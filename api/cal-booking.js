const CAL_API = 'https://api.cal.com/v2/bookings';
// We deliberately use Cal.com's LEGACY v2 booking format (cal-api-version 2024-06-14: eventTypeId +
// a flat `responses` object). The newer format (2026-02-25 + bookingFieldsResponses) strict-parses the
// event type's STORED bookingFields before it reads the request and 400s with "N.required" if any stored
// field is malformed. The Discovery event type has a corrupted workflow-injected `smsReminderNumber`
// field (saved as type:"unknown" with no `required` flag) that fails that parse, so the modern format
// blocks EVERY booking. The legacy path skips that parse — the same path Cal's own hosted booking page
// uses — so bookings succeed. Verified live: legacy format returns 201 where the modern format 400s.
const CAL_API_VERSION = '2024-06-14';
const TEAM_SLUG = 'revwhisper';
const EVENT_TYPE_SLUG = 'discovery';
// Legacy bookings require a numeric eventTypeId (slug routing is a modern-format feature). Falls back to
// the known Discovery event type id when CAL_EVENT_TYPE_ID isn't set in the environment.
const DEFAULT_EVENT_TYPE_ID = 5076967;
const UPSTREAM_TIMEOUT_MS = 15000;
const DEFAULT_X_AUDIT_CALL_BOOKED_EVENT_ID = 'tw-r8ftv-rd0hl';

const { sendCapiEvent, buildUserData } = require('./_meta-capi');
const { sendXConversionEvent, buildIdentifiers } = require('./_x-capi');
const { sendBookingAlert } = require('./_alert');
const { sendAuditConfirmationEmail } = require('./_audit-confirmation-email');

// Cal.com metadata limits (per API docs): <=50 keys, key <=40 chars, string value <=500 chars.
const META_MAX_KEYS = 50;
const META_MAX_KEY_LEN = 40;
const META_MAX_VAL_LEN = 500;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function validate(body) {
  if (!body.start || Number.isNaN(new Date(body.start).getTime())) {
    return 'A valid start time is required.';
  }
  if (!body.name || !String(body.name).trim()) return 'A name is required.';
  const email = String(body.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email is required.';
  if (!body.timeZone || !String(body.timeZone).trim()) return 'A timezone is required.';
  return null;
}

// Coerce any value to a trimmed, length-capped string. Objects/arrays are dropped.
function clampStr(value, max) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  const s = String(value).trim();
  return s.length > max ? s.slice(0, max) : s;
}

// Build a Cal.com-safe metadata object: string values only, within key/value/count limits.
function buildMetadata(body) {
  const out = {};
  const add = (key, value) => {
    if (Object.keys(out).length >= META_MAX_KEYS) return;
    const k = clampStr(key, META_MAX_KEY_LEN);
    const v = clampStr(value, META_MAX_VAL_LEN);
    if (!k || !v || out[k]) return;
    out[k] = v;
  };
  add('source', body.source || 'website');
  add('listings', body.listings);
  add('airbnbUrl', body.airbnbUrl);
  // Phone also lives in metadata as a free-form fallback string. The primary CRM path is
  // attendee.phoneNumber (set on the booking above, E.164) → Cal.com booking webhook →
  // Disco Call automation → Attio. metadata.phone is the belt-and-suspenders source.
  add('phone', body.phone);
  if (body.attribution && typeof body.attribution === 'object' && !Array.isArray(body.attribution)) {
    for (const [k, v] of Object.entries(body.attribution)) add(k, v);
  }
  return out;
}

function parseEventTypeId(raw) {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Which team member the round-robin assigned. The legacy booking response carries the host in
// `user` ({name,email,username}); `hosts[]`/`organizer` cover other response shapes. Last resort:
// Cal titles bookings "<event> between <host> and <attendee>", so the host is parseable from the
// title. Returns {name,email} or null — the client maps it to a photo + intro video.
function extractHost(data) {
  if (!data || typeof data !== 'object') return null;
  const u = data.user || data.organizer || (Array.isArray(data.hosts) && data.hosts[0]) || null;
  if (u && typeof u === 'object' && (u.name || u.email)) {
    return { name: u.name ? String(u.name) : '', email: u.email ? String(u.email) : '' };
  }
  const m = typeof data.title === 'string' && data.title.match(/between (.+?) and .+/i);
  return m ? { name: m[1].trim(), email: '' } : null;
}

function extractMessage(b) {
  if (!b) return '';
  if (typeof b === 'string') return b;
  const e = b.error;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && e.message) return String(e.message);
  if (b.message) return String(b.message);
  return '';
}

// The Google Meet URL for the booking. Verified live: the legacy booking response puts the location
// TYPE in `location` ("integrations:google:meet") and the real URL in `references[].meetingUrl`
// (both a google_meet_video and a google_calendar reference carry it), present immediately with no
// race. Prefer the video reference, then any reference, then a `location` that's already a URL.
// Returns '' when absent so the confirmation email falls back gracefully (no broken button).
function extractMeetingUrl(data) {
  if (!data || typeof data !== 'object') return '';
  const isUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v);
  if (isUrl(data.meetingUrl)) return data.meetingUrl; // modern-format shape (top-level URL)
  const refs = Array.isArray(data.references) ? data.references
    : (Array.isArray(data.bookingReferences) ? data.bookingReferences : []);
  const vid = refs.find((r) => r && r.type === 'google_meet_video' && isUrl(r.meetingUrl));
  if (vid) return vid.meetingUrl;
  const any = refs.find((r) => r && isUrl(r.meetingUrl));
  if (any) return any.meetingUrl;
  return isUrl(data.location) ? data.location : '';
}

// POST the booking to Cal.com. apiKey may be '' to send an unauthenticated (public) booking,
// which Cal.com accepts for public team event types. Returns a normalized result object.
async function postBooking(payload, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const headers = {
      'cal-api-version': CAL_API_VERSION,
      'Content-Type': 'application/json'
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const r = await fetch(CAL_API, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    let parsed = null;
    try { parsed = await r.json(); } catch { parsed = null; }
    return { kind: 'response', status: r.status, body: parsed };
  } catch (err) {
    return { kind: 'network', err };
  } finally {
    clearTimeout(timeout);
  }
}

// Resolve the Google Meet link for the confirmation email. Cal.com generates it when it creates the
// Google Calendar event during booking. Verified live: the legacy POST response already carries the
// real URL in references[].meetingUrl (present immediately, no race) — so extractMeetingUrl gets it
// with no extra call. The uid re-read is belt-and-suspenders insurance for the rare case it's absent.
// Never throws: on any failure returns '' and the email omits the link (falls back to the invite line).
async function resolveMeetingUrl(data, apiKey) {
  const fromPost = extractMeetingUrl(data);
  if (fromPost) return fromPost;
  const uid = data && data.uid;
  if (!uid || !apiKey) return '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const r = await fetch(`${CAL_API}/${encodeURIComponent(uid)}`, {
      headers: { 'cal-api-version': '2024-08-13', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const j = await r.json().catch(() => null);
    return extractMeetingUrl(j && j.data) || '';
  } catch {
    return '';
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = await parseBody(req);
  const error = validate(body);
  if (error) return sendJson(res, 400, { error });

  // The synthetic monitor (booking-canary GitHub Action) sends this header with a deliberately-past
  // date. We skip ops alerts for it — the canary's own failure path handles alerting, and we don't
  // want its expected "in the past" rejection emailing a false "customers can't book" alarm.
  const isCanary = !!(req.headers && req.headers['x-rw-canary']);

  // Trim the key defensively — a stray newline/space in a Vercel env var is a classic
  // cause of "Invalid API Key" 401s that silently break every booking.
  const apiKey = (process.env.CAL_API_KEY || '').trim();
  const eventTypeId = parseEventTypeId(process.env.CAL_EVENT_TYPE_ID) || DEFAULT_EVENT_TYPE_ID;

  // Build a clean E.164 from the (client-validated) phone. The phone feeds the SMS-reminder field
  // AND the CRM path (Cal.com booking webhook → Disco Call automation → Attio/Quo). Guard the format
  // so a malformed value can never fail the booking — if it isn't a plausible E.164 we omit it and
  // fall back to metadata.phone.
  const phoneDigits = String(body.phone || '').replace(/\D/g, '');
  const phoneE164 = (phoneDigits.length >= 8 && phoneDigits.length <= 15) ? '+' + phoneDigits : '';

  // Legacy-format payload: eventTypeId + a flat `responses` object (booking-field slug → value) plus
  // top-level timeZone/language/metadata. `responses.attendeePhoneNumber` maps to the attendee phone and
  // `responses.smsReminderNumber` feeds the SMS reminder; both are optional, so a missing/odd phone can
  // never block a booking. `includePhone=false` produces a phone-free payload for the retry below.
  const buildPayload = (includePhone) => {
    const responses = {
      name: String(body.name).trim(),
      email: String(body.email).trim(),
      guests: [],
      location: { value: 'conferencing', optionValue: '' }
    };
    if (includePhone && phoneE164) {
      responses.attendeePhoneNumber = phoneE164;
      responses.smsReminderNumber = phoneE164;
    }
    return {
      eventTypeId,
      start: new Date(body.start).toISOString(),
      timeZone: String(body.timeZone).trim(),
      language: 'en',
      metadata: buildMetadata(body),
      responses
    };
  };

  let upstreamPayload = buildPayload(true);

  // Attempt with auth (if a key is configured). Public team bookings also succeed WITHOUT
  // auth, so if the key is rejected (401/403) we retry once unauthenticated rather than
  // failing the customer's booking outright.
  let attempt = await postBooking(upstreamPayload, apiKey);
  if (attempt.kind === 'response' && apiKey && (attempt.status === 401 || attempt.status === 403)) {
    console.error(`cal-booking: Cal.com rejected CAL_API_KEY (HTTP ${attempt.status}). Falling back to an unauthenticated booking — FIX THE KEY in your environment.`);
    attempt = await postBooking(upstreamPayload, '');
  }

  // If Cal.com rejects the phone number itself (e.g. "{smsReminderNumber}invalid_number"), retry once
  // WITHOUT the phone fields. They're optional, so a customer with an odd phone still gets booked — we
  // just lose the SMS-reminder number for that one booking (metadata.phone still carries it to the CRM).
  if (attempt.kind === 'response' && phoneE164 && (attempt.status === 400 || attempt.status === 500)) {
    const raw = JSON.stringify(attempt.body || '').toLowerCase();
    if (raw.includes('invalid_number') || raw.includes('smsremindernumber') || raw.includes('attendeephonenumber')) {
      console.error('cal-booking: Cal.com rejected the phone number. Retrying the booking without the phone fields.');
      upstreamPayload = buildPayload(false);
      attempt = await postBooking(upstreamPayload, apiKey || '');
    }
  }

  if (attempt.kind === 'network') {
    console.error('cal-booking upstream error:', attempt.err && attempt.err.name, attempt.err && attempt.err.message);
    if (!isCanary) await sendBookingAlert({ source: 'live booking', reason: 'Could not reach Cal.com (network/timeout)', detail: (attempt.err && attempt.err.message) || 'network error' });
    return sendJson(res, 502, { error: 'Unable to reach Cal.com right now.', fallback: true });
  }

  const { status, body: upstreamBody } = attempt;

  if (status < 200 || status >= 300) {
    console.error('cal-booking non-OK', status, JSON.stringify(upstreamBody));
    const message = extractMessage(upstreamBody) || 'Cal.com rejected the booking.';
    const lower = message.toLowerCase();
    // The slot was taken between load and booking (concurrent/ad-load race). Redirecting to
    // Cal.com wouldn't help — the client should refresh availability and let them re-pick.
    const slotGone = status === 409 ||
      /already has|not available|no_available|no available|already booked|no longer available|fully booked|slot.*unavailable/.test(lower);
    // Transient/infra/throttle/auth: Cal.com's own booking page may still work → offer fallback.
    const fallback = !slotGone && (status === 401 || status === 403 || status === 408 || status === 429 || status >= 500);
    // Alert on SYSTEMIC failures only. A taken slot is a normal race; "in the past" only comes from
    // a malformed/synthetic request (the UI never sends a past slot) — neither means an outage.
    // Everything else (config/parse errors like 4.required, 5xx, broken auth, throttling) does.
    const benign = slotGone || /in the past/i.test(lower);
    if (!isCanary && !benign) {
      await sendBookingAlert({ source: 'live booking', status, reason: 'Cal.com rejected the booking', detail: message });
    }
    return sendJson(res, status, {
      error: message,
      code: slotGone ? 'slot_unavailable' : undefined,
      fallback
    });
  }

  const data = upstreamBody && upstreamBody.data ? upstreamBody.data : null;

  // Server-side Meta CAPI "Schedule" — fires on every booking made through our widget,
  // deduped with the browser event via the shared fbEventId. This endpoint is browser-called,
  // so req carries the visitor's _fbp/_fbc/IP/UA for strong match quality.
  if (body.fbEventId) {
    const fullName = String(body.name || '').trim();
    const nameParts = fullName.split(' ');
    await sendCapiEvent({
      eventName: 'Schedule',
      eventId: String(body.fbEventId),
      eventSourceUrl: req.headers.referer || req.headers.referrer || 'https://revwhisper.com/audit-booking',
      userData: buildUserData({
        email: body.email,
        phone: body.phone,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(' '),
        fbp: body.fbp,
        fbc: body.fbc,
        req
      }),
      customData: { content_name: 'Audit Call Booked', content_category: 'Audit' },
      timeoutMs: 8000
    });
  }

  if (body.xConversionId) {
    await sendXConversionEvent({
      eventId: process.env.X_AUDIT_CALL_BOOKED_EVENT_ID || DEFAULT_X_AUDIT_CALL_BOOKED_EVENT_ID,
      conversionId: String(body.xConversionId),
      eventSourceUrl: req.headers.referer || req.headers.referrer || 'https://revwhisper.com/audit-booking',
      identifiers: buildIdentifiers({
        twclid: body.twclid || (body.attribution && body.attribution.twclid),
        email: body.email,
        phone: body.phone,
        req
      }),
      description: 'Audit Call Booked',
      timeoutMs: 8000
    });
  }

  // Post-booking "what to expect" email, sent immediately via Resend. Never throws and is skipped
  // for the synthetic canary.
  if (!isCanary) {
    const meetingUrl = await resolveMeetingUrl(data, apiKey);
    await sendAuditConfirmationEmail({
      name: body.name,
      email: body.email,
      startIso: (data && (data.start || data.startTime)) || body.start,
      timeZone: body.timeZone,
      listings: body.listings,
      meetingUrl
    });
  }

  return sendJson(res, 201, {
    ok: true,
    booking: data
      ? {
          uid: data.uid,
          // Legacy format returns startTime/endTime; keep start/end fallbacks for forward-compat.
          start: data.start || data.startTime,
          end: data.end || data.endTime,
          location: data.location,
          duration: data.duration,
          title: data.title,
          host: extractHost(data)
        }
      : null
  });
};

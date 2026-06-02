const CAL_API = 'https://api.cal.com/v2/bookings';
const CAL_API_VERSION = '2026-02-25';
const TEAM_SLUG = 'revwhisper';
const EVENT_TYPE_SLUG = 'discovery';
const UPSTREAM_TIMEOUT_MS = 15000;

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
  // Phone lives in metadata as a free-form string (no format validation risk), and is
  // also delivered to the CRM via the form webhook. We deliberately do NOT put it in
  // attendee.phoneNumber, which Cal.com validates as an international number.
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

function extractMessage(b) {
  if (!b) return '';
  if (typeof b === 'string') return b;
  const e = b.error;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && e.message) return String(e.message);
  if (b.message) return String(b.message);
  return '';
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = await parseBody(req);
  const error = validate(body);
  if (error) return sendJson(res, 400, { error });

  // Trim the key defensively — a stray newline/space in a Vercel env var is a classic
  // cause of "Invalid API Key" 401s that silently break every booking.
  const apiKey = (process.env.CAL_API_KEY || '').trim();
  const eventTypeId = parseEventTypeId(process.env.CAL_EVENT_TYPE_ID);

  const upstreamPayload = {
    start: new Date(body.start).toISOString(),
    attendee: {
      name: String(body.name).trim(),
      email: String(body.email).trim(),
      timeZone: String(body.timeZone).trim(),
      language: 'en'
    },
    metadata: buildMetadata(body)
  };

  if (eventTypeId) {
    upstreamPayload.eventTypeId = eventTypeId;
  } else {
    upstreamPayload.eventTypeSlug = EVENT_TYPE_SLUG;
    upstreamPayload.teamSlug = TEAM_SLUG;
  }

  // Attempt with auth (if a key is configured). Public team bookings also succeed WITHOUT
  // auth, so if the key is rejected (401/403) we retry once unauthenticated rather than
  // failing the customer's booking outright.
  let attempt = await postBooking(upstreamPayload, apiKey);
  if (attempt.kind === 'response' && apiKey && (attempt.status === 401 || attempt.status === 403)) {
    console.error(`cal-booking: Cal.com rejected CAL_API_KEY (HTTP ${attempt.status}). Falling back to an unauthenticated booking — FIX THE KEY in your environment.`);
    attempt = await postBooking(upstreamPayload, '');
  }

  if (attempt.kind === 'network') {
    console.error('cal-booking upstream error:', attempt.err && attempt.err.name, attempt.err && attempt.err.message);
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
    return sendJson(res, status, {
      error: message,
      code: slotGone ? 'slot_unavailable' : undefined,
      fallback
    });
  }

  const data = upstreamBody && upstreamBody.data ? upstreamBody.data : null;
  return sendJson(res, 201, {
    ok: true,
    booking: data
      ? {
          uid: data.uid,
          start: data.start,
          end: data.end,
          location: data.location,
          duration: data.duration,
          title: data.title
        }
      : null
  });
};

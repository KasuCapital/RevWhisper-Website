// Cal.com booking webhook → Meta CAPI "Schedule" ("Audit Call Booked").
//
// This is the ONLY path that captures bookings completed on Cal.com's hosted fallback
// page (where the browser has left our site, so the in-page Pixel can't fire). It also
// backs up the in-page widget's browser Schedule event — deduped via the shared event_id
// we stash in the booking metadata as `fbEventId`.
//
// Cal.com setup:
//   Settings → Developer → Webhooks → New
//     Subscriber URL : https://revwhisper.com/api/cal-webhook
//     Event triggers : "Booking created"
//     Secret         : generate one, then set it in env CAL_WEBHOOK_SECRET
// Required env: META_CAPI_ACCESS_TOKEN, and CAL_WEBHOOK_SECRET (recommended — signs the payload).

const crypto = require('crypto');
const { sendCapiEvent, buildUserData } = require('./_meta-capi');

const BOOKING_PAGE_URL = 'https://revwhisper.com/audit-booking';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

// Read the untouched request stream so HMAC verification matches Cal.com's signature.
async function readRaw(req) {
  if (req.readable) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  }
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

// Cal.com signs with X-Cal-Signature-256 = hex HMAC-SHA256(rawBody, secret).
function verifySignature(raw, signature, secret) {
  if (!secret) return { verified: false, reason: 'no_secret' };
  if (!signature) return { verified: false, reason: 'no_signature' };
  const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return { verified: false, reason: 'length_mismatch' };
  return { verified: crypto.timingSafeEqual(a, b), reason: 'compared' };
}

function firstAttendee(p) {
  if (Array.isArray(p.attendees) && p.attendees.length) return p.attendees[0];
  // Some payloads carry the booker under responses instead.
  const r = p.responses || {};
  const email = (r.email && (r.email.value || r.email)) || '';
  const name = (r.name && (r.name.value || r.name)) || '';
  return { email, name };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const raw = await readRaw(req);
  const secret = (process.env.CAL_WEBHOOK_SECRET || '').trim();
  const sig = req.headers['x-cal-signature-256'];
  const check = verifySignature(raw, sig, secret);

  // If a secret is configured we enforce it. If it isn't configured yet, we process the
  // event but warn loudly — set CAL_WEBHOOK_SECRET to lock this endpoint down.
  if (secret && !check.verified) {
    console.error(`[cal-webhook] signature rejected (${check.reason}).`);
    return sendJson(res, 401, { error: 'Invalid signature.' });
  }
  if (!secret) {
    console.warn('[cal-webhook] CAL_WEBHOOK_SECRET not set — processing UNVERIFIED webhook. Set the secret to secure this endpoint.');
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    return sendJson(res, 400, { error: 'Invalid JSON.' });
  }

  const trigger = event && event.triggerEvent;
  const p = (event && event.payload) || {};

  // Only a newly-created booking is a "Schedule". Ignore reschedules/cancellations/etc.
  if (trigger && trigger !== 'BOOKING_CREATED') {
    return sendJson(res, 200, { received: true, ignored: trigger });
  }

  const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
  const attendee = firstAttendee(p);
  const fullName = String(attendee.name || '').trim();
  const [firstName, ...rest] = fullName.split(' ');

  // Same event_id as the browser Schedule (in-page bookings stash it in metadata) → Meta
  // dedupes the pair. Fallback-page bookings have no browser event; derive a stable id
  // from the booking uid so Cal.com retries don't double-count.
  const eventId = meta.fbEventId || (p.uid ? `sched_srv_${p.uid}` : undefined);

  const result = await sendCapiEvent({
    eventName: 'Schedule',
    eventId,
    eventSourceUrl: BOOKING_PAGE_URL,
    userData: buildUserData({
      email: attendee.email,
      firstName,
      lastName: rest.join(' '),
      phone: meta.phone,
      fbp: meta.fbp,
      fbc: meta.fbc
    }),
    customData: { content_name: 'Audit Call Booked', content_category: 'Audit' }
  });

  // Always 200 so Cal.com doesn't retry-storm; surface the CAPI outcome in the body/logs.
  return sendJson(res, 200, { received: true, capi: result.ok ? 'sent' : (result.skipped ? 'skipped' : 'error') });
};

// Shared X/Twitter Conversions API helper.
//
// Browser Pixel and server CAPI use the same X event ID and `conversion_id` so
// X can deduplicate the two delivery paths. The pixel token is server-only.
//
// Required env for server delivery:
//   X_PIXEL_TOKEN
//   X_AUDIT_LEAD_EVENT_ID
//   X_AUDIT_CALL_BOOKED_EVENT_ID
//
// Optional env:
//   X_PIXEL_ID - defaults to the site pixel below.

const crypto = require('crypto');

const API_VERSION = '12';
const DEFAULT_PIXEL_ID = 'r8ftv';

function sha256(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return undefined;
  return crypto.createHash('sha256').update(s).digest('hex');
}

function normalizePhone(value) {
  const raw = String(value == null ? '' : value).trim();
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  return `+${digits}`;
}

function hashPhone(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function clientIp(req) {
  const xff = req && req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || undefined;
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

function buildIdentifiers({ twclid, email, phone, ip, userAgent, req } = {}) {
  const identifiers = [];
  const clickId = String(twclid || '').trim();
  const hashedEmail = sha256(email);
  const hashedPhone = hashPhone(phone);
  const clientIpAddress = String(ip || clientIp(req) || '').trim();
  const ua = String(userAgent || (req && req.headers && req.headers['user-agent']) || '').trim();

  if (clickId) identifiers.push({ twclid: clickId });
  if (hashedEmail) identifiers.push({ hashed_email: hashedEmail });
  if (hashedPhone) identifiers.push({ hashed_phone_number: hashedPhone });
  if (clientIpAddress && ua) identifiers.push({ ip_address: clientIpAddress, user_agent: ua });

  return identifiers;
}

async function sendXConversionEvent({
  eventId,
  conversionId,
  conversionTime,
  eventSourceUrl,
  identifiers = [],
  description,
  value,
  currency,
  contents,
  timeoutMs = 8000
} = {}) {
  const token = (process.env.X_PIXEL_TOKEN || '').trim();
  const pixelId = (process.env.X_PIXEL_ID || DEFAULT_PIXEL_ID).trim();

  if (!token) {
    console.warn(`[x-capi] X_PIXEL_TOKEN not set - skipping ${eventId || 'event'} (conversion_id=${conversionId}).`);
    return { ok: false, skipped: true };
  }
  if (!eventId) return { ok: false, error: 'eventId is required' };
  if (!identifiers.length) return { ok: false, error: 'at least one identifier is required' };

  const event = compact({
    conversion_time: new Date(conversionTime || Date.now()).toISOString(),
    event_id: eventId,
    event_source_url: eventSourceUrl,
    conversion_id: conversionId,
    identifiers,
    description,
    value,
    currency,
    contents
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`https://ads-api.x.com/${API_VERSION}/measurement/conversions/${encodeURIComponent(pixelId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pixel-Token': token
      },
      body: JSON.stringify({ conversions: [event] }),
      signal: controller.signal
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      console.error(`[x-capi] ${eventId} rejected (HTTP ${r.status}):`, JSON.stringify(body));
      return { ok: false, status: r.status, error: body };
    }
    return { ok: true, status: r.status, body };
  } catch (err) {
    console.error(`[x-capi] ${eventId} send failed:`, err && err.name, err && err.message);
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendXConversionEvent, buildIdentifiers, sha256, hashPhone, normalizePhone, clientIp };

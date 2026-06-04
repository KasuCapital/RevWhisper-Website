// Shared Meta Conversions API (CAPI) helper.
//
// Server-side event delivery that complements the browser Pixel (959022406709300).
// Each server event carries the SAME `event_id` as its browser counterpart so Meta
// deduplicates them — you get the resilience of server-side without double-counting.
//
// Required env:  META_CAPI_ACCESS_TOKEN  — Events Manager → Settings → Conversions API → Generate access token
// Optional env:  META_PIXEL_ID           — defaults to the site pixel below
//                META_TEST_EVENT_CODE     — Events Manager → Test Events (use ONLY while testing, then remove)
//
// Fail-safe: if META_CAPI_ACCESS_TOKEN is unset, sendCapiEvent() is a no-op that logs a
// warning and returns {skipped:true}. That lets this code ship before the token exists.
// It never throws — safe to await inside a user-facing request without risking the response.

const crypto = require('crypto');

const GRAPH_VERSION = 'v21.0';
const DEFAULT_PIXEL_ID = '959022406709300';

// Meta requires SHA-256 of normalized (trimmed, lowercased) values for em/fn/ln.
function sha256(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return undefined;
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Phone: digits only (incl. country code), no '+' or separators, then SHA-256.
function hashPhone(value) {
  const digits = String(value == null ? '' : value).replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

function readCookie(req, name) {
  const header = req && req.headers && req.headers.cookie;
  if (!header) return undefined;
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = header.match(new RegExp('(?:^|;\\s*)' + safe + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function clientIp(req) {
  const xff = req && req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || undefined;
}

// Strip empty/undefined keys so we never transmit blank match fields.
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && (v.length === 0 || v[0] === undefined)) continue;
    out[k] = v;
  }
  return out;
}

// Build user_data for matching. Pass `req` to auto-pull IP/UA/_fbp/_fbc (browser-originated
// calls like the form webhook). The Cal.com webhook is server-to-server with no user cookies,
// so it passes fbp/fbc explicitly (pulled from the booking metadata) instead.
function buildUserData({ email, phone, firstName, lastName, fbp, fbc, ip, userAgent, req } = {}) {
  const ua = userAgent || (req && req.headers && req.headers['user-agent']) || undefined;
  return compact({
    em: email ? [sha256(email)] : undefined,
    ph: phone ? [hashPhone(phone)] : undefined,
    fn: firstName ? [sha256(firstName)] : undefined,
    ln: lastName ? [sha256(lastName)] : undefined,
    fbp: fbp || (req ? readCookie(req, '_fbp') : undefined),
    fbc: fbc || (req ? readCookie(req, '_fbc') : undefined),
    client_ip_address: ip || (req ? clientIp(req) : undefined),
    client_user_agent: ua
  });
}

// Send one event to the Conversions API. Never throws; returns a result object.
async function sendCapiEvent({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  actionSource = 'website',
  userData = {},
  customData,
  timeoutMs = 8000
} = {}) {
  const accessToken = (process.env.META_CAPI_ACCESS_TOKEN || '').trim();
  const pixelId = (process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID).trim();

  if (!accessToken) {
    console.warn(`[meta-capi] META_CAPI_ACCESS_TOKEN not set — skipping ${eventName || 'event'} (event_id=${eventId}).`);
    return { ok: false, skipped: true };
  }
  if (!eventName) return { ok: false, error: 'eventName is required' };

  const event = compact({
    event_name: eventName,
    event_time: Math.floor((eventTime || Date.now()) / 1000),
    event_id: eventId,
    action_source: actionSource,
    event_source_url: eventSourceUrl,
    user_data: userData,
    custom_data: customData
  });

  const payload = { data: [event] };
  const testCode = (process.env.META_TEST_EVENT_CODE || '').trim();
  if (testCode) payload.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      console.error(`[meta-capi] ${eventName} rejected (HTTP ${r.status}):`, JSON.stringify(body));
      return { ok: false, status: r.status, error: body };
    }
    return { ok: true, status: r.status, body };
  } catch (err) {
    console.error(`[meta-capi] ${eventName} send failed:`, err && err.name, err && err.message);
    return { ok: false, error: String((err && err.message) || err) };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendCapiEvent, buildUserData, sha256, hashPhone, readCookie, clientIp };

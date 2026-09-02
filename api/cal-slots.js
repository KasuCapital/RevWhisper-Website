const CAL_API = 'https://api.cal.com/v2/slots';
const CAL_API_VERSION = '2024-09-04';
const TEAM_SLUG = 'revwhisper';
const EVENT_TYPE_SLUG = 'discovery';
const MAX_RANGE_DAYS = 60;
// The widgets ask for "the next 60 days" from the visitor's local midnight. Expressed in absolute
// time that is NOT always 60×24h: a fall-back DST change inside the window makes it 60 days + 1 hour
// (Europe from late August, the US from early September, every year), and other zones wobble too.
// A strict `> 60 days` check rejected exactly those requests as "Date range may not exceed 60 days"
// and every visitor in an affected zone saw a dead calendar (Sept 2026 incident, reported by a lead
// in Europe/Amsterdam). So: tolerate a full day of slack, and beyond that CLAMP the window instead
// of refusing it. Cal.com itself accepts far longer ranges (verified: 120 days → 200), so the cap is
// only our own guard against pathological requests and must never be a reason a customer can't book.
const RANGE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 10000;
const CACHE_OK = 'public, max-age=60, stale-while-revalidate=300';

const { sendBookingAlert } = require('./_alert');

const ALERT_SUBJECT = "🚨 URGENT: RevWhisper booking calendar is FAILING — customers can't see availability";
const ALERT_HEADLINE = '🚨 Availability is failing to load';
const ALERT_SUMMARY = 'The booking calendar could not load open times. Customers on /audit-booking, /get-started and /what-to-expect are likely seeing an error instead of the calendar.';
const ALERT_HINT = 'Open <code>/audit-booking?preview=calendar</code> and see whether the calendar loads. Then the ' +
  '<code>/api/cal-slots</code> Vercel logs, and Cal.com status. If the reason is a 400 from OUR validation, the ' +
  'widget is building a request the API refuses — a client-side bug, fix it in the three calendar pages.';

function sendJson(res, statusCode, payload, cacheControl) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl || 'no-store');
  res.end(JSON.stringify(payload));
}

function parseISO(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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

// Request context for the alert email so the failure is diagnosable from the inbox alone.
function describeRequest(req, url) {
  const h = (req && req.headers) || {};
  return [
    `query: ${url.search || '(none)'}`,
    `referer: ${h.referer || h.referrer || '(none)'}`,
    `ua: ${String(h['user-agent'] || '(none)').slice(0, 160)}`
  ].join('\n');
}

// Email ops about an availability failure. Returns true when an alert was actually sent, so the
// response can tell the browser not to double-report the same failure via /api/client-error.
async function alertAvailability({ status, reason, detail }) {
  const r = await sendBookingAlert({
    source: 'availability',
    status,
    reason,
    detail,
    subject: ALERT_SUBJECT,
    headline: ALERT_HEADLINE,
    summary: ALERT_SUMMARY,
    hint: ALERT_HINT
  });
  return !!(r && r.ok);
}

async function getSlots(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { 'cal-api-version': CAL_API_VERSION },
      signal: controller.signal
    });
    let parsed = null;
    let parseError = false;
    try { parsed = await r.json(); } catch { parseError = true; }
    return { kind: 'response', status: r.status, body: parsed, parseError };
  } catch (err) {
    return { kind: 'network', err };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const startRaw = url.searchParams.get('start');
  const endRaw = url.searchParams.get('end');
  const timeZone = url.searchParams.get('timeZone') || 'UTC';
  const context = describeRequest(req, url);

  const start = parseISO(startRaw);
  let end = parseISO(endRaw);
  if (!start || !end) {
    // Bare hits with no dates at all are scanners/bots — not worth an email. Dates that are PRESENT
    // but unparseable came from our own widget (nothing else calls this), so that IS an outage.
    const alerted = (startRaw || endRaw)
      ? await alertAvailability({ status: 400, reason: 'Widget sent unparseable start/end dates', detail: context })
      : false;
    return sendJson(res, 400, { error: 'start and end query params are required (ISO 8601).', alerted });
  }
  if (end <= start) {
    const alerted = await alertAvailability({ status: 400, reason: 'Widget sent end <= start', detail: context });
    return sendJson(res, 400, { error: 'end must be after start.', alerted });
  }

  const maxMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (end - start > maxMs + RANGE_TOLERANCE_MS) {
    // Never refuse — a too-long window is an odd request, not a broken one. Serve the first 60 days.
    console.warn(`cal-slots: range ${(end - start) / 86400000} days exceeds ${MAX_RANGE_DAYS}; clamping.`, context.split('\n')[0]);
    end = new Date(start.getTime() + maxMs);
  }

  const upstream = new URL(CAL_API);
  upstream.searchParams.set('teamSlug', TEAM_SLUG);
  upstream.searchParams.set('eventTypeSlug', EVENT_TYPE_SLUG);
  upstream.searchParams.set('start', start.toISOString());
  upstream.searchParams.set('end', end.toISOString());
  upstream.searchParams.set('timeZone', timeZone);

  // One retry: GET slots is idempotent, so a transient network blip or 5xx is worth a
  // second try before we surface an error to the calendar.
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    result = await getSlots(upstream.toString());
    const transient = result.kind === 'network' ||
      (result.kind === 'response' && (result.status >= 500 || result.parseError));
    if (!transient) break;
  }

  if (result.kind === 'network') {
    const msg = (result.err && result.err.message) || 'network error';
    console.error('cal-slots upstream error:', result.err && result.err.name, msg);
    const alerted = await alertAvailability({ status: 502, reason: 'Could not reach Cal.com (network/timeout)', detail: `${msg}\n${context}` });
    return sendJson(res, 502, { error: 'Unable to reach Cal.com right now.', alerted });
  }

  if (result.parseError) {
    console.error('cal-slots non-JSON response, status', result.status);
    const alerted = await alertAvailability({ status: result.status, reason: 'Cal.com returned a non-JSON response', detail: context });
    return sendJson(res, 502, { error: 'Cal.com returned an unexpected response.', alerted });
  }

  if (result.status < 200 || result.status >= 300) {
    console.error('cal-slots upstream non-OK', result.status, JSON.stringify(result.body));
    // Normalize to a plain string so the calendar never renders "[object Object]".
    const message = extractMessage(result.body) || `Cal.com returned ${result.status}.`;
    const alerted = await alertAvailability({ status: result.status, reason: 'Cal.com rejected the availability request', detail: `${message}\n${context}` });
    return sendJson(res, result.status, { error: message, alerted });
  }

  return sendJson(res, 200, result.body, CACHE_OK);
};

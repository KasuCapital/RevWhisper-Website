const CAL_API = 'https://api.cal.com/v2/slots';
const CAL_API_VERSION = '2024-09-04';
const TEAM_SLUG = 'revwhisper';
const EVENT_TYPE_SLUG = 'discovery';
const MAX_RANGE_DAYS = 60;
const UPSTREAM_TIMEOUT_MS = 10000;
const CACHE_OK = 'public, max-age=60, stale-while-revalidate=300';

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

  const start = parseISO(startRaw);
  const end = parseISO(endRaw);
  if (!start || !end) {
    return sendJson(res, 400, { error: 'start and end query params are required (ISO 8601).' });
  }
  if (end <= start) {
    return sendJson(res, 400, { error: 'end must be after start.' });
  }

  const rangeMs = end - start;
  const maxMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (rangeMs > maxMs) {
    return sendJson(res, 400, { error: `Date range may not exceed ${MAX_RANGE_DAYS} days.` });
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
    console.error('cal-slots upstream error:', result.err && result.err.name, result.err && result.err.message);
    return sendJson(res, 502, { error: 'Unable to reach Cal.com right now.' });
  }

  if (result.parseError) {
    console.error('cal-slots non-JSON response, status', result.status);
    return sendJson(res, 502, { error: 'Cal.com returned an unexpected response.' });
  }

  if (result.status < 200 || result.status >= 300) {
    console.error('cal-slots upstream non-OK', result.status, JSON.stringify(result.body));
    // Normalize to a plain string so the calendar never renders "[object Object]".
    const message = extractMessage(result.body) || `Cal.com returned ${result.status}.`;
    return sendJson(res, result.status, { error: message });
  }

  return sendJson(res, 200, result.body, CACHE_OK);
};

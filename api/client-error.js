// Browser-side failure reports from the booking calendar pages. The API endpoints already email ops
// when THEY fail (api/_alert.js), but some failures never reach them: the request itself never left
// the browser, a 200 came back that the page couldn't parse or render, or a serverless function
// crashed hard before its own alerting ran. The three calendar widgets POST those here (skipping
// anything the API already flagged with `alerted: true`) so that every way the funnel can break in
// front of a customer ends in an email.
//
// Deliberately narrow: known pages only, short strings, one alert per page per 10 minutes (the
// per-source throttle in _alert.js). Nothing here is trusted beyond being logged and emailed.
const { sendBookingAlert } = require('./_alert');

const KNOWN_PAGES = new Set(['audit-booking', 'get-started', 'what-to-expect']);
const KNOWN_STAGES = new Set(['availability', 'booking', 'render']);
const MAX_MESSAGE = 500;
const MAX_DETAIL = 1500;

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

function clampStr(v, max) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = await parseBody(req);
  const page = String(body.page || '');
  const stage = KNOWN_STAGES.has(String(body.stage)) ? String(body.stage) : 'availability';
  if (!KNOWN_PAGES.has(page)) {
    return sendJson(res, 400, { error: 'Unknown page.' });
  }

  const message = clampStr(body.message, MAX_MESSAGE) || 'unknown error';
  const h = req.headers || {};
  const detail = [
    `message: ${message}`,
    `detail: ${clampStr(body.detail, MAX_DETAIL) || '(none)'}`,
    `referer: ${h.referer || h.referrer || '(none)'}`,
    `ua: ${clampStr(h['user-agent'], 160) || '(none)'}`
  ].join('\n');

  const stageLabel = stage === 'booking' ? 'booking' : stage === 'render' ? 'calendar rendering' : 'availability';
  console.error(`client-error [${page}/${stage}]:`, message);

  const r = await sendBookingAlert({
    source: `browser · ${page}`,
    status: body.status ? clampStr(body.status, 8) : undefined,
    reason: `A visitor's browser hit a ${stageLabel} failure on /${page}`,
    detail,
    subject: `🚨 URGENT: RevWhisper /${page} ${stageLabel} failed in a visitor's browser`,
    headline: `🚨 ${stageLabel[0].toUpperCase()}${stageLabel.slice(1)} failed in the browser`,
    summary: `The booking widget on /${page} showed a visitor an error. This came from the page itself, so the API may not have logged anything.`,
    hint: `Open <code>/${page}${page === 'audit-booking' ? '?preview=calendar' : ''}</code> in a browser and reproduce. ` +
      'A single report on a flaky mobile connection can be noise; two in a row is an outage.'
  });

  return sendJson(res, 200, { ok: true, alerted: !!(r && r.ok) });
};

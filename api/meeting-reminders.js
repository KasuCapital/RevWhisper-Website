// GET /api/meeting-reminders — run every minute by Vercel Cron (vercel.json "crons").
//
// Emails each booker their Google Meet link about 10 minutes before their live audit. The link is
// read from Cal.com at send time, never at booking time: calls get swapped between reps and the
// link changes with the host, so this is the only place the link is handed out.
//
// How it stays correct with no database:
//  - Every run asks Cal.com for Discovery calls starting within the next 10 minutes (plus a short
//    grace for calls that just started), so one booking is seen by ~10 consecutive runs.
//  - Each send carries a Resend Idempotency-Key built from the booking uid + recipient + email
//    content. Resend refuses to send the same key twice (24h memory), so those repeat runs cannot
//    produce duplicates. If the host or link changes inside the window, the content changes, the
//    key changes, and the booker gets one corrected email.
//  - A per-instance memo of keys already sent just saves the redundant Resend calls.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Fails closed if CRON_SECRET is
// unset. `?dry=1` (same auth) reports what would be sent without sending anything.
const crypto = require('crypto');
const { sendMeetingLinkEmail, buildMeetingLinkHtml, isMeetingUrl } = require('./_meeting-link-email');
const { sendBookingAlert } = require('./_alert');

const CAL_API = 'https://api.cal.com/v2/bookings';
const CAL_API_VERSION = '2024-08-13';
const DEFAULT_EVENT_TYPE_ID = 5076967; // Discovery (the live audit)
const LEAD_MS = 10 * 60 * 1000;        // send once the call is this close
const GRACE_MS = 2 * 60 * 1000;        // still send if the call started moments ago (late booking, slow run)
const UPSTREAM_TIMEOUT_MS = 12000;
const SEND_GAP_MS = 600;               // stay under Resend's requests-per-second limit
const HOST_DOMAIN_RE = /@revwhisper\.com$/i;

const ALERT_SUBJECT = '🚨 RevWhisper meeting-link reminders are failing';
const ALERT_HEADLINE = '🚨 Meeting-link reminders are failing';
const ALERT_SUMMARY = 'The reminder that emails bookers their Google Meet link 10 minutes before the call did not go out. It is the only email that carries the link, so affected bookers have no way to join unless someone sends it to them.';
const ALERT_HINT = 'The <code>/api/meeting-reminders</code> Vercel logs and cron runs, then <code>CAL_API_KEY</code>, <code>CRON_SECRET</code> and <code>RESEND_API_KEY</code> in the Vercel project settings.';

const sentKeys = new Map(); // idempotency key -> sent-at ms (warm instance only; Resend is the real guard)

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  return (user ? user[0] : '') + '***@' + (domain || '');
}

function alert(reason, detail, status) {
  return sendBookingAlert({
    source: 'meeting reminder', status, reason, detail,
    subject: ALERT_SUBJECT, headline: ALERT_HEADLINE, summary: ALERT_SUMMARY, hint: ALERT_HINT
  });
}

async function fetchUpcoming(apiKey, eventTypeId, nowMs) {
  const qs = new URLSearchParams({
    status: 'upcoming',
    eventTypeId: String(eventTypeId),
    afterStart: new Date(nowMs - GRACE_MS).toISOString(),
    beforeEnd: new Date(nowMs + LEAD_MS + 4 * 60 * 60 * 1000).toISOString(),
    sortStart: 'asc',
    take: '100'
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(`${CAL_API}?${qs}`, {
      headers: { 'cal-api-version': CAL_API_VERSION, Authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    if (r.status !== 200 || !body || !Array.isArray(body.data)) {
      return { ok: false, status: r.status, detail: JSON.stringify(body).slice(0, 600) };
    }
    return { ok: true, bookings: body.data };
  } catch (err) {
    return { ok: false, status: 0, detail: err && err.message ? err.message : 'network error' };
  } finally {
    clearTimeout(timeout);
  }
}

// Bookings that should get the link on this run: accepted Discovery calls starting within the
// lead window (or that started within the grace period).
function dueBookings(bookings, eventTypeId, nowMs) {
  return bookings.filter((b) => {
    if (!b || b.status !== 'accepted') return false;
    if (Number(b.eventTypeId) !== Number(eventTypeId)) return false;
    const start = new Date(b.start).getTime();
    return !Number.isNaN(start) && start > nowMs - GRACE_MS && start <= nowMs + LEAD_MS;
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return sendJson(res, 503, { error: 'Not configured (CRON_SECRET missing).' });
  const given = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (!given || !safeEqual(given, `Bearer ${secret}`)) return sendJson(res, 401, { error: 'Unauthorized.' });

  const dry = new URL(req.url, 'http://localhost').searchParams.get('dry') === '1';
  const apiKey = (process.env.CAL_API_KEY || '').trim();
  if (!apiKey) {
    await alert('CAL_API_KEY is not set', 'The reminder cannot read bookings from Cal.com without an API key.');
    return sendJson(res, 503, { error: 'Not configured (CAL_API_KEY missing).' });
  }
  const eventTypeId = Number(process.env.CAL_EVENT_TYPE_ID) || DEFAULT_EVENT_TYPE_ID;
  const nowMs = Date.now();

  const upstream = await fetchUpcoming(apiKey, eventTypeId, nowMs);
  if (!upstream.ok) {
    await alert('Could not read upcoming bookings from Cal.com', upstream.detail, upstream.status);
    return sendJson(res, 502, { error: 'Cal.com request failed.', status: upstream.status });
  }

  for (const [k, t] of sentKeys) if (nowMs - t > 60 * 60 * 1000) sentKeys.delete(k);

  const due = dueBookings(upstream.bookings, eventTypeId, nowMs);
  const items = [];
  let sends = 0;

  for (const b of due) {
    const host = Array.isArray(b.hosts) && b.hosts[0] ? b.hosts[0] : {};
    const meetingUrl = isMeetingUrl(b.meetingUrl) ? b.meetingUrl : (isMeetingUrl(b.location) ? b.location : '');
    const base = { uid: b.uid, start: b.start, host: host.name || '' };

    if (!meetingUrl) {
      items.push({ ...base, result: 'no-meeting-url' });
      if (!dry) await alert('A call starting soon has no Google Meet link in Cal.com', `Booking ${b.uid}, starts ${b.start}, host ${host.name || 'unknown'}.`);
      continue;
    }

    const replyTo = typeof host.email === 'string' && HOST_DOMAIN_RE.test(host.email) ? host.email : undefined;
    const attendees = (Array.isArray(b.attendees) ? b.attendees : [])
      .filter((a) => a && typeof a.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email));

    for (const a of attendees) {
      const fields = { name: a.name, startIso: b.start, timeZone: a.timeZone, hostName: host.name, meetingUrl };
      const digest = crypto.createHash('sha256')
        .update(a.email.toLowerCase() + '\n' + buildMeetingLinkHtml(fields)).digest('hex').slice(0, 24);
      const key = `meeting-link/${b.uid}/${digest}`;
      const item = { ...base, to: maskEmail(a.email) };

      if (sentKeys.has(key)) { items.push({ ...item, result: 'already-sent' }); continue; }
      if (dry) { items.push({ ...item, result: 'would-send' }); continue; }

      if (sends++) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
      const r = await sendMeetingLinkEmail({ ...fields, email: a.email, replyTo, idempotencyKey: key });
      if (r && r.ok) {
        sentKeys.set(key, nowMs);
        items.push({ ...item, result: 'sent' });
      } else {
        items.push({ ...item, result: 'failed' });
        await alert('Resend did not accept a meeting-link email', `Booking ${b.uid}, starts ${b.start}. ${JSON.stringify(r).slice(0, 400)}`, r && r.status);
      }
    }
  }

  const failed = items.some((i) => i.result === 'failed' || i.result === 'no-meeting-url');
  return sendJson(res, failed ? 500 : 200, { ok: !failed, dry, checked: upstream.bookings.length, due: due.length, items });
};

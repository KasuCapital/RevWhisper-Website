// Urgent ops alert when the booking funnel fails for a SYSTEMIC reason (a Cal.com config/parse
// error, a 5xx, broken auth, an unreachable upstream, or a request our own widget built that the
// API rejected) — NOT a normal "that slot was just taken" race. Emails the operator via Resend
// (api/_resend.js). The whole point is that a booking outage can never again go unnoticed for days.
//
// Callers: /api/cal-booking (booking failures), /api/cal-slots (availability failures — the
// calendar itself going dark), /api/client-error (failures only the browser saw).
//
// Hard rules:
//  - NEVER throws. Alerting must not break the booking flow (sendEmail already swallows errors).
//  - Throttled per source per warm instance so a sustained outage with traffic can't flood the
//    inbox. Per SOURCE, not global: a calendar outage must not mute a booking-failure alert that
//    lands two minutes later, and browser reports can't silence the server-side ones.
const { sendEmail } = require('./_resend');

const ALERT_TO = process.env.BOOKING_ALERT_EMAIL || 'bgamble@revwhisper.com';
const THROTTLE_MS = 10 * 60 * 1000; // at most one alert per source per 10 minutes per warm instance
const lastAlertAt = new Map();

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

const DEFAULT_HINT = 'Cal.com event type <code>5076967</code> (booking-questions config), then the ' +
  '<code>/api/cal-booking</code> Vercel logs. Past incident: a corrupted Cal "smsReminderNumber" ' +
  'booking field broke every booking with <code>4.required</code>.';

// fire an urgent booking-funnel alert. Returns the sendEmail result (or a skipped marker).
//   source   — which part of the funnel failed ('live booking', 'availability', 'browser · audit-booking')
//   status   — HTTP status involved, if any
//   reason   — one-line human summary
//   detail   — raw error text / request context for diagnosis
//   subject / headline / summary / hint — optional overrides of the default booking-failure wording
async function sendBookingAlert({ source = 'booking', status, reason, detail, subject, headline, summary, hint } = {}) {
  try {
    const key = String(source);
    const now = Date.now();
    const last = lastAlertAt.get(key) || 0;
    if (now - last < THROTTLE_MS) return { ok: false, skipped: 'throttled' };
    lastAlertAt.set(key, now);

    const when = new Date(now).toISOString();
    const subj = subject || "🚨 URGENT: RevWhisper bookings are FAILING — customers can't book";
    const head = headline || '🚨 Bookings are failing';
    const sum = summary || 'A booking just failed. Customers likely cannot book a meeting right now.';
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#b3261e;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">
          <div style="font-size:12px;letter-spacing:.09em;text-transform:uppercase;opacity:.85">RevWhisper · Booking Monitor</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">${esc(head)}</div>
        </div>
        <div style="border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;padding:22px;color:#1a1a1a">
          <p style="font-size:16px;margin:0 0 14px"><strong>${esc(sum)}</strong></p>
          <table style="font-size:14px;border-collapse:collapse;width:100%">
            <tr><td style="padding:5px 8px;color:#666;width:110px">Source</td><td style="padding:5px 8px"><strong>${esc(source)}</strong></td></tr>
            <tr><td style="padding:5px 8px;color:#666">Reason</td><td style="padding:5px 8px"><strong>${esc(reason)}</strong></td></tr>
            ${status ? `<tr><td style="padding:5px 8px;color:#666">HTTP status</td><td style="padding:5px 8px">${esc(status)}</td></tr>` : ''}
            <tr><td style="padding:5px 8px;color:#666;vertical-align:top">Detail</td><td style="padding:5px 8px"><code style="font-size:12px;word-break:break-word;white-space:pre-wrap">${esc(detail)}</code></td></tr>
            <tr><td style="padding:5px 8px;color:#666">Time (UTC)</td><td style="padding:5px 8px">${esc(when)}</td></tr>
          </table>
          <p style="font-size:13px;color:#555;margin:18px 0 0;line-height:1.5">
            <strong>What to check:</strong> ${hint || DEFAULT_HINT}
          </p>
          <p style="font-size:12px;color:#999;margin:14px 0 0">Further "${esc(source)}" alerts are muted for 10 minutes to avoid flooding.</p>
        </div>
      </div>`;

    return await sendEmail({ to: ALERT_TO, subject: subj, html });
  } catch (err) {
    console.error('sendBookingAlert failed (swallowed):', err && err.message);
    return { ok: false, error: err && err.message };
  }
}

module.exports = { sendBookingAlert };

// "Your meeting link" reminder for the live audit, sent about 10 minutes before the call by
// /api/meeting-reminders. This is the ONLY email that carries the Google Meet link.
//
// Why it exists: calls get swapped between reps and the Meet link changes with the host, so a link
// handed out at booking time sent people to the wrong meeting. The booking confirmation email and
// the add-to-calendar events deliberately carry no link; this one reads the booking from Cal.com
// right before the call, so the link (and the host named here) is whoever is actually taking it.
//
// Hard rules:
//  - NEVER throws.
//  - No link, no email: without a real https Meet URL there is nothing useful to send.
//  - Deliberately tiny: time, host, button, plain link as a fallback, one line on rescheduling.
const { sendEmail } = require('./_resend');

const FROM = 'RevWhisper <team@hello.revwhisper.com>';
const SUBJECT = 'Your meeting link';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function isMeetingUrl(v) {
  return typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v);
}

// Start time in the attendee's own timezone, e.g. "2:00 PM EST".
function formatTime(startIso, timeZone) {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timeZone || 'UTC', timeZoneName: 'short' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(d);
  }
}

// Returns '' when there is no usable Meet link (callers must not send in that case).
function buildMeetingLinkHtml({ name, startIso, timeZone, hostName, meetingUrl } = {}) {
  if (!isMeetingUrl(meetingUrl)) return '';
  const first = esc(firstName(name));
  const host = esc(firstName(hostName));
  const time = esc(formatTime(startIso, timeZone));
  const meet = esc(meetingUrl);
  const heading = first ? `Your call starts soon, ${first}.` : 'Your call starts soon.';
  const whenLine = (time ? `Your live audit is at <strong style="color:#32302F;">${time}</strong>` : 'Your live audit is about to start')
    + (host ? ` with ${host}` : '') + `. Here's your Google Meet link.`;
  const preheader = time ? `Your RevWhisper audit starts at ${time}.` : 'Your RevWhisper audit starts soon.';

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#32302F;background:#ffffff;">
      <div style="padding:32px 24px;">
        <img src="https://revwhisper.com/images/email/rw-mark.png" width="34" height="34" alt="RevWhisper" style="display:block;border:0;margin:0 0 24px;">

        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:400;margin:0 0 14px;color:#32302F;line-height:1.25;">
          ${heading}
        </h1>
        <p style="font-size:16px;line-height:1.6;color:#706b68;margin:0 0 22px;">${whenLine}</p>

        <a href="${meet}" style="display:inline-block;background:#4A6741;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:8px;">Join on Google Meet</a>

        <p style="font-size:13px;line-height:1.6;color:#a39e9b;margin:16px 0 0;">Button not working? Paste this into your browser:<br><a href="${meet}" style="color:#4A6741;">${meet}</a></p>

        <hr style="border:none;border-top:1px solid #E0DCDA;margin:28px 0;">

        <p style="font-size:16px;line-height:1.6;color:#706b68;margin:0;">Can't make it? Reply to this email and we'll find another time.</p>
      </div>
    </div>`;
}

// Send the reminder. Never throws; returns the sendEmail result (or a skipped marker).
// replyTo: the assigned host's address when known, so a last-minute "can't make it" reaches the
// person actually taking the call; otherwise sendEmail's default.
async function sendMeetingLinkEmail({ name, email, startIso, timeZone, hostName, meetingUrl, replyTo, idempotencyKey } = {}) {
  try {
    if (!email) return { ok: false, skipped: 'no-email' };
    const html = buildMeetingLinkHtml({ name, startIso, timeZone, hostName, meetingUrl });
    if (!html) return { ok: false, skipped: 'no-meeting-url' };
    return await sendEmail({
      to: email,
      from: FROM,
      ...(replyTo ? { replyTo } : {}),
      subject: SUBJECT,
      html,
      idempotencyKey
    });
  } catch (err) {
    console.error('sendMeetingLinkEmail error:', err && err.message);
    return { ok: false, error: err && err.message ? err.message : 'unknown' };
  }
}

module.exports = { sendMeetingLinkEmail, buildMeetingLinkHtml, isMeetingUrl };

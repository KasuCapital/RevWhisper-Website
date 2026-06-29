// Post-booking "what to expect" email for the live audit. Fired from /api/cal-booking on a
// successful booking and sent immediately (no scheduling — one fewer point of failure). Deliberately
// SHORT — the host has already read the /audit-booking confirmation screen, so this leads with the
// Google Meet link (the one actionable thing) and the genuinely new content (a plain-English "what
// RevWhisper is"), not a page recap.
//
// Hard rules:
//  - NEVER throws. A confirmation-email failure must not affect the booking.
//  - NO pricing. Sent from the brand address (RevWhisper), not a personal name — a personal-name
//    "From" trips strict inbound "employee-name impersonation" filters (e.g. Google Workspace).
//  - Wording is count-aware: single listing → "property"; any multi band → "portfolio".
const { sendEmail } = require('./_resend');

const FROM = 'RevWhisper <team@hello.revwhisper.com>';
const REPLY_TO = 'nluna@revwhisper.com'; // replies still reach a human (Nick)

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function firstName(name) {
  const f = String(name || '').trim().split(/\s+/)[0];
  return f || 'there';
}

// Single listing (or unknown) → singular wording; any multi band → portfolio.
function isSingle(listings) {
  return !listings || String(listings).trim() === '1';
}

// Format the confirmed start in the attendee's own timezone, e.g. "Saturday, June 27 at 2:00 PM EDT".
function formatWhen(startIso, timeZone) {
  const tz = timeZone || 'UTC';
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz }).format(d);
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }).format(d);
    return `${date} at ${time}`;
  } catch {
    const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(d);
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
    return `${date} at ${time}`;
  }
}

// Just the weekday, for the sign-off ("See you Saturday.").
function weekday(startIso, timeZone) {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return 'soon';
  try { return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timeZone || 'UTC' }).format(d); }
  catch { return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d); }
}

function buildAuditConfirmationHtml({ name, startIso, timeZone, listings, meetingUrl } = {}) {
  const first = esc(firstName(name));
  const single = isSingle(listings);
  const prop = single ? 'property' : 'portfolio';
  const when = esc(formatWhen(startIso, timeZone));
  const day = esc(weekday(startIso, timeZone));
  const meet = (typeof meetingUrl === 'string' && /^https?:\/\//.test(meetingUrl)) ? meetingUrl : '';
  const whenLine = when
    ? `You're set for <strong style="color:#32302F;">${when}</strong>, about 30 minutes over Google Meet.`
    : `Your audit is confirmed, about 30 minutes over Google Meet.`;

  // The Meet link is the one actionable thing — lead with it. If Cal.com hasn't surfaced it yet,
  // fall back to the "we'll send it" reassurance rather than showing a broken button.
  const meetBlock = meet
    ? `<a href="${esc(meet)}" style="display:inline-block;background:#4A6741;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:8px;">Join on Google Meet</a>
        <p style="font-size:13px;color:#a39e9b;margin:11px 0 0;">It's also in your calendar invite, and we'll send a reminder before your call.</p>`
    : `<p style="font-size:15px;line-height:1.6;color:#706b68;margin:0;">Your Google Meet link is in the calendar invite we just sent, and we'll have it ready for you here before your call.</p>`;

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your audit is confirmed — here's your Google Meet link and what we'll cover.</div>
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#32302F;background:#ffffff;">
      <div style="padding:32px 24px;">
        <img src="https://revwhisper.com/images/email/rw-mark.png" width="34" height="34" alt="RevWhisper" style="display:block;border:0;margin:0 0 24px;">

        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:400;margin:0 0 14px;color:#32302F;line-height:1.25;">
          You're booked, ${first}.
        </h1>
        <p style="font-size:16px;line-height:1.6;color:#706b68;margin:0 0 22px;">${whenLine}</p>

        ${meetBlock}

        <hr style="border:none;border-top:1px solid #E0DCDA;margin:28px 0;">

        <p style="font-size:16px;line-height:1.7;color:#706b68;margin:0;">
          On the call we'll get to know your ${prop}, pull up your ranking audit live on screen, and show you exactly where your revenue opportunity is. If it's a fit we'll talk about working together; either way you'll leave knowing where you stand.
        </p>

        <p style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a39e9b;margin:28px 0 12px;">What we actually do</p>
        <p style="font-size:16px;line-height:1.7;color:#706b68;margin:0 0 14px;">
          Two jobs, every day: we optimize your listing and we grow your revenue, with one goal: making you the most money possible. The difference is in how we price.
        </p>
        <p style="font-size:16px;line-height:1.7;color:#706b68;margin:0 0 14px;">
          Most revenue managers price off the market, matching whatever comparable listings charge. What they miss is that every pricing decision also moves your ranking and visibility on Airbnb, and they never account for it. Push it too high and your listing gets completely buried, invisible to the guests searching your dates. Drop it too low and you stay visible, but your calendar fills at rates far below what those nights could have brought in. The most money lives at the exact point in between, and dialing into it is everything: the highest rate you can hold without losing your visibility. <strong style="color:#32302F;">We scrape your live ranking and adjust your rate to that point, every single day.</strong> Very few revenue managers price with that discipline.
        </p>
        <p style="font-size:16px;line-height:1.7;color:#706b68;margin:0;">
          It's the same system we run on our own short-term rentals across the US, and it's why hosts we manage see a 25% revenue lift year over year, well ahead of what market-based pricing alone delivers.
        </p>

        <p style="font-size:16px;line-height:1.6;color:#706b68;margin:24px 0 0;">
          <strong style="color:#32302F;">To get the most from it,</strong> come with a number in mind for what your ${prop} could do at its best, and the one thing about your revenue that nags at you most.
        </p>

        <p style="font-size:16px;line-height:1.6;color:#32302F;margin:26px 0 0;">See you ${day}. Reply here if anything changes.</p>
      </div>
    </div>`;
}

// Send the confirmation immediately. Never throws; returns the sendEmail result (or a marker).
async function sendAuditConfirmationEmail({ name, email, startIso, timeZone, listings, meetingUrl } = {}) {
  try {
    if (!email) return { ok: false, skipped: 'no-email' };
    return await sendEmail({
      to: email,
      from: FROM,
      replyTo: REPLY_TO,
      subject: 'Your live audit is booked',
      html: buildAuditConfirmationHtml({ name, startIso, timeZone, listings, meetingUrl })
    });
  } catch (err) {
    console.error('sendAuditConfirmationEmail error:', err && err.message);
    return { ok: false, error: err && err.message ? err.message : 'unknown' };
  }
}

module.exports = { sendAuditConfirmationEmail, buildAuditConfirmationHtml };

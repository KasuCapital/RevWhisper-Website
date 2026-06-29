// Shared Resend integration point. Both the form-webhook confirmation email and the
// conference "send to client" email go through here so there is a single place that
// owns the API shape, auth header, and the "key not set" degradation behavior.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Must send from the verified Resend domain (hello.revwhisper.com). The bare
// revwhisper.com domain is NOT verified, so sending from it is rejected (403).
const DEFAULT_FROM = 'RevWhisper <team@hello.revwhisper.com>';
const DEFAULT_REPLY_TO = 'nluna@revwhisper.com';

function isEmailEnabled() {
  return Boolean(RESEND_API_KEY);
}

// Sends a single email via Resend. Never throws — returns a result object so callers
// can decide whether the failure matters (fire-and-forget vs. surface to the user).
// scheduledAt (optional): an ISO-8601 string or Resend natural-language offset (e.g. "in 5 min").
// When set, Resend holds the email and delivers it at that time instead of immediately.
async function sendEmail({ to, subject, html, from = DEFAULT_FROM, replyTo = DEFAULT_REPLY_TO, scheduledAt }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email.');
    return { ok: false, skipped: true, error: 'RESEND_API_KEY not configured.' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {})
      })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Resend email failed:', res.status, text);
      return { ok: false, status: res.status, error: text || `Resend returned ${res.status}` };
    }

    return { ok: true, status: res.status };
  } catch (err) {
    console.error('Resend email error:', err);
    return { ok: false, error: err && err.message ? err.message : 'Unknown Resend error.' };
  }
}

module.exports = { sendEmail, isEmailEnabled, DEFAULT_FROM };

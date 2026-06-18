// Sends the conference "next steps" email to a prospect: a short RevWhisper intro,
// the custom checkout link the teammate just built, and a link to book a call.
// Triggered by the "Send to client" button on /event-builder.

const { sendEmail } = require('./_resend');

const BOOKING_URL = 'https://cal.com/team/revwhisper/discovery';
const ALLOWED_CHECKOUT_HOSTS = new Set(['revwhisper.com', 'www.revwhisper.com']);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    return {};
  }
}

// The endpoint is unauthenticated, so only allow checkout links that point back to our
// own checkout form — never let it be used to mail an arbitrary URL to an arbitrary inbox.
function isAllowedCheckoutUrl(value) {
  try {
    const url = new URL(String(value));
    return (
      url.protocol === 'https:' &&
      ALLOWED_CHECKOUT_HOSTS.has(url.hostname) &&
      url.pathname.replace(/\/$/, '') === '/checkout-form'
    );
  } catch (error) {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml({ firstName, checkoutUrl, bookingUrl }) {
  const safeName = escapeHtml(firstName);
  const safeCheckout = escapeHtml(checkoutUrl);
  const safeBooking = escapeHtml(bookingUrl);

  return `
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#32302F;">
      <div style="padding:32px 24px;">
        <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;margin:0 0 16px;color:#32302F;">
          Great connecting, ${safeName}.
        </h1>
        <p style="font-size:15px;line-height:1.7;color:#706b68;margin:0 0 20px;">
          RevWhisper is a revenue optimization service for short-term rental hosts, built by hosts.
          We take over the pricing, listing, and search-ranking work that quietly leaves money on the
          table &mdash; so your calendar fills at the right rate without you babysitting it.
        </p>
        <p style="font-size:15px;line-height:1.7;color:#706b68;margin:0 0 28px;">
          Here are your two next steps. When you're ready to get started, the enrollment link below
          has your details and pricing already set up. If you'd rather talk it through first, grab a
          time with our team.
        </p>

        <a href="${safeCheckout}" style="display:block;text-align:center;background:#4A6741;color:#fff;text-decoration:none;padding:14px 24px;border-radius:6px;font-size:15px;font-weight:600;margin:0 0 12px;">
          Complete your enrollment
        </a>
        <a href="${safeBooking}" style="display:block;text-align:center;background:#fff;color:#32302F;text-decoration:none;padding:13px 24px;border:1.5px solid #E0DCDA;border-radius:6px;font-size:15px;font-weight:500;margin:0 0 28px;">
          Book a call with our team
        </a>

        <p style="font-size:13px;line-height:1.7;color:#a39e9b;margin:0 0 24px;">
          Questions before you commit? Just reply to this email &mdash; it goes straight to our team.
        </p>

        <hr style="border:none;border-top:1px solid #E0DCDA;margin:8px 0 16px;">
        <p style="font-size:12px;color:#a39e9b;margin:0;">
          RevWhisper — Revenue optimization for short-term rental hosts.
        </p>
      </div>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = await parseBody(req);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const checkoutUrl = String(body.checkout_url || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: 'A valid client email is required.' });
  }

  if (!isAllowedCheckoutUrl(checkoutUrl)) {
    return sendJson(res, 400, { error: 'A valid RevWhisper checkout link is required.' });
  }

  const firstName = name.split(/\s+/)[0] || 'there';

  // Prefill the booking page with the prospect's name/email too.
  const bookingUrl =
    `${BOOKING_URL}?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;

  const result = await sendEmail({
    to: email,
    subject: 'Your RevWhisper next steps',
    html: buildEmailHtml({ firstName, checkoutUrl, bookingUrl })
  });

  if (!result.ok) {
    const status = result.skipped ? 503 : 502;
    return sendJson(res, status, {
      error: result.error || 'Unable to send the email right now. Copy the link and send it manually.'
    });
  }

  return sendJson(res, 200, { sent: true });
};

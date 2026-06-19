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
    <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#32302F;">
      <div style="padding:32px 24px;">
        <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;margin:0 0 16px;color:#32302F;">
          Great connecting, ${safeName}.
        </h1>
        <p style="font-size:15px;line-height:1.7;color:#706b68;margin:0 0 24px;">
          Thanks for hearing us out at the conference! Here's a quick recap and everything you need
          to get started with onboarding your RevWhisper service.
        </p>

        <p style="font-size:15px;line-height:1.7;color:#706b68;margin:0 0 14px;">
          Our approach is built on excelling at three things:
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f0;border-radius:10px;margin:0 0 30px;">
          <tr><td style="padding:18px 22px;">
            <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4A6741;margin:0 0 5px;">Visibility</p>
            <p style="font-size:14px;line-height:1.6;color:#48433f;margin:0;">Making sure your listing shows up on page one for the open nights on your calendar.</p>
          </td></tr>
          <tr><td style="padding:18px 22px;border-top:1px solid #e6e2de;">
            <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4A6741;margin:0 0 5px;">Conversion</p>
            <p style="font-size:14px;line-height:1.6;color:#48433f;margin:0;">Crafting your listing page so viewers stay engaged longer &mdash; and book.</p>
          </td></tr>
          <tr><td style="padding:18px 22px;border-top:1px solid #e6e2de;">
            <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4A6741;margin:0 0 5px;">Revenue Management</p>
            <p style="font-size:14px;line-height:1.6;color:#48433f;margin:0;">Most teams stop at market-adjusted pricing. We use rank-adjusted pricing &mdash; so we never undersell your property and capture the highest possible ADR for every open night.</p>
          </td></tr>
        </table>

        <p style="font-size:15px;line-height:1.7;color:#706b68;margin:0 0 20px;">
          Below is the roll-out timeline for onboarding. Your enrollment check-out triggers your
          Research &amp; Initial Set-Up &mdash; once you check out, I'll send your Listing Intake Form
          and kick things off with a member of our Onboarding Team.
        </p>

        <a href="${safeCheckout}" style="display:block;text-align:center;background:#4A6741;color:#fff;text-decoration:none;padding:14px 24px;border-radius:6px;font-size:15px;font-weight:600;margin:0 0 28px;">
          Complete your enrollment
        </a>

        <div style="border-top:1px solid #E0DCDA;padding-top:26px;">
          <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a39e9b;margin:0 0 20px;">What happens next</p>

          <div style="margin:0 0 22px;">
            <p style="font-family:Georgia,serif;font-size:18px;font-weight:400;color:#32302F;margin:0 0 8px;line-height:1.3;">Research, Ranking Audit &amp; Performance Meeting</p>
            <p style="font-size:14px;line-height:1.7;color:#706b68;margin:0 0 12px;">We connect to your Airbnb account and run a complete analysis of where you stand today &mdash; your search rank across the next 60 days of availability, listing quality gaps, pricing structure, and competitive positioning. This becomes your performance baseline.</p>
            <p style="font-size:14px;line-height:1.7;color:#706b68;margin:0 0 10px;">You'll meet with your RevWhisper Representative within 5 business days to review findings and move forward across five areas:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.6;color:#706b68;margin:0;">
              <tr><td style="padding:3px 0;"><strong style="color:#48433f;">Search Rank Baseline</strong> &mdash; your current position across 60&ndash;90 days of open dates, by guest configuration.</td></tr>
              <tr><td style="padding:3px 0;"><strong style="color:#48433f;">Rules &amp; Settings</strong> &mdash; account-level adjustments that directly affect visibility.</td></tr>
              <tr><td style="padding:3px 0;"><strong style="color:#48433f;">Listing Enhancements</strong> &mdash; copy, title, meta-tags, amenities, photos, and completeness scoring.</td></tr>
              <tr><td style="padding:3px 0;"><strong style="color:#48433f;">Image Improvements</strong> &mdash; upgrades to photo quality, selection, and sequencing.</td></tr>
              <tr><td style="padding:3px 0;"><strong style="color:#48433f;">Pricing Strategy &amp; Rules</strong> &mdash; dynamic pricing built around a true competitive set.</td></tr>
            </table>
          </div>

          <div style="margin:0 0 22px;padding-top:22px;border-top:1px solid #E0DCDA;">
            <p style="font-family:Georgia,serif;font-size:18px;font-weight:400;color:#32302F;margin:0 0 8px;line-height:1.3;">Implementation</p>
            <p style="font-size:14px;line-height:1.7;color:#706b68;margin:0;">Our team executes all approved changes to your account, listing, and pricing setup &mdash; typically within 2 days, depending on the volume of changes.</p>
          </div>

          <div style="padding-top:22px;border-top:1px solid #E0DCDA;">
            <p style="font-family:Georgia,serif;font-size:18px;font-weight:400;color:#32302F;margin:0 0 8px;line-height:1.3;">Your monthly service begins</p>
            <p style="font-size:14px;line-height:1.7;color:#706b68;margin:0;">Continuous rank monitoring, pricing promotion strategy, competitor pacing, and ongoing listing improvements &mdash; keeping you on page one and growing your booking conversion.</p>
          </div>
        </div>

        <p style="font-size:15px;line-height:1.7;color:#706b68;margin:28px 0 24px;">
          I hope you found our chat informative, and I'm confident our team can unlock your property's
          true performance. If you'd prefer to talk it through on a call first, grab a time with our team.
        </p>

        <a href="${safeBooking}" style="display:block;text-align:center;background:#fff;color:#32302F;text-decoration:none;padding:13px 24px;border:1.5px solid #E0DCDA;border-radius:6px;font-size:15px;font-weight:500;margin:0 0 28px;">
          Book a meeting
        </a>

        <p style="font-size:15px;line-height:1.7;color:#32302F;margin:0 0 12px;">
          Looking forward to working for you,
        </p>
        <p style="font-size:15px;line-height:1.5;color:#32302F;margin:0;font-weight:600;">Nick</p>
        <p style="font-size:14px;line-height:1.5;color:#4A6741;margin:0 0 24px;">nluna@revwhisper.com</p>

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
    subject: 'Your Next Steps',
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

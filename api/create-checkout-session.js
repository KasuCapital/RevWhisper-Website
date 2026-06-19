const MAX_LISTINGS = 10;
const VALID_PLANS = new Set(['monthly', 'annual', 'enterprise']);
// Standard (non-enterprise) one-time onboarding fee, charged upfront per listing.
// This path creates no monthly/recurring charge.
const ONBOARDING_FEE_PER_LISTING = 996;
// Hardcoded promo codes → fraction off the onboarding fee. Mirrored in checkout-form.html.
const PROMO_CODES = { welcome50: 0.5 };

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function resolveBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = (forwardedProto ? forwardedProto.split(',')[0] : 'https').trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}`;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string') return {};
  try {
    return JSON.parse(req.body);
  } catch (error) {
    return {};
  }
}

function parseListingCount(payload) {
  const rawCount = Number.parseInt(payload.listing_count, 10);
  if (Number.isInteger(rawCount)) return rawCount;

  if (Array.isArray(payload.listings)) {
    return payload.listings.filter((item) => typeof item === 'string' && item.trim()).length;
  }

  return 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const payload = parseBody(req);
  const email = String(payload.email || '').trim().toLowerCase();
  const submittedPlan = String(payload.plan || '').trim().toLowerCase();
  const plan = VALID_PLANS.has(submittedPlan) ? submittedPlan : 'monthly';
  const listingCount = parseListingCount(payload);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: 'A valid email is required.' });
  }

  if (!Number.isInteger(listingCount) || listingCount < 1) {
    return sendJson(res, 400, { error: 'At least one listing is required.' });
  }

  const baseUrl = resolveBaseUrl(req);
  const isEnterprise = plan === 'enterprise';
  // Promo discount is honored only on the standard onboarding path (enterprise quotes are bespoke).
  const promoCode = String(payload.promo_code || '').trim().toLowerCase();
  const promoDiscount =
    !isEnterprise && Object.prototype.hasOwnProperty.call(PROMO_CODES, promoCode)
      ? PROMO_CODES[promoCode]
      : 0;
  const parseNumeric = (value) => {
    if (value == null || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const onboardingFee = isEnterprise ? parseNumeric(payload.onboarding_fee) : 0;
  const monthlyCost = isEnterprise ? parseNumeric(payload.monthly_cost) : 0;
  const useSubscriptionMode = isEnterprise && onboardingFee === 0;
  const enterpriseRedirectUrl =
    process.env.ENTERPRISE_REDIRECT_URL || `${baseUrl}/get-started?plan=enterprise`;

  if (!isEnterprise && listingCount > MAX_LISTINGS) {
    return sendJson(res, 200, {
      enterprise: true,
      redirect_url: enterpriseRedirectUrl,
      message: 'Portfolio size is 11+ listings. Redirect to enterprise pricing flow.'
    });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    return sendJson(res, 500, {
      error: 'Stripe is not configured. Required env var: STRIPE_SECRET_KEY.'
    });
  }

  if (isEnterprise) {
    if (useSubscriptionMode) {
      if (monthlyCost < 1) {
        return sendJson(res, 400, {
          error: 'A valid monthly cost is required when onboarding fee is $0.'
        });
      }
    } else if (onboardingFee < 1) {
      return sendJson(res, 400, { error: 'A valid onboarding fee is required for enterprise plans.' });
    }
  }

  const successUrl =
    process.env.STRIPE_SUCCESS_URL || `${baseUrl}/success-b?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    process.env.STRIPE_CANCEL_URL ||
    `${baseUrl}/checkout-form${plan ? `?plan=${encodeURIComponent(plan)}` : ''}`;

  const params = new URLSearchParams();
  params.set('mode', useSubscriptionMode ? 'subscription' : 'payment');
  params.set('customer_email', email);
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('allow_promotion_codes', 'true');

  if (useSubscriptionMode) {
    // Enterprise with waived onboarding fee: start the monthly subscription immediately.
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(Math.round(monthlyCost * 100)));
    params.set('line_items[0][price_data][recurring][interval]', 'month');
    params.set('line_items[0][price_data][product_data][name]', 'RevWhisper Monthly Subscription');
    params.set('line_items[0][quantity]', String(listingCount));
  } else if (isEnterprise) {
    // Dynamic pricing via price_data for enterprise
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(Math.round(onboardingFee * 100)));
    params.set('line_items[0][price_data][product_data][name]', 'Listing Optimization Fee (Enterprise)');
    params.set('line_items[0][quantity]', String(listingCount));
  } else {
    // Standard onboarding: one-time fee per listing, with optional promo discount applied server-side.
    const unitAmount = Math.round(ONBOARDING_FEE_PER_LISTING * (1 - promoDiscount) * 100);
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(unitAmount));
    params.set('line_items[0][price_data][product_data][name]', 'RevWhisper Listing Optimization (one-time)');
    params.set('line_items[0][quantity]', String(listingCount));
  }

  params.set('metadata[email]', email);
  params.set('metadata[plan]', plan);
  params.set('metadata[listing_count]', String(listingCount));
  params.set('metadata[source]', 'checkout-form');
  params.set('metadata[checkout_mode]', useSubscriptionMode ? 'subscription' : 'payment');

  if (isEnterprise) {
    params.set('metadata[onboarding_fee]', String(onboardingFee));
    params.set('metadata[monthly_cost]', String(monthlyCost));
    if (payload.term_months) params.set('metadata[term_months]', String(payload.term_months));
  } else {
    params.set(
      'metadata[onboarding_fee_per_listing]',
      String(Math.round(ONBOARDING_FEE_PER_LISTING * (1 - promoDiscount)))
    );
  }

  if (promoDiscount > 0) {
    params.set('metadata[promo_code]', promoCode);
    params.set('metadata[promo_discount_pct]', String(Math.round(promoDiscount * 100)));
  }

  if (Array.isArray(payload.listings) && payload.listings.length) {
    const listingUrls = payload.listings
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, isEnterprise ? 50 : MAX_LISTINGS)
      .join(',');
    if (listingUrls) params.set('metadata[listing_urls]', listingUrls.slice(0, 450));
  }

  let stripeResponse;
  try {
    stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
  } catch (error) {
    return sendJson(res, 502, { error: 'Unable to reach Stripe Checkout right now.' });
  }

  const stripeRawBody = await stripeResponse.text();
  let stripeBody = null;
  try {
    stripeBody = JSON.parse(stripeRawBody);
  } catch (error) {
    stripeBody = null;
  }

  if (!stripeResponse.ok) {
    const stripeMessage =
      stripeBody && stripeBody.error && stripeBody.error.message
        ? stripeBody.error.message
        : 'Stripe rejected checkout session creation.';
    return sendJson(res, 502, { error: stripeMessage });
  }

  if (!stripeBody || !stripeBody.url) {
    return sendJson(res, 502, { error: 'Stripe returned an invalid checkout response.' });
  }

  return sendJson(res, 200, {
    checkout_url: stripeBody.url,
    session_id: stripeBody.id
  });
};

const WEBHOOK_URLS = {
  get_started:
    process.env.MAKE_GET_STARTED_WEBHOOK_URL ||
    'https://hook.us2.make.com/23rh699yc1ob5tcetd6ionr18431yvyr',
  checkout:
    process.env.MAKE_CHECKOUT_WEBHOOK_URL ||
    'https://hook.us2.make.com/jgedj1a6t70wyml2umwaaa73maexffrk',
  revenue_lift:
    process.env.MAKE_REVENUE_LIFT_WEBHOOK_URL ||
    'https://hook.us2.make.com/4wpxqhppekskm9448ggsndhovimtji71',
  webinar_registration:
    process.env.MAKE_WEBINAR_WEBHOOK_URL ||
    'https://hook.us2.make.com/33fat6fwbl6ad1jt13b7kqcpgbybka59'
};

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

function payloadError(eventType, payload) {
  const email = String(payload.email || '').trim();
  if (!email || !email.includes('@')) return 'A valid email is required.';

  if (eventType === 'get_started') {
    if (!String(payload.name || '').trim()) return 'A name is required.';
    if (!String(payload.phone || '').trim()) return 'A phone number is required.';
  }

  if (eventType === 'checkout') {
    const listingCount = Number.parseInt(payload.listing_count, 10);
    const hasListings = Array.isArray(payload.listings) && payload.listings.length > 0;
    if ((!Number.isInteger(listingCount) || listingCount < 1) && !hasListings) {
      return 'At least one listing is required.';
    }
  }

  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = await parseBody(req);
  const eventType = String(body.event_type || '').trim();
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : null;
  const targetUrl = WEBHOOK_URLS[eventType];

  if (!targetUrl) {
    return sendJson(res, 400, { error: 'Unsupported event type.' });
  }

  if (!payload) {
    return sendJson(res, 400, { error: 'A JSON payload object is required.' });
  }

  const validationError = payloadError(eventType, payload);
  if (validationError) {
    return sendJson(res, 400, { error: validationError });
  }

  const forwardPayload = {
    ...payload,
    event_type: eventType
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let makeResponse;
  try {
    makeResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardPayload),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error(`Failed to forward ${eventType} webhook:`, error);
    return sendJson(res, 502, { error: 'Unable to reach the notification webhook right now.' });
  }

  clearTimeout(timeout);

  if (!makeResponse.ok) {
    let responseText = '';
    try {
      responseText = await makeResponse.text();
    } catch (error) {
      responseText = '';
    }

    console.error(`Webhook ${eventType} failed with ${makeResponse.status}:`, responseText);
    return sendJson(res, 502, { error: 'Notification webhook rejected the request.' });
  }

  return sendJson(res, 200, { received: true });
};

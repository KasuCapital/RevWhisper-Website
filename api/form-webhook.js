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
    'https://hook.us2.make.com/33fat6fwbl6ad1jt13b7kqcpgbybka59',
  // Conference / in-person intake collected by teammates. Has its own dedicated Make
  // scenario (payload also carries source:'conference').
  conference_intake:
    process.env.MAKE_CONFERENCE_WEBHOOK_URL ||
    'https://hook.us2.make.com/4i96f2csrjaxev5150b1rqklrb7fb91g'
};

const INTAKE_WEBHOOK_URL = 'https://hook.us2.make.com/9x8k27nrk3ll6rfrjtfrn469cnslxpuj';
const DEFAULT_X_AUDIT_LEAD_EVENT_ID = 'tw-r8ftv-r8ftx';

const { sendCapiEvent, buildUserData } = require('./_meta-capi');
const { sendXConversionEvent, buildIdentifiers } = require('./_x-capi');
async function sendIntakeWebhook(name, email) {
  try {
    await fetch(INTAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
  } catch (err) {
    console.error('Intake webhook error:', err);
  }
}

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email is required.';

  if (eventType === 'get_started' || eventType === 'conference_intake') {
    if (!String(payload.name || '').trim()) return 'A name is required.';
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

  // For get_started submissions: intake webhook, plus the server-side Meta CAPI Lead
  // (deduped with the browser Pixel via the shared fbEventId).
  if (eventType === 'get_started') {
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();

    const tasks = [
      sendIntakeWebhook(name, email)
    ];

    // Only the audit funnel sends browser event IDs. Scope server-side ad events to it so
    // we never emit a server Lead for a page that didn't fire a browser Lead to dedupe against.
    if (payload.fbEventId) {
      const [firstName, ...rest] = name.split(' ');
      tasks.push(sendCapiEvent({
        eventName: 'Lead',
        eventId: String(payload.fbEventId),
        eventSourceUrl: req.headers.referer || req.headers.referrer || undefined,
        userData: buildUserData({
          email,
          phone: payload.phone,
          firstName,
          lastName: rest.join(' '),
          req
        }),
        customData: {
          content_name: payload.fbContentName || 'Free Audit',
          content_category: 'Audit Lead'
        }
      }));
    }

    if (payload.xConversionId) {
      tasks.push(sendXConversionEvent({
        eventId: process.env.X_AUDIT_LEAD_EVENT_ID || DEFAULT_X_AUDIT_LEAD_EVENT_ID,
        conversionId: String(payload.xConversionId),
        eventSourceUrl: req.headers.referer || req.headers.referrer || 'https://revwhisper.com/audit',
        identifiers: buildIdentifiers({
          twclid: payload.twclid || (payload.attribution && payload.attribution.twclid),
          email,
          phone: payload.phone,
          req
        }),
        description: payload.xContentName || 'Free Audit Lead'
      }));
    }

    // Don't block the response on side-effects
    await Promise.allSettled(tasks);
  }

  return sendJson(res, 200, { received: true });
};

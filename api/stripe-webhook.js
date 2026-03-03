const crypto = require('crypto');

const RELEVANT_EVENTS = new Set([
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed'
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body), 'utf8');

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function verifyStripeSignature(rawBodyBuffer, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) return false;

  const elements = signatureHeader.split(',');
  let timestamp = null;
  const signatures = [];

  for (const element of elements) {
    const [key, value] = element.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || !signatures.length) return false;

  const ts = Number.parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(ts) || Math.abs(now - ts) > 300) return false;

  const signedPayload = `${timestamp}.${rawBodyBuffer.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(signedPayload, 'utf8').digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return signatures.some((sig) => {
    const signatureBuffer = Buffer.from(sig, 'hex');
    return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const rawBody = await readRawBody(req);
  if (!rawBody.length) return sendJson(res, 400, { error: 'Missing webhook body.' });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers['stripe-signature'];
    const validSignature = verifyStripeSignature(rawBody, signature, webhookSecret);
    if (!validSignature) return sendJson(res, 400, { error: 'Invalid Stripe signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    return sendJson(res, 400, { error: 'Webhook body is not valid JSON.' });
  }

  if (!event || !event.type || !event.data || !event.data.object) {
    return sendJson(res, 400, { error: 'Webhook payload is missing required fields.' });
  }

  const makeWebhookUrl = process.env.MAKE_STRIPE_WEBHOOK_URL;
  if (makeWebhookUrl && RELEVANT_EVENTS.has(event.type)) {
    const object = event.data.object;
    const payload = {
      event_type: event.type,
      event_id: event.id || null,
      created: event.created || null,
      livemode: !!event.livemode,
      session_id: object.id || null,
      customer_email: object.customer_details?.email || object.customer_email || null,
      subscription_id: object.subscription || null,
      invoice_id: object.invoice || null,
      metadata: object.metadata || {}
    };

    try {
      await fetch(makeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      // Stripe considers 2xx success as final delivery; surface non-blocking integration failures in logs.
      console.error('Failed to forward Stripe webhook to Make:', error);
    }
  }

  return sendJson(res, 200, { received: true });
};

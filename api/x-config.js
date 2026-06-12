const DEFAULT_PIXEL_ID = 'r8ftv';
const DEFAULT_AUDIT_LEAD_EVENT_ID = 'tw-r8ftv-r8ftx';
const DEFAULT_AUDIT_CALL_BOOKED_EVENT_ID = 'tw-r8ftv-rd0hl';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  return sendJson(res, 200, {
    pixelId: (process.env.X_PIXEL_ID || DEFAULT_PIXEL_ID).trim(),
    auditLeadEventId: (process.env.X_AUDIT_LEAD_EVENT_ID || DEFAULT_AUDIT_LEAD_EVENT_ID).trim(),
    auditCallBookedEventId: (process.env.X_AUDIT_CALL_BOOKED_EVENT_ID || DEFAULT_AUDIT_CALL_BOOKED_EVENT_ID).trim()
  });
};

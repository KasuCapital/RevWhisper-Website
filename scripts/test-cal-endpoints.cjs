/* Rigorous offline tests for the Cal.com proxy endpoints.
 * Mocks the upstream `fetch` so NO real bookings are created.
 * Run: node scripts/test-cal-endpoints.cjs
 */
const path = require('node:path');
// Capture ops alerts instead of emailing them — every alert path is asserted below.
const alerts = [];
require.cache[require.resolve(path.join(__dirname, '..', 'api', '_alert.js'))] = {
  id: 'mock-alert', filename: 'mock-alert', loaded: true, children: [],
  exports: { sendBookingAlert: async (a) => { alerts.push(a); return { ok: true }; } }
};
const booking = require(path.join(__dirname, '..', 'api', 'cal-booking.js'));
const slots = require(path.join(__dirname, '..', 'api', 'cal-slots.js'));
const clientError = require(path.join(__dirname, '..', 'api', 'client-error.js'));
const DAY = 24 * 60 * 60 * 1000;

let passed = 0, failed = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; fails.push(name + (detail ? ` — ${detail}` : '')); }
}

// ── Mocks ──
function mockRes() {
  return {
    statusCode: 200, headers: {}, _body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this._body = b; },
    json() { try { return JSON.parse(this._body); } catch { return null; } }
  };
}
function fakeResponse(status, jsonBody, opts) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (opts && opts.nonJson) throw new Error('not json');
      return jsonBody;
    }
  };
}
// Install a fetch mock that pops queued responses (or throws for network errors).
let fetchCalls = [];
function installFetch(queue) {
  fetchCalls = [];
  global.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options: options || {} });
    const next = queue.shift();
    if (next === undefined) throw new Error('mock: no queued response');
    if (next === 'NETWORK') throw new Error('mock network failure');
    return next;
  };
}
function authHeaderOf(callIdx) {
  const h = (fetchCalls[callIdx] && fetchCalls[callIdx].options.headers) || {};
  return h['Authorization'] || h['authorization'];
}
function bodyOf(callIdx) {
  try { return JSON.parse(fetchCalls[callIdx].options.body); } catch { return {}; }
}

async function run() {
  // ───────────────────── cal-booking ─────────────────────
  const validBody = {
    start: '2026-07-01T15:00:00.000Z', name: 'Jane Doe', email: 'jane@example.com',
    timeZone: 'America/New_York', phone: '+1 (555) 123-4567', listings: '2-5',
    airbnbUrl: 'https://airbnb.com/rooms/123', source: 'audit',
    attribution: { utm_source: 'fb', utm_campaign: 'spring' }
  };
  const ok201 = () => fakeResponse(201, { status: 'success', data: { uid: 'abc', start: validBody.start, end: '2026-07-01T15:30:00.000Z', location: 'meet', duration: 30, title: 'Discovery' } });

  // 1. Validation: missing email → 400, no upstream call
  installFetch([]);
  let r = mockRes();
  await booking({ method: 'POST', body: { ...validBody, email: '' } }, r);
  check('booking/validation: bad email → 400', r.statusCode === 400, `got ${r.statusCode}`);
  check('booking/validation: no upstream call', fetchCalls.length === 0);

  // 1b. Method guard
  installFetch([]);
  r = mockRes();
  await booking({ method: 'GET' }, r);
  check('booking/method: GET → 405', r.statusCode === 405);

  // 2. Happy path with valid key → 201, single call, auth header present
  process.env.CAL_API_KEY = 'cal_live_validkey';
  delete process.env.CAL_EVENT_TYPE_ID;
  installFetch([ok201()]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/happy: 201', r.statusCode === 201 && r.json().ok === true, `got ${r.statusCode}`);
  check('booking/happy: single upstream call', fetchCalls.length === 1, `calls=${fetchCalls.length}`);
  check('booking/happy: sent auth header', authHeaderOf(0) === 'Bearer cal_live_validkey');
  check('booking/happy: legacy eventTypeId (default 5076967)', bodyOf(0).eventTypeId === 5076967 && !bodyOf(0).eventTypeSlug, JSON.stringify({ id: bodyOf(0).eventTypeId, slug: bodyOf(0).eventTypeSlug }));
  check('booking/happy: cal-api-version 2024-06-14', (fetchCalls[0].options.headers || {})['cal-api-version'] === '2024-06-14', JSON.stringify((fetchCalls[0].options.headers || {})['cal-api-version']));
  check('booking/happy: no-store cache header', r.headers['cache-control'] === 'no-store');

  // 2b. Legacy `responses` shape (NOT the modern attendee/bookingFieldsResponses), phone in
  //     responses.smsReminderNumber + attendeePhoneNumber (E.164), metadata carries phone + attribution
  const sent = bodyOf(0);
  check('booking/responses: name+email present', sent.responses && sent.responses.name === 'Jane Doe' && sent.responses.email === 'jane@example.com', JSON.stringify(sent.responses));
  check('booking/responses: location object', !!(sent.responses && sent.responses.location && sent.responses.location.value === 'conferencing'));
  check('booking/responses: top-level timeZone+language', sent.timeZone === 'America/New_York' && sent.language === 'en');
  check('booking/phone: in responses.smsReminderNumber (E.164)', sent.responses.smsReminderNumber === '+15551234567', JSON.stringify(sent.responses.smsReminderNumber));
  check('booking/phone: in responses.attendeePhoneNumber (E.164)', sent.responses.attendeePhoneNumber === '+15551234567');
  check('booking/phone: NO modern attendee object', sent.attendee === undefined);
  check('booking/phone: present in metadata', sent.metadata.phone === '+1 (555) 123-4567');
  check('booking/meta: source from client', sent.metadata.source === 'audit', sent.metadata.source);
  check('booking/meta: attribution merged', sent.metadata.utm_source === 'fb' && sent.metadata.utm_campaign === 'spring');

  // 3. CRITICAL: bad key → 401 then retry WITHOUT auth → 201
  installFetch([fakeResponse(401, { error: { message: 'CustomThrottlerGuard - Invalid API Key' } }), ok201()]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/auth-retry: final 201', r.statusCode === 201 && r.json().ok === true, `got ${r.statusCode}`);
  check('booking/auth-retry: two calls', fetchCalls.length === 2, `calls=${fetchCalls.length}`);
  check('booking/auth-retry: 1st had auth', authHeaderOf(0) === 'Bearer cal_live_validkey');
  check('booking/auth-retry: 2nd had NO auth', authHeaderOf(1) === undefined, `got ${authHeaderOf(1)}`);

  // 4. bad key 401, retry also 401 → surface 401 with fallback:true
  installFetch([fakeResponse(401, { error: { message: 'Invalid API Key' } }), fakeResponse(401, { error: { message: 'Invalid API Key' } })]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/auth-fail: status 401', r.statusCode === 401);
  check('booking/auth-fail: fallback true', r.json().fallback === true);

  // 5. Slot taken (400 "not available") → slot_unavailable, fallback:false
  installFetch([fakeResponse(400, { error: { message: 'One of the hosts either already has booking at this time or is not available' } })]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/slot-taken: status 400', r.statusCode === 400);
  check('booking/slot-taken: code slot_unavailable', r.json().code === 'slot_unavailable', JSON.stringify(r.json()));
  check('booking/slot-taken: fallback false', r.json().fallback === false);

  // 6. 429 throttle → fallback true
  installFetch([fakeResponse(429, { error: { message: 'Too many requests' } })]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/429: fallback true', r.statusCode === 429 && r.json().fallback === true);

  // 7. 500 → fallback true
  installFetch([fakeResponse(500, { error: { message: 'Internal error' } })]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/500: fallback true', r.statusCode === 500 && r.json().fallback === true);

  // 8. Network error → 502 fallback true
  installFetch(['NETWORK']);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/network: 502 fallback', r.statusCode === 502 && r.json().fallback === true);

  // 9. Metadata limits: huge airbnbUrl + nested object + 60 attribution keys
  const bigAttr = {};
  for (let i = 0; i < 60; i++) bigAttr['k' + i] = 'v' + i;
  bigAttr.nested = { should: 'be dropped' };
  bigAttr.arr = [1, 2, 3];
  installFetch([ok201()]);
  r = mockRes();
  await booking({ method: 'POST', body: { ...validBody, airbnbUrl: 'x'.repeat(900), attribution: bigAttr } }, r);
  const meta = bodyOf(0).metadata;
  check('booking/meta: <=50 keys', Object.keys(meta).length <= 50, `keys=${Object.keys(meta).length}`);
  check('booking/meta: value capped 500', meta.airbnbUrl.length === 500, `len=${meta.airbnbUrl.length}`);
  check('booking/meta: nested object dropped', meta.nested === undefined);
  check('booking/meta: array dropped', meta.arr === undefined);
  check('booking/meta: all values strings', Object.values(meta).every(v => typeof v === 'string'));

  // 10. No API key set → single unauthenticated call, 201 (NOT 503)
  delete process.env.CAL_API_KEY;
  installFetch([ok201()]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/no-key: 201 (no 503)', r.statusCode === 201, `got ${r.statusCode}`);
  check('booking/no-key: single call, no auth', fetchCalls.length === 1 && authHeaderOf(0) === undefined);

  // 11. Key with trailing newline → trimmed in header
  process.env.CAL_API_KEY = 'cal_live_withnl\n';
  installFetch([ok201()]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/trim-key: header has no newline', authHeaderOf(0) === 'Bearer cal_live_withnl', JSON.stringify(authHeaderOf(0)));
  delete process.env.CAL_API_KEY;

  // 12. eventTypeId env overrides slug
  process.env.CAL_EVENT_TYPE_ID = '5076967';
  installFetch([ok201()]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/eventTypeId: used numeric id', bodyOf(0).eventTypeId === 5076967 && !bodyOf(0).eventTypeSlug);
  delete process.env.CAL_EVENT_TYPE_ID;

  // 12b. CRITICAL: Cal rejects the phone (invalid_number, 500) → retry WITHOUT phone fields → 201.
  //      Guarantees a customer with an odd phone still gets booked instead of hard-failing.
  process.env.CAL_API_KEY = 'cal_live_validkey';
  installFetch([
    fakeResponse(500, { error: { message: '[{"code":"custom","message":"{smsReminderNumber}invalid_number","path":["responses"]}]' } }),
    ok201()
  ]);
  r = mockRes();
  await booking({ method: 'POST', body: validBody }, r);
  check('booking/phone-retry: final 201', r.statusCode === 201 && r.json().ok === true, `got ${r.statusCode}`);
  check('booking/phone-retry: two calls', fetchCalls.length === 2, `calls=${fetchCalls.length}`);
  check('booking/phone-retry: 1st call included phone', bodyOf(0).responses.smsReminderNumber === '+15551234567');
  check('booking/phone-retry: 2nd call dropped phone', bodyOf(1).responses.smsReminderNumber === undefined && bodyOf(1).responses.attendeePhoneNumber === undefined);
  delete process.env.CAL_API_KEY;

  // ───────────────────── cal-slots ─────────────────────
  const slotsUrl = '/api/cal-slots?start=2026-07-01T00:00:00.000Z&end=2026-07-20T00:00:00.000Z&timeZone=America/New_York';
  const slotsData = { data: { '2026-07-01': [{ start: '2026-07-01T09:00:00.000-04:00' }] } };

  // 13. Happy path → 200, body passthrough, cached, no alert
  installFetch([fakeResponse(200, slotsData)]);
  alerts.length = 0;
  r = mockRes();
  await slots({ method: 'GET', url: slotsUrl }, r);
  check('slots/happy: 200', r.statusCode === 200);
  check('slots/happy: no alert', alerts.length === 0);
  check('slots/happy: passthrough data', r.json().data['2026-07-01'][0].start === slotsData.data['2026-07-01'][0].start);
  check('slots/happy: cached header', /max-age=60/.test(r.headers['cache-control']));

  // 14. Upstream non-OK with {error:{message}} → normalized string (NOT [object Object])
  installFetch([fakeResponse(404, { status: 'error', error: { code: 'NotFound', message: 'event type not found' } })]);
  alerts.length = 0;
  r = mockRes();
  await slots({ method: 'GET', url: slotsUrl }, r);
  check('slots/err-normalize: status passthrough 404', r.statusCode === 404);
  check('slots/err-normalize: ops alerted', alerts.length === 1 && alerts[0].source === 'availability' && alerts[0].status === 404, JSON.stringify(alerts));
  check('slots/err-normalize: body says alerted', r.json().alerted === true);
  check('slots/err-normalize: error is string', typeof r.json().error === 'string' && r.json().error === 'event type not found', JSON.stringify(r.json().error));
  check('slots/err-normalize: not [object Object]', r.json().error !== '[object Object]');
  check('slots/err-normalize: no-store', r.headers['cache-control'] === 'no-store');

  // 15. Network error retried (2 calls) → 502
  installFetch(['NETWORK', 'NETWORK']);
  alerts.length = 0;
  r = mockRes();
  await slots({ method: 'GET', url: slotsUrl }, r);
  check('slots/network: 502', r.statusCode === 502);
  check('slots/network: retried (2 calls)', fetchCalls.length === 2, `calls=${fetchCalls.length}`);
  check('slots/network: ops alerted', alerts.length === 1 && /reach Cal.com/.test(alerts[0].reason), JSON.stringify(alerts));
  check('slots/network: body says alerted', r.json().alerted === true);

  // 16. 5xx then 200 (retry recovers) → 200
  installFetch([fakeResponse(503, { error: { message: 'unavailable' } }), fakeResponse(200, slotsData)]);
  r = mockRes();
  await slots({ method: 'GET', url: slotsUrl }, r);
  check('slots/retry-recover: 200 after 503', r.statusCode === 200, `got ${r.statusCode}`);
  check('slots/retry-recover: 2 calls', fetchCalls.length === 2);

  // 17. end <= start → 400, and ops hear about it (only our widget builds these URLs)
  installFetch([]);
  alerts.length = 0;
  r = mockRes();
  await slots({ method: 'GET', url: '/api/cal-slots?start=2026-07-20T00:00:00.000Z&end=2026-07-01T00:00:00.000Z&timeZone=UTC' }, r);
  check('slots/bad-range: 400', r.statusCode === 400 && fetchCalls.length === 0);
  check('slots/bad-range: ops alerted', alerts.length === 1 && alerts[0].status === 400, JSON.stringify(alerts));

  // 17b. no dates at all (scanner/bot) → 400 but NO alert
  installFetch([]);
  alerts.length = 0;
  r = mockRes();
  await slots({ method: 'GET', url: '/api/cal-slots', headers: {} }, r);
  check('slots/no-params: 400', r.statusCode === 400);
  check('slots/no-params: no alert', alerts.length === 0 && r.json().alerted === false);

  // 18. Sept-2026 incident: 60 calendar days across a fall-back DST change = 60d + 1h in absolute
  //     time. Must be served as-is (NOT rejected, NOT clamped), no alert.
  const dstStart = new Date('2026-09-01T22:00:00.000Z'); // Sept 2 00:00 Europe/Amsterdam (CEST)
  const dstEnd = new Date(dstStart.getTime() + 60 * DAY + 60 * 60 * 1000); // Nov 1 00:00 CET
  installFetch([fakeResponse(200, slotsData)]);
  alerts.length = 0;
  r = mockRes();
  await slots({ method: 'GET', url: `/api/cal-slots?start=${dstStart.toISOString()}&end=${dstEnd.toISOString()}&timeZone=Europe/Amsterdam` }, r);
  check('slots/dst-60d+1h: 200', r.statusCode === 200, `got ${r.statusCode} ${r._body}`);
  check('slots/dst-60d+1h: end passed through unclamped', fetchCalls.length === 1 && new URL(fetchCalls[0].url).searchParams.get('end') === dstEnd.toISOString(), fetchCalls[0] && fetchCalls[0].url);
  check('slots/dst-60d+1h: no alert', alerts.length === 0);

  // 18b. US visitor on Sept 3 2026 (the day the US window first crosses Nov 1) — same shape
  const usStart = new Date('2026-09-03T05:00:00.000Z');
  const usEnd = new Date('2026-11-02T06:00:00.000Z');
  installFetch([fakeResponse(200, slotsData)]);
  r = mockRes();
  await slots({ method: 'GET', url: `/api/cal-slots?start=${usStart.toISOString()}&end=${usEnd.toISOString()}&timeZone=America/Chicago` }, r);
  check('slots/dst-us: 200', r.statusCode === 200, `got ${r.statusCode} ${r._body}`);

  // 18c. Pathologically long range (92 days) → NOT a 400 any more: clamped to 60 days and served
  installFetch([fakeResponse(200, slotsData)]);
  alerts.length = 0;
  r = mockRes();
  await slots({ method: 'GET', url: '/api/cal-slots?start=2026-07-01T00:00:00.000Z&end=2026-10-01T00:00:00.000Z&timeZone=UTC' }, r);
  check('slots/too-long: served (200)', r.statusCode === 200 && fetchCalls.length === 1, `got ${r.statusCode}`);
  check('slots/too-long: clamped to 60d', fetchCalls.length === 1 && new URL(fetchCalls[0].url).searchParams.get('end') === new Date(new Date('2026-07-01T00:00:00.000Z').getTime() + 60 * DAY).toISOString(), fetchCalls[0] && fetchCalls[0].url);
  check('slots/too-long: no alert (handled, not failed)', alerts.length === 0);

  // 19. non-JSON upstream → 502
  installFetch([fakeResponse(200, null, { nonJson: true }), fakeResponse(200, null, { nonJson: true })]);
  r = mockRes();
  await slots({ method: 'GET', url: slotsUrl }, r);
  check('slots/nonjson: 502', r.statusCode === 502, `got ${r.statusCode}`);

  // ───────────────────── client-error ─────────────────────
  // 20. Browser report from a known page → 200 + ops alert with that page as the source
  alerts.length = 0;
  r = mockRes();
  await clientError({ method: 'POST', url: '/api/client-error', headers: { 'user-agent': 'test' },
    body: { page: 'audit-booking', stage: 'availability', status: 500, message: 'Cal.com returned 500', detail: { url: '/audit-booking' } } }, r);
  check('client-error/valid: 200 ok', r.statusCode === 200 && r.json().ok === true, r._body);
  check('client-error/valid: alerted', alerts.length === 1 && alerts[0].source === 'browser · audit-booking' && /availability/.test(alerts[0].reason), JSON.stringify(alerts));
  check('client-error/valid: detail carries message', /Cal.com returned 500/.test(alerts[0] && alerts[0].detail));

  // 21. Unknown page → 400, no alert (not a spam vector for arbitrary pages)
  alerts.length = 0;
  r = mockRes();
  await clientError({ method: 'POST', url: '/api/client-error', headers: {}, body: { page: 'evil', message: 'x' } }, r);
  check('client-error/unknown-page: 400', r.statusCode === 400);
  check('client-error/unknown-page: no alert', alerts.length === 0);

  // 22. GET → 405
  r = mockRes();
  await clientError({ method: 'GET', url: '/api/client-error', headers: {} }, r);
  check('client-error/get: 405', r.statusCode === 405);

  // ── Summary ──
  console.log(`\n${'='.repeat(56)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); }
  else console.log('\n✓ All endpoint reliability tests passed.');
  console.log('='.repeat(56));
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error('TEST HARNESS CRASH:', e); process.exit(2); });

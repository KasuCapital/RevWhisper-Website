// Shared request guards for the api/ handlers. Zero dependencies, like the rest of api/.
//
// requireTeamKey: internal-only endpoints (event-builder tools) require the shared team key
//   in the `x-rw-team-key` header, matching the RW_TEAM_KEY env var. Fails closed: if the env
//   var is unset the endpoint refuses every request.
// rateLimit: best-effort per-IP limiter. State lives in the warm serverless instance only, so
//   it caps bursts from one client rather than enforcing a global quota.

const crypto = require('crypto');

function clientIp(req) {
  const fwd = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Returns null when the request carries the right key, otherwise { status, error }.
function checkTeamKey(req) {
  const expected = process.env.RW_TEAM_KEY;
  if (!expected) return { status: 503, error: 'This tool is not configured (RW_TEAM_KEY missing).' };
  const given = (req.headers && req.headers['x-rw-team-key']) || '';
  if (!given || !safeEqual(given, expected)) return { status: 401, error: 'Team key required.' };
  return null;
}

const buckets = new Map();

// Returns true when the request is within `limit` hits per `windowMs` for this IP + name.
function rateLimit(req, name, limit, windowMs) {
  const now = Date.now();
  const key = name + '|' + clientIp(req);
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
    }
  }
  return hits.length <= limit;
}

module.exports = { checkTeamKey, rateLimit, clientIp };

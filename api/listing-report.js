// GET /api/listing-report?id=<publicId>
//
// The live listing report on /listing-check. The visitor's own browser starts the report through
// RevWhisper Growth Hub's public create-analysis endpoint (it allows revwhisper.com by CORS and
// rate-limits per visitor), which returns the report's public id. Growth Hub's read endpoint has
// no CORS, so the page reads the finished report through here: we fetch it server-to-server and
// return only what the page shows, computed the same way Growth Hub's own report computes it
// (src/lib/vacancy.ts and src/lib/visibility.ts in RevWhisper-Growth-Hub).
//
// Security: the only input is the report id, checked against a strict pattern before it touches
// the upstream URL, and the upstream host is fixed. Nothing else from the request is forwarded.
// Per-IP rate limit (the page polls every few seconds while the report builds).
//
// Timing: Growth Hub marks a report complete on its first pass (about 10 seconds, 6 pages of
// search results), then a deep pass re-checks buried dates across all 15 pages and stamps
// rankings_finalized_at (usually within a minute). Its own report page shows "Checking all 15
// pages" until then; here the report stays pending until then, so a first-pass "not found" is
// never shown or cached.
//
// Responses: { status: 'pending' } while the report is building (Growth Hub answers 404 until it
// is complete), { status: 'ready', ... } once done, { status: 'error' } if Growth Hub can't be read.

const { rateLimit } = require('./_guard');

const GROWTH_HUB = 'https://app.revwhisper.com';
const ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
const UPSTREAM_TIMEOUT_MS = 9000;
// Airbnb search: 18 results a page, 15 pages a guest can reach (Growth Hub src/lib/visibility.ts)
const PAGE_SIZE = 18;
const MAX_RESULTS = 15 * PAGE_SIZE;
const PHOTO_HOST = /^https:\/\/[a-z0-9.-]*muscache\.com\//i;
// Past this, a report still missing rankings_finalized_at isn't getting its deep pass
// (Growth Hub src/app/report/[id]/page.tsx DEEP_CHECK_WAIT_MS)
const DEEP_CHECK_WAIT_MS = 10 * 60 * 1000;

function deepCheckDone(row) {
  if (row.rankings_finalized_at) return true;
  const completed = Date.parse(row.completed_at || '');
  return !Number.isFinite(completed) || Date.now() - completed > DEEP_CHECK_WAIT_MS;
}

// The listing's own market; levels for an extra search market carry `market`.
function ownLevels(row) {
  return (Array.isArray(row.occupancy_levels) ? row.occupancy_levels : []).filter((l) => l && !l.market);
}

function sendJson(res, statusCode, payload, cacheControl) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl || 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify(payload));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v, max) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// A position a guest can actually reach by paging; deeper legacy positions count as not found.
function reachable(position) {
  const p = num(position);
  return p && p > 0 && p <= MAX_RESULTS ? p : null;
}

// Share of searching guests who scroll deep enough to see a position (Growth Hub's reach curve).
function reach(position) {
  if (!(position > 1)) return 1;
  const depth = (position + PAGE_SIZE - 1) / PAGE_SIZE;
  return Math.min(1, Math.max(0, Math.pow(depth, -1.3)));
}

// Listing's nightly rate: its own price in search results, else the market average.
function adrFrom(rankings) {
  const own = rankings.map((r) => num(r.targetListingPricePerNight)).filter((p) => p > 0);
  if (own.length) return { adr: Math.round(own.reduce((s, p) => s + p, 0) / own.length), source: 'own' };
  const market = rankings.map((r) => num(r.averageADR)).filter((p) => p > 0);
  if (market.length) return { adr: Math.round(market.reduce((s, p) => s + p, 0) / market.length), source: 'market' };
  return { adr: null, source: null };
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

// Open nights in the next 90 days, ignoring trailing months the host never opened (95%+ blocked).
function vacancy(availability, rankings) {
  const days = availability.filter((d) => d && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
  if (!days.length) return null;
  const months = new Map();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(d);
  }
  const blocked = new Set();
  const keys = Array.from(months.keys());
  for (let i = keys.length - 1; i >= 0; i--) {
    const list = months.get(keys[i]);
    if (list.filter((d) => !d.available).length / list.length >= 0.95) blocked.add(keys[i]);
    else break;
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() + 90);
  const from = isoDay(today);
  const to = isoDay(cutoff);
  const window = days.filter((d) => !blocked.has(d.date.slice(0, 7)) && d.date >= from && d.date <= to);
  const open90 = window.filter((d) => d.available).length;
  const { adr, source } = adrFrom(rankings);
  return { open90, adr, adrSource: source, value90: adr != null ? open90 * adr : null };
}

// Average position and how many guests scroll that far (Growth Hub computeVisibilityStats).
function visibility(rankings) {
  const positions = [];
  const detection = [];
  for (const r of rankings) {
    const p = reachable(r.position);
    if (p) {
      positions.push(p);
      detection.push(1);
    } else {
      detection.push(0);
    }
  }
  const searched = rankings
    .map((r) => num(r.searchedResultCount) || num(r.totalResults) || 0)
    .filter((n) => n > 0)
    .map((n) => Math.min(MAX_RESULTS, n));
  const avg = positions.length ? positions.reduce((s, p) => s + p, 0) / positions.length : null;
  return {
    avgPosition: avg != null ? Math.round(avg) : null,
    page: avg != null ? Math.max(1, Math.ceil(avg / PAGE_SIZE)) : null,
    ahead: avg != null ? Math.max(0, Math.round(avg - 1)) : null,
    reachPct: avg != null ? Math.round(reach(avg) * 100) : 0,
    foundPct: detection.length ? Math.round((detection.reduce((s, x) => s + x, 0) / detection.length) * 100) : 0,
    searches: rankings.length,
    deepest: searched.length ? Math.max.apply(null, searched) : 0,
  };
}

function windowsOf(rankings) {
  return rankings
    .filter((r) => typeof r.checkIn === 'string')
    .slice(0, 12)
    .map((r) => ({ in: r.checkIn.slice(0, 10), out: text(r.checkOut, 10), pos: reachable(r.position) }));
}

// Today through today + 90 (the same inclusive window as vacancy() and Growth Hub) as one string:
// 1 = open, 0 = booked, - = unknown.
function calendar(availability) {
  const byDate = new Map();
  for (const d of availability) if (d && typeof d.date === 'string') byDate.set(d.date, !!d.available);
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const start = isoDay(day);
  let out = '';
  for (let i = 0; i <= 90; i++) {
    const k = isoDay(day);
    out += byDate.has(k) ? (byDate.get(k) ? '1' : '0') : '-';
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return { start, days: out };
}

function summarize(row, id) {
  const raw = row.raw_listing && typeof row.raw_listing === 'object' ? row.raw_listing : {};
  const primary = Array.isArray(row.ranking_by_date) ? row.ranking_by_date : [];
  const availability = Array.isArray(raw.availability) ? raw.availability : [];
  const rooms = raw.roomCounts && typeof raw.roomCounts === 'object' ? raw.roomCounts : {};
  const primaryGuests = num(primary[0] && primary[0].guests) || num(rooms.guests) || num(raw.maxGuestCapacity);

  // The smallest finished group size below the primary one (Growth Hub adds max-2 / max-4 levels).
  let small = null;
  for (const level of ownLevels(row)) {
    const g = num(level && level.guests);
    if (!g || level.status !== 'complete' || !Array.isArray(level.rankings) || !level.rankings.length) continue;
    if (primaryGuests && g >= primaryGuests) continue;
    if (!small || g < small.guests) small = { guests: g, windows: windowsOf(level.rankings) };
  }

  const photoCandidates = [Array.isArray(raw.photos) && raw.photos[0] && raw.photos[0].url, row.listing_photo];
  const photo = photoCandidates.find((u) => typeof u === 'string' && PHOTO_HOST.test(u)) || '';
  const location = text(raw.breadcrumbLocation, 120).split(',').slice(0, 2).join(',').trim();

  return {
    status: 'ready',
    reportUrl: `${GROWTH_HUB}/report/${id}`,
    listing: {
      title: text(raw.title || row.listing_title, 140),
      photo,
      location,
      bedrooms: num(rooms.bedrooms),
      guests: num(rooms.guests) || num(raw.maxGuestCapacity),
      rating: num(raw.starRating),
      reviews: num(raw.reviewsCount),
    },
    primary: { guests: primaryGuests, windows: windowsOf(primary) },
    small,
    visibility: visibility(primary),
    vacancy: vacancy(availability, primary),
    calendar: calendar(availability),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  if (!rateLimit(req, 'listing-report', 40, 60 * 1000)) {
    return sendJson(res, 429, { error: 'Too many requests.' });
  }
  let id = '';
  try {
    id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
  } catch (e) {}
  if (!ID_PATTERN.test(id)) return sendJson(res, 400, { error: 'Invalid report id.' });

  let upstream;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    upstream = await fetch(`${GROWTH_HUB}/api/reports/${id}?slim=1`, {
      signal: ctl.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    console.error('listing-report upstream failed', err && err.name);
    return sendJson(res, 502, { status: 'error' });
  } finally {
    clearTimeout(timer);
  }
  // Growth Hub only serves finished reports here; anything else is still building (or failed,
  // which the page treats as slow after its wait runs out).
  if (upstream.status === 404) return sendJson(res, 200, { status: 'pending' });
  if (!upstream.ok) return sendJson(res, 502, { status: 'error' });

  let row;
  try {
    row = await upstream.json();
  } catch (err) {
    return sendJson(res, 502, { status: 'error' });
  }
  if (!row || row.status !== 'complete' || !deepCheckDone(row)) return sendJson(res, 200, { status: 'pending' });
  // Smaller group sizes are ranked after the deep pass; don't let the CDN hold a summary without them.
  const levelsPending = ownLevels(row).some((l) => l.status === 'processing');
  try {
    return sendJson(res, 200, summarize(row, id), levelsPending ? 'no-store' : 'public, max-age=60, s-maxage=600');
  } catch (err) {
    console.error('listing-report summarize failed', err);
    return sendJson(res, 502, { status: 'error' });
  }
};

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = 'tri_angle~airbnb-rooms-urls-scraper';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

// Strip query params that cause issues (check_in, check_out, locale, currency)
function cleanListingUrl(raw) {
  try {
    const u = new URL(raw);
    // Keep only the path (e.g. /rooms/12345)
    return u.origin + u.pathname;
  } catch (e) {
    return raw;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return sendJson(res, 400, { error: 'Invalid JSON.' });
  }

  const rawUrl = (body && body.url) || '';
  if (!rawUrl || !rawUrl.includes('airbnb')) {
    return sendJson(res, 400, { error: 'A valid Airbnb URL is required.' });
  }

  if (!APIFY_TOKEN) {
    return sendJson(res, 500, { error: 'Scraper not configured.' });
  }

  const url = cleanListingUrl(rawUrl);

  // Run the Apify actor synchronously (waits for result)
  const apiUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=45`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);

  try {
    const apifyRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url }],
        proxyConfiguration: { useApifyProxy: true }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!apifyRes.ok) {
      const text = await apifyRes.text().catch(() => '');
      console.error('Apify error:', apifyRes.status, text);
      return sendJson(res, 502, { error: 'Scraper returned an error.' });
    }

    const items = await apifyRes.json();
    const listing = Array.isArray(items) && items.length > 0 ? items[0] : null;

    if (!listing) {
      return sendJson(res, 404, { error: 'Could not find listing data.' });
    }

    // Log raw keys so we can see exact structure
    console.log('Apify listing keys:', Object.keys(listing));
    console.log('Apify listing sample:', JSON.stringify(listing).slice(0, 2000));

    // Extract rating — could be a number, string, or object like {value: 4.5}
    let rating = listing.rating || listing.stars || listing.guestSatisfactionOverall || null;
    if (rating && typeof rating === 'object') {
      rating = rating.value || rating.accuracy || rating.overall || Object.values(rating).find(v => typeof v === 'number') || null;
    }
    if (typeof rating === 'number') rating = Math.round(rating * 100) / 100;

    // Extract hero image — try every known field pattern
    let heroImage = null;
    if (listing.images && listing.images.length > 0) {
      const img = listing.images[0];
      heroImage = typeof img === 'string' ? img : (img.url || img.pictureUrl || img.large || img.original || img.baseUrl || null);
    }
    if (!heroImage && listing.photos && listing.photos.length > 0) {
      const p = listing.photos[0];
      heroImage = typeof p === 'string' ? p : (p.url || p.pictureUrl || p.large || p.original || p.baseUrl || null);
    }
    if (!heroImage) heroImage = listing.heroImage || listing.thumbnailUrl || listing.pictureUrl || listing.image || listing.thumbnail || null;

    // Extract location
    let location = null;
    if (listing.location && typeof listing.location === 'object') {
      location = listing.location.city || listing.location.name || listing.location.address || null;
    } else {
      location = listing.location || listing.address || listing.city || null;
    }

    return sendJson(res, 200, {
      hostName: listing.hostName || listing.host?.name || listing.primaryHost?.name || null,
      title: listing.name || listing.title || null,
      heroImage,
      location,
      rating,
      reviewCount: listing.reviewsCount || listing.reviews_count || listing.numberOfReviews || null,
      bedrooms: listing.bedrooms || null,
      bathrooms: listing.bathrooms || null,
      price: listing.price || listing.pricing?.rate?.amount || null,
      _debug_keys: Object.keys(listing)
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('Scrape listing failed:', error);
    return sendJson(res, 502, { error: 'Scraper timed out or failed.' });
  }
};

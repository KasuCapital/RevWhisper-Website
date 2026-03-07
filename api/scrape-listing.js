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

    // Return only the fields we need — field names vary by actor, check multiple
    return sendJson(res, 200, {
      hostName: listing.hostName || listing.host?.name || listing.primaryHost?.name || null,
      title: listing.name || listing.title || null,
      heroImage: listing.heroImage
        || (listing.photos && listing.photos[0] && (listing.photos[0].pictureUrl || listing.photos[0].large || listing.photos[0]))
        || listing.thumbnailUrl
        || listing.pictureUrl
        || listing.image
        || null,
      location: listing.location || listing.address || listing.city || null,
      rating: listing.rating || listing.stars || listing.guestSatisfactionOverall || null,
      reviewCount: listing.reviewsCount || listing.reviews_count || null,
      bedrooms: listing.bedrooms || null,
      bathrooms: listing.bathrooms || null,
      price: listing.price || listing.pricing?.rate?.amount || null
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('Scrape listing failed:', error);
    return sendJson(res, 502, { error: 'Scraper timed out or failed.' });
  }
};

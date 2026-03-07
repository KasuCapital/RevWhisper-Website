const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = 'tri_angle~airbnb-scraper'; // Apify Airbnb Scraper

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
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

  const url = (body && body.url) || '';
  if (!url || !url.includes('airbnb')) {
    return sendJson(res, 400, { error: 'A valid Airbnb URL is required.' });
  }

  if (!APIFY_TOKEN) {
    return sendJson(res, 500, { error: 'Scraper not configured.' });
  }

  // Run the Apify actor synchronously (waits for result, up to 60s)
  const apiUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=30`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);

  try {
    const apifyRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url }],
        maxListings: 1,
        includeReviews: false,
        maxReviews: 0,
        calendarMonths: 0,
        proxy: { useApifyProxy: true }
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

    // Return only the fields we need
    return sendJson(res, 200, {
      hostName: listing.host?.name || listing.hostName || null,
      title: listing.name || listing.title || null,
      heroImage: listing.photos?.[0]?.pictureUrl
        || listing.photos?.[0]?.large
        || listing.thumbnailUrl
        || listing.pictureUrl
        || null,
      location: listing.address || listing.city || null,
      rating: listing.stars || listing.guestSatisfactionOverall || null,
      reviewCount: listing.numberOfGuests || listing.reviewsCount || null,
      bedrooms: listing.bedrooms || null,
      bathrooms: listing.bathrooms || null,
      price: listing.pricing?.rate?.amount || listing.price || null
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('Scrape listing failed:', error);
    return sendJson(res, 502, { error: 'Scraper timed out or failed.' });
  }
};

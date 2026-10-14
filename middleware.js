// Vercel Routing Middleware, on every page request:
// 1. Tags the response with the visitor's coarse location (country, plus region code such as QC) so
//    /assets/rw-consent.js can decide, before any tracker runs, whether this visitor needs an opt-in
//    banner. Country/region only; nothing identifying.
// 2. Phones on /audit get the app-style form (/audit-flow) at the same URL. It's served here, before the
//    page loads, so there's no redirect or blank-screen wait and ad links keep working unchanged.
//    Desktop and tablets keep the original /audit; ?classic=1 shows the original on a phone.
// Every other page is served unchanged.
export const config = {
  matcher: ['/((?!api/|ingest/|assets/|images/|icons/|fonts/|_vercel/|.*\\.[a-zA-Z0-9]{2,5}$).*)', '/(.*\\.html)']
};

// Same phone test the site uses in the browser: tablets (iPad, Android without "Mobile") aren't phones
const PHONE_UA = /iPhone|iPod|Android.+Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini/i;

function isPhone(request) {
  return request.headers.get('sec-ch-ua-mobile') === '?1' || PHONE_UA.test(request.headers.get('user-agent') || '');
}

export default function middleware(request) {
  const headers = {};
  try {
    const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
    const region = (request.headers.get('x-vercel-ip-country-region') || '').toUpperCase();
    let geo = /^[A-Z]{2}$/.test(country) ? country : 'XX';
    if (geo !== 'XX' && /^[A-Z0-9]{1,3}$/.test(region)) geo += '-' + region;
    headers['set-cookie'] = `rw_geo=${geo}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
  } catch (e) {}
  try {
    const url = new URL(request.url);
    if (url.pathname === '/audit' && !url.searchParams.has('classic') && isPhone(request)) {
      url.pathname = '/audit-flow';
      headers['x-middleware-rewrite'] = url.toString();
      return new Response(null, { headers });
    }
  } catch (e) {}
  headers['x-middleware-next'] = '1';
  return new Response(null, { headers });
}

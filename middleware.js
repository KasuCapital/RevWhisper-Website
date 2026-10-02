// Vercel Routing Middleware: tags each page response with the visitor's coarse location
// (country, plus region code such as QC) so /assets/rw-consent.js can decide, before
// any tracker runs, whether this visitor needs an opt-in banner. Country/region only;
// nothing identifying. Pages are served unchanged.
export const config = {
  matcher: ['/((?!api/|assets/|images/|icons/|fonts/|_vercel/|.*\\.[a-zA-Z0-9]{2,5}$).*)', '/(.*\\.html)']
};

export default function middleware(request) {
  const headers = { 'x-middleware-next': '1' };
  try {
    const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
    const region = (request.headers.get('x-vercel-ip-country-region') || '').toUpperCase();
    let geo = /^[A-Z]{2}$/.test(country) ? country : 'XX';
    if (geo !== 'XX' && /^[A-Z0-9]{1,3}$/.test(region)) geo += '-' + region;
    headers['set-cookie'] = `rw_geo=${geo}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
  } catch (e) {}
  return new Response(null, { headers });
}

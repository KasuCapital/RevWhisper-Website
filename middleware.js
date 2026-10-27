// Vercel Routing Middleware, on every page request:
// 1. Tags the response with the visitor's coarse location (country, plus region code such as QC) so
//    /assets/rw-consent.js can decide, before any tracker runs, whether this visitor needs an opt-in
//    banner. Country/region only; nothing identifying.
// 2. Phones on /audit get the app-style form (/audit-flow) at the same URL. It's served here, before the
//    page loads, so there's no redirect or blank-screen wait and ad links keep working unchanged.
//    Desktop and tablets keep the original /audit; ?classic=1 shows the original on a phone.
//    /unqualified (the preview of the unqualified-lead flow) does the same with /unqualified-flow.
// 3. Scheduled blog posts (a `publish` time in blog/posts.js, compiled into blog-schedule.js by
//    scripts/build-blog-index.mjs): until its time, a post's URL redirects to /blog, and /blog and
//    /sitemap.xml are served from the version built for the latest publish time that has passed.
//    Each post appears on time with no rebuild or redeploy.
// Every other page is served unchanged.
import { BLOG_SCHEDULE } from './blog-schedule.js';

export const config = {
  matcher: ['/((?!api/|ingest/|assets/|images/|icons/|fonts/|_vercel/|.*\\.[a-zA-Z0-9]{2,5}$).*)', '/(.*\\.html)', '/sitemap.xml']
};

// Pages with an app-style phone version served at the same URL
const PHONE_PAGES = { '/audit': '/audit-flow', '/unqualified': '/unqualified-flow' };

// Same phone test the site uses in the browser: tablets (iPad, Android without "Mobile") aren't phones
const PHONE_UA = /iPhone|iPod|Android.+Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini/i;

function isPhone(request) {
  return request.headers.get('sec-ch-ua-mobile') === '?1' || PHONE_UA.test(request.headers.get('user-agent') || '');
}

// What the blog schedule does with this URL at `now`: { redirect } for a post that isn't out yet,
// { rewrite } for /blog or /sitemap.xml once a scheduled version is due, or null
function blogSchedule(url, now) {
  const path = url.pathname.replace(/\.html$/, '').replace(/\/(index)?$/, '') || '/';
  const slug = path.startsWith('/blog/') ? path.slice('/blog/'.length) : null;
  if (slug && BLOG_SCHEDULE.posts[slug] > now) return { redirect: '/blog' };
  const due = BLOG_SCHEDULE.versions.filter(v => v.at <= now);
  const version = due[due.length - 1];
  if (!version) return null;
  if (path === '/blog') return { rewrite: version.index };
  if (path === '/sitemap.xml') return { rewrite: version.sitemap };
  return null;
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
    const scheduled = blogSchedule(url, Date.now());
    if (scheduled && scheduled.redirect) {
      headers.location = new URL(scheduled.redirect, url).toString();
      headers['cache-control'] = 'no-store';
      return new Response(null, { status: 307, headers });
    }
    if (scheduled && scheduled.rewrite) {
      url.pathname = scheduled.rewrite;
      headers['x-middleware-rewrite'] = url.toString();
      return new Response(null, { headers });
    }
  } catch (e) {}
  try {
    const url = new URL(request.url);
    const phonePage = PHONE_PAGES[url.pathname];
    if (phonePage && !url.searchParams.has('classic') && isPhone(request)) {
      url.pathname = phonePage;
      headers['x-middleware-rewrite'] = url.toString();
      return new Response(null, { headers });
    }
  } catch (e) {}
  headers['x-middleware-next'] = '1';
  return new Response(null, { headers });
}

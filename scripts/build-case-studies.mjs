#!/usr/bin/env node
// build-case-studies.mjs — turns the case study drafts (the "RevWhisper Case Studies" folder: pages/*.html
// plus images/) into site pages under /case-studies, and fills the
// scrolling "more case studies" strips (CS-STRIP-NEW / CS-STRIP-MORE markers) on /case-study and on
// every case study page. Then it runs sync-partials so the pages get the site header, footer and
// attribution script.
//
//   node scripts/build-case-studies.mjs ["/path/to/RevWhisper Case Studies"]
//
// Re-run it whenever the drafts change (figures labelled "booked so far" move daily). Edit the drafts,
// not the generated case-studies/*.html files. To add a page, add it to PAGES below.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(process.argv[2] || join(homedir(), 'Desktop', 'RevWhisper Case Studies'));
const OUT = join(ROOT, 'case-studies');
const IMG_OUT = join(ROOT, 'images', 'case-studies');
const SITE = 'https://revwhisper.com';

// In display order. `src` is the draft file in pages/. `img` is the card image; `crop`/`pos` trim
// screenshots of Airbnb listings down to the photo. `stat` is the number that pops up on the carousel card;
// take it from the page's own figures and update it when the draft changes.
const PAGES = [
  { group: 'full', slug: 'sombrero-beach-home', stat: ['80% vs 36%', 'booked in September, vs similar homes'], src: 'sombrero-beach-home', tag: 'Single-home owner', name: 'Sombrero Beach Home', eyebrow: 'Marathon, FL · 4 BR Waterfront',
    h: 'More homes in Marathon. <em>More nights booked anyway.</em>', host: 'Matt, owner', img: '2ffee431a42c79b46932c5245e9d3cde.jpg', crop: '8.3% 49.1% 34.4% 5.1%', pos: '20% 30%' },
  { group: 'full', slug: 'peek-n-peak', stat: ['0 → 14', 'October nights booked, vs last October'], src: 'peek-n-peak', tag: 'Owner with a slow off-season', name: 'Peek n’ Peak', eyebrow: 'Clymer, NY · 4 BR Ski Chalet',
    h: 'A ski house that sat <em>empty all fall.</em>', host: 'Mike and Julie, owners', img: 'lead-peek-house-a.jpg' },
  { group: 'full', slug: 'eastside-pool-home', stat: ['$437 → $721', 'November nightly price'], src: 'eastside-pool-home', tag: 'Manager with a new listing', name: 'Eastside Pool Home', eyebrow: 'Austin, TX · 5 BR Group Home',
    h: 'A second-season listing, <em>priced to be seen.</em>', host: 'Cribs (Blake and Jeremy)', img: 'lead-holly-pool-a.jpg' },
  { group: 'full', slug: 'retreats-miami', stat: ['6 of 6', 'homes beat their market in October'], src: 'retreats-miami', tag: 'Manager with a mixed portfolio', name: 'Retreats Miami', eyebrow: 'Miami and Miami Beach, FL · 6-Home Portfolio',
    h: 'Miami got more crowded. <em>All six homes still beat the market.</em>', host: 'Marc, Retreats Miami', img: '4c91be0776b0031299e63f17372253a6.jpg', crop: '9.8% 1.6% 16.8% 1.7%', pos: '50% 40%' },
  { group: 'full', slug: 'pinecone-stays', stat: ['$121.1K', 'October revenue across 17 cabins'], src: 'pinecone-stays', tag: 'Large portfolio operator', name: 'Pinecone Stays', eyebrow: 'Catskills, NY · 17-Cabin Portfolio',
    h: 'Seventeen Catskills cabins, <em>ahead of their markets.</em>', host: 'Max, Pinecone Stays', img: 'lead-woods-living-a.jpg' },
  { group: 'timeline', slug: 'woods-edge', stat: ['$16.0K', 'first 30 days, vs $4.6K last year'], src: 'timeline-woods-edge', tag: 'Hosts asking if gains last', name: 'Woods Edge', eyebrow: 'Results Timeline · 30/60/90 days',
    h: 'Ahead in 30 days. <em>Still ahead at 90.</em>', host: 'Max, Pinecone Stays · Catskills, NY', img: 'lead-woods-game-a.jpg' },
  { group: 'timeline', slug: 'casa-spur', stat: ['26×', 'its bookings in the same 30 days last year'], src: 'timeline-casa-spur', tag: 'Large home, crowded market', name: 'Casa Spur', eyebrow: 'Results Timeline · First 30 days',
    h: '$34.3K booked in 30 days. <em>Against $1.3K a year earlier.</em>', host: 'Daniel, Palm Homes · Miami, FL', img: 'casa-cover-a.jpg' },
  { group: 'timeline', slug: 'killington-ski-home', stat: ['52% vs 31%', 'December booked, vs similar homes'], src: 'timeline-killington-ski-home', tag: 'Ski-town owner', name: 'Killington Ski Home', eyebrow: 'Results Timeline · First 30 days',
    h: '$66.5K booked in the first 30 days. <em>Ski season, filled early.</em>', host: 'Joel Santos · Killington, VT', img: 'joel-cover-a.jpg' },
  { group: 'guide', slug: 'what-to-expect', stat: ['+77%', '1820 House, after a one-booking first month'], src: 'what-to-expect', tag: 'Hosts with a slow start', name: 'What to expect', eyebrow: 'Three homes that started slowly',
    h: 'Some homes jump in week one. <em>Most build over two or three months.</em>', host: 'Matt; Mike and Julie', img: 'dc0082903768aa8168dd0a0c05c28a56.jpg', crop: '7.1% 50.4% 38.4% 2.3%', pos: '15% 25%' },
];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plain = s => s.replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, '’').replace(/\s+/g, ' ').trim();
const url = p => `/case-studies/${p.slug}`;
const imgStyle = p => `object-position:${p.pos || 'center'}${p.crop ? `;object-view-box:inset(${p.crop})` : ''}`;

function describe(text, max = 158) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
}

// ── Shared <head> pieces (same tags as blog/_template.html) ──────────────────────────────────────
function headTop() {
  return `<!-- ATTRIBUTION:START -->
<!-- ATTRIBUTION:END -->
<script src="/assets/rw-consent.js?v=3"></script>
<script defer src="/assets/rw-posthog.js?v=3"></script>
<!-- GA4. Consent defaults come from /assets/rw-consent.js -->
<script>
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','G-Y1FYZ5849B');
(window.rwConsent?rwConsent.whenAllowed:function(f){f();})(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-Y1FYZ5849B';document.head.appendChild(s);});
function rwTrack(e,p){gtag('event',e,p||{});}
</script>
<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
(window.rwConsent?rwConsent.whenAdsAllowed:function(g){g()})(function(){s.parentNode.insertBefore(t,s)})}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
if(window.rwConsent&&!rwConsent.ads)fbq('consent','revoke');
fbq('init', '959022406709300');
fbq('track', 'PageView');
</script>
<script>
document.addEventListener('DOMContentLoaded',function(){
  document.addEventListener('click',function(e){
    var el=e.target.closest('a,button');
    if(!el)return;
    var txt=(el.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();
    if(txt.indexOf('book your free strategy call')!==-1||txt.indexOf('book a call')!==-1||txt.indexOf('book a free strategy call')!==-1){
      fbq('track','Lead',{content_name:'Book Strategy Call'});
    }
  });
});
</script>
<!-- End Meta Pixel -->`;
}

function headMeta({ title, description, path, image }) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:site_name" content="RevWhisper">
<meta property="og:image" content="${SITE}/images/case-studies/${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/images/case-studies/${image}">
<link rel="icon" href="/icons/favicon-light.svg" type="image/svg+xml" media="(prefers-color-scheme: light)">
<link rel="icon" href="/icons/favicon-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/icons/favicon-light.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/fonts.css">`;
}

const headBottom = `<link rel="stylesheet" href="/assets/header.css">
<script defer src="/assets/header.js"></script>
<link rel="stylesheet" href="/assets/footer.css">
<link rel="stylesheet" href="/assets/cs-strip.css?v=5">
<script defer src="/assets/cs-strip.js?v=3"></script>
<script src="/assets/x-pixel-base.js?v=2"></script>`;

// Fixed menu bar on desktop: push the page down so it doesn't sit on the hero. On phones the bar is in
// the page flow already. Also keep the site header's rounded corners (drafts set --radius to 8px).
const shellCss = `<style>
@media(min-width:901px){body{padding-top:76px}}
.float-bar{border-radius:14px}
</style>`;

// ── The scrolling strip ──────────────────────────────────────────────────────────────────────────
// `all`: the "See all case studies" link back to /case-study (left off on /case-study itself).
// `compact`: smaller cards with the "For" tag and a pop-up stat on the photo, no host line (the carousel above The System on /case-study).
function strip({ id, eyebrow, title, sub, exclude, all = true, compact = false }) {
  const list = PAGES.filter(p => p.slug !== exclude);
  return `<aside class="cs-strip${compact ? ' cs-strip--compact' : ''}" aria-labelledby="${id}-h" data-cs-strip>
  <div class="cs-strip-in">
    <div class="cs-strip-head">
      <div class="cs-strip-intro">
        <div class="cs-strip-eyebrow">${eyebrow}</div>
        <h2 class="cs-strip-title" id="${id}-h">${title}</h2>
        ${sub ? `<p class="cs-strip-sub">${sub}</p>` : ''}
      </div>
      <div class="cs-strip-nav">
        ${all ? '<a class="cs-strip-all" href="/case-study">See all case studies <span aria-hidden="true">→</span></a>' : ''}
        <button class="cs-strip-btn" type="button" data-dir="-1" aria-label="Scroll back" disabled>‹</button>
        <button class="cs-strip-btn" type="button" data-dir="1" aria-label="Scroll forward">›</button>
      </div>
    </div>
    <ul class="cs-strip-row" role="list">
${list.map((p, i) => `      <li><a class="cs-strip-card" href="${url(p)}">
        <span class="cs-strip-img"><img src="/images/case-studies/${p.img}" alt="" loading="lazy" style="${imgStyle(p)}">${compact ? `<span class="cs-strip-tag">For: ${p.tag}</span>` : ''}${compact && p.stat ? `<span class="cs-strip-stat" style="--i:${i}"><b>${esc(p.stat[0])}</b><span>${esc(p.stat[1])}</span></span>` : ''}</span>
        <span class="cs-strip-body">
          <span class="cs-strip-kick">${p.eyebrow}</span>
          <span class="cs-strip-h">${p.h}</span>
          <span class="cs-strip-meta">${esc(p.name)}${compact ? '' : ` · ${esc(p.host)}`}</span>
${compact ? '' : `          <span class="cs-strip-for"><b>For:</b> ${p.tag}</span>`}
        </span>
      </a></li>`).join('\n')}
    </ul>
  </div>
</aside>`;
}

const STRIPS = {
  'CS-STRIP-NEW': () => strip({ id: 'cs-strip-new', eyebrow: 'New case studies', title: 'The full stories, <em>home by home.</em>', all: false, compact: true }),
  'CS-STRIP-MORE': () => strip({ id: 'cs-strip-more', eyebrow: 'Keep reading', title: 'More homes, <em>more results.</em>', all: false }),
};

function fillMarker(src, name, body) {
  const start = `<!-- ${name}:START -->`, end = `<!-- ${name}:END -->`;
  const a = src.indexOf(start), b = src.indexOf(end);
  if (a === -1 || b < a) return src;
  return `${src.slice(0, a + start.length)}\n${body}\n${src.slice(b)}`;
}

// ── One case study page ──────────────────────────────────────────────────────────────────────────
const images = new Set(PAGES.map(p => p.img));

function buildPage(p) {
  const raw = readFileSync(join(SRC, 'pages', `${p.src}.html`), 'utf8');
  const style = raw.match(/<style>[\s\S]*?<\/style>/)[0]
    // The drafts style a bare `footer`; that would restyle the site footer. Their own footer is dropped.
    .replace(/(^|})\s*footer[^{}]*\{[^}]*\}/g, '$1');
  let body = raw.match(/<body>([\s\S]*?)<\/body>/)[1];

  for (const m of body.matchAll(/\.\.\/images\/([^"')\s]+)/g)) images.add(m[1]);
  body = body
    .replace(/\.\.\/images\//g, '/images/case-studies/')
    .replace(/\s*Draft for review:[^<]*?(?=<\/div>)/, '')
    .replace(/<footer>[\s\S]*?<\/footer>/, '');
  if (/Draft for review|Draft, November/.test(body)) throw new Error(`${p.src}: draft label left in the page`);

  const title = plain(raw.match(/<title>([\s\S]*?)<\/title>/)[1]);
  const sub = body.match(/<p class="sub">([\s\S]*?)<\/p>/);
  const description = describe(sub ? plain(sub[1]) : `${p.name}: ${plain(p.h)}`);

  // Drop the draft's closing </main> and put the strip + site footer after it.
  body = body.replace(/<\/main>\s*$/, '').trimEnd();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
${headTop()}
${headMeta({ title, description, path: url(p), image: p.img })}
${style}
${headBottom}
${shellCss}
</head>
<body>
<!-- Generated by scripts/build-case-studies.mjs from the case study drafts. Edit the draft, then re-run. -->
<!-- HEADER:START -->
<!-- HEADER:END -->
${body}
</main>
<!-- CS-STRIP-MORE:START -->
<!-- CS-STRIP-MORE:END -->
<!-- FOOTER:START -->
<!-- FOOTER:END -->
</body>
</html>
`;
  return fillMarker(html, 'CS-STRIP-MORE', strip({ id: 'cs-strip-more', eyebrow: 'Keep reading', title: 'More homes, <em>more results.</em>', exclude: p.slug }));
}

// ── Run ──────────────────────────────────────────────────────────────────────────────────────────
if (!existsSync(join(SRC, 'pages'))) { console.error(`No pages/ folder in ${SRC}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });
mkdirSync(IMG_OUT, { recursive: true });

for (const p of PAGES) {
  writeFileSync(join(OUT, `${p.slug}.html`), buildPage(p));
  console.log(`WROTE case-studies/${p.slug}.html`);
}

for (const f of images) copyFileSync(join(SRC, 'images', f), join(IMG_OUT, f));
console.log(`COPIED ${images.size} images to images/case-studies/`);

// Strips on existing pages (the generated pages already have theirs)
for (const rel of ['case-study.html']) {
  const abs = join(ROOT, rel);
  let src = readFileSync(abs, 'utf8');
  for (const [name, make] of Object.entries(STRIPS)) src = fillMarker(src, name, make());
  writeFileSync(abs, src);
  console.log(`STRIPS ${rel}`);
}

execFileSync(process.execPath, [join(ROOT, 'scripts', 'sync-partials.mjs')], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log('Synced header, footer and attribution.');

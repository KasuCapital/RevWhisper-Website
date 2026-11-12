#!/usr/bin/env node
// build-case-studies.mjs — turns the case study drafts (the "RevWhisper Case Studies" folder: pages/*.html
// plus images/) into site pages under /case-studies, builds the /case-studies hub, and fills the
// scrolling "more case studies" strips (CS-STRIP-MORE markers) on /case-study and on
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
// screenshots of Airbnb listings down to the photo.
const PAGES = [
  { group: 'full', slug: 'sombrero-beach-home', src: 'sombrero-beach-home', tag: 'Single-home owner', name: 'Sombrero Beach Home', eyebrow: 'Marathon, FL · 4 BR Waterfront',
    h: 'More homes in Marathon. <em>More nights booked anyway.</em>', host: 'Matt, owner', img: '2ffee431a42c79b46932c5245e9d3cde.jpg', crop: '8.3% 49.1% 34.4% 5.1%', pos: '20% 30%' },
  { group: 'full', slug: 'peek-n-peak', src: 'peek-n-peak', tag: 'Owner with a slow off-season', name: 'Peek n’ Peak', eyebrow: 'Clymer, NY · 4 BR Ski Chalet',
    h: 'A ski house that sat <em>empty all fall.</em>', host: 'Mike and Julie, owners', img: 'lead-peek-house-a.jpg' },
  { group: 'full', slug: 'eastside-pool-home', src: 'eastside-pool-home', tag: 'Manager with a new listing', name: 'Eastside Pool Home', eyebrow: 'Austin, TX · 5 BR Group Home',
    h: 'A second-season listing, <em>priced to be seen.</em>', host: 'Cribs (Blake and Jeremy)', img: 'lead-holly-pool-a.jpg' },
  { group: 'full', slug: 'retreats-miami', src: 'retreats-miami', tag: 'Manager with a mixed portfolio', name: 'Retreats Miami', eyebrow: 'Miami and Miami Beach, FL · 6-Home Portfolio',
    h: 'Miami got more crowded. <em>All six homes still beat the market.</em>', host: 'Marc, Retreats Miami', img: '4c91be0776b0031299e63f17372253a6.jpg', crop: '9.8% 1.6% 16.8% 1.7%', pos: '50% 40%' },
  { group: 'full', slug: 'pinecone-stays', src: 'pinecone-stays', tag: 'Large portfolio operator', name: 'Pinecone Stays', eyebrow: 'Catskills, NY · 17-Cabin Portfolio',
    h: 'Seventeen Catskills cabins, <em>ahead of their markets.</em>', host: 'Max, Pinecone Stays', img: 'lead-woods-living-a.jpg' },
  { group: 'timeline', slug: 'woods-edge', src: 'timeline-woods-edge', tag: 'Hosts asking if gains last', name: 'Woods Edge', eyebrow: 'Results Timeline · 30/60/90 days',
    h: 'Ahead in 30 days. <em>Still ahead at 90.</em>', host: 'Max, Pinecone Stays · Catskills, NY', img: 'lead-woods-game-a.jpg' },
  { group: 'timeline', slug: 'casa-spur', src: 'timeline-casa-spur', tag: 'Large home, crowded market', name: 'Casa Spur', eyebrow: 'Results Timeline · First 30 days',
    h: '$34.3K booked in 30 days. <em>Against $1.3K a year earlier.</em>', host: 'Daniel, Palm Homes · Miami, FL', img: 'casa-cover-a.jpg' },
  { group: 'timeline', slug: 'killington-ski-home', src: 'timeline-killington-ski-home', tag: 'Ski-town owner', name: 'Killington Ski Home', eyebrow: 'Results Timeline · First 30 days',
    h: '$66.5K booked in the first 30 days. <em>Ski season, filled early.</em>', host: 'Joel Santos · Killington, VT', img: 'joel-cover-a.jpg' },
  { group: 'guide', slug: 'what-to-expect', src: 'what-to-expect', tag: 'Hosts with a slow start', name: 'What to expect', eyebrow: 'Three homes that started slowly',
    h: 'Some homes jump in week one. <em>Most build over two or three months.</em>', host: 'Matt; Mike and Julie', img: 'dc0082903768aa8168dd0a0c05c28a56.jpg', crop: '7.1% 50.4% 38.4% 2.3%', pos: '15% 25%' },
];
const GROUPS = [
  { key: 'full', title: 'Full case studies', note: 'What we changed, month by month, and what’s booked next.' },
  { key: 'timeline', title: 'Results timelines', note: 'What happened in the first 30, 60 and 90 days.' },
  { key: 'guide', title: 'Guide', note: 'For homes that don’t jump in week one.' },
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
<link rel="stylesheet" href="/assets/cs-strip.css">
<script defer src="/assets/cs-strip.js"></script>
<script src="/assets/x-pixel-base.js?v=2"></script>`;

// Fixed menu bar on desktop: push the page down so it doesn't sit on the hero. On phones the bar is in
// the page flow already. Also keep the site header's rounded corners (drafts set --radius to 8px).
const shellCss = `<style>
@media(min-width:901px){body{padding-top:76px}}
.float-bar{border-radius:14px}
</style>`;

// ── The scrolling strip ──────────────────────────────────────────────────────────────────────────
function strip({ id, eyebrow, title, sub, exclude }) {
  const list = PAGES.filter(p => p.slug !== exclude);
  return `<aside class="cs-strip" aria-labelledby="${id}-h" data-cs-strip>
  <div class="cs-strip-in">
    <div class="cs-strip-head">
      <div class="cs-strip-intro">
        <div class="cs-strip-eyebrow">${eyebrow}</div>
        <h2 class="cs-strip-title" id="${id}-h">${title}</h2>
        ${sub ? `<p class="cs-strip-sub">${sub}</p>` : ''}
      </div>
      <div class="cs-strip-nav">
        <a class="cs-strip-all" href="/case-studies">See all ${PAGES.length} <span aria-hidden="true">→</span></a>
        <button class="cs-strip-btn" type="button" data-dir="-1" aria-label="Scroll back" disabled>‹</button>
        <button class="cs-strip-btn" type="button" data-dir="1" aria-label="Scroll forward">›</button>
      </div>
    </div>
    <ul class="cs-strip-row" role="list">
${list.map(p => `      <li><a class="cs-strip-card" href="${url(p)}">
        <span class="cs-strip-img"><img src="/images/case-studies/${p.img}" alt="" loading="lazy" style="${imgStyle(p)}"></span>
        <span class="cs-strip-body">
          <span class="cs-strip-kick">${p.eyebrow}</span>
          <span class="cs-strip-h">${p.h}</span>
          <span class="cs-strip-meta">${esc(p.name)} · ${esc(p.host)}</span>
          <span class="cs-strip-for"><b>For:</b> ${p.tag}</span>
        </span>
      </a></li>`).join('\n')}
    </ul>
  </div>
</aside>`;
}

const STRIPS = {
  'CS-STRIP-MORE': () => strip({ id: 'cs-strip-more', eyebrow: 'Keep reading', title: 'More homes, <em>more results.</em>' }),
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

// ── The /case-studies hub ────────────────────────────────────────────────────────────────────────
function buildHub() {
  const card = p => `      <a class="hub-card" href="${url(p)}">
        <span class="hub-img"><img src="/images/case-studies/${p.img}" alt="" loading="lazy" style="${imgStyle(p)}"></span>
        <span class="hub-body">
          <span class="hub-kick">${p.eyebrow}</span>
          <span class="hub-h">${p.h}</span>
          <span class="hub-host">${esc(p.name)} · ${esc(p.host)}</span>
          <span class="hub-for"><b>For:</b> ${p.tag}</span>
        </span>
      </a>`;
  const groups = GROUPS.map(g => `  <section class="hub-group" aria-labelledby="hub-${g.key}">
    <div class="hub-group-head"><h2 id="hub-${g.key}">${g.title}</h2><p>${g.note}</p></div>
    <div class="hub-grid">
${PAGES.filter(p => p.group === g.key).map(card).join('\n')}
    </div>
  </section>`).join('\n');
  const counts = k => PAGES.filter(p => p.group === k).length;
  const title = 'Case studies: real homes, real results | RevWhisper';
  const description = 'Full case studies and results timelines from RevWhisper hosts: what we changed on each listing, month-by-month results against last year, and what’s already booked next.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${headTop()}
${headMeta({ title, description, path: '/case-studies', image: PAGES[0].img })}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--black:#32302F;--white:#fff;--accent:#4A6741;--accent-light:#dce6d8;--terra:#8B4A3E;--g50:#faf9f8;--g200:#E0DCDA;--g500:#706b68;--g600:#58534f;
  --heading:'Lora',Georgia,serif;--body:'DM Sans',system-ui,'Helvetica Neue',sans-serif;--mono:'DM Mono',Consolas,monospace;
  --sh:0 4px 16px rgba(50,48,47,.07),0 2px 6px rgba(50,48,47,.04)}
body{background:var(--white);color:var(--black);font-family:var(--body);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2{font-family:var(--heading);font-weight:400;letter-spacing:-.02em;line-height:1.12;text-wrap:balance}
.hub{max-width:1120px;margin:0 auto;padding:72px 40px 24px}
.hub-hero{display:grid;gap:22px;padding-bottom:40px;border-bottom:1px solid var(--g200)}
.hub-eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--g500)}
.hub-hero h1{font-size:clamp(38px,5.6vw,62px);max-width:16ch}
.hub-hero h1 em,.hub-group-head h2 em{color:var(--accent);font-style:italic}
.hub-hero p{max-width:62ch;color:var(--g600);font-size:18px;font-weight:300;text-wrap:pretty}
.hub-facts{display:flex;flex-wrap:wrap;gap:10px 30px;list-style:none}
.hub-facts li{display:flex;gap:8px;align-items:baseline}
.hub-facts b{font-family:var(--heading);font-weight:500;font-size:24px}
.hub-facts span{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--g500)}
.hub-group{display:grid;gap:22px;padding-top:52px}
.hub-group-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 18px}
.hub-group-head h2{font-size:28px}
.hub-group-head p{color:var(--g500);font-size:15px}
.hub-grid{display:grid;gap:22px;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))}
.hub-card{display:grid;grid-template-rows:auto 1fr;background:var(--g50);border:1px solid var(--g200);border-radius:12px;overflow:hidden;color:inherit;text-decoration:none;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.hub-card:hover{transform:translateY(-2px);box-shadow:var(--sh);border-color:#a9b9a3}
.hub-card:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.hub-img{display:block;aspect-ratio:16/10;background:var(--g200);overflow:hidden}
.hub-img img{width:100%;height:100%;object-fit:cover;display:block}
.hub-body{display:flex;flex-direction:column;gap:10px;padding:18px 20px 20px}
.hub-kick{font-family:var(--mono);font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--g500)}
.hub-h{font-family:var(--heading);font-size:21px;line-height:1.2;letter-spacing:-.015em;text-wrap:balance}
.hub-h em{font-style:normal;color:var(--accent)}
.hub-host{color:var(--g500);font-size:14.5px}
.hub-for{margin-top:auto;align-self:flex-start;font-family:var(--mono);font-size:11.5px;padding:3px 10px;border-radius:999px;border:1px solid var(--black)}
.hub-for b{font-weight:500}
.hub-band{margin-top:64px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 28px;padding:26px 30px;border-radius:14px;background:var(--accent-light)}
.hub-band p{font-family:var(--heading);font-size:21px;max-width:40ch}
.hub-band a{font-weight:500;color:var(--accent);text-decoration:none;white-space:nowrap}
.hub-band a:hover{text-decoration:underline}
.hub-cta{text-align:center;padding:84px 0 56px;display:grid;justify-items:center;gap:18px}
.hub-cta h2{font-size:clamp(30px,4vw,42px);max-width:22ch}
.hub-cta p{color:var(--g600);max-width:54ch}
.hub-cta a{display:inline-flex;gap:10px;align-items:center;background:var(--black);color:var(--white);text-decoration:none;font-weight:500;padding:15px 26px;border-radius:999px;margin-top:6px}
.hub-cta a:hover{background:var(--accent)}
@media(max-width:720px){.hub{padding:44px 16px 16px}.hub-band{padding:22px}}
@media(prefers-reduced-motion:reduce){.hub-card{transition:none}.hub-card:hover{transform:none}}
</style>
${headBottom}
${shellCss}
</head>
<body>
<!-- Generated by scripts/build-case-studies.mjs. Edit PAGES there, then re-run. -->
<!-- HEADER:START -->
<!-- HEADER:END -->
<main class="hub">
  <header class="hub-hero">
    <div class="hub-eyebrow">RevWhisper · Case studies</div>
    <h1>Real homes. <em>Real calendars.</em></h1>
    <p>Each story shows what we changed on the listing, how every month compared with the same month last year, and what’s already booked next. Slow months are shown too. Pick the home that looks most like yours.</p>
    <ul class="hub-facts">
      <li><b>${counts('full')}</b><span>Full case studies</span></li>
      <li><b>${counts('timeline')}</b><span>Results timelines</span></li>
      <li><b>${counts('guide')}</b><span>Guide</span></li>
    </ul>
  </header>
${groups}
  <div class="hub-band">
    <p>Want the quick version? See what client calendars look like right now.</p>
    <a href="/case-study">See client calendars <span aria-hidden="true">→</span></a>
  </div>
  <section class="hub-cta">
    <h2>One of these homes probably looks like yours.</h2>
    <p>Every listing is different, but the first step is always the same: see where your listing stands today, before anything changes.</p>
    <a href="https://cal.com/team/revwhisper/discovery">Book Your Free Strategy Call <span aria-hidden="true">→</span></a>
  </section>
</main>
<!-- FOOTER:START -->
<!-- FOOTER:END -->
</body>
</html>
`;
}

// ── Run ──────────────────────────────────────────────────────────────────────────────────────────
if (!existsSync(join(SRC, 'pages'))) { console.error(`No pages/ folder in ${SRC}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });
mkdirSync(IMG_OUT, { recursive: true });

for (const p of PAGES) {
  writeFileSync(join(OUT, `${p.slug}.html`), buildPage(p));
  console.log(`WROTE case-studies/${p.slug}.html`);
}
writeFileSync(join(OUT, 'index.html'), buildHub());
console.log('WROTE case-studies/index.html');

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

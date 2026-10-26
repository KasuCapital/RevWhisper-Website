#!/usr/bin/env node
// Builds the /unqualified preview: the /audit landing page, where every submission takes the
// unqualified path into /listing-check (the video questionnaire). Desktop gets a copy of audit.html
// (unqualified.html); phones get a copy of audit-flow.html (unqualified-flow.html), served at
// /unqualified by middleware.js the same way /audit serves /audit-flow.
//
// The copies load no trackers (Meta, GA, PostHog, X, Vercel Analytics) and never call the CRM
// webhook, so test runs don't reach Meta, Attio or #crm-updates.
//
// Re-run after any change to audit.html or audit-flow.html:
//   node scripts/build-unqualified-preview.mjs
// Every edit below must match exactly once; the build stops if the source has drifted.
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PREVIEW_SCRIPT = `<script>
/* PREVIEW: no trackers and no CRM. The lead is logged to the console instead of sent. */
window.fbq=function(){};
(function(f){window.fetch=function(u,o){
  if(String(u).indexOf('/api/form-webhook')>-1){
    try{console.info('[preview] not sent to the CRM:',JSON.parse(o.body));}catch(e){}
    return Promise.resolve(new Response('{"ok":true,"preview":true}',{status:200,headers:{'Content-Type':'application/json'}}));
  }
  return f.apply(this,arguments);
};})(window.fetch);
</script>`;

function edit(html, file, find, replace) {
  const n = typeof find === 'string' ? html.split(find).length - 1 : (html.match(new RegExp(find.source, find.flags.includes('g') ? find.flags : find.flags + 'g')) || []).length;
  if (n !== 1) throw new Error(`${file}: expected 1 match for ${find}, found ${n}`);
  return html.replace(find, replace);
}

const COMMON = [
  ['<!DOCTYPE html>\n', (src) => `<!DOCTYPE html>\n<!-- GENERATED from ${src} by scripts/build-unqualified-preview.mjs. Don't edit: change ${src} and re-run. -->\n`],
  ['<script src="/assets/rw-consent.js?v=3"></script>\n', () => '<script src="/assets/rw-consent.js?v=3"></script>\n' + PREVIEW_SCRIPT + '\n'],
  ['<script defer src="/assets/rw-posthog.js?v=4"></script>\n', () => ''],
  ["(window.rwConsent?rwConsent.whenAllowed:function(f){f();})(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-Y1FYZ5849B';document.head.appendChild(s);});", () => '/* preview: gtag.js not loaded */'],
  [/<!-- Meta Pixel[\s\S]*?<!-- End Meta Pixel -->/, () => '<!-- preview: Meta Pixel not loaded -->'],
  [/<!-- X Pixel base code[\s\S]*?<!-- End X Pixel base code -->/, () => '<!-- preview: X Pixel not loaded -->'],
  ['<script defer src="/_vercel/insights/script.js"></script>', () => ''],
  ["window.location.href='/audit-report-coming';", () => "window.location.href='/listing-check';"],
];

const PAGES = [
  {
    src: 'audit.html',
    out: 'unqualified.html',
    edits: [
      ['const qualified=!(revenueVal && revenueVal===bandsForListings[0]);', 'const qualified=false; // PREVIEW: every submission takes the unqualified path'],
      ['<!-- Phones never get this page: middleware.js serves /audit-flow at this URL. ?classic=1 shows this page on a phone. -->', '<!-- Phones never get this page: middleware.js serves /unqualified-flow at /unqualified. ?classic=1 shows this page on a phone. -->'],
    ],
  },
  {
    src: 'audit-flow.html',
    out: 'unqualified-flow.html',
    edits: [
      ['const qualified=!(revenueVal&&revenueVal===rwBands(listingsVal)[0]);', 'const qualified=false; // PREVIEW: every submission takes the unqualified path'],
    ],
  },
];

for (const page of PAGES) {
  let html = await readFile(join(ROOT, page.src), 'utf8');
  for (const [find, make] of COMMON) html = edit(html, page.src, find, make(page.src));
  for (const [find, replace] of page.edits) html = edit(html, page.src, find, replace);
  for (const banned of ['fbevents.js', 'gtag/js?id=', 'rw-posthog.js', 'x-pixel-base.js', '/audit-report-coming']) {
    if (html.includes(banned)) throw new Error(`${page.out}: still contains ${banned}`);
  }
  await writeFile(join(ROOT, page.out), html);
  console.log(`${page.src} -> ${page.out}`);
}

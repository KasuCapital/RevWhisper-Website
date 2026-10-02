#!/usr/bin/env node
// One-off migration (2026-10-02): moves every page onto /assets/rw-consent.js.
// Idempotent. Usage: node scripts/apply-consent.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const WRITE = process.argv.includes('--write');
const TAG = '<script src="/assets/rw-consent.js?v=1"></script>';
const files = execSync("git ls-files '*.html' scripts/home-redesign.shell.html").toString().trim().split('\n')
  .filter(f => !f.startsWith('.claude/'));

const GTAG_LOADER = "(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-Y1FYZ5849B';document.head.appendChild(s);})();";
const GATED_LOADER = "(window.rwConsent?rwConsent.whenAllowed:function(f){f();})(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-Y1FYZ5849B';document.head.appendChild(s);});";
const LAZY_G = "var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id=G-Y1FYZ5849B';document.head.appendChild(g);";
const LAZY_G_GATED = "(window.rwConsent?rwConsent.whenAllowed:function(f){f();})(function(){var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id=G-Y1FYZ5849B';document.head.appendChild(g);});";
const REVOKE = "if(window.rwConsent&&!rwConsent.ads)fbq('consent','revoke');\n";
const AD_CONSENT = '!window.rwConsent||rwConsent.ads';

// Group B (case studies, privacy, terms): GA only loaded after Accept. Becomes the standard block.
const GROUP_B = /<!-- Cookie Consent \+ GA4 \(consent-gated\) -->\n<script>\nwindow\.dataLayer[\s\S]*?function rwLoadGA\(\)\{[\s\S]*?\n\}\)\(\);\n<\/script>/;
const GROUP_B_NEW = `<!-- GA4. Consent defaults come from /assets/rw-consent.js -->
<script>
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','G-Y1FYZ5849B');
${GATED_LOADER}
function rwTrack(e,p){gtag('event',e,p||{});}
</script>`;

const CONSENT_IIFE = /\(function\(\)\{(?:(?!\}\)\(\);)[\s\S])*?rw_cookie_consent[\s\S]*?\}\)\(\);[ \t]*\n?/g;
const CONSENT_DEFAULT = /^gtag\('consent','default',\{[^}]*\}\);[ \t]*\n/gm;
const NOSCRIPT_FB = /<noscript><img[^>]*facebook\.com\/tr\?id=[^>]*><\/noscript>[ \t]*\n?/g;

const report = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  let s = src;
  const notes = [];
  const count = (re) => (s.match(re) || []).length;

  if (GROUP_B.test(s)) { s = s.replace(GROUP_B, GROUP_B_NEW); notes.push('groupB'); }

  // Strip legacy consent defaults and banner/upgrade IIFEs from GA blocks only.
  s = s.replace(/<script>(?:(?!<\/script>)[\s\S])*?<\/script>/g, (blk) => {
    if (!/G-Y1FYZ5849B|rw_cookie_consent/.test(blk)) return blk;
    let b = blk;
    const n1 = (b.match(CONSENT_DEFAULT) || []).length, n2 = (b.match(CONSENT_IIFE) || []).length;
    b = b.replace(CONSENT_DEFAULT, '').replace(CONSENT_IIFE, '');
    if (b.includes(GTAG_LOADER)) { b = b.replace(GTAG_LOADER, GATED_LOADER); notes.push('gated-loader'); }
    if (b.includes(LAZY_G) && !b.includes(LAZY_G_GATED)) { b = b.replace(LAZY_G, LAZY_G_GATED); notes.push('gated-lazy'); }
    if (n1) notes.push(`-default x${n1}`);
    if (n2) notes.push(`-banner/upgrade x${n2}`);
    return b;
  });
  s = s.replace(/<!-- GA4 \(consent-mode\)[^>]*-->/g, '<!-- GA4. Consent defaults come from /assets/rw-consent.js -->');
  s = s.replace(/<!-- Cookie Consent \+ GA4[^>]*-->/g, '<!-- GA4. Consent defaults come from /assets/rw-consent.js -->');

  // Meta: revoke before init when ads are not allowed.
  s = s.replace(/(^|\n)([ \t]*)(fbq\(\s*'init')/g, (m, nl, ind, call, off) => {
    const before = s.slice(Math.max(0, off - 80), off + nl.length);
    if (before.includes("fbq('consent','revoke')")) return m;
    notes.push('meta-revoke');
    return `${nl}${ind}${REVOKE}${ind}${call}`;
  });
  if (count(NOSCRIPT_FB)) { notes.push('-noscript-pixel'); s = s.replace(NOSCRIPT_FB, ''); }

  // Server-side CAPI / X conversions follow the same consent.
  if (s.includes('data.fbEventId=eventId;') && !s.includes('data.adConsent=')) {
    s = s.replace('data.fbEventId=eventId;', `data.fbEventId=eventId; data.adConsent=${AD_CONSENT};`); notes.push('capi-flag');
  }
  if (s.includes('fbEventId:evId,') && !s.includes('adConsent:')) {
    s = s.replace('fbEventId:evId,', `fbEventId:evId,adConsent:${AD_CONSENT},`); notes.push('capi-flag');
  }

  // Load rw-consent.js before the first tracker on the page.
  if (!s.includes('src="/assets/rw-consent.js')) {
    const m = s.match(/(<!--[^>]*-->\n)?<script[^>]*>(?:(?!<\/script>)[\s\S])*?(G-Y1FYZ5849B|fbq\(|x-pixel-base)/);
    const xm = s.match(/<script[^>]*x-pixel-base\.js[^>]*><\/script>/);
    const idx = [m && m.index, xm && xm.index].filter(i => i != null).sort((a, b) => a - b)[0];
    if (idx != null) { s = s.slice(0, idx) + TAG + '\n' + s.slice(idx); notes.push('+rw-consent'); }
  }

  if (/rw_cookie_consent/.test(s)) notes.push('!! legacy key still referenced');
  if (/gtag\('consent','default'/.test(s)) notes.push('!! consent default still present');
  if (s !== src) { report.push(`${f}: ${notes.join(', ')}`); if (WRITE) writeFileSync(f, s); }
}
console.log(report.join('\n'));
console.log(`\n${report.length} files ${WRITE ? 'written' : 'would change'}`);

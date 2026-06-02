#!/usr/bin/env node
// One-shot migration: strip inline footer markup + duplicated footer CSS
// from target pages and insert FOOTER markers + asset link so sync-partials.mjs
// can manage them. Idempotent.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Pages that should ship the shared footer.
// Note: get-started.html intentionally excluded — it's a single-screen form with
// overflow:hidden body styling that hides anything below the form.
const TARGETS = [
  'index.html',
  'blog/index.html',
  'blog/_template.html',
  '404.html',
  'photoediting.html',
  'case-study.html',
  'blog/airbnb-host-fee-squeeze-pricing-math.html',
  'blog/airbnb-mobile-app-listing-optimization.html',
  'blog/amenity-completeness-listing-visibility.html',
  'blog/comp-set-analysis-30-minutes.html',
  'blog/photography-audit-listing-losing-clicks.html',
  'blog/reserve-now-pay-later-revenue-strategy.html',
  'blog/views-not-bookings-content-gap.html',
  'blog/why-professional-photos-double-your-bookings.html',
];

// Match an entire <footer ...>...</footer> block (the FIRST occurrence).
const FOOTER_BLOCK_RE = /\n?<footer\b[^>]*>[\s\S]*?<\/footer>\n?/;

// Inline CSS rules to strip (best-effort; won't fail if missing).
// Each entry tries to match a contiguous chunk of footer-related declarations.
const CSS_STRIP_PATTERNS = [
  // home.css-style block: footer{...} .footer-grid{...} ... .footer-bottom{...}
  /\n?footer\{padding:[^}]*\}[\s\S]*?\.footer-bottom\{[^}]*\}\n?/,
  // blog-style footer block: /* ── Footer ── */ followed by rules
  /\n?\/\* ── Footer ── \*\/\nfooter\{padding:[^}]*\}[\s\S]*?\.footer-bottom\{[^}]*\}\n?/,
  // photoediting's .pe-footer rule (single-line)
  /\n?\.pe-footer\{[^}]*\}\n?/,
  /\n?\.pe-footer a\{[^}]*\}\n?/,
  // Responsive overrides — single-line variants
  /\n  footer\{padding:40px 0 30px\}\n  \.footer-bottom\{flex-direction:column;gap:10px;align-items:flex-start\}/,
  /\n  \.footer-bottom\{flex-direction:column;gap:10px;align-items:flex-start\}/,
  /\n  \.pe-footer\{padding:24px 0\}/,
];

function migrate(rel) {
  const abs = join(ROOT, rel);
  let src;
  try { src = readFileSync(abs, 'utf8'); }
  catch { console.error(`MISS  ${rel}`); return; }

  if (src.includes('<!-- FOOTER:START -->')) {
    console.log(`SKIP  ${rel} (already migrated)`);
    return;
  }

  // 1) Replace the existing <footer>...</footer> block with markers
  const hadFooter = FOOTER_BLOCK_RE.test(src);
  src = src.replace(FOOTER_BLOCK_RE, '\n\n<!-- FOOTER:START -->\n<!-- FOOTER:END -->\n');

  // 2) Strip duplicated inline footer CSS
  let cssRemoved = 0;
  for (const re of CSS_STRIP_PATTERNS) {
    if (re.test(src)) {
      src = src.replace(re, '');
      cssRemoved++;
    }
  }

  // 3) Inject /assets/footer.css link before </head> (idempotent)
  if (!src.includes('/assets/footer.css')) {
    src = src.replace(
      /<\/head>/,
      `<link rel="stylesheet" href="/assets/footer.css">\n</head>`
    );
  }

  writeFileSync(abs, src);
  console.log(`WROTE ${rel}  [footer:${hadFooter} css-rules-stripped:${cssRemoved}]`);
}

for (const t of TARGETS) migrate(t);

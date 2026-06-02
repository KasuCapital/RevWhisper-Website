#!/usr/bin/env node
// One-shot migration: strip inline float-bar markup/CSS/JS from blog HTML files
// and insert HEADER markers + asset links so sync-header.mjs can manage them.
// Idempotent: rerunning is a no-op once markers are in place.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'blog');

const CSS_BLOCK_RE =
  /\n?\/\* ── Floating Nav Bar ── \*\/[\s\S]*?\.fb-hamburger\.open span:last-child\{transform:translateY\(-3\.5px\) rotate\(-45deg\)\}\n?/;

const RESPONSIVE_LINES_RE =
  /\n?  \.float-bar\{width:calc\(100% - 32px\);padding:6px 6px 6px 16px\}\n  \.fb-links\{display:none;position:absolute;top:calc\(100% \+ 8px\);left:0;right:0;background:var\(--white\);flex-direction:column;padding:12px;border-radius:var\(--radius\);box-shadow:var\(--sh-lg\);gap:2px\}\n  \.fb-links\.open\{display:flex\}\n  \.fb-hamburger\{display:flex\}/;

const NAV_HTML_RE =
  /\n?<!-- ── Floating Nav ── -->\n<nav class="float-bar" id="float-bar">[\s\S]*?<\/nav>\n?/;

const NAV_JS_RE =
  /\n?<!-- ── Nav scroll & hamburger ── -->\n<script>\n\(function\(\) \{[\s\S]*?\}\)\(\);\n<\/script>\n?/;

function migrate(absPath) {
  const rel = absPath.replace(ROOT + '/', '');
  let src = readFileSync(absPath, 'utf8');
  if (src.includes('<!-- HEADER:START -->')) {
    console.log(`SKIP   ${rel} (already migrated)`);
    return;
  }

  let cssRemoved = CSS_BLOCK_RE.test(src);
  src = src.replace(CSS_BLOCK_RE, '\n');

  let respRemoved = RESPONSIVE_LINES_RE.test(src);
  src = src.replace(RESPONSIVE_LINES_RE, '');

  let navRemoved = NAV_HTML_RE.test(src);
  src = src.replace(NAV_HTML_RE, '\n\n<!-- HEADER:START -->\n<!-- HEADER:END -->\n');

  let jsRemoved = NAV_JS_RE.test(src);
  src = src.replace(NAV_JS_RE, '\n');

  // Inject header asset links right before </head>
  if (!src.includes('/assets/header.css')) {
    src = src.replace(
      /<\/head>/,
      `<link rel="stylesheet" href="/assets/header.css">\n<script defer src="/assets/header.js"></script>\n</head>`
    );
  }

  writeFileSync(absPath, src);
  console.log(
    `WROTE  ${rel}  [css:${cssRemoved} resp:${respRemoved} nav:${navRemoved} js:${jsRemoved}]`
  );
}

const files = [
  '_template.html',
  ...readdirSync(BLOG).filter(f => f.endsWith('.html') && f !== 'index.html' && f !== '_template.html'),
];

for (const f of files) migrate(join(BLOG, f));

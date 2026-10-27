#!/usr/bin/env node
// render-blog-hero.mjs: save a post's HTML hero graphic as images/blog/<slug>.png
// (1200x675, its finished frame) for og:image and twitter:image, since social
// platforms need a raster image. Uses the local Google Chrome in headless mode.
//   node scripts/render-blog-hero.mjs <slug> [<slug> ...]

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1200, H = 675;

function hero(slug) {
  const file = join(ROOT, 'blog', `${slug}.html`);
  const src = readFileSync(file, 'utf8');
  const a = src.indexOf('<!-- HERO:START -->'), b = src.indexOf('<!-- HERO:END -->');
  if (a === -1 || b === -1) throw new Error(`HERO markers not found in blog/${slug}.html`);
  return src.slice(a + '<!-- HERO:START -->'.length, b).trim();
}

function page(markup) {
  const font = f => pathToFileURL(join(ROOT, 'fonts', f)).href;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'DM Sans';font-weight:100 1000;src:url(${font('dm-sans-normal-300-700.woff2')}) format('woff2')}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#fff}
${readFileSync(join(ROOT, 'assets/blog-graphics.css'), 'utf8')}
.hx{width:${W}px;margin:0;border:0!important;border-radius:0}
</style></head><body><div class="hx still">${markup}</div></body></html>`;
}

const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('usage: node scripts/render-blog-hero.mjs <slug> [<slug> ...]'); process.exit(1); }
if (!existsSync(CHROME)) { console.error(`Chrome not found at ${CHROME}; set CHROME_PATH`); process.exit(1); }

const tmp = mkdtempSync(join(tmpdir(), 'rw-hero-'));
try {
  for (const slug of slugs) {
    const html = join(tmp, `${slug}.html`);
    const out = join(ROOT, 'images/blog', `${slug}.png`);
    writeFileSync(html, page(hero(slug)));
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${W},${H}`, `--screenshot=${out}`, '--virtual-time-budget=2000',
      pathToFileURL(html).href,
    ], { stdio: 'ignore' });
    console.log(`WROTE images/blog/${slug}.png`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

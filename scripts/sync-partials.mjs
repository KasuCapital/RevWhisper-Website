#!/usr/bin/env node
// sync-partials.mjs — propagate _partials/*.html into target pages between
// matching <!-- NAME:START --> / <!-- NAME:END --> markers. Idempotent.
// Run after editing any file in _partials/.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Each partial maps to (a) its source file and (b) the marker name used in pages.
const PARTIALS = [
  { name: 'HEADER', file: '_partials/header.html' },
  { name: 'FOOTER', file: '_partials/footer.html' },
  // Landing-page sections (10/3/26): proof band + client results, shared across paid LPs.
  { name: 'LP-PROOF', file: '_partials/lp-proof.html' },
  { name: 'LP-RESULTS', file: '_partials/lp-results.html' },
  // UTM + click-ID capture (10/16/26). allPages: synced into every page that has the markers,
  // not just TARGETS, so no landing page can drift from the copy the forms rely on.
  { name: 'ATTRIBUTION', file: '_partials/attribution.html', allPages: true },
];

// Pages that should ship the shared partials. Anything not listed here is left alone.
const TARGETS = [
  'index.html',
  '404.html',
  'photoediting.html',
  'case-study.html',
  'revenue-management.html',
  'airbnb-listing-optimization.html',
  'privacy.html',
  'terms.html',
  'blog/index.html',
  'blog/_template.html',
  'vrma.html',
  'audit.html',
  'airbnb-revenue-management.html',
  'pricing-tool-audit.html',
  'ranking-audit.html',
  'listing-audit.html',
];

// Auto-include every HTML file under blog/ that isn't the index/template.
function discoverBlogPosts() {
  const blogDir = join(ROOT, 'blog');
  let entries = [];
  try { entries = readdirSync(blogDir); } catch { return []; }
  return entries
    .filter(f => f.endsWith('.html') && f !== 'index.html' && f !== '_template.html')
    .map(f => `blog/${f}`);
}

// Every page an allPages partial can live in: top-level pages, blog posts, and build shells.
function discoverAllPages() {
  const list = (dir, keep) => {
    try { return readdirSync(join(ROOT, dir)).filter(keep).map(f => (dir === '.' ? f : `${dir}/${f}`)); }
    catch { return []; }
  };
  return [
    ...list('.', f => f.endsWith('.html')),
    ...list('blog', f => f.endsWith('.html')),
    ...list('scripts', f => f.endsWith('.shell.html')),
  ];
}

function readPartial(rel) {
  return readFileSync(join(ROOT, rel), 'utf8').trimEnd();
}

function syncPartial(src, name, body) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const startIdx = src.indexOf(start);
  const endIdx = src.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { src, found: false, changed: false };
  }
  const before = src.slice(0, startIdx + start.length);
  const after = src.slice(endIdx);
  const next = `${before}\n${body}\n${after}`;
  return { src: next, found: true, changed: next !== src };
}

function syncFile(rel, partials) {
  const abs = join(ROOT, rel);
  let src;
  try { src = readFileSync(abs, 'utf8'); }
  catch {
    console.error(`MISS  ${rel} (not found)`);
    return { changed: false, missing: false };
  }
  let changed = false;
  let touched = [];
  for (const p of partials) {
    const r = syncPartial(src, p.name, p.body);
    if (!r.found) continue;
    if (r.changed) { changed = true; touched.push(p.name); }
    src = r.src;
  }
  if (changed) {
    writeFileSync(abs, src);
    console.log(`WROTE ${rel}  [${touched.join(',')}]`);
  } else {
    console.log(`OK    ${rel}`);
  }
  return { changed, missing: false };
}

function main() {
  const partials = PARTIALS.map(p => ({ name: p.name, body: readPartial(p.file), allPages: !!p.allPages }));
  const targets = [...TARGETS, ...discoverBlogPosts()];
  const everywhere = partials.filter(p => p.allPages);
  const others = discoverAllPages().filter(rel => !targets.includes(rel));
  let changed = 0;
  for (const rel of targets) {
    const r = syncFile(rel, partials);
    if (r.changed) changed++;
  }
  for (const rel of others) {
    const r = syncFile(rel, everywhere);
    if (r.changed) changed++;
  }
  const total = targets.length + others.length;
  console.log(`\n${changed} file(s) updated · ${total - changed} unchanged`);
}

main();

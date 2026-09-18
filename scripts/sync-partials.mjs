#!/usr/bin/env node
// sync-partials.mjs — propagate _partials/*.html into target pages between
// matching <!-- NAME:START --> / <!-- NAME:END --> markers. Idempotent.
// Run after editing _partials/header.html or _partials/footer.html.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Each partial maps to (a) its source file and (b) the marker name used in pages.
const PARTIALS = [
  { name: 'HEADER', file: '_partials/header.html' },
  { name: 'FOOTER', file: '_partials/footer.html' },
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
  const partials = PARTIALS.map(p => ({ name: p.name, body: readPartial(p.file) }));
  const targets = [...TARGETS, ...discoverBlogPosts()];
  let changed = 0;
  for (const rel of targets) {
    const r = syncFile(rel, partials);
    if (r.changed) changed++;
  }
  console.log(`\n${changed} file(s) updated · ${targets.length - changed} unchanged`);
}

main();

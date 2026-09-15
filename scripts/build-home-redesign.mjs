#!/usr/bin/env node
/**
 * Compiles the Claude Design canvas export ("RevWhisper Landing.dc.html") into a
 * standalone page at /home-redesign, with no canvas runtime.
 *
 * The export depends on three things the browser can't do on its own:
 *   1. style-hover / style-focus attributes  -> real CSS rules on generated classes
 *   2. onClick="{{ handler }}" bindings      -> data-ev-* hooks the runtime wires up
 *   3. {{ value }} interpolation             -> left in place; assets/home-redesign.js
 *                                               re-implements the render loop
 *
 * Re-run this after the teammate updates the design:
 *   node scripts/build-home-redesign.mjs [path-to-design-folder]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const DESIGN_DIR = resolve(
  process.argv[2] || '/Users/bryan/Downloads/Whisper wheel design revamp'
);
const SRC = join(DESIGN_DIR, 'RevWhisper Landing.dc.html');
const ROOT = resolve(import.meta.dirname, '..');

if (!existsSync(SRC)) {
  console.error(`Design export not found: ${SRC}`);
  console.error('Pass the design folder as the first argument.');
  process.exit(1);
}

const raw = readFileSync(SRC, 'utf8');

/* ── 1. Split the canvas file ─────────────────────────────────────────────── */
const helmetStyle = raw.match(/<helmet>[\s\S]*?<style>([\s\S]*?)<\/style>[\s\S]*?<\/helmet>/);
if (!helmetStyle) throw new Error('Could not find <helmet> <style> block');
let css = helmetStyle[1].trim();

const bodyMatch = raw.match(/<\/helmet>([\s\S]*?)<\/x-dc>/);
if (!bodyMatch) throw new Error('Could not find markup between </helmet> and </x-dc>');
let html = bodyMatch[1].trim();

/* ── 2. style-hover / style-focus -> generated CSS classes ────────────────── */
// The canvas runtime turns these into pseudo-class rules at mount. We bake them
// into a stylesheet instead, so hover states survive without the runtime.
const genRules = [];
const classCache = new Map(); // dedupe identical declarations
let classSeq = 0;

function classFor(pseudo, decls) {
  const key = pseudo + '|' + decls;
  if (classCache.has(key)) return classCache.get(key);
  const name = `rw-${pseudo.slice(0, 1)}${++classSeq}`;
  // `.name:hover{...}` — the source declarations already win on specificity against
  // the element's own inline style only if marked important, because inline styles
  // outrank any selector. The canvas had the same constraint and solved it the same way.
  const body = decls
    .split(/;(?![^(]*\))/)
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':');
      return `${d.slice(0, i).trim()}:${d.slice(i + 1).trim()} !important`;
    })
    .join(';');
  genRules.push(`.${name}:${pseudo}{${body}}`);
  classCache.set(key, name);
  return name;
}

// Matches a full start tag, tolerating `>` inside quoted attribute values.
const TAG_RE = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

const EVENT_ATTRS = {
  onClick: 'click',
  onMouseOver: 'mouseover',
  onMouseOut: 'mouseout',
  onFocus: 'focus',
  onBlur: 'blur',
  onInput: 'input',
  onChange: 'change'
};

let hoverCount = 0;
let focusCount = 0;
let eventCount = 0;

html = html.replace(TAG_RE, (full, tag, attrs, selfClose) => {
  let out = attrs;
  const addClasses = [];

  // style-hover="..." / style-focus="..." / style-active="..."
  out = out.replace(/\sstyle-([a-z]+)="([^"]*)"/g, (_m, pseudo, decls) => {
    if (!decls.trim()) return '';
    if (pseudo === 'hover') hoverCount++;
    if (pseudo === 'focus') focusCount++;
    addClasses.push(classFor(pseudo, decls));
    return '';
  });

  // onClick="{{ handler }}" -> data-ev-click="handler"
  out = out.replace(
    /\s(on[A-Z][a-zA-Z]*)="\{\{\s*([\w.]+)\s*\}\}"/g,
    (_m, attr, handler) => {
      const evt = EVENT_ATTRS[attr];
      if (!evt) return '';
      eventCount++;
      return ` data-ev-${evt}="${handler}"`;
    }
  );

  if (addClasses.length) {
    if (/\sclass="/.test(out)) {
      out = out.replace(/\sclass="([^"]*)"/, (_m, c) => ` class="${c} ${addClasses.join(' ')}"`);
    } else {
      out = ` class="${addClasses.join(' ')}"` + out;
    }
  }

  return `<${tag}${out}${selfClose}>`;
});

/* ── 3. Bake the state-1 values, stash the templates ─────────────────────── */
// Without this the raw HTML ships literal "{{ pBody }}" text and an invalid
// <circle cx="{{ activeCx }}">, both visible for a frame before the JS runs.
// assets/home-redesign-vals.js is the single source of truth, shared with the runtime.
const require_ = createRequire(import.meta.url);
const { values } = require_(join(ROOT, 'assets/home-redesign-vals.js'));
const initial = values({ selected: 1, activeFactor: 0 });

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (tpl) =>
  tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => (initial[k] === undefined ? '' : String(initial[k])));

let bakedAttrs = 0;
let bakedText = 0;

// 3a. Sole-text-child bindings: <p style="…">{{ pBody }}</p>
html = html.replace(
  /<(p|div|span)((?:[^>"']|"[^"]*"|'[^']*')*?)>(\s*\{\{\s*[\w.]+\s*\}\}\s*)<\/\1>/g,
  (_full, tag, attrs, inner) => {
    bakedText++;
    return `<${tag}${attrs} data-tpl-text="${esc(inner.trim())}">${esc(fill(inner).trim())}</${tag}>`;
  }
);

// 3b. Attribute bindings: style="{{ pillStyle1 }}", cx="{{ activeCx }}", …
html = html.replace(TAG_RE, (full, tag, attrs, selfClose) => {
  const tpl = {};
  const out = attrs.replace(/\s([\w:-]+)="([^"]*\{\{[^"]*)"/g, (_m, name, value) => {
    if (name === 'data-tpl-text') return _m;
    tpl[name] = value;
    bakedAttrs++;
    return ` ${name}="${esc(fill(value))}"`;
  });
  if (!Object.keys(tpl).length) return full;
  return `<${tag}${out} data-tpl="${esc(JSON.stringify(tpl))}"${selfClose}>`;
});

/* ── 4. Asset paths ──────────────────────────────────────────────────────── */
// Design-local assets were converted to webp under /images/redesign/.
html = html
  .replace(/src="assets\/([^"]+)\.(png|jpg|jpeg)"/g, 'src="/images/redesign/$1.webp"')
  // Absolute prod URLs -> same-origin, so the preview works locally and offline.
  .replace(/https:\/\/revwhisper\.com\/images\//g, '/images/');

// Every image below the fold loads lazily; the hero stays eager so LCP isn't deferred.
html = html.replace(/<img /g, (m, offset) =>
  html.slice(offset, offset + 400).includes('hero-home')
    ? '<img fetchpriority="high" decoding="async" '
    : '<img loading="lazy" decoding="async" '
);

/* ── 4b. Resolve the placeholders the design left pointing at #top ───────── */
// The canvas had nowhere real to link, so social and legal both point at #top.
let relinked = 0;
const RELINK = [
  [/href="#top" aria-label="X"/g, 'href="https://x.com/RevWhisper" aria-label="X" target="_blank" rel="noopener"'],
  [/href="#top" aria-label="Instagram"/g, 'href="https://www.instagram.com/rev.whisper/" aria-label="Instagram" target="_blank" rel="noopener"'],
  [/href="#top" aria-label="Facebook"/g, 'href="https://www.facebook.com/groups/airbnblistingoptimization" aria-label="Facebook" target="_blank" rel="noopener"'],
  [/href="#top"([^>]*)>Privacy</g, 'href="/privacy"$1>Privacy<'],
  [/href="#top"([^>]*)>Terms</g, 'href="/terms"$1>Terms<']
];
RELINK.forEach(([re, to]) => {
  html = html.replace(re, (m) => { relinked++; return to; });
});

// Both "free performance audit" links pointed at #audit, which the design put on the
// bottom *booking* card — so a link promising an audit landed on a call form. The real
// audit is the five-step widget in the hero.
html = html.replace(/href="#audit"/g, () => { relinked++; return 'href="#top"'; });

/* ── 5. Stitch the stylesheet ────────────────────────────────────────────── */
css = [
  '/* Compiled from "RevWhisper Landing.dc.html" by scripts/build-home-redesign.mjs.',
  '   Edit the design, then re-run the script — do not hand-edit this file. */',
  css,
  '',
  '/* hover / focus states lifted out of style-hover + style-focus attributes */',
  ...genRules
].join('\n');

writeFileSync(join(ROOT, 'assets/home-redesign.css'), css + '\n');

/* ── 6. Page shell ───────────────────────────────────────────────────────── */
const shell = readFileSync(join(ROOT, 'scripts/home-redesign.shell.html'), 'utf8');
const page = shell.replace('<!--BODY-->', () => html);
writeFileSync(join(ROOT, 'home-redesign.html'), page);

console.log('Built /home-redesign');
console.log(`  hover rules   ${hoverCount}`);
console.log(`  focus rules   ${focusCount}`);
console.log(`  event hooks   ${eventCount}`);
console.log(`  baked attrs   ${bakedAttrs}`);
console.log(`  baked text    ${bakedText}`);
console.log(`  css           ${(css.length / 1024).toFixed(1)} KB`);
console.log(`  html          ${(page.length / 1024).toFixed(1)} KB`);

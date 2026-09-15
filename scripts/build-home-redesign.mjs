#!/usr/bin/env node
/**
 * Compiles the Claude Design canvas export ("RevWhisper Landing.dc.html") into
 * /home-redesign — a real page in this site's chrome, not a canvas replica.
 *
 * What the site keeps of its own:
 *   - the shared header and footer (_partials/*.html, between sync-partials markers)
 *   - the live homepage's five-step audit form (.form-card, lifted from index.html)
 *   - buttons, eyebrows, section headings, inputs -> home.css / audit-widget.css classes
 *
 * What comes from the design:
 *   - every section between the hero and the footer, with its interactions
 *   - the hero copy and the listing photo + rank card (recomposed: copy, form and photo
 *     all inside the hero; the design's hero CTA button is dropped — the form is the CTA)
 *
 * The export also leaned on three canvas-runtime features, resolved here at build time:
 *   1. style-hover / style-focus attributes  -> CSS pseudo-class rules on generated classes
 *   2. onClick="{{ handler }}" bindings      -> data-ev-click hooks (mouseover/out are
 *                                               dropped on purpose: hover no longer drives
 *                                               the Whisper Wheel — see home-redesign.js)
 *   3. {{ value }} interpolation             -> baked to state-1 values, templates stashed
 *                                               in data-tpl so the page paints before its JS
 *
 * Re-run after the teammate updates the design:
 *   node scripts/build-home-redesign.mjs [path-to-design-folder]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const DESIGN_DIR = resolve(process.argv[2] || '/Users/bryan/Downloads/Whisper wheel design revamp');
const SRC = join(DESIGN_DIR, 'RevWhisper Landing.dc.html');
const ROOT = resolve(import.meta.dirname, '..');

if (!existsSync(SRC)) {
  console.error(`Design export not found: ${SRC}\nPass the design folder as the first argument.`);
  process.exit(1);
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const raw = readFileSync(SRC, 'utf8');

/* ── Markup helpers (no HTML parser available; the export is well-formed, div-based) ── */
const DIV_TOKEN = /<div\b|<\/div>/g;

/** Index just past the </div> that closes the <div opening at openIdx. */
function matchClose(html, openIdx) {
  DIV_TOKEN.lastIndex = openIdx;
  let depth = 0, m;
  while ((m = DIV_TOKEN.exec(html))) {
    depth += m[0] === '<div' ? 1 : -1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error(`Unclosed <div at ${openIdx}`);
}

/** Start indices of the direct <div> children of the div opening at openIdx. */
function directChildren(html, openIdx) {
  const end = matchClose(html, openIdx);
  const innerStart = html.indexOf('>', openIdx) + 1;
  const kids = [];
  let depth = 0, m;
  DIV_TOKEN.lastIndex = innerStart;
  while ((m = DIV_TOKEN.exec(html)) && m.index < end - 6) {
    if (m[0] === '<div') { if (depth === 0) kids.push(m.index); depth++; }
    else depth--;
  }
  return kids;
}

const slice = (html, openIdx) => html.slice(openIdx, matchClose(html, openIdx));

/* ── 1. Split the canvas file ─────────────────────────────────────────────── */
const helmet = raw.match(/<helmet>[\s\S]*?<style>([\s\S]*?)<\/style>[\s\S]*?<\/helmet>/);
if (!helmet) throw new Error('Could not find <helmet> <style> block');
let css = helmet[1].trim();

const bodyMatch = raw.match(/<\/helmet>([\s\S]*?)<\/x-dc>/);
if (!bodyMatch) throw new Error('Could not find markup between </helmet> and </x-dc>');
const body = bodyMatch[1].trim();

/* ── 2. Take the design apart ─────────────────────────────────────────────── */
const wOpen = body.indexOf('<div style="background:#FFFFFF;color:#32302F');
if (wOpen < 0) throw new Error('Could not find the design wrapper div');
const wrapperOpenTag = body.slice(wOpen, body.indexOf('>', wOpen) + 1).replace('<div ', '<div class="rd-body" ');

const kids = directChildren(body, wOpen).map((i) => slice(body, i));
const heroIdx = kids.findIndex((k) => k.startsWith('<div id="top"'));
const footerIdx = kids.findIndex((k) => k.includes('border-top:1px solid #E0DCDA;background:#F8F7F6'));
if (heroIdx < 0 || footerIdx < 0) throw new Error('Wrapper children did not match the expected shape');

const dropped = kids.filter((k) => /^<div data-(progress|nav)\b/.test(k)).length;
const hero = kids[heroIdx];
const sections = kids.filter((k, i) => i !== heroIdx && i !== footerIdx && !/^<div data-(progress|nav)\b/.test(k));

// Inside the design's hero: the photo band holds [rank-frame + rank card, caption row,
// "What we are" block] under one position:relative div, then a "See how it works" cue.
const bandOpen = hero.indexOf('<div data-reveal style="max-width:1120px;margin:0 auto;padding:0 24px 44px">');
if (bandOpen < 0) throw new Error('Could not find the hero photo band');
const relOpen = directChildren(hero, bandOpen)[0];
const relKids = directChildren(hero, relOpen);
if (relKids.length !== 3) throw new Error(`Photo band has ${relKids.length} children, expected 3`);
const photoHtml = hero.slice(relKids[0], matchClose(hero, relKids[1]));   // photo + caption
const whatWeAreHtml = slice(hero, relKids[2]);
const cueHtml = hero.slice(matchClose(hero, bandOpen), hero.lastIndexOf('</div>')).trim();

/* ── 3. Transform passes ──────────────────────────────────────────────────── */
const counts = { cta: 0, eyebrow: 0, h2: 0, hover: 0, focus: 0, events: 0, bakedAttrs: 0, bakedText: 0, relinked: 0 };

// 3a. CTAs -> the site's buttons. Side text next to buttons is removed for uniformity.
const BTN = '<a href="/get-started" class="btn-accent">Book your free strategy call &rarr;</a>';
function siteButtons(html) {
  return html
    // pricing card (dark green): white button, drop the note beneath it
    .replace(/<a href="#call"[^>]*style-hover="background:#F8F7F6;color:#32302F[^"]*">Book a strategy call<\/a>\s*<div style="font-size:15px;color:#FFFFFF;text-align:center">[^<]*<\/div>/g,
      () => { counts.cta++; return '<a href="/get-started" class="btn-white" style="align-self:flex-start">Book your free strategy call &rarr;</a>'; })
    // team block (outline button inside a flex column): keep it natural width
    .replace(/<a href="#call"[^>]*style-hover="background:#32302F;color:#FFFFFF">Book a strategy call<\/a>/g,
      () => { counts.cta++; return BTN.replace('class="btn-accent"', 'class="btn-accent" style="align-self:flex-start"'); })
    // button + trailing explainer span
    .replace(/<a href="#call"[^>]*>Book a strategy call<\/a>\s*<span style="font-size:16px;color:#706A63">[^<]*<\/span>/g,
      () => { counts.cta++; return BTN; })
    // any remaining
    .replace(/<a href="#call"[^>]*>Book a strategy call<\/a>/g, () => { counts.cta++; return BTN; });
}

// 3b. Eyebrows and section headings -> site classes (typography only; layout stays inline)
function siteTypography(html) {
  return html
    .replace(/<div style="font-size:13px;font-weight:500;letter-spacing:\.18em;text-transform:uppercase;color:#4A6741">([^<]*)<\/div>/g,
      (_m, t) => { counts.eyebrow++; return `<div class="eyebrow">${t}</div>`; })
    .replace(/<h2 style="margin:0;font-size:clamp\(28px,3\.2vw,38px\);line-height:1\.18;font-family:'Lora',Georgia,serif;font-weight:400;letter-spacing:-0\.018em(;[^"]*)?">/g,
      (_m, rest) => { counts.h2++; return `<h2 class="h2" style="margin:0${rest || ''}">`; });
}

// 3c. Links and ids. #compare and #pricing collide with home.css rules written for the
// live homepage's sections (dark compare table, grey pricing band), so they're renamed.
function siteLinks(html) {
  const swap = (re, to) => { html = html.replace(re, (m) => { counts.relinked++; return typeof to === 'function' ? to(m) : to; }); };
  swap(/href="https:\/\/revwhisper\.com\/case-study-2"/g, 'href="/case-study"');
  swap(/href="#audit"/g, 'href="#audit-form" class="js-to-audit"');
  swap(/id="compare"/g, 'id="why-revwhisper"');
  swap(/href="#compare"/g, 'href="#why-revwhisper"');
  swap(/id="pricing"/g, 'id="rates"');
  swap(/href="#pricing"/g, 'href="#rates"');
  return html;
}

// 3d. Bottom "Book a strategy call" card -> the site's form card + inputs + button
function siteCallCard(html) {
  const INPUT_ATTRS = {
    'Full name': 'autocomplete="name"',
    'Email': 'type="email" autocomplete="email" inputmode="email"',
    'Airbnb listing URL': 'inputmode="url" autocomplete="off"',
    'Number of listings': 'inputmode="numeric"'
  };
  return html
    .replace(/<div data-reveal id="audit" style="background:#FFFFFF;border-radius:8px;padding:28px;display:flex;flex-direction:column;gap:14px">/,
      '<div data-reveal class="form-card rd-call-card">')
    .replace(/<input placeholder="(Full name|Email|Airbnb listing URL|Number of listings)" style="[^"]*"(?: style-focus="[^"]*")?>/g,
      (_m, ph) => `<input class="field-input" placeholder="${ph}" ${INPUT_ATTRS[ph]}>`)
    .replace(/<button style="[^"]*"(?: style-hover="[^"]*")?(?: style-focus="[^"]*")?>Choose a time<\/button>/,
      '<button type="button" class="btn-next">Choose a time</button>');
}

// 3e. style-hover / style-focus -> generated pseudo-class rules; event bindings -> hooks
const genRules = [];
const classCache = new Map();
let classSeq = 0;
function classFor(pseudo, decls) {
  const key = pseudo + '|' + decls;
  if (classCache.has(key)) return classCache.get(key);
  const name = `rw-${pseudo.slice(0, 1)}${++classSeq}`;
  // inline styles outrank any selector, so the lifted declarations must be !important
  const rule = decls.split(/;(?![^(]*\))/).map((d) => d.trim()).filter(Boolean)
    .map((d) => { const i = d.indexOf(':'); return `${d.slice(0, i).trim()}:${d.slice(i + 1).trim()} !important`; })
    .join(';');
  genRules.push(`.${name}:${pseudo}{${rule}}`);
  classCache.set(key, name);
  return name;
}

const TAG_RE = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

function pseudoAndEvents(html) {
  return html.replace(TAG_RE, (full, tag, attrs, selfClose) => {
    let out = attrs;
    const add = [];
    out = out.replace(/\sstyle-([a-z]+)="([^"]*)"/g, (_m, pseudo, decls) => {
      if (!decls.trim()) return '';
      counts[pseudo === 'hover' ? 'hover' : 'focus']++;
      add.push(classFor(pseudo, decls));
      return '';
    });
    // onClick survives as a hook; onMouseOver/onMouseOut are dropped (hover no longer drives state)
    out = out.replace(/\s(on[A-Z][a-zA-Z]*)="\{\{\s*([\w.]+)\s*\}\}"/g, (_m, attr, handler) => {
      if (attr !== 'onClick') return '';
      counts.events++;
      return ` data-ev-click="${handler}"`;
    });
    if (add.length) {
      out = /\sclass="/.test(out)
        ? out.replace(/\sclass="([^"]*)"/, (_m, c) => ` class="${c} ${add.join(' ')}"`)
        : ` class="${add.join(' ')}"` + out;
    }
    return `<${tag}${out}${selfClose}>`;
  });
}

// 3f. Whisper Wheel pills become real buttons for keyboard users
const wheelA11y = (html) => html.replace(/<div data-factor-row="(\d)"/g, '<div data-factor-row="$1" role="button" tabindex="0"');

// 3g. Bake state-1 values, stash templates (assets/home-redesign-vals.js is shared with the runtime)
const require_ = createRequire(import.meta.url);
const { values } = require_(join(ROOT, 'assets/home-redesign-vals.js'));
const initial = values({ selected: 1, activeFactor: 0 });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (tpl) => tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => (initial[k] === undefined ? '' : String(initial[k])));

function bakeTemplates(html) {
  html = html.replace(/<(p|div|span)((?:[^>"']|"[^"]*"|'[^']*')*?)>(\s*\{\{\s*[\w.]+\s*\}\}\s*)<\/\1>/g,
    (_f, tag, attrs, inner) => { counts.bakedText++; return `<${tag}${attrs} data-tpl-text="${esc(inner.trim())}">${esc(fill(inner).trim())}</${tag}>`; });
  return html.replace(TAG_RE, (full, tag, attrs, selfClose) => {
    const tpl = {};
    const out = attrs.replace(/\s([\w:-]+)="([^"]*\{\{[^"]*)"/g, (m, name, value) => {
      if (name === 'data-tpl-text') return m;
      tpl[name] = value; counts.bakedAttrs++;
      return ` ${name}="${esc(fill(value))}"`;
    });
    return Object.keys(tpl).length ? `<${tag}${out} data-tpl="${esc(JSON.stringify(tpl))}"${selfClose}>` : full;
  });
}

// 3h. Assets, colours, container widths
const COLOR_MAP = {                 // design's near-miss greys -> the site's exact tokens
  '#706A63': '#706b68', '#F8F7F6': '#faf9f8', '#D5D0CC': '#ccc8c5', '#E8E4E1': '#f3f1ef', '#48433F': '#48433f'
};
const siteColors = (s) => s.replace(/#(?:706A63|F8F7F6|D5D0CC|E8E4E1|48433F)\b/g, (m) => COLOR_MAP[m]);

function assetsAndLayout(html) {
  html = html
    .replace(/src="assets\/([^"]+)\.(png|jpg|jpeg)"/g, 'src="/images/redesign/$1.webp"')
    .replace(/https:\/\/revwhisper\.com\/images\//g, '/images/');
  html = html.replace(/<img /g, (m, offset) =>
    html.slice(offset, offset + 400).includes('hero-home') ? '<img fetchpriority="high" decoding="async" ' : '<img loading="lazy" decoding="async" ');
  // design containers are 1120px with 24px gutters; the site's .w is 1100px with 28px
  html = html.replace(/max-width:1120px;margin:0 auto;padding:([^;"]+)/g,
    (_m, p) => `max-width:1100px;margin:0 auto;padding:${p.replace(/(^|\s)24px(?=\s|$)/g, '$128px')}`);
  return siteColors(html);
}

/* ── 4. Assemble ──────────────────────────────────────────────────────────── */
// The live homepage's form card, verbatim, tagged so its leads are attributable to this page
const indexHtml = read('index.html');
const fcOpen = indexHtml.indexOf('<div class="form-card" id="audit-form">');
if (fcOpen < 0) throw new Error('Could not find .form-card#audit-form in index.html');
const formCard = slice(indexHtml, fcOpen).replace('id="audit-form">', 'id="audit-form" data-page="homepage-redesign">');

const heroHtml = read('scripts/home-redesign.hero.html')
  .replace('<!--PHOTO-->', () => photoHtml)
  .replace('<!--FORM-->', () => formCard);

const whatWeAre = `<div data-reveal style="max-width:1100px;margin:0 auto;padding:56px 28px 0">\n${whatWeAreHtml}\n${cueHtml}\n</div>`;

let content = [wrapperOpenTag, heroHtml, whatWeAre, ...sections, '</div>'].join('\n\n');
content = siteButtons(content);
content = siteTypography(content);
content = siteLinks(content);
content = siteCallCard(content);
content = pseudoAndEvents(content);
content = wheelA11y(content);
content = bakeTemplates(content);
content = assetsAndLayout(content);

/* ── 5. Stylesheet ────────────────────────────────────────────────────────── */
// The design's own globals would fight the site's: html/body are home.css's job, and its
// bare a{}/a:hover{} would recolour header + button text on hover. Scope or drop them.
css = css
  .replace(/^\s*html,body\{[^}]*\}\s*$/m, '')
  .replace(/^\s*a\{[^}]*\}\s*$/m, '')
  .replace(/^\s*a:hover\{[^}]*\}\s*$/m, '')
  .replace(/@media \(hover:none\)\{\s*a\{/, '@media (hover:none){\n    .rd-body a{');

css = [
  '/* Compiled from "RevWhisper Landing.dc.html" by scripts/build-home-redesign.mjs.',
  '   Edit the design or scripts/home-redesign.extra.css, then re-run — do not hand-edit. */',
  siteColors(css),
  '',
  '/* hover / focus states lifted out of style-hover + style-focus attributes */',
  ...siteColors(genRules.join('\n')).split('\n'),
  '',
  read('scripts/home-redesign.extra.css').trim()
].join('\n');
writeFileSync(join(ROOT, 'assets/home-redesign.css'), css + '\n');

/* ── 6. Page ──────────────────────────────────────────────────────────────── */
const page = read('scripts/home-redesign.shell.html')
  .replace('<!--HEADER-->', () => read('_partials/header.html').trimEnd())
  .replace('<!--FOOTER-->', () => read('_partials/footer.html').trimEnd())
  .replace('<!--BODY-->', () => content);
writeFileSync(join(ROOT, 'home-redesign.html'), page);

console.log('Built /home-redesign');
console.log(`  design blocks  ${kids.length} found · ${sections.length} kept · nav/progress/hero/footer replaced (${dropped + 2} dropped)`);
console.log(`  buttons        ${counts.cta} -> .btn-accent/.btn-white`);
console.log(`  eyebrows/h2    ${counts.eyebrow} / ${counts.h2} -> .eyebrow / .h2`);
console.log(`  links          ${counts.relinked} rewritten`);
console.log(`  hover/focus    ${counts.hover} / ${counts.focus} rules`);
console.log(`  click hooks    ${counts.events}`);
console.log(`  baked          ${counts.bakedAttrs} attrs · ${counts.bakedText} text`);
console.log(`  css / html     ${(css.length / 1024).toFixed(1)} KB / ${(page.length / 1024).toFixed(1)} KB`);

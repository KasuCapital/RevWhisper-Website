#!/usr/bin/env node
/**
 * Compiles the Claude Design canvas export ("RevWhisper Landing.dc.html") into
 * the homepage (index.html) — a real page in this site's chrome, not a canvas replica.
 *
 * What the site keeps of its own:
 *   - the shared header and footer (_partials/*.html, between sync-partials markers)
 *   - the shared five-step audit form (.form-card, in scripts/home-redesign.form.html)
 *   - buttons, eyebrows, section headings, inputs -> home.css / audit-widget.css classes
 *
 * What comes from the design:
 *   - every section between the hero and the footer, with its interactions, in the
 *     order set by ORDER below
 *   - every CTA opens the hero form's fullscreen takeover (audit.html's flow); the header
 *     button is the one link that still leaves for /get-started
 *   - the hero copy (the hero is copy beside the form; the design's hero CTA button and
 *     its whole photo band — listing photo, rank card, "What we are" block, scroll cue —
 *     are dropped, so the +35% band is the first thing under the hero)
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
const sections = kids.filter((k, i) => i !== heroIdx && i !== footerIdx && !/^<div data-(progress|nav)\b/.test(k));

// Section order, set by Bryan on 17 Sep 2026. The +35% band opens the page under the
// hero; the process timeline follows the case studies ("here are the results, here is
// how you get them") and keeps the comparison → pricing close contiguous. Sections are
// picked by a marker, so a re-exported design that shuffles itself still compiles in
// this order. Markers are matched on the raw export (ids are renamed later, in siteLinks).
const ORDER = [
  ['stat band',  '>Average across managed listings</div>'],
  ['mechanism',  'id="system"'],
  ['stack',      '>The stack you can retire</div>'],
  ['results',    'id="results"'],
  ['process',    '>The process</div>'],
  ['comparison', 'id="compare"'],
  ['pricing',    'id="pricing"'],
  ['team',       '>Why trust us</div>'],
  ['call',       'id="call"']
];
const ordered = ORDER.map(([label, marker]) => {
  const hits = sections.filter((s) => s.includes(marker));
  if (hits.length !== 1) throw new Error(`Expected one "${label}" section (marker ${marker}), found ${hits.length}`);
  return hits[0];
});
if (new Set(ordered).size !== sections.length) throw new Error(`ORDER covers ${new Set(ordered).size} of ${sections.length} sections`);

/* ── 3. Transform passes ──────────────────────────────────────────────────── */
const counts = { cta: 0, eyebrow: 0, h2: 0, hover: 0, focus: 0, events: 0, bakedAttrs: 0, bakedText: 0, relinked: 0, icons: 0 };

// 3a. CTAs -> the site's buttons, every one into the audit form's fullscreen takeover
// (.js-to-form, handled by audit-widget.js). One offer on the page, one name for it.
// Side text next to buttons is removed for uniformity.
const BTN = '<a href="#audit-form" class="btn-accent js-to-form">Get my free audit &rarr;</a>';
// Inside a flex column the button would stretch to the column's width; these two sit in
// one (the team block, the pricing card) and keep their natural width. Both are spelled
// out rather than patched out of BTN — a string replace against BTN's class list breaks
// silently the next time the label or the class changes.
const BTN_NARROW = '<a href="#audit-form" class="btn-accent js-to-form" style="align-self:flex-start">Get my free audit &rarr;</a>';
const BTN_NARROW_WHITE = '<a href="#audit-form" class="btn-white js-to-form" style="align-self:flex-start">Get my free audit &rarr;</a>';
function siteButtons(html) {
  return html
    // pricing card (dark green): white button, drop the note beneath it
    .replace(/<a href="#call"[^>]*style-hover="background:#F8F7F6;color:#32302F[^"]*">Book a strategy call<\/a>\s*<div style="font-size:15px;color:#FFFFFF;text-align:center">[^<]*<\/div>/g,
      () => { counts.cta++; return BTN_NARROW_WHITE; })
    // team block (outline button inside a flex column): keep it natural width
    .replace(/<a href="#call"[^>]*style-hover="background:#32302F;color:#FFFFFF">Book a strategy call<\/a>/g,
      () => { counts.cta++; return BTN_NARROW; })
    // button + trailing explainer span
    .replace(/<a href="#call"[^>]*>Book a strategy call<\/a>\s*<span style="font-size:16px;color:#706A63">[^<]*<\/span>/g,
      () => { counts.cta++; return BTN; })
    // any remaining
    .replace(/<a href="#call"[^>]*>Book a strategy call<\/a>/g, () => { counts.cta++; return BTN; })
    // CTA rows carry the button and nothing else: drop the "See full case studies" link
    // beside the Results button (the case-study cards above it already link out) and
    // centre the one row the design left flush-left (the process timeline).
    .replace(/<a href="https:\/\/revwhisper\.com\/case-study-2"[^>]*>See full case studies<\/a>\s*/g, () => { counts.relinked++; return ''; })
    .replace(/(<div data-reveal style="margin-top:\d+px;display:flex;align-items:center;)(flex-wrap:wrap;gap:\d+px">\s*<a href="#audit-form" class="btn-accent js-to-form">)/g,
      (_m, a, b) => `${a}justify-content:center;${b}`);
}

// 3i. Occupancy cards get a market icon. Line icons drawn to each market's own character
// (palm / pine / skyline / misty ridges / snow-capped peak / rolling hills) so six cards
// that carry near-identical numbers are told apart at a glance. Stroked in the brand
// accent. The cards are duplicated for the marquee loop, so a global replace catches both
// copies; the Whisper Wheel's "Your property" card shares this markup and is skipped by
// not being a key here.
const ICON = (paths) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#4A6741" stroke-width="1.7" ` +
  `stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:0 0 auto;margin-top:2px" aria-hidden="true">${paths}</svg>`;
const MARKET_ICONS = {
  // palm: trunk + four fronds
  'Florida Gulf Coast': ICON('<path d="M12.5 10.5c-.4 3.7-1.1 7.2-2.5 10.5"/><path d="M12.5 10.5C9.7 8.4 6.4 8.8 4.6 11.4"/><path d="M12.5 10.5c2.8-2.1 6.1-1.7 7.9.9"/><path d="M12.5 10.5c-.6-3.2.9-5.9 3.5-6.9"/><path d="M12.5 10.5c2.1 1.2 3.5 3.1 4.1 5.5"/>'),
  // conifer
  'Poconos': ICON('<path d="M12 2.8 7.6 9.9h2.6L5.6 16.2h12.8L13.8 9.9h2.6L12 2.8Z"/><path d="M12 16.2v4.6"/>'),
  // skyline with a spire
  'Miami': ICON('<path d="M2.5 20.5h19"/><path d="M5 20.5v-8.2h4.2v8.2"/><path d="M9.2 20.5V6.8h5.6v13.7"/><path d="M14.8 20.5v-6.4H19v6.4"/><path d="M12 6.8V4.2"/>'),
  // ridge line with two bands of haze
  'Smoky Mountains': ICON('<path d="M2.5 19.6 9 9.6l3.6 5.2 3.2-4.4 5.7 9.2"/><path d="M4.4 15.6h5"/><path d="M12.2 15.6h7"/>'),
  // peak with a snow line
  'White Mountains': ICON('<path d="M2.6 19.4 9.6 6.4l4.2 7.6 2.6-4.2 5 9.6Z"/><path d="M9.6 6.4 12 10.8H7.25Z" fill="#4A6741" stroke="none"/>'),
  // rolling hills
  'North Georgia Mountains': ICON('<path d="M2.5 19.3c2.6-7.8 7.4-7.8 10 0"/><path d="M10.4 19.3c2.2-6 6.4-6 8.6 0"/><path d="M2.5 19.3h19"/>')
};
const NAME_BLOCK = /<div style="min-width:0">\s*(<div style="font-size:16px;[^"]*">([^<]+)<\/div>\s*<div style="font-size:14px;[^"]*">[^<]*<\/div>)\s*<\/div>/g;
function marketIcons(html) {
  // the icon needs its own 26px, so the card grows to keep the longest name on one line
  html = html.replace(/flex:0 0 auto;width:232px;background:#FFFFFF/g,
    () => { counts.icons++; return 'flex:0 0 auto;width:268px;background:#FFFFFF'; });
  return html.replace(NAME_BLOCK, (m, inner, name) => {
    const icon = MARKET_ICONS[name];
    if (!icon) return m;
    return `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div style="min-width:0">${inner}</div>${icon}</div>`;
  });
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
  swap(/href="#audit"/g, 'href="#audit-form" class="js-to-form"');
  swap(/id="compare"/g, 'id="why-revwhisper"');
  swap(/href="#compare"/g, 'href="#why-revwhisper"');
  swap(/id="pricing"/g, 'id="rates"');
  swap(/href="#pricing"/g, 'href="#rates"');
  return html;
}

// 3d. Bottom "Book a strategy call" card -> one button into the same fullscreen audit
// flow as every other CTA. The design's 4-field form was a second, different funnel for
// the same booking, and its "prefer diagnostics first" line only existed to point back
// at the first one.
function siteCallCard(html) {
  const open = html.indexOf('<div data-reveal id="audit" style="background:#FFFFFF;border-radius:8px;padding:28px;display:flex;flex-direction:column;gap:14px">');
  if (open < 0) throw new Error('Could not find the bottom call card');
  const end = matchClose(html, open);
  const cta = `<div data-reveal class="rd-call-cta">
        <a href="#audit-form" class="btn-white js-to-form">Get my free audit &rarr;</a>
      </div>`;
  counts.cta++;
  html = html.slice(0, open) + cta + html.slice(end);
  return html.replace(/\s*<div style="font-size:16px;color:#FFFFFF">Prefer diagnostics first\? <a [^>]*>Request a free performance audit<\/a> instead\.<\/div>/,
    () => { counts.relinked++; return ''; });
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
  // no image is above the fold any more — the hero is copy + the audit form
  html = html.replace(/<img /g, '<img loading="lazy" decoding="async" ');
  // design containers are 1120px with 24px gutters; the site's .w is 1100px with 28px
  html = html.replace(/max-width:1120px;margin:0 auto;padding:([^;"]+)/g,
    (_m, p) => `max-width:1100px;margin:0 auto;padding:${p.replace(/(^|\s)24px(?=\s|$)/g, '$128px')}`);
  return siteColors(html);
}

/* ── 4. Assemble ──────────────────────────────────────────────────────────── */
// The five-step audit form card. Held in its own build source rather than lifted from
// index.html: this build now WRITES index.html, so reading it back would be circular.
// data-fullscreen opts the card into audit.html's takeover (see audit-widget.js). No
// data-page — audit-widget.js then tags these leads "homepage", as the old / did.
const formSrc = read('scripts/home-redesign.form.html');
const fcOpen = formSrc.indexOf('<div class="form-card" id="audit-form">');
if (fcOpen < 0) throw new Error('Could not find .form-card#audit-form in scripts/home-redesign.form.html');
const formCard = slice(formSrc, fcOpen).replace('id="audit-form">', 'id="audit-form" data-fullscreen>');

const heroHtml = read('scripts/home-redesign.hero.html').replace('<!--FORM-->', () => formCard);

let content = [wrapperOpenTag, heroHtml, ...ordered, '</div>'].join('\n\n');
content = siteButtons(content);
content = marketIcons(content);
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
writeFileSync(join(ROOT, 'index.html'), page);

console.log('Built / (index.html)');
console.log(`  design blocks  ${kids.length} found · ${sections.length} kept · nav/progress/hero/footer replaced (${dropped + 2} dropped)`);
console.log(`  buttons        ${counts.cta} -> .btn-accent/.btn-white, all .js-to-form (fullscreen audit)`);
console.log(`  order          ${ORDER.map(([l]) => l).join(' → ')}`);
console.log(`  eyebrows/h2    ${counts.eyebrow} / ${counts.h2} -> .eyebrow / .h2`);
console.log(`  links          ${counts.relinked} rewritten`);
console.log(`  market icons   ${Object.keys(MARKET_ICONS).length} drawn · ${counts.icons} cards widened`);
console.log(`  hover/focus    ${counts.hover} / ${counts.focus} rules`);
console.log(`  click hooks    ${counts.events}`);
console.log(`  baked          ${counts.bakedAttrs} attrs · ${counts.bakedText} text`);
console.log(`  css / html     ${(css.length / 1024).toFixed(1)} KB / ${(page.length / 1024).toFixed(1)} KB`);

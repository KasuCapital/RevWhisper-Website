#!/usr/bin/env node
// build-blog-index.mjs: bake blog/posts.js into static HTML inside blog/index.html.
//   BLOG-FILTERS  tag filter buttons, one per tag used by any post
//   BLOG-CARDS    one card per post, newest first
//   BLOG-SCHEMA   the Blog JSON-LD
// Cards must exist in server-rendered HTML so crawlers can discover posts; the
// page script only hides and shows them (tag filter, Load more).
// Posts built from blog/_post-template.html set `hero: true` in posts.js: their
// card thumbnail is the post's own HTML hero graphic, copied from between the
// HERO:START / HERO:END markers in blog/<slug>.html.
// It also writes the blog section of sitemap.xml (BLOG-SITEMAP markers).
//
// Scheduled posts (a `publish` time in posts.js) are left out of blog/index.html and
// sitemap.xml until that time has passed. For each upcoming time, it writes the /blog
// page and sitemap as they should look from then on into blog/_scheduled/, and lists
// the times in blog-schedule.js. middleware.js reads that list on every request, so
// each post appears on time with no rebuild or redeploy.
// Run after adding or editing a post in blog/posts.js. Idempotent.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'blog/index.html');
const SITEMAP = join(ROOT, 'sitemap.xml');
const SCHEDULED_DIR = join(ROOT, 'blog/_scheduled');
const SCHEDULE_MODULE = join(ROOT, 'blog-schedule.js');
const SITE = 'https://revwhisper.com';

function loadPosts() {
  const src = readFileSync(join(ROOT, 'blog/posts.js'), 'utf8');
  const ctx = {};
  runInNewContext(src, ctx);
  if (!Array.isArray(ctx.BLOG_POSTS)) throw new Error('BLOG_POSTS not found in blog/posts.js');
  return ctx.BLOG_POSTS;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// The date a card shows and sorts by: "Last updated" for new posts, publish date for older ones.
const shownDate = p => p.updated || p.date;

function between(src, name, file) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const startIdx = src.indexOf(start);
  const endIdx = src.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Markers ${name}:START/${name}:END not found in ${file}`);
  }
  return src.slice(startIdx + start.length, endIdx).trim();
}

function heroThumb(post) {
  const file = `blog/${post.slug}.html`;
  const hero = between(readFileSync(join(ROOT, file), 'utf8'), 'HERO', file);
  // `still` shows the graphic's finished frame: no entrance animation on the index.
  return `<div class="blog-card-thumb"><div class="hx still" aria-hidden="true">${hero}</div></div>`;
}

function cardHtml(post) {
  const tags = (post.tags || [])
    .map(t => `<span class="blog-card-tag">${esc(t)}</span>`).join('');
  let thumb;
  if (post.hero) thumb = heroThumb(post);
  else if (post.image) thumb = `<img class="blog-card-img" src="${esc(post.image)}" alt="${esc(post.title)}" loading="lazy">`;
  else thumb = '<div class="blog-card-img blog-card-img--placeholder"></div>';
  const date = shownDate(post);
  const dateLabel = post.updated ? `Last updated ${fmtDate(date)}` : fmtDate(date);
  return `      <a href="/blog/${esc(post.slug)}" class="blog-card" data-tags="${esc((post.tags || []).join('|'))}">
        ${thumb}
        <div class="blog-card-body">
          <div class="blog-card-tags">${tags}</div>
          <h2 class="blog-card-title">${esc(post.title)}</h2>
          <p class="blog-card-excerpt">${esc(post.excerpt)}</p>
          <div class="blog-card-meta">
            <span>${esc(post.author || 'RevWhisper Team')}</span>
            <time datetime="${esc(date)}">${dateLabel}</time>
          </div>
        </div>
      </a>`;
}

function filtersHtml(posts) {
  const counts = new Map();
  for (const p of posts) for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  const tags = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const btn = (tag, label, n, on) =>
    `      <button type="button" class="blog-filter" data-tag="${esc(tag)}" aria-pressed="${on}">${esc(label)} <span class="blog-filter-n">${n}</span></button>`;
  return [btn('', 'All posts', posts.length, true), ...tags.map(([t, n]) => btn(t, t, n, false))].join('\n');
}

function schemaHtml(posts) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'RevWhisper Blog',
    description: 'Data-driven pricing, ranking, and listing-optimization strategies for Airbnb hosts.',
    url: `${SITE}/blog`,
    publisher: {
      '@type': 'Organization',
      name: 'RevWhisper',
      url: SITE,
      logo: `${SITE}/icons/favicon-light.svg`,
    },
    blogPost: posts.map(p => {
      const author = p.author || 'RevWhisper Team';
      return {
        '@type': 'BlogPosting',
        headline: p.title,
        url: `${SITE}/blog/${p.slug}`,
        datePublished: p.date,
        dateModified: p.updated || undefined,
        image: p.image ? `${SITE}${p.image}` : undefined,
        author: { '@type': author === 'RevWhisper Team' ? 'Organization' : 'Person', name: author },
      };
    }),
  };
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

function replaceBlock(src, name, body) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const startIdx = src.indexOf(start);
  const endIdx = src.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Markers ${name}:START/${name}:END not found (blog/index.html or sitemap.xml)`);
  }
  return src.slice(0, startIdx + start.length) + '\n' + body + '\n' + src.slice(endIdx);
}

// sitemap <lastmod> for a post: the dateModified in its Article JSON-LD
function lastmod(post) {
  const html = readFileSync(join(ROOT, 'blog', `${post.slug}.html`), 'utf8');
  const m = html.match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})"/);
  return m ? m[1] : shownDate(post);
}

function sitemapBlock(posts) {
  const url = (loc, mod, priority) =>
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${mod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
  const mods = posts.map(lastmod);
  const newest = mods.reduce((a, b) => (b > a ? b : a), '');
  return [url(`${SITE}/blog`, newest, '0.8'), ...posts.map((p, i) => url(`${SITE}/blog/${p.slug}`, mods[i], '0.7'))].join('\n');
}

// The /blog page and sitemap as they look when exactly `posts` are published
function render(posts, indexSrc, sitemapSrc) {
  let index = replaceBlock(indexSrc, 'BLOG-FILTERS', filtersHtml(posts));
  index = replaceBlock(index, 'BLOG-CARDS', posts.map(cardHtml).join('\n'));
  index = replaceBlock(index, 'BLOG-SCHEMA', schemaHtml(posts));
  return { index, sitemap: replaceBlock(sitemapSrc, 'BLOG-SITEMAP', sitemapBlock(posts)) };
}

function write(file, text, label) {
  let prev = null;
  try { prev = readFileSync(file, 'utf8'); } catch {}
  if (prev === text) return console.log(`OK    ${label} (unchanged)`);
  writeFileSync(file, text);
  console.log(`WROTE ${label}`);
}

// 2026-10-28T13:00:00.000Z -> 202610281300 (UTC), used in the scheduled file names
const stamp = ms => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);

function main() {
  const now = Date.now();
  const all = loadPosts().slice()
    .sort((a, b) => shownDate(b).localeCompare(shownDate(a)) || b.date.localeCompare(a.date));
  const at = p => {
    if (!p.publish) return 0;
    const ms = Date.parse(p.publish);
    if (Number.isNaN(ms)) throw new Error(`Bad publish time for ${p.slug}: ${p.publish}`);
    return ms;
  };
  const indexSrc = readFileSync(INDEX, 'utf8');
  const sitemapSrc = readFileSync(SITEMAP, 'utf8');

  const live = all.filter(p => at(p) <= now);
  const base = render(live, indexSrc, sitemapSrc);
  write(INDEX, base.index, `blog/index.html (${live.length} cards)`);
  write(SITEMAP, base.sitemap, 'sitemap.xml');

  // One /blog page and sitemap per upcoming publish time
  const times = [...new Set(all.map(at).filter(t => t > now))].sort((a, b) => a - b);
  mkdirSync(SCHEDULED_DIR, { recursive: true });
  const keep = new Set();
  const versions = times.map(t => {
    const posts = all.filter(p => at(p) <= t);
    const { index, sitemap } = render(posts, base.index, base.sitemap);
    const name = stamp(t);
    keep.add(`index-${name}.html`).add(`sitemap-${name}.xml`);
    write(join(SCHEDULED_DIR, `index-${name}.html`), index, `blog/_scheduled/index-${name}.html (${posts.length} cards)`);
    write(join(SCHEDULED_DIR, `sitemap-${name}.xml`), sitemap, `blog/_scheduled/sitemap-${name}.xml`);
    return { at: t, index: `/blog/_scheduled/index-${name}`, sitemap: `/blog/_scheduled/sitemap-${name}.xml` };
  });
  for (const f of readdirSync(SCHEDULED_DIR)) {
    if (!keep.has(f)) { rmSync(join(SCHEDULED_DIR, f)); console.log(`REMOVED blog/_scheduled/${f}`); }
  }

  const schedule = {
    posts: Object.fromEntries(all.filter(p => at(p) > now).map(p => [p.slug, at(p)])),
    versions,
  };
  write(SCHEDULE_MODULE, `// Generated by scripts/build-blog-index.mjs from blog/posts.js. Read by middleware.js. Don't edit.\nexport const BLOG_SCHEDULE = ${JSON.stringify(schedule, null, 2)};\n`, 'blog-schedule.js');
}

main();

#!/usr/bin/env node
// build-blog-index.mjs — bake blog/posts.js into static HTML cards inside
// blog/index.html between <!-- BLOG-CARDS:START --> / <!-- BLOG-CARDS:END -->
// markers, and regenerate the Blog JSON-LD between BLOG-SCHEMA markers.
// Cards must exist in server-rendered HTML so crawlers can discover posts.
// Run after adding a post to blog/posts.js. Idempotent.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'blog/index.html');
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

function cardHtml(post) {
  const tags = (post.tags || [])
    .map(t => `<span class="blog-card-tag">${esc(t)}</span>`).join('');
  const img = post.image
    ? `<img class="blog-card-img" src="${esc(post.image)}" alt="${esc(post.title)}" loading="lazy">`
    : '<div class="blog-card-img blog-card-img--placeholder"></div>';
  return `      <a href="/blog/${esc(post.slug)}" class="blog-card">
        ${img}
        <div class="blog-card-body">
          <div class="blog-card-tags">${tags}</div>
          <h2 class="blog-card-title">${esc(post.title)}</h2>
          <p class="blog-card-excerpt">${esc(post.excerpt)}</p>
          <div class="blog-card-meta">
            <span>${esc(post.author || 'RevWhisper Team')}</span>
            <span>${fmtDate(post.date)}</span>
          </div>
        </div>
      </a>`;
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
    blogPost: posts.map(p => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE}/blog/${p.slug}`,
      datePublished: p.date,
      image: p.image ? `${SITE}${p.image}` : undefined,
      author: { '@type': 'Organization', name: p.author || 'RevWhisper Team' },
    })),
  };
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

function replaceBlock(src, name, body) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const startIdx = src.indexOf(start);
  const endIdx = src.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Markers ${name}:START/${name}:END not found in blog/index.html`);
  }
  return src.slice(0, startIdx + start.length) + '\n' + body + '\n' + src.slice(endIdx);
}

function main() {
  const posts = loadPosts().slice().sort((a, b) => b.date.localeCompare(a.date));
  let src = readFileSync(INDEX, 'utf8');
  const next = replaceBlock(
    replaceBlock(src, 'BLOG-CARDS', posts.map(cardHtml).join('\n')),
    'BLOG-SCHEMA',
    schemaHtml(posts),
  );
  if (next !== src) {
    writeFileSync(INDEX, next);
    console.log(`WROTE blog/index.html (${posts.length} cards)`);
  } else {
    console.log('OK    blog/index.html (unchanged)');
  }
}

main();

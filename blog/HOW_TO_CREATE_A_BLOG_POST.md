# How to Create a New Blog Post

## Quick Steps

1. Copy the template
2. Edit the new file
3. Register it in `posts.js`

---

## Step 1: Copy the Template

```bash
cp blog/_template.html blog/your-post-slug.html
```

**Slug rules:**
- All lowercase
- Words separated by hyphens
- No special characters
- Keep it short but descriptive
- Example: `pricing-strategies-for-peak-season`

---

## Step 2: Edit the New File

Open the new HTML file and find the sections marked with `✏️ EDIT`. There are only a few things to change:

### Head metadata (lines near the top)

Replace these placeholders:

| Placeholder | Replace with |
|---|---|
| `POST TITLE` | Your full post title |
| `POST DESCRIPTION` | 1-2 sentence summary for SEO (under 160 chars) |
| `POST-SLUG` | Same slug as the filename (no `.html`) |
| `POST-IMAGE-PATH` | Path to the OG/social share image (e.g. `/images/properties/kitchen-after.webp`) |

These appear in the `<title>`, `<meta>`, and Open Graph tags. There are 8 total instances to replace.

### Post header (in the `<header>` section)

```html
<div class="post-tags">
  <span class="post-tag">Tag One</span>   <!-- change tag text -->
  <span class="post-tag">Tag Two</span>   <!-- add/remove tags as needed -->
</div>
<h1>Your Blog Post Title Goes Here</h1>   <!-- same as POST TITLE -->
<div class="post-meta">RevWhisper Team &middot; Mar 10, 2026</div>  <!-- author · date -->
```

### Hero image

```html
<img class="post-hero-img" src="/images/properties/livingroom-after.webp" alt="Descriptive alt text">
```

Change `src` to your image path and write a meaningful `alt` attribute.

### Article content

The article body lives inside `<article class="post-content w">`. Use these HTML elements:

```html
<p>Paragraph text. Use <strong>bold</strong> and <a href="/link">links</a>.</p>

<h2>Section Heading</h2>

<h3>Sub-heading</h3>

<ul>
  <li>Bullet point</li>
</ul>

<ol>
  <li>Numbered item</li>
</ol>

<blockquote>
  Pull quote or key takeaway.
</blockquote>

<img src="/images/your-image.webp" alt="Description">
```

### CTA banner (optional tweak)

The bottom CTA defaults to "Book a Free Strategy Call". You can customize the heading and description if the post relates to a specific service.

---

## Step 3: Register in posts.js

Open `blog/posts.js` and add a new entry **at the top** of the `BLOG_POSTS` array (newest first):

```js
var BLOG_POSTS = [
  {
    slug: "your-post-slug",           // must match filename (no .html)
    title: "Your Full Post Title",
    excerpt: "1-2 sentences that appear on the blog gallery card.",
    date: "2026-03-15",               // YYYY-MM-DD
    image: "/images/your-image.webp", // card thumbnail (recommended 800x450)
    tags: ["Tag One", "Tag Two"],     // short labels shown on card
    author: "RevWhisper Team"         // or a specific author name
  },
  // ... existing posts below
];
```

---

## Where to Put Images

- Blog images go in `/images/` (or a subdirectory like `/images/blog/`)
- Recommended format: `.webp` for performance
- Card thumbnails look best at 16:9 aspect ratio (~800x450)
- Hero images display at max 900px wide

---

## Step 4: Rebuild the blog index (required)

The gallery cards are baked into `blog/index.html` at build time so search engines
and AI crawlers can see the posts (client-side rendering left every post invisible
to crawlers). After editing `posts.js`, run:

```bash
node scripts/build-blog-index.mjs
```

Then add the new post's URL to `sitemap.xml` with today's date as `<lastmod>`.

---

## SEO Requirements (every post, non-negotiable)

These exist because an audit found all posts were link islands with no freshness signals:

- [ ] **2–4 contextual internal links in the article body** — at least one to the most
      relevant service page (`/revenue-management`, `/airbnb-listing-optimization`,
      `/photoediting`, or `/case-study`) and at least one to a related post. Put them
      on natural anchor text mid-sentence, not "click here".
- [ ] **`<title>` under ~60 characters** (it truncates in search results) and
      **meta description under ~155 characters**.
- [ ] **`dateModified` in the Article JSON-LD** — set it equal to `datePublished` on
      day one, and update it whenever the post meaningfully changes.
- [ ] **og:image must be a raster file** (`.jpg`/`.png`/`.webp`) that actually exists —
      social platforms reject SVG previews. Verify the path.
- [ ] **Named author where possible** — a real person with `"@type": "Person"` in the
      Article schema beats "RevWhisper Team" for E-E-A-T.

---

## How It All Works

- **`blog/index.html`** (the gallery at `/blog`) ships static cards baked in by `scripts/build-blog-index.mjs` from `posts.js`
- **Individual posts** are standalone HTML files — no framework; the only build steps are the index bake and `scripts/sync-partials.mjs` for nav/footer
- **Vercel's `cleanUrls: true`** means `blog/my-post.html` is served at `/blog/my-post`
- The nav bar on blog pages links to Home, Blog, Solution, and Pricing
- Each post has a "Back to Blog" link and a bottom CTA banner

---

## Checklist

- [ ] File copied from `_template.html` with correct slug filename
- [ ] All 8 `POST TITLE` / `POST DESCRIPTION` / `POST-SLUG` / `POST-IMAGE-PATH` placeholders replaced
- [ ] `<h1>` title updated
- [ ] Post tags updated
- [ ] Date and author updated in `.post-meta`
- [ ] Hero image `src` and `alt` set
- [ ] Article content written
- [ ] Entry added to top of `posts.js` array
- [ ] Image files added to `/images/`
- [ ] 2–4 internal body links added (service page + sibling post)
- [ ] `dateModified` present in Article JSON-LD
- [ ] Title ≤60 chars, meta description ≤155 chars, og:image is a real raster file
- [ ] `node scripts/build-blog-index.mjs` run
- [ ] `sitemap.xml` entry added with today's `<lastmod>`

---

## Example: Creating a Post from Scratch

```bash
# 1. Copy template
cp blog/_template.html blog/5-pricing-mistakes-airbnb-hosts-make.html

# 2. Edit the file (replace placeholders, write content)

# 3. Add to posts.js
```

```js
// Add this as the first entry in BLOG_POSTS:
{
  slug: "5-pricing-mistakes-airbnb-hosts-make",
  title: "5 Pricing Mistakes Airbnb Hosts Make (And How to Fix Them)",
  excerpt: "Most hosts leave money on the table with static pricing. Here are the five most common mistakes and what to do instead.",
  date: "2026-03-20",
  image: "/images/blog/pricing-mistakes.webp",
  tags: ["Pricing", "Strategy"],
  author: "RevWhisper Team"
}
```

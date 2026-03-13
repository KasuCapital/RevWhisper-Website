/*
 * Blog Post Registry
 * ──────────────────
 * To add a new post:
 *   1. Copy _template.html → your-slug.html
 *   2. Fill in your content
 *   3. Add an entry here (newest first)
 *
 * Fields:
 *   slug     – filename without .html (must match the file)
 *   title    – post title
 *   excerpt  – 1-2 sentence preview
 *   date     – YYYY-MM-DD
 *   image    – path to card thumbnail (recommended 800×450)
 *   tags     – array of short labels
 *   author   – author name
 */

var BLOG_POSTS = [
  {
    slug: "airbnb-host-fee-squeeze-pricing-math",
    title: "The 15.5% Fee Squeeze: How Airbnb's New Host Fee Changes Your Pricing Math",
    excerpt: "You switched to a PMS and Airbnb moved you to a 15.5% host-only fee. Your pricing math changed — here's how to recalibrate every rate so you stop losing money.",
    date: "2026-03-13",
    image: "",
    tags: ["Deep Dive", "Revenue Management"],
    author: "RevWhisper Team"
  },
  {
    slug: "why-professional-photos-double-your-bookings",
    title: "Why Professional Photos Can Double Your Airbnb Bookings",
    excerpt: "Guests scroll fast. Your listing photos are the single biggest factor in whether someone clicks — or keeps scrolling. Here's how to get them right.",
    date: "2026-03-10",
    image: "/images/properties/livingroom-after.webp",
    tags: ["Photography", "Optimization"],
    author: "RevWhisper Team"
  }
];

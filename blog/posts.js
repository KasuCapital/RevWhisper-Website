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
    slug: "reserve-now-pay-later-revenue-strategy",
    title: "Reserve Now, Pay Later Has 70% Adoption. Here's How It Changes Your Revenue Strategy.",
    excerpt: "Airbnb's Reserve Now Pay Later feature hit 70% adoption in Q4 2025. More bookings, but different guest behavior. Here's what hosts need to know.",
    date: "2026-03-18",
    image: "/images/blog/paylater2-cropped.png",
    tags: ["Platform Changes", "Booking Psychology"],
    author: "RevWhisper Team"
  },
  {
    slug: "airbnb-host-fee-squeeze-pricing-math",
    title: "The 15.5% Fee Squeeze: How Airbnb's New Host Fee Changes Your Pricing Math",
    excerpt: "You switched to a PMS and Airbnb moved you to a 15.5% host-only fee. Your pricing math changed — here's how to recalibrate every rate so you stop losing money.",
    date: "2026-03-13",
    image: "/images/beforeafter/2-after.jpg",
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

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
    slug: "photography-audit-listing-losing-clicks",
    title: "Photography Audit: Is Your Listing Losing Clicks?",
    excerpt: "Your listing is leaking clicks and bookings right now, and your photos are likely the first place to look. A 12-item audit covering cover photo, sequencing, title, amenities, and review strategy.",
    date: "2026-04-29",
    image: "/images/blog/photography-audit-v1.svg",
    tags: ["Checklist", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "views-not-bookings-content-gap",
    title: "You're Getting Views but Not Bookings. Here's What the Algorithm Sees.",
    excerpt: "You are getting views but not bookings. That gap is not a pricing problem. It is a content problem, and the algorithm is watching every second of it.",
    date: "2026-04-14",
    image: "/images/blog/views-not-bookings.jpg",
    tags: ["Deep Dive", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "amenity-completeness-listing-visibility",
    title: "Amenity Completeness: The Fields You Left Blank Are Costing You Visibility",
    excerpt: "Airbnb's algorithm uses 800+ signals to rank your listing. Every blank amenity field, missing description detail, and unchecked checkbox is a zero-point signal pushing you down in search.",
    date: "2026-04-08",
    image: "/images/blog/amenity-completeness.png",
    tags: ["Deep Dive", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "airbnb-mobile-app-listing-optimization",
    title: "64% of Airbnb Bookings Now Happen on the App. Your Listing Isn't Optimized for It.",
    excerpt: "In Q4 2025, 64% of all Airbnb nights were booked through the mobile app. Most hosts build their listing on a laptop. Here's how to optimize for the 6-inch screen.",
    date: "2026-03-18",
    image: "/images/properties/kitchen-after.webp",
    tags: ["Deep Dive", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "comp-set-analysis-30-minutes",
    title: "How to Run a Comp Set Analysis in 30 Minutes",
    excerpt: "Your listing is invisible because you don't know who you're competing against. A comp set analysis shows you the 5-10 listings stealing your bookings. Here's how to do it in 30 minutes.",
    date: "2026-03-25",
    image: "/images/analytics/analytical1.png",
    tags: ["How-To Guide", "Listing Optimization"],
    author: "RevWhisper Team"
  },
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

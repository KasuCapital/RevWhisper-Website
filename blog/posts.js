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
 *
 * Posts built from _post-template.html also set:
 *   updated  – YYYY-MM-DD "Last updated" date; the card shows and sorts by it
 *   hero     – true: the card thumbnail is the post's HTML hero graphic
 *   image    – images/blog/<slug>.png from scripts/render-blog-hero.mjs (social preview)
 *
 * Scheduling: a post with
 *   publish  – ISO time with offset, e.g. "2026-10-28T09:00:00-04:00"
 * stays off /blog and the sitemap, and its URL redirects to /blog, until that time.
 * build-blog-index.mjs writes the versions of /blog and the sitemap that middleware.js
 * switches to as each time passes. No redeploy needed.
 */

var BLOG_POSTS = [
  {
    slug: "best-airbnb-pricing-tools",
    title: "Best Airbnb Pricing Tools, and When to Hire a Manager Instead",
    excerpt: "PriceLabs, Wheelhouse and Beyond all set your rates for you. Here is how they compare, and when software alone is not enough.",
    date: "2026-11-05",
    updated: "2026-11-05",
    publish: "2026-11-05T09:00:00-05:00",
    image: "/images/blog/best-airbnb-pricing-tools.png",
    hero: true,
    tags: ["Comparison", "Revenue Management"],
    author: "Marisa @ RevWhisper"
  },
  {
    slug: "new-york-airbnb-law",
    title: "New York Airbnb Law Explained: NYC's Rules and the 2025 State Law",
    excerpt: "Is Airbnb banned in New York? Inside New York City, nearly. Everywhere else, no. What NYC's Local Law 18 requires and what the 2025 state law changed for hosts upstate.",
    date: "2026-11-04",
    updated: "2026-11-04",
    publish: "2026-11-04T09:00:00-05:00",
    image: "/images/blog/new-york-airbnb-law.png",
    hero: true,
    tags: ["Policy Guide", "Market Guide"],
    author: "Marisa @ RevWhisper"
  },
  {
    slug: "airbnb-revenue-management-new-york",
    title: "Airbnb Revenue Management in New York: Rules, Taxes and Pricing by Season",
    excerpt: "What New York hosts need to know about state and local rules, lodging taxes and seasonal pricing, and how RevWhisper works with New York listings.",
    date: "2026-11-03",
    updated: "2026-11-03",
    publish: "2026-11-03T09:00:00-05:00",
    image: "/images/blog/airbnb-revenue-management-new-york.png",
    hero: true,
    tags: ["Market Guide", "Revenue Management"],
    author: "Marisa @ RevWhisper"
  },
  {
    slug: "2027-holiday-calendar-airbnb-hosts",
    title: "2027 Holiday Calendar for Airbnb Hosts: Dates to Price Now",
    excerpt: "Every major US holiday in 2027, the day it falls on, and which ones create long weekends. Set these rates before guests start booking.",
    date: "2026-10-29",
    updated: "2026-10-29",
    publish: "2026-10-29T09:00:00-04:00",
    image: "/images/blog/2027-holiday-calendar-airbnb-hosts.png",
    hero: true,
    tags: ["How-To Guide", "Revenue Management"],
    author: "Marisa @ RevWhisper"
  },
  {
    slug: "airbnb-cancellation-policies-for-hosts",
    title: "Airbnb Cancellation Policies for Hosts: Flexible, Moderate, Limited and Firm",
    excerpt: "Airbnb retired Strict and added Limited. What each policy pays you when a guest cancels, which one fits your calendar, and how to change it.",
    date: "2026-10-28",
    updated: "2026-10-28",
    publish: "2026-10-28T09:00:00-04:00",
    image: "/images/blog/airbnb-cancellation-policies-for-hosts.png",
    hero: true,
    tags: ["Policy Guide", "Booking Settings"],
    author: "Marisa @ RevWhisper"
  },
  {
    slug: "airbnb-checkout-instructions-2026-house-rules",
    title: "Airbnb Checkout Instructions That Follow the New 2026 House Rules",
    excerpt: "Airbnb's new house rules start November 20, 2026. What you can still ask guests to do at checkout, and a ready-to-copy checkout message that stays inside the rules.",
    date: "2026-10-27",
    updated: "2026-10-27",
    publish: "2026-10-27T09:00:00-04:00",
    image: "/images/blog/airbnb-checkout-instructions-2026-house-rules.png",
    hero: true,
    tags: ["Template", "Policy Guide"],
    author: "Marisa @ RevWhisper"
  },
  {
    slug: "photography-audit-listing-losing-clicks",
    title: "Photography Audit: Is Your Listing Losing Clicks?",
    excerpt: "Your listing is leaking clicks and bookings, and your photos are the first place to look. A 12-item audit from cover photo to review strategy.",
    date: "2026-04-29",
    image: "/images/blog/photography-audit-listing-losing-clicks.png",
    hero: true,
    tags: ["Checklist", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "views-not-bookings-content-gap",
    title: "You're Getting Views but Not Bookings. Here's What the Algorithm Sees.",
    excerpt: "You are getting views but not bookings. That gap is not a pricing problem: it is a content problem, and the algorithm is watching every second of it.",
    date: "2026-04-14",
    image: "/images/blog/views-not-bookings-content-gap.png",
    hero: true,
    tags: ["Deep Dive", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "amenity-completeness-listing-visibility",
    title: "Amenity Completeness: The Fields You Left Blank Are Costing You Visibility",
    excerpt: "Every blank amenity field is a filter your listing doesn't match. Guests filter by amenities, so missing fields keep you out of the searches most likely to book.",
    date: "2026-04-08",
    image: "/images/blog/amenity-completeness-listing-visibility.png",
    hero: true,
    tags: ["Deep Dive", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "comp-set-analysis-30-minutes",
    title: "How to Run a Comp Set Analysis in 30 Minutes",
    excerpt: "Your listing is invisible because you don't know who you're up against. A comp set analysis finds the listings taking your bookings in 30 minutes.",
    date: "2026-03-25",
    image: "/images/blog/comp-set-analysis-30-minutes.png",
    hero: true,
    tags: ["How-To Guide", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "airbnb-mobile-app-listing-optimization",
    title: "64% of Airbnb Nights Are Now Booked on the App. Your Listing Isn't Optimized for It.",
    excerpt: "In Q4 2025, 64% of all Airbnb nights were booked through the mobile app. Most hosts build their listing on a laptop. Here's how to optimize for the 6-inch screen.",
    date: "2026-03-18",
    image: "/images/blog/airbnb-mobile-app-listing-optimization.png",
    hero: true,
    tags: ["Deep Dive", "Listing Optimization"],
    author: "RevWhisper Team"
  },
  {
    slug: "reserve-now-pay-later-revenue-strategy",
    title: "Reserve Now, Pay Later Hit Over 70% Adoption. Here's How It Changes Your Revenue Strategy.",
    excerpt: "Over 70% of eligible Airbnb bookings used Reserve Now, Pay Later in Q4 2025. More bookings, but different guest behavior. Here's what hosts need to know.",
    date: "2026-03-18",
    image: "/images/blog/reserve-now-pay-later-revenue-strategy.png",
    hero: true,
    tags: ["Platform Changes", "Booking Psychology"],
    author: "RevWhisper Team"
  },
  {
    slug: "airbnb-host-fee-squeeze-pricing-math",
    title: "The 15.5% Fee Squeeze: How Airbnb's New Host Fee Changes Your Pricing Math",
    excerpt: "Most Airbnb hosts now pay a 15.5% host-only fee, taken from the payout. Here's how to recalibrate every rate so you stop losing money.",
    date: "2026-03-13",
    image: "/images/blog/airbnb-host-fee-squeeze-pricing-math.png",
    hero: true,
    tags: ["Deep Dive", "Revenue Management"],
    author: "RevWhisper Team"
  },
  {
    slug: "why-professional-photos-double-your-bookings",
    title: "Why Professional Photos Win More Airbnb Bookings",
    excerpt: "Guests scroll fast. Your listing photos are the single biggest factor in whether someone clicks or keeps scrolling. Here's how to get them right.",
    date: "2026-03-10",
    image: "/images/blog/why-professional-photos-double-your-bookings.png",
    hero: true,
    tags: ["Photography", "Optimization"],
    author: "RevWhisper Team"
  }
];

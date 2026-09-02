# Project Map

## Live Routes
- `/` -> homepage (`index.html`)
- `/checkout` -> pricing/checkout selector (`checkout.html`)
- `/checkout-form` -> enrollment form (`checkout-form.html`)
- `/get-started` -> strategy-call form (`get-started.html`)
- `/poconos` -> event page (`poconos.html`)
- `/success-b` -> payment success page (`success-b.html`)
- `/api/form-webhook` -> server-side proxy for get-started, checkout, and revenue-lift form notifications (`api/form-webhook.js`)
- `/api/create-checkout-session` -> Stripe Checkout Session creator (`api/create-checkout-session.js`)
- `/api/stripe-webhook` -> Stripe webhook receiver for payment events (`api/stripe-webhook.js`)
- `/api/cal-slots` -> Cal.com availability proxy for the booking calendars on /audit-booking, /get-started, /what-to-expect (`api/cal-slots.js`). Range guard is DST-tolerant and clamps instead of rejecting; every failure emails ops via `api/_alert.js`.
- `/api/cal-booking` -> creates the Cal.com booking (`api/cal-booking.js`); systemic failures email ops via `api/_alert.js`.
- `/api/client-error` -> browser-side failure reports from the three calendar pages, for failures the API never saw (`api/client-error.js`). Alerts are throttled per source (10 min) in `api/_alert.js`; recipient is `BOOKING_ALERT_EMAIL` (default bgamble@revwhisper.com), sent through Resend.

## Source Organization
- `api/` contains Vercel serverless functions for form notifications, Stripe checkout creation, and Stripe webhook processing.
- `docs/` contains brand guide, Stripe setup docs, and this project map.
- `images/` contains team photos and property before/after images.
- `icons/` contains SVG favicons.

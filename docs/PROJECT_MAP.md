# Project Map

## Live Routes
- `/` -> legacy homepage (`index.html`)
- `/new-homepage` -> new homepage (`new-homepage/index.html`)
- `/checkout` -> pricing/checkout selector (`checkout.html`)
- `/checkout-form` -> enrollment form (`checkout-form.html`)
- `/get-started` -> strategy-call form (`get-started.html`)
- `/api/create-checkout-session` -> Stripe Checkout Session creator (`api/create-checkout-session.js`)
- `/api/stripe-webhook` -> Stripe webhook receiver for payment events (`api/stripe-webhook.js`)

## Source Organization
- `archive/new-homepage-sections/` contains the original section-by-section drafts and the initial combined draft from the redesign process.
- `new-homepage/index.html` is the single-file consolidated new homepage intended for iteration and launch.
- `api/` contains Vercel serverless functions for Stripe checkout creation and webhook processing.

# Stripe Dynamic Checkout Setup

## What This Does
- `checkout-form.html` now posts form data to `/api/create-checkout-session`.
- The API creates a Stripe-hosted Checkout Session URL dynamically based on:
  - selected plan (`monthly` or `annual`)
  - number of listing URLs (`1..10`)
- If listing count is `11+`, the API returns an enterprise redirect instead of Stripe checkout.

## Required Vercel Environment Variables
- `STRIPE_SECRET_KEY` -> Stripe secret API key (`sk_live_...` in production).
- `STRIPE_PRICE_ONBOARDING` -> one-time onboarding fee price ID (per listing).
- `STRIPE_PRICE_MONTHLY` -> recurring monthly plan price ID.
- `STRIPE_PRICE_ANNUAL` -> recurring annual plan price ID.

## Optional Vercel Environment Variables
- `APP_URL` -> canonical app URL, e.g. `https://revwhisper.com`.
- `STRIPE_SUCCESS_URL` -> overrides default success URL.
- `STRIPE_CANCEL_URL` -> overrides default cancel URL.
- `ENTERPRISE_REDIRECT_URL` -> where `11+` listing submissions are redirected.
- `STRIPE_WEBHOOK_SECRET` -> enables Stripe signature verification on `/api/stripe-webhook`.
- `MAKE_STRIPE_WEBHOOK_URL` -> forwards relevant Stripe events to Make.com.

## Stripe Product/Price Requirements
- Onboarding fee must be a one-time Price.
- Monthly plan must be a recurring monthly Price.
- Annual plan must be a recurring yearly Price.
- The checkout API sets both onboarding and selected plan quantity equal to `listing_count`.

## Webhook Endpoint
- Endpoint: `/api/stripe-webhook`
- Recommended Stripe events:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`
- If `MAKE_STRIPE_WEBHOOK_URL` is set, these events are forwarded to Make.com.

## Test Checklist
1. Test with `plan=monthly` and 1 listing.
2. Test with `plan=annual` and 10 listings.
3. Test with 11 listings and verify enterprise redirect.
4. Complete a Stripe test payment and confirm webhook delivery.

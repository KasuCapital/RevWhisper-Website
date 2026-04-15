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

## Enterprise with $0 Onboarding Fee (Subscription-Only)
- When `plan=enterprise` and `onboarding_fee=0`, the API creates a Stripe Checkout Session in `mode=subscription` instead of `mode=payment`.
- The single line item is an inline `price_data` with `recurring.interval=month`, `unit_amount=monthly_cost * 100`, `quantity=listing_count`, and product name `RevWhisper Monthly Subscription`.
- First invoice is charged immediately at checkout completion (no trial).
- `term_months` is passed through as session metadata only — the minimum-term commitment lives in the service agreement, not in Stripe.
- Session metadata includes `checkout_mode=subscription` (vs `payment` for the standard flow) so downstream automations can route events correctly.
- If `onboarding_fee=0` is submitted without a valid `monthly_cost`, the API returns a 400 with `A valid monthly cost is required when onboarding fee is $0.`

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

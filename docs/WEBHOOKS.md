# Webhooks & Notifications

All webhook URLs and their payloads, organized by event. Use this as a reference when building Make.com scenarios or Teams notifications.

---

## 1. New Booking (Get-Started Form Submitted)

**Trigger:** User completes the get-started form and is redirected to Cal.com to book a discovery call.

**Public submit endpoint:**
```
/api/form-webhook
```

**Make target (env var):**
```
MAKE_GET_STARTED_WEBHOOK_URL
```

**Source file:** `get-started.html`

**Method:** `POST`

**JSON Body:**
```json
{
  "listings": "1-2",
  "airbnbUrl": "https://www.airbnb.com/rooms/12345",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1 5551234567",
  "schedule": "yes"
}
```

| Field       | Type   | Notes                                             |
|-------------|--------|---------------------------------------------------|
| `listings`  | string | Portfolio size selected (e.g. `"1-2"`, `"3-5"`, `"6-10"`, `"11+"`) |
| `airbnbUrl` | string | User's Airbnb listing URL                         |
| `name`      | string | Full name                                         |
| `email`     | string | Email address                                     |
| `phone`     | string | Country code + phone number                       |
| `schedule`  | string | Always `"yes"`                                    |

**What happens next:** After the webhook fires, the user is redirected to `https://cal.com/rev-whisper/discovery` with `name` and `email` pre-filled.

---

## 2. Checkout Form Submitted (Pre-Payment)

**Trigger:** User fills out the checkout form and clicks submit, right before being redirected to Stripe.

**Public submit endpoint:**
```
/api/form-webhook
```

**Make target (env var):**
```
MAKE_CHECKOUT_WEBHOOK_URL
```

**Source file:** `checkout-form.html`

**Method:** `POST`

**JSON Body:**
```json
{
  "plan": "monthly",
  "first_name": "Jane",
  "last_name": "Smith",
  "full_name": "Jane Smith",
  "email": "jane@example.com",
  "phone_code": "+1",
  "phone_number": "5551234567",
  "phone_full": "+1 5551234567",
  "listings": [
    "https://www.airbnb.com/rooms/12345",
    "https://www.airbnb.com/rooms/67890"
  ],
  "listing_count": 2,
  "agreed_to_terms": true,
  "submitted_at": "2026-03-04T15:30:00.000Z",
  "source_page": "https://revwhisper.com/checkout-form"
}
```

| Field             | Type     | Notes                                      |
|-------------------|----------|--------------------------------------------|
| `plan`            | string   | `"monthly"` or `"annual"`                  |
| `first_name`      | string   | First name                                 |
| `last_name`       | string   | Last name                                  |
| `full_name`       | string   | First + last name                          |
| `email`           | string   | Email address                              |
| `phone_code`      | string   | Country dial code (e.g. `"+1"`)            |
| `phone_number`    | string   | Phone number without country code          |
| `phone_full`      | string   | Full phone number with country code        |
| `listings`        | string[] | Array of Airbnb listing URLs               |
| `listing_count`   | number   | Number of listings                         |
| `agreed_to_terms` | boolean  | Always `true` (form requires agreement)    |
| `submitted_at`    | string   | ISO 8601 timestamp                         |
| `source_page`     | string   | URL of the checkout page                   |

**Note:** This fires *before* payment. The user may abandon at the Stripe checkout screen. Use webhook #3 below to confirm actual payment.

---

## 3. Payment Completed (Stripe Webhook → Make.com)

**Trigger:** Stripe fires an event after a successful payment. Our server-side handler forwards it to Make.com.

**Webhook URL (env var):**
```
MAKE_STRIPE_WEBHOOK_URL  (set in Vercel environment variables)
```

**Source file:** `api/stripe-webhook.js` (line ~83)

**Method:** `POST`

**Stripe events forwarded:** `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`

**JSON Body (forwarded to Make.com):**
```json
{
  "event_type": "checkout.session.completed",
  "event_id": "evt_1abc123",
  "created": 1709567400,
  "livemode": true,
  "session_id": "cs_live_abc123",
  "customer_email": "jane@example.com",
  "subscription_id": "sub_abc123",
  "invoice_id": "in_abc123",
  "metadata": {
    "email": "jane@example.com",
    "plan": "monthly",
    "listing_count": "2",
    "listing_urls": "https://www.airbnb.com/rooms/12345,https://www.airbnb.com/rooms/67890",
    "source": "checkout-form"
  }
}
```

| Field              | Type    | Notes                                                    |
|--------------------|---------|----------------------------------------------------------|
| `event_type`       | string  | One of: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` |
| `event_id`         | string  | Stripe event ID                                          |
| `created`          | number  | Unix timestamp                                           |
| `livemode`         | boolean | `true` in production, `false` in test mode               |
| `session_id`       | string  | Stripe checkout session or invoice ID                    |
| `customer_email`   | string  | Customer's email                                         |
| `subscription_id`  | string  | Stripe subscription ID (null for one-time)               |
| `invoice_id`       | string  | Stripe invoice ID (null on initial checkout)             |
| `metadata`         | object  | Custom metadata set during checkout session creation     |
| `metadata.email`   | string  | Customer email (duplicated for convenience)              |
| `metadata.plan`    | string  | `"monthly"` or `"annual"`                                |
| `metadata.listing_count` | string | Number of listings (as string from Stripe metadata) |
| `metadata.listing_urls`  | string | Comma-separated listing URLs                        |
| `metadata.source`  | string  | Always `"checkout-form"`                                 |

---

## 4. Listing Audit Completed

**Status: Not yet set up.**

The listing audit is done in separate software. The simplest approach is to create a dedicated Make.com webhook URL for this event, then trigger it from whatever tool you use to complete audits. Options:

- **Option A (Recommended):** Create a Make.com webhook scenario for audit completions. When you finish an audit in your external tool, use a button/automation in that tool to POST to the Make.com webhook. That scenario then notifies your Teams channel.
- **Option B:** If the audit tool supports outgoing webhooks natively, point it directly at a Make.com webhook URL.
- **Option C:** If neither works, a simple manual trigger — a bookmark or shortcut that POSTs to the webhook with the client name/email — gets the job done without overcomplicating it.

**Suggested JSON body (for when you set this up):**
```json
{
  "event": "audit_completed",
  "email": "jane@example.com",
  "name": "Jane Smith",
  "listing_urls": ["https://www.airbnb.com/rooms/12345"],
  "completed_at": "2026-03-04T15:30:00.000Z",
  "notes": "Optional auditor notes"
}
```

---

## Environment Variables Summary

These must be set in Vercel (or your hosting platform):

| Variable                 | Used By                  | Purpose                                  |
|--------------------------|--------------------------|------------------------------------------|
| `STRIPE_SECRET_KEY`      | `api/create-checkout-session.js` | Stripe API authentication          |
| `STRIPE_WEBHOOK_SECRET`  | `api/stripe-webhook.js`  | Verifies Stripe webhook signatures       |
| `MAKE_STRIPE_WEBHOOK_URL`| `api/stripe-webhook.js`  | Forwards Stripe events to Make.com       |
| `MAKE_GET_STARTED_WEBHOOK_URL` | `api/form-webhook.js` | Forwards get-started submissions to Make |
| `MAKE_CHECKOUT_WEBHOOK_URL` | `api/form-webhook.js` | Forwards checkout submissions to Make |
| `MAKE_REVENUE_LIFT_WEBHOOK_URL` | `api/form-webhook.js` | Forwards revenue-lift submissions to Make |
| `STRIPE_PRICE_ONBOARDING`| `api/create-checkout-session.js` | Stripe price ID for onboarding fee |
| `STRIPE_PRICE_MONTHLY`   | `api/create-checkout-session.js` | Stripe price ID for monthly plan   |
| `STRIPE_PRICE_ANNUAL`    | `api/create-checkout-session.js` | Stripe price ID for annual plan    |

**Note:** Form pages now post to `/api/form-webhook`, and the Make webhook URLs live server-side. Rotate the old client-exposed Make URLs after deployment.

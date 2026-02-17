# Archive Sur Mer Marketplace (Stripe Connect)

Vestiaire-inspired marketplace backend + frontend for selling new and pre-owned designer-wear.

This repository now includes:

- Stripe Connect Express onboarding for sellers
- Supabase-powered listings catalog
- Checkout Session creation with Connect destination payouts + platform fee
- Stripe webhook handling to mark listings sold/release reserved listings
- Cloudinary image upload endpoint
- Lightweight storefront + seller dashboard (`/` and `/sell-with-us.html`)

---

## 1) Environment variables

Set these in your deployment (for Vercel, Project Settings -> Environment Variables):

### Required

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_ORIGIN` (example: `https://archive-sur-mer.com`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Optional

- `PLATFORM_FEE_PERCENT` (default: `15`)
- `CORS_ALLOW_ORIGIN` (default: `*`)
- `CLOUDINARY_URL`
  - OR `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`

---

## 2) Supabase schema

Run `supabase-schema.sql` in Supabase SQL editor before using the API.

Tables created:

- `seller_profiles`
- `listings`

---

## 3) API routes

### `GET|POST /api/start-onboarding`

Creates or reuses seller Stripe Express account and returns/redirects to onboarding link.

- GET query: `email`, optional `origin`
- POST JSON: `{ "email": "seller@example.com", "origin": "https://..." }`

### `GET|POST /api/account-status`

Returns onboarding state for a seller profile.

- by email or `stripe_account_id`

### `GET|POST|PATCH /api/listings`

- `GET`: list marketplace inventory
  - query params: `status`, `condition`, `search`, `limit`, `offset`
- `POST`: create listing
- `PATCH`: seller status update (`active` or `archived`)

### `POST /api/create-checkout-session`

Creates Stripe Checkout session and routes payout to seller connected account.

Input:

```json
{
  "listingId": "uuid",
  "origin": "https://archive-sur-mer.com",
  "buyerEmail": "optional@example.com"
}
```

### `POST /api/stripe-webhook`

Handles Stripe webhook events:

- `checkout.session.completed` -> listing becomes `sold`
- `checkout.session.expired` / `checkout.session.async_payment_failed` -> listing goes back to `active`

### `POST /api/upload-image`

Uploads image to Cloudinary:

```json
{
  "imageData": "data:image/jpeg;base64,... or https://...",
  "folder": "archive-sur-mer/listings"
}
```

---

## 4) Frontend routes

- `/` -> buyer marketplace page with filters + direct Stripe Checkout
- `/sell-with-us.html` -> seller onboarding and listing publishing

---

## 5) Stripe webhook setup

In Stripe Dashboard -> Developers -> Webhooks:

1. Add endpoint: `https://<your-domain>/api/stripe-webhook`
2. Events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`
3. Copy signing secret into `STRIPE_WEBHOOK_SECRET`

---

## 6) Notes

- API functions are CommonJS and work as Vercel serverless routes.
- Listing creation expects seller email already onboarded in Stripe Connect flow.
- Checkout currently uses one-line-item "buy now" flow (quantity fixed to 1).
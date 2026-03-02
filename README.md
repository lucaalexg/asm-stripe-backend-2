# Archive Sur Mer Marketplace (Stripe Connect)

Vestiaire-inspired marketplace backend + frontend for selling new and pre-owned designer-wear.

---

## ✅ Was läuft aktuell? (Current Status)

All Phase 1 features are implemented and live.

### API endpoints (Vercel serverless, all in `/api/`)

| Route | Methods | Was macht es |
|---|---|---|
| `/api/start-onboarding` | GET, POST | Stripe Connect Express account erstellen / wiederverwenden, Onboarding-Link zurückgeben |
| `/api/account-status` | GET, POST | Onboarding-Status eines Sellers abfragen (per Email oder `stripe_account_id`) |
| `/api/listings` | GET, POST, PATCH | Marketplace-Inventar abrufen (Filter: Brand, Size, Condition, Preis, Suche), Listing anlegen, Status ändern |
| `/api/customer-signup` | POST | Käufer-Profil anlegen / aktualisieren (Email, Telefon, Name) |
| `/api/moderate-listings` | GET, POST | Admin-Moderationsqueue (pending → approved / rejected), mit Cloudinary-Weißhintergrund-Transform |
| `/api/wishlist` | GET, POST, DELETE | Wishlist-Items speichern und entfernen |
| `/api/saved-searches` | GET, POST, DELETE | Gespeicherte Suchfilter verwalten |
| `/api/offers` | GET, POST, PATCH | Angebot erstellen, Gegenangebot, Ablehnen, Akzeptieren |
| `/api/orders` | GET | Bestellhistorie für Käufer oder Verkäufer |
| `/api/create-checkout-session` | POST | Stripe Checkout Session mit Connect-Auszahlung an Seller |
| `/api/stripe-webhook` | POST | Webhook: Listing auf `sold` setzen / freigeben bei Payment-Events |
| `/api/upload-image` | POST | Bild zu Cloudinary hochladen |
| `/api/return` | GET | Statische Bestätigungsseite nach Stripe Connect Onboarding |

### Frontend-Seiten

| Seite | Beschreibung |
|---|---|
| `/` (`index.html`) | Buyer Marketplace: Listings, Filter, Wishlist, Offers, Order History, Checkout |
| `/sell-with-us.html` | Seller Studio: Stripe Connect, Listing erstellen, Angebote verwalten |
| `/admin-review.html` | Moderation Desk: Listings freigeben / ablehnen |
| `/about.html` | Marken- und Qualitätsseite |
| `/contact.html` | Kontaktseite |
| `/privacy.html` | Datenschutzseite |
| `/create-account.html` | Kundenkonto anlegen |

### Infrastruktur

- **Backend**: Vercel Serverless Functions (Node.js / CommonJS)
- **Datenbank**: Supabase (PostgreSQL)
- **Zahlungen**: Stripe Connect Express + Stripe Checkout
- **Media**: Cloudinary (Upload + White-Background-Transform)

### Was ist noch **nicht** live (Phase 2+)

- Vollständige Authentifizierung / Session / RBAC
- Order Lifecycle + Versand-Labels + Tracking
- Returns / Disputes / Refunds Dashboard
- Anti-Fraud / Risk Scoring
- Messaging Center
- Personalisierte Empfehlungen
- Lokalisierung / Mehrwährung / Steuer-Matrix

---

This repository now includes:

- Stripe Connect Express onboarding for sellers
- Customer registration endpoint (email + phone)
- Supabase-powered listings catalog
- Wishlist (save items) and saved search presets
- Offer and counter-offer negotiation flow
- Buyer order history + seller sales feed
- Advanced marketplace filtering (brand, size, condition, price, sorting)
- Listing moderation workflow (pending/approved/rejected)
- Multi-image + video listing media support
- Checkout Session creation with Connect destination payouts + platform fee
- Stripe webhook handling to mark listings sold/release reserved listings
- Cloudinary image upload endpoint
- Lightweight storefront + seller dashboard + moderation desk (`/`, `/sell-with-us.html`, `/admin-review.html`)

---

## 1) Environment variables

Set these in your deployment (for Vercel, Project Settings -> Environment Variables):

### Required

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_ORIGIN` (example: `https://archive-sur-mer.com`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MARKETPLACE_ADMIN_TOKEN` (used for approve/reject moderation endpoints)

### Optional

- `PLATFORM_FEE_PERCENT` (default: `15`)
- `CORS_ALLOW_ORIGIN` (default: `*`)
- `CLOUDINARY_URL`
  - OR `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`

---

## 2) Supabase schema

Run `supabase-schema.sql` in Supabase SQL editor before using the API.

Tables created:

- `customer_profiles`
- `seller_profiles`
- `listings`
- `wishlist_items`
- `saved_searches`
- `offers`

`listings` now tracks:

- `media_urls` and `video_url`
- `moderation_status`, `moderation_reason`, `moderated_at`
- `approved_media_urls` (first approved image forced onto white background canvas for Cloudinary URLs)
- `buyer_email` (captured at checkout completion for order history)

---

## 3) API routes

### `GET|POST /api/start-onboarding`

Creates or reuses seller Stripe Express account and returns/redirects to onboarding link.

- GET query: `email`, optional `origin`
- POST JSON: `{ "email": "seller@example.com", "origin": "https://..." }`
- If a stored connected account is missing or incompatible for account links, the endpoint auto-recovers by creating a fresh Express account and updating `seller_profiles`.

### `GET|POST /api/account-status`

Returns onboarding state for a seller profile.

- by email or `stripe_account_id`

### `GET|POST|PATCH /api/listings`

- `GET`: list marketplace inventory
  - query params: `status`, `condition`, `search`, `brand`, `size`, `min_price`, `max_price`, `sort`, `limit`, `offset`
  - optional seller view params: `seller_email`, `moderation_status`
- `POST`: create listing (saved as `pending` moderation by default)
- `PATCH`: seller status update (`active` or `archived`)

### `POST /api/customer-signup`

Registers or updates a customer profile by email:

```json
{
  "email": "buyer@example.com",
  "phone": "+491751234567",
  "fullName": "Buyer Name",
  "marketingOptIn": true
}
```

### `GET|POST /api/moderate-listings`

Admin-only moderation API (`Authorization: Bearer <MARKETPLACE_ADMIN_TOKEN>`):

- `GET` queue by moderation state (`pending` by default)
- `POST` actions:
  - `approve` -> listing becomes buyable and approved primary image is transformed to white background canvas
  - `reject` -> listing hidden from public feed with moderation reason

### `GET|POST|DELETE /api/wishlist`

Wishlist operations for customers:

- `GET` by `customer_email`
- `POST` save listing by `customerEmail` + `listingId`
- `DELETE` remove listing by `customerEmail` + `listingId`

### `GET|POST|DELETE /api/saved-searches`

Saved search presets for customers:

- `GET` by `customer_email`
- `POST` create preset with filters (`search`, `brand`, `size`, `condition`, `min_price`, `max_price`, `sort`)
- `DELETE` remove by `savedSearchId`

### `GET|POST|PATCH /api/offers`

Offer negotiation API:

- `POST` create buyer offer on approved active listing
- `GET` fetch offers by `customer_email`, `seller_email`, or `listing_id`
- `PATCH` actions:
  - seller: `accept`, `reject`, `counter`
  - buyer: `cancel`, `accept_counter`

### `GET /api/orders`

Order feed API:

- buyer scope via `customer_email` (returns completed purchases)
- seller scope via `seller_email` (returns completed sales)
- pagination via `limit`, `offset`

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

- `checkout.session.completed` -> listing becomes `sold` and stores buyer email
- `checkout.session.expired` / `checkout.session.async_payment_failed` -> listing goes back to `active`

### `POST /api/upload-image`

Uploads image to Cloudinary:

```json
{
  "imageData": "data:image/jpeg;base64,... or https://...",
  "folder": "archive-sur-mer/listings"
}
```

### `GET /api/return`

Static HTML confirmation page served after Stripe Connect Express onboarding completes. Stripe redirects sellers here; the page shows a success message and links back to `/sell-with-us.html`.

---

## 4) Frontend routes

- `/` -> buyer marketplace page (customer registration, member tools, wishlist/offers/saved searches/order history, advanced filters, direct Stripe Checkout)
- `/sell-with-us.html` -> seller onboarding, rich-media submission, offer inbox, and sales tracking
- `/admin-review.html` -> approve/decline queue for your moderation team
- `/about.html` -> marketplace brand and quality standards page
- `/contact.html` -> internal support and contact page
- `/privacy.html` -> internal privacy policy page
- Legacy compatibility aliases:
  - `/pages/contact` and `/pages/contact.html` -> internal `contact.html`
  - `/blogs/news` and `/blogs/news.html` -> internal `about.html`
  - `/policies/privacy-policy` and `/policies/privacy-policy.html` -> internal `privacy.html`

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
- New listings are submitted as pending and do not appear publicly until approved.
- Checkout currently uses one-line-item "buy now" flow (quantity fixed to 1).

---

## 7) Roadmap blueprint

- `PHASE1_VESTIAIRE_PARITY_BLUEPRINT.md` documents the Phase 1 frontend parity contract:
  - Vestiaire-style structure/order
  - Archive Sur Mer brand constraints
  - feature parity map and Phase 2 handoff
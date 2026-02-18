# Phase 1 Blueprint: Vestiaire-Style Frontend Parity for Archive Sur Mer

This document defines the exact frontend structure target for Archive Sur Mer using:

- Vestiaire-like information architecture and interaction flow
- Archive Sur Mer typography and color language
- Existing implemented backend capabilities (moderation, wishlist, offers, saved searches, customer profiles)

---

## 1) Brand system (locked)

Use Archive Sur Mer visual DNA as the baseline:

- Primary serif family:
  - `"New York", Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, serif`
- Neutral luxury palette:
  - Primary ink: `#111111`
  - Surfaces: warm off-whites / stone neutrals
  - White-card product framing for approved inventory
- Spacing and cadence:
  - Large editorial rhythm
  - Narrow letter-spacing for eyebrow/meta labels

Non-goal: cloning Vestiaire colors/fonts.

---

## 2) Homepage parity structure (ordered top to bottom)

1. Announcement strip (trust statement)
2. Luxury category-led header nav
3. Editorial hero (campaign message + 2 CTAs)
4. Trust strip (authenticity, offers, secure checkout)
5. Discover chips ("Shop by mood")
6. Member lounge (collapsed by default)
   - customer signup
   - customer connect
   - wishlist / offers / saved searches panels
7. Sticky discovery filter bar
   - search, brand, size, condition, price range, sort
   - save search + reset
8. Listing grid with rich card actions
   - buy now
   - save item
   - make offer
9. Editorial statement block
10. Sell-with-us CTA band

This order is the canonical flow for current implementation.

---

## 3) Feature parity map (Phase 1 scope)

### A. Discovery parity
- [x] Search
- [x] Condition filter
- [x] Brand filter
- [x] Size filter
- [x] Price range
- [x] Sort (newest / low-high / high-low)
- [x] Quick chips for instant presets
- [x] Saved search presets

### B. Listing interaction parity
- [x] Multi-image cards with thumbnail rail and next/prev controls
- [x] Optional listing video link
- [x] Wishlist save/remove
- [x] Offer submission from card
- [x] Direct checkout CTA

### C. Marketplace trust parity
- [x] Moderation before listing is public
- [x] Seller onboarding state checks
- [x] White-background first image for approved listings (Cloudinary transform path)

### D. Member utility parity
- [x] Customer profile (email + phone)
- [x] Wishlist panel
- [x] Offer panel with status + buyer actions
- [x] Saved search panel with apply/delete

---

## 4) Seller journey parity (Phase 1 scope)

### Seller Studio sequence
1. Connect Stripe account
2. Publish rich listing (multi-image + optional video)
3. Track moderation status
4. Handle offer inbox:
   - accept
   - reject
   - counter

All four steps are currently present.

---

## 5) Admin parity (Phase 1 scope)

### Moderation Desk
- token-gated access
- pending queue
- approve / reject actions
- rejection reason capture
- approved listing publication behavior

---

## 6) What is explicitly NOT in Phase 1

The following are deferred to Phase 2+ backend/platform parity:

- full auth/session/RBAC (buyer/seller/admin)
- order lifecycle + shipping labels + tracking
- returns/disputes/refunds dashboards
- anti-fraud/risk scoring
- messaging center/threaded conversations
- recommendation engine and personalization feeds
- localization/currency tax matrix and advanced compliance workflows

---

## 7) Phase 2 handoff checklist

When starting Phase 2, prioritize:

1. Authentication and role model
2. Orders table + order states API
3. Shipping integration pipeline
4. Notification service (email first)
5. Seller-facing payout and performance dashboard

---

## 8) Acceptance criteria for Phase 1 completion

Phase 1 is complete if:

- homepage follows the canonical ordered stack listed above
- Archive Sur Mer visual system is preserved
- discovery + wishlist + offers + saved-search interactions work end-to-end
- seller and admin flows support moderation and offer lifecycle
- no syntax/runtime blocking errors in production build


const {
  clampInt,
  getQueryParam,
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  normalizeCurrency,
  readJsonBody,
  sanitizeText,
  sendJson,
  setCors,
  toPriceCents,
} = require("./_shared");

const OFFER_STATUSES = new Set([
  "pending",
  "countered",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
]);
const FINAL_STATUSES = new Set(["accepted", "rejected", "cancelled", "expired"]);
const ALLOWED_ACTIONS = new Set(["accept", "reject", "counter", "cancel", "accept_counter"]);

async function getCustomerByEmail(supabase, email) {
  const result = await supabase
    .from("customer_profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (result.error && !isNoRowsError(result.error)) throw result.error;
  return result.data || null;
}

async function getSellerByEmail(supabase, email) {
  const result = await supabase
    .from("seller_profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (result.error && !isNoRowsError(result.error)) throw result.error;
  return result.data || null;
}

function formatOffer(offer, customerMap = new Map(), sellerMap = new Map(), listingMap = new Map()) {
  const displayedCents = offer.final_amount_cents || offer.counter_amount_cents || offer.amount_cents;
  return {
    ...offer,
    amount: Number((offer.amount_cents / 100).toFixed(2)),
    counter_amount:
      offer.counter_amount_cents === null ? null : Number((offer.counter_amount_cents / 100).toFixed(2)),
    final_amount:
      offer.final_amount_cents === null ? null : Number((offer.final_amount_cents / 100).toFixed(2)),
    display_amount: Number((displayedCents / 100).toFixed(2)),
    customer_email: customerMap.get(offer.customer_id) || null,
    seller_email: sellerMap.get(offer.seller_id) || null,
    listing: listingMap.get(offer.listing_id) || null,
  };
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const customerEmail = sanitizeText(getQueryParam(req, "customer_email"), 180).toLowerCase();
      const sellerEmail = sanitizeText(getQueryParam(req, "seller_email"), 180).toLowerCase();
      const listingId = sanitizeText(getQueryParam(req, "listing_id"), 90);
      const status = sanitizeText(getQueryParam(req, "status"), 20).toLowerCase();
      const limit = clampInt(getQueryParam(req, "limit"), 1, 80, 30);
      const offset = clampInt(getQueryParam(req, "offset"), 0, 5000, 0);

      if (!customerEmail && !sellerEmail && !listingId) {
        return sendJson(res, 400, {
          error: "Use one filter: customer_email, seller_email, or listing_id.",
        });
      }

      let customerId = null;
      let sellerId = null;

      if (customerEmail) {
        if (!isValidEmail(customerEmail)) {
          return sendJson(res, 400, { error: "customer_email is invalid." });
        }
        const customer = await getCustomerByEmail(supabase, customerEmail);
        if (!customer) return sendJson(res, 200, { count: 0, offers: [] });
        customerId = customer.id;
      }

      if (sellerEmail) {
        if (!isValidEmail(sellerEmail)) {
          return sendJson(res, 400, { error: "seller_email is invalid." });
        }
        const seller = await getSellerByEmail(supabase, sellerEmail);
        if (!seller) return sendJson(res, 200, { count: 0, offers: [] });
        sellerId = seller.id;
      }

      let query = supabase
        .from("offers")
        .select(
          "id, listing_id, seller_id, customer_id, currency, amount_cents, counter_amount_cents, final_amount_cents, status, buyer_message, seller_message, created_at, updated_at, resolved_at"
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (customerId) query = query.eq("customer_id", customerId);
      if (sellerId) query = query.eq("seller_id", sellerId);
      if (listingId) query = query.eq("listing_id", listingId);
      if (status && status !== "all") {
        if (!OFFER_STATUSES.has(status)) {
          return sendJson(res, 400, { error: "Invalid offer status filter." });
        }
        query = query.eq("status", status);
      }

      const offerResult = await query;
      if (offerResult.error) throw offerResult.error;

      const offers = offerResult.data || [];
      const listingIds = [...new Set(offers.map((offer) => offer.listing_id).filter(Boolean))];
      const customerIds = [...new Set(offers.map((offer) => offer.customer_id).filter(Boolean))];
      const sellerIds = [...new Set(offers.map((offer) => offer.seller_id).filter(Boolean))];

      let listingMap = new Map();
      let customerMap = new Map();
      let sellerMap = new Map();

      if (listingIds.length > 0) {
        const listingResult = await supabase
          .from("listings")
          .select("id, title, brand, image_url, status, moderation_status")
          .in("id", listingIds);
        if (listingResult.error) throw listingResult.error;
        listingMap = new Map((listingResult.data || []).map((listing) => [listing.id, listing]));
      }

      if (customerIds.length > 0) {
        const customerResult = await supabase
          .from("customer_profiles")
          .select("id, email")
          .in("id", customerIds);
        if (customerResult.error) throw customerResult.error;
        customerMap = new Map((customerResult.data || []).map((c) => [c.id, c.email]));
      }

      if (sellerIds.length > 0) {
        const sellerResult = await supabase
          .from("seller_profiles")
          .select("id, email")
          .in("id", sellerIds);
        if (sellerResult.error) throw sellerResult.error;
        sellerMap = new Map((sellerResult.data || []).map((s) => [s.id, s.email]));
      }

      return sendJson(res, 200, {
        count: offers.length,
        offers: offers.map((offer) => formatOffer(offer, customerMap, sellerMap, listingMap)),
      });
    }

    const body = await readJsonBody(req);

    if (req.method === "POST") {
      const customerEmail = sanitizeText(body.customerEmail || body.customer_email, 180).toLowerCase();
      const listingId = sanitizeText(body.listingId || body.listing_id, 90);
      const message = sanitizeText(body.message || body.buyerMessage || body.buyer_message, 1000);
      const rawAmount = body.amount_cents ?? body.amountCents ?? body.amount;
      const amountCents = toPriceCents(rawAmount);

      if (!isValidEmail(customerEmail)) {
        return sendJson(res, 400, { error: "Valid customerEmail is required." });
      }

      if (!listingId) {
        return sendJson(res, 400, { error: "listingId is required." });
      }

      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return sendJson(res, 400, { error: "Offer amount must be a positive number." });
      }

      const customer = await getCustomerByEmail(supabase, customerEmail);
      if (!customer) {
        return sendJson(res, 404, {
          error: "Customer not found. Create a customer account first.",
        });
      }

      const listingResult = await supabase
        .from("listings")
        .select("id, seller_id, currency, status, moderation_status, title, brand, price_cents")
        .eq("id", listingId)
        .maybeSingle();

      if (listingResult.error && !isNoRowsError(listingResult.error)) throw listingResult.error;
      if (!listingResult.data) return sendJson(res, 404, { error: "Listing not found." });

      const listing = listingResult.data;
      if (listing.status !== "active" || listing.moderation_status !== "approved") {
        return sendJson(res, 409, {
          error: "Offers are only possible on active, approved listings.",
        });
      }

      const openOfferCheck = await supabase
        .from("offers")
        .select("id")
        .eq("listing_id", listing.id)
        .eq("customer_id", customer.id)
        .in("status", ["pending", "countered"])
        .maybeSingle();

      if (openOfferCheck.error && !isNoRowsError(openOfferCheck.error)) throw openOfferCheck.error;
      if (openOfferCheck.data) {
        return sendJson(res, 409, {
          error: "You already have an open offer on this listing.",
        });
      }

      const insertResult = await supabase
        .from("offers")
        .insert({
          listing_id: listing.id,
          seller_id: listing.seller_id,
          customer_id: customer.id,
          currency: normalizeCurrency(listing.currency),
          amount_cents: amountCents,
          status: "pending",
          buyer_message: message || null,
        })
        .select(
          "id, listing_id, seller_id, customer_id, currency, amount_cents, counter_amount_cents, final_amount_cents, status, buyer_message, seller_message, created_at, updated_at, resolved_at"
        )
        .single();

      if (insertResult.error) throw insertResult.error;
      return sendJson(res, 201, {
        offer: formatOffer(insertResult.data),
      });
    }

    const offerId = sanitizeText(body.offerId || body.offer_id, 90);
    const action = sanitizeText(body.action, 30).toLowerCase();
    const sellerEmail = sanitizeText(body.sellerEmail || body.seller_email, 180).toLowerCase();
    const customerEmail = sanitizeText(body.customerEmail || body.customer_email, 180).toLowerCase();
    const sellerMessage = sanitizeText(body.message || body.seller_message, 1000);
    const counterCents = toPriceCents(body.counterAmount ?? body.counter_amount ?? body.counter_amount_cents);

    if (!offerId || !ALLOWED_ACTIONS.has(action)) {
      return sendJson(res, 400, {
        error: "offerId and valid action are required.",
      });
    }

    const offerResult = await supabase
      .from("offers")
      .select(
        "id, listing_id, seller_id, customer_id, currency, amount_cents, counter_amount_cents, final_amount_cents, status, buyer_message, seller_message, created_at, updated_at, resolved_at"
      )
      .eq("id", offerId)
      .maybeSingle();

    if (offerResult.error && !isNoRowsError(offerResult.error)) throw offerResult.error;
    if (!offerResult.data) return sendJson(res, 404, { error: "Offer not found." });

    const offer = offerResult.data;
    if (FINAL_STATUSES.has(offer.status)) {
      return sendJson(res, 409, {
        error: `Offer is already ${offer.status} and cannot be changed.`,
      });
    }

    const nowIso = new Date().toISOString();
    let updatePayload = {};

    if (action === "accept" || action === "reject" || action === "counter") {
      if (!isValidEmail(sellerEmail)) {
        return sendJson(res, 400, { error: "Valid sellerEmail is required for seller actions." });
      }
      const seller = await getSellerByEmail(supabase, sellerEmail);
      if (!seller || seller.id !== offer.seller_id) {
        return sendJson(res, 403, { error: "Seller is not authorized for this offer." });
      }

      if (action === "accept") {
        updatePayload = {
          status: "accepted",
          final_amount_cents: offer.counter_amount_cents || offer.amount_cents,
          seller_message: sellerMessage || null,
          resolved_at: nowIso,
        };
      } else if (action === "reject") {
        updatePayload = {
          status: "rejected",
          seller_message: sellerMessage || "Offer rejected.",
          resolved_at: nowIso,
        };
      } else {
        if (!Number.isInteger(counterCents) || counterCents <= 0) {
          return sendJson(res, 400, {
            error: "counterAmount must be a positive number for counter action.",
          });
        }
        updatePayload = {
          status: "countered",
          counter_amount_cents: counterCents,
          seller_message: sellerMessage || null,
        };
      }
    } else if (action === "cancel" || action === "accept_counter") {
      if (!isValidEmail(customerEmail)) {
        return sendJson(res, 400, { error: "Valid customerEmail is required for this action." });
      }
      const customer = await getCustomerByEmail(supabase, customerEmail);
      if (!customer || customer.id !== offer.customer_id) {
        return sendJson(res, 403, { error: "Customer is not authorized for this offer." });
      }

      if (action === "cancel") {
        updatePayload = {
          status: "cancelled",
          resolved_at: nowIso,
        };
      } else {
        if (offer.status !== "countered" || !offer.counter_amount_cents) {
          return sendJson(res, 409, {
            error: "Only countered offers can be accepted by customer.",
          });
        }
        updatePayload = {
          status: "accepted",
          final_amount_cents: offer.counter_amount_cents,
          resolved_at: nowIso,
        };
      }
    }

    const updateResult = await supabase
      .from("offers")
      .update(updatePayload)
      .eq("id", offer.id)
      .select(
        "id, listing_id, seller_id, customer_id, currency, amount_cents, counter_amount_cents, final_amount_cents, status, buyer_message, seller_message, created_at, updated_at, resolved_at"
      )
      .single();

    if (updateResult.error) throw updateResult.error;

    return sendJson(res, 200, {
      offer: formatOffer(updateResult.data),
      action,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

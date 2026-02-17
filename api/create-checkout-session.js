const {
  getPublicOrigin,
  getStripeClient,
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  normalizeCurrency,
  readJsonBody,
  sanitizeText,
  sendJson,
  setCors,
} = require("./_shared");

function parseUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value).trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch (_error) {
    return null;
  }
}

function normalizeJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

function parseHttpUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  let reservedListingId = "";
  let checkoutSessionId = "";
  let supabase;

  try {
    const body = await readJsonBody(req);
    const listingId = sanitizeText(body.listingId || body.listing_id, 80);
    const buyerEmail = sanitizeText(body.buyerEmail || body.buyer_email, 160).toLowerCase();
    const explicitOrigin = sanitizeText(body.origin, 500);

    if (!listingId) {
      return sendJson(res, 400, { error: "listingId is required." });
    }

    if (buyerEmail && !isValidEmail(buyerEmail)) {
      return sendJson(res, 400, { error: "buyerEmail is invalid." });
    }

    const publicOrigin = getPublicOrigin(req, explicitOrigin);
    if (!publicOrigin) {
      return sendJson(res, 500, {
        error: "Unable to resolve PUBLIC_ORIGIN for checkout redirect URLs.",
      });
    }

    supabase = getSupabaseAdmin();
    const stripe = getStripeClient();

    const listingResult = await supabase
      .from("listings")
      .select(
        "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, moderation_status, status"
      )
      .eq("id", listingId)
      .maybeSingle();

    if (listingResult.error && !isNoRowsError(listingResult.error)) {
      throw listingResult.error;
    }

    if (!listingResult.data) {
      return sendJson(res, 404, { error: "Listing not found." });
    }

    const listing = listingResult.data;
    if (listing.status !== "active") {
      return sendJson(res, 409, {
        error: `Listing cannot be purchased while status is '${listing.status}'.`,
      });
    }

    if (listing.moderation_status !== "approved") {
      return sendJson(res, 409, {
        error: `Listing cannot be purchased before moderation approval (current: ${listing.moderation_status}).`,
      });
    }

    const sellerResult = await supabase
      .from("seller_profiles")
      .select("id, email, stripe_account_id")
      .eq("id", listing.seller_id)
      .maybeSingle();

    if (sellerResult.error && !isNoRowsError(sellerResult.error)) {
      throw sellerResult.error;
    }

    if (!sellerResult.data || !sellerResult.data.stripe_account_id) {
      return sendJson(res, 400, {
        error: "Seller payout account is missing.",
      });
    }

    const connectedAccount = await stripe.accounts.retrieve(sellerResult.data.stripe_account_id);
    if (!connectedAccount.charges_enabled || !connectedAccount.payouts_enabled) {
      return sendJson(res, 409, {
        error: "Seller Stripe account is not fully enabled yet.",
      });
    }

    // Reserve first to avoid creating multiple active checkout sessions for one item.
    const reserveResult = await supabase
      .from("listings")
      .update({ status: "reserved" })
      .eq("id", listing.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (reserveResult.error && !isNoRowsError(reserveResult.error)) {
      throw reserveResult.error;
    }

    if (!reserveResult.data) {
      return sendJson(res, 409, {
        error: "Listing is no longer available.",
      });
    }

    reservedListingId = listing.id;

    const feePercentEnv = Number.parseFloat(String(process.env.PLATFORM_FEE_PERCENT || "15"));
    const feePercent = Number.isFinite(feePercentEnv)
      ? Math.max(1, Math.min(feePercentEnv, 30))
      : 15;
    const applicationFeeAmount = Math.round((listing.price_cents * feePercent) / 100);

    const fallbackSuccessUrl = `${publicOrigin}/?checkout=success&listing=${listing.id}`;
    const fallbackCancelUrl = `${publicOrigin}/?checkout=cancelled&listing=${listing.id}`;

    const successUrl = parseUrl(body.successUrl || body.success_url) || fallbackSuccessUrl;
    const cancelUrl = parseUrl(body.cancelUrl || body.cancel_url) || fallbackCancelUrl;

    const productData = {
      name: `${listing.brand} ${listing.title}`.trim(),
      description: sanitizeText(listing.description, 240) || undefined,
    };

    const approvedMedia = normalizeJsonArray(listing.approved_media_urls)
      .map(parseHttpUrl)
      .filter(Boolean);
    const submittedMedia = normalizeJsonArray(listing.media_urls)
      .map(parseHttpUrl)
      .filter(Boolean);
    const primaryImage = approvedMedia[0] || submittedMedia[0] || parseHttpUrl(listing.image_url);

    if (primaryImage) {
      productData.images = [primaryImage];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: normalizeCurrency(listing.currency),
            unit_amount: listing.price_cents,
            product_data: productData,
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: sellerResult.data.stripe_account_id,
        },
        metadata: {
          listing_id: listing.id,
          seller_id: sellerResult.data.id,
          platform: "archive-sur-mer",
        },
      },
      metadata: {
        listing_id: listing.id,
        seller_id: sellerResult.data.id,
        platform: "archive-sur-mer",
      },
    });

    checkoutSessionId = session.id;

    const attachSessionResult = await supabase
      .from("listings")
      .update({
        status: "reserved",
        checkout_session_id: session.id,
      })
      .eq("id", listing.id)
      .eq("status", "reserved");

    if (attachSessionResult.error) {
      throw attachSessionResult.error;
    }

    return sendJson(res, 200, {
      session_id: session.id,
      url: session.url,
      listing_id: listing.id,
      application_fee_amount: applicationFeeAmount,
      application_fee_percent: feePercent,
    });
  } catch (error) {
    if (supabase && reservedListingId && !checkoutSessionId) {
      await supabase
        .from("listings")
        .update({ status: "active" })
        .eq("id", reservedListingId)
        .eq("status", "reserved");
    }

    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

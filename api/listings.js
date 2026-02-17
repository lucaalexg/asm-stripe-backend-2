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

const SELLER_STATUS_UPDATES = new Set(["active", "archived"]);

function formatListing(listing) {
  return {
    ...listing,
    price: Number((listing.price_cents / 100).toFixed(2)),
  };
}

function parseSearch(value) {
  const cleaned = sanitizeText(value, 80).replace(/[%_,]/g, "");
  return cleaned;
}

function parseImageUrl(value) {
  const imageUrl = sanitizeText(value, 400);
  if (!imageUrl) return null;
  if (!/^https?:\/\//i.test(imageUrl)) return null;
  return imageUrl;
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const status = sanitizeText(getQueryParam(req, "status"), 20).toLowerCase() || "active";
      const search = parseSearch(getQueryParam(req, "search"));
      const condition = sanitizeText(getQueryParam(req, "condition"), 20).toLowerCase();
      const limit = clampInt(getQueryParam(req, "limit"), 1, 60, 24);
      const offset = clampInt(getQueryParam(req, "offset"), 0, 5000, 0);

      let query = supabase
        .from("listings")
        .select(
          "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, status, created_at, sold_at"
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (condition === "new") {
        query = query.eq("is_new", true);
      } else if (condition === "used" || condition === "pre-owned" || condition === "preowned") {
        query = query.eq("is_new", false);
      }

      if (search) {
        query = query.or(`title.ilike.%${search}%,brand.ilike.%${search}%`);
      }

      const listingResult = await query;
      if (listingResult.error) {
        throw listingResult.error;
      }

      return sendJson(res, 200, {
        count: listingResult.data.length,
        listings: listingResult.data.map(formatListing),
      });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);

      const sellerEmail = sanitizeText(body.sellerEmail || body.seller_email, 160).toLowerCase();
      const title = sanitizeText(body.title, 140);
      const brand = sanitizeText(body.brand, 80);
      const description = sanitizeText(body.description, 4000);
      const size = sanitizeText(body.size, 40);
      const condition = sanitizeText(body.condition, 60);
      const isNew = Boolean(body.isNew || body.is_new);
      const currency = normalizeCurrency(body.currency);
      const imageUrl = parseImageUrl(body.imageUrl || body.image_url);
      const rawPrice = body.price_cents ?? body.priceCents ?? body.price;
      const priceCents = toPriceCents(rawPrice);

      if (!isValidEmail(sellerEmail)) {
        return sendJson(res, 400, {
          error: "sellerEmail is required and must be valid.",
        });
      }

      if (!title || !brand) {
        return sendJson(res, 400, {
          error: "title and brand are required.",
        });
      }

      if (!Number.isInteger(priceCents) || priceCents <= 0) {
        return sendJson(res, 400, {
          error: "price must be a positive number.",
        });
      }

      const sellerResult = await supabase
        .from("seller_profiles")
        .select("id, email, stripe_account_id, onboarding_complete")
        .eq("email", sellerEmail)
        .maybeSingle();

      if (sellerResult.error && !isNoRowsError(sellerResult.error)) {
        throw sellerResult.error;
      }

      if (!sellerResult.data) {
        return sendJson(res, 404, {
          error: "Seller not found. Complete onboarding first.",
        });
      }

      if (!sellerResult.data.stripe_account_id) {
        return sendJson(res, 400, {
          error: "Seller has no Stripe account. Complete onboarding first.",
        });
      }

      const insertResult = await supabase
        .from("listings")
        .insert({
          seller_id: sellerResult.data.id,
          title,
          brand,
          description,
          size: size || null,
          condition: condition || (isNew ? "New with tags" : "Pre-owned"),
          is_new: isNew,
          price_cents: priceCents,
          currency,
          image_url: imageUrl,
          status: "active",
        })
        .select(
          "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, status, created_at, sold_at"
        )
        .single();

      if (insertResult.error) {
        throw insertResult.error;
      }

      return sendJson(res, 201, {
        listing: formatListing(insertResult.data),
      });
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);

      const listingId = sanitizeText(body.listingId || body.id, 80);
      const status = sanitizeText(body.status, 20).toLowerCase();
      const sellerEmail = sanitizeText(body.sellerEmail || body.seller_email, 160).toLowerCase();

      if (!listingId || !SELLER_STATUS_UPDATES.has(status)) {
        return sendJson(res, 400, {
          error: "listingId and valid status (active|archived) are required.",
        });
      }

      if (!isValidEmail(sellerEmail)) {
        return sendJson(res, 400, {
          error: "Valid sellerEmail is required for updates.",
        });
      }

      const sellerResult = await supabase
        .from("seller_profiles")
        .select("id")
        .eq("email", sellerEmail)
        .maybeSingle();

      if (sellerResult.error && !isNoRowsError(sellerResult.error)) {
        throw sellerResult.error;
      }

      if (!sellerResult.data) {
        return sendJson(res, 404, { error: "Seller not found." });
      }

      const updateResult = await supabase
        .from("listings")
        .update({ status })
        .eq("id", listingId)
        .eq("seller_id", sellerResult.data.id)
        .select(
          "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, status, created_at, sold_at"
        )
        .maybeSingle();

      if (updateResult.error && !isNoRowsError(updateResult.error)) {
        throw updateResult.error;
      }

      if (!updateResult.data) {
        return sendJson(res, 404, {
          error: "Listing not found for this seller.",
        });
      }

      return sendJson(res, 200, {
        listing: formatListing(updateResult.data),
      });
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

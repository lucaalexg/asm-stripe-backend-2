const {
  clampInt,
  getQueryParam,
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  sanitizeText,
  sendJson,
  setCors,
} = require("./_shared");

async function getSellerByEmail(supabase, email) {
  const sellerResult = await supabase
    .from("seller_profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (sellerResult.error && !isNoRowsError(sellerResult.error)) {
    throw sellerResult.error;
  }

  return sellerResult.data || null;
}

async function getCustomerByEmail(supabase, email) {
  const customerResult = await supabase
    .from("customer_profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (customerResult.error && !isNoRowsError(customerResult.error)) {
    throw customerResult.error;
  }

  return customerResult.data || null;
}

function normalizeMediaUrls(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter((item) => /^https?:\/\//i.test(item));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || "").trim())
          .filter((item) => /^https?:\/\//i.test(item));
      }
    } catch (_error) {
      return [];
    }
  }

  return [];
}

function resolvePrimaryImage(listing) {
  const approved = normalizeMediaUrls(listing.approved_media_urls);
  if (approved.length > 0) return approved[0];

  const submitted = normalizeMediaUrls(listing.media_urls);
  if (submitted.length > 0) return submitted[0];

  const fallback = String(listing.image_url || "").trim();
  return /^https?:\/\//i.test(fallback) ? fallback : null;
}

function formatOrder(listing, counterpart) {
  const amount = Number(((listing.price_cents || 0) / 100).toFixed(2));
  return {
    id: listing.checkout_session_id || listing.id,
    listing_id: listing.id,
    title: listing.title,
    brand: listing.brand,
    condition: listing.condition,
    price_cents: listing.price_cents,
    currency: listing.currency,
    amount,
    sold_at: listing.sold_at || null,
    created_at: listing.created_at,
    buyer_email: listing.buyer_email || null,
    seller_email: counterpart || null,
    image_url: resolvePrimaryImage(listing),
    media_urls:
      normalizeMediaUrls(listing.approved_media_urls).length > 0
        ? normalizeMediaUrls(listing.approved_media_urls)
        : normalizeMediaUrls(listing.media_urls),
    status: listing.status,
  };
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const customerEmail = sanitizeText(getQueryParam(req, "customer_email"), 180).toLowerCase();
    const sellerEmail = sanitizeText(getQueryParam(req, "seller_email"), 180).toLowerCase();
    const limit = clampInt(getQueryParam(req, "limit"), 1, 80, 20);
    const offset = clampInt(getQueryParam(req, "offset"), 0, 5000, 0);

    if (!customerEmail && !sellerEmail) {
      return sendJson(res, 400, {
        error: "Use one filter: customer_email or seller_email.",
      });
    }

    if (customerEmail && sellerEmail) {
      return sendJson(res, 400, {
        error: "Use either customer_email or seller_email, not both.",
      });
    }

    if (customerEmail) {
      if (!isValidEmail(customerEmail)) {
        return sendJson(res, 400, { error: "customer_email is invalid." });
      }

      const customer = await getCustomerByEmail(supabase, customerEmail);
      if (!customer) {
        return sendJson(res, 200, { count: 0, scope: "buyer", orders: [] });
      }

      const ordersResult = await supabase
        .from("listings")
        .select(
          "id, checkout_session_id, title, brand, condition, price_cents, currency, image_url, media_urls, approved_media_urls, sold_at, created_at, status, buyer_email, seller_id"
        )
        .eq("status", "sold")
        .eq("buyer_email", customer.email)
        .order("sold_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (ordersResult.error) throw ordersResult.error;

      const rows = ordersResult.data || [];
      const sellerIds = [...new Set(rows.map((row) => row.seller_id).filter(Boolean))];
      const sellerEmailMap = new Map();

      if (sellerIds.length > 0) {
        const sellerResult = await supabase
          .from("seller_profiles")
          .select("id, email")
          .in("id", sellerIds);
        if (sellerResult.error) throw sellerResult.error;
        (sellerResult.data || []).forEach((seller) => {
          sellerEmailMap.set(seller.id, seller.email);
        });
      }

      return sendJson(res, 200, {
        count: rows.length,
        scope: "buyer",
        orders: rows.map((row) => formatOrder(row, sellerEmailMap.get(row.seller_id) || null)),
      });
    }

    if (!isValidEmail(sellerEmail)) {
      return sendJson(res, 400, { error: "seller_email is invalid." });
    }

    const seller = await getSellerByEmail(supabase, sellerEmail);
    if (!seller) {
      return sendJson(res, 200, { count: 0, scope: "seller", orders: [] });
    }

    const salesResult = await supabase
      .from("listings")
      .select(
        "id, checkout_session_id, title, brand, condition, price_cents, currency, image_url, media_urls, approved_media_urls, sold_at, created_at, status, buyer_email, seller_id"
      )
      .eq("status", "sold")
      .eq("seller_id", seller.id)
      .order("sold_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (salesResult.error) throw salesResult.error;

    const rows = salesResult.data || [];
    return sendJson(res, 200, {
      count: rows.length,
      scope: "seller",
      orders: rows.map((row) => formatOrder(row, seller.email)),
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Failed to load orders.",
    });
  }
};

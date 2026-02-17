const {
  getQueryParam,
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  readJsonBody,
  sanitizeText,
  sendJson,
  setCors,
} = require("./_shared");

function parseHttpUrl(value, maxLength = 700) {
  const candidate = sanitizeText(value, maxLength);
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) return null;
  return candidate;
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

function parseMediaUrls(value, maxItems = 8) {
  const raw = normalizeJsonArray(value);
  const seen = new Set();
  const urls = [];
  for (const item of raw) {
    const parsed = parseHttpUrl(item);
    if (!parsed || seen.has(parsed)) continue;
    seen.add(parsed);
    urls.push(parsed);
    if (urls.length >= maxItems) break;
  }
  return urls;
}

function formatListing(listing) {
  const submitted = parseMediaUrls(listing.media_urls);
  const approved = parseMediaUrls(listing.approved_media_urls);
  const display = approved.length > 0 ? approved : submitted;
  return {
    ...listing,
    media_urls: submitted,
    approved_media_urls: approved,
    primary_image_url: display[0] || parseHttpUrl(listing.image_url),
    price: Number((listing.price_cents / 100).toFixed(2)),
  };
}

async function getCustomerByEmail(supabase, email) {
  const result = await supabase
    .from("customer_profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (result.error && !isNoRowsError(result.error)) {
    throw result.error;
  }
  return result.data || null;
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = req.method === "GET" ? {} : await readJsonBody(req);
    const rawEmail =
      req.method === "GET"
        ? getQueryParam(req, "customer_email")
        : body.customerEmail || body.customer_email;
    const customerEmail = sanitizeText(rawEmail, 180).toLowerCase();

    if (!isValidEmail(customerEmail)) {
      return sendJson(res, 400, { error: "Valid customer_email is required." });
    }

    const customer = await getCustomerByEmail(supabase, customerEmail);
    if (!customer) {
      if (req.method === "GET") {
        return sendJson(res, 200, { count: 0, items: [] });
      }
      return sendJson(res, 404, {
        error: "Customer account not found. Create your customer account first.",
      });
    }

    if (req.method === "GET") {
      const wishlistResult = await supabase
        .from("wishlist_items")
        .select("id, listing_id, created_at")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });

      if (wishlistResult.error) {
        throw wishlistResult.error;
      }

      const items = wishlistResult.data || [];
      const listingIds = [...new Set(items.map((item) => item.listing_id).filter(Boolean))];

      let listingMap = new Map();
      if (listingIds.length > 0) {
        const listingResult = await supabase
          .from("listings")
          .select(
            "id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, status, created_at"
          )
          .in("id", listingIds);

        if (listingResult.error) {
          throw listingResult.error;
        }

        listingMap = new Map(
          (listingResult.data || []).map((listing) => [listing.id, formatListing(listing)])
        );
      }

      const enriched = items.map((item) => ({
        id: item.id,
        listing_id: item.listing_id,
        created_at: item.created_at,
        listing: listingMap.get(item.listing_id) || null,
      }));

      return sendJson(res, 200, {
        count: enriched.length,
        items: enriched,
      });
    }

    const listingId = sanitizeText(
      req.method === "DELETE" ? body.listingId || body.listing_id : body.listingId || body.listing_id,
      90
    );
    if (!listingId) {
      return sendJson(res, 400, { error: "listingId is required." });
    }

    if (req.method === "DELETE") {
      const deleteResult = await supabase
        .from("wishlist_items")
        .delete()
        .eq("customer_id", customer.id)
        .eq("listing_id", listingId);

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      return sendJson(res, 200, { removed: true, listing_id: listingId });
    }

    const listingResult = await supabase
      .from("listings")
      .select("id, status, moderation_status")
      .eq("id", listingId)
      .maybeSingle();

    if (listingResult.error && !isNoRowsError(listingResult.error)) {
      throw listingResult.error;
    }

    if (!listingResult.data) {
      return sendJson(res, 404, { error: "Listing not found." });
    }

    if (listingResult.data.moderation_status !== "approved") {
      return sendJson(res, 409, {
        error: "Only approved listings can be saved to wishlist.",
      });
    }

    const existing = await supabase
      .from("wishlist_items")
      .select("id, listing_id, created_at")
      .eq("customer_id", customer.id)
      .eq("listing_id", listingId)
      .maybeSingle();

    if (existing.error && !isNoRowsError(existing.error)) {
      throw existing.error;
    }

    if (existing.data) {
      return sendJson(res, 200, {
        exists: true,
        item: existing.data,
      });
    }

    const insertResult = await supabase
      .from("wishlist_items")
      .insert({
        customer_id: customer.id,
        listing_id: listingId,
      })
      .select("id, listing_id, created_at")
      .single();

    if (insertResult.error) {
      throw insertResult.error;
    }

    return sendJson(res, 201, {
      exists: false,
      item: insertResult.data,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

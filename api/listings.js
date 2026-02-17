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
const MODERATION_STATES = new Set(["pending", "approved", "rejected"]);
const PUBLIC_MODERATION_STATE = "approved";

function parseHttpUrl(value, maxLength = 600) {
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
  let items = [];
  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "string") {
    items = value.split(/[\n,]/g);
  } else if (value) {
    items = [value];
  }

  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const url = parseHttpUrl(item, 700);
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    deduped.push(url);
    if (deduped.length >= maxItems) break;
  }
  return deduped;
}

function formatListing(listing) {
  const mediaUrls = parseMediaUrls(normalizeJsonArray(listing.media_urls));
  const approvedMediaUrls = parseMediaUrls(normalizeJsonArray(listing.approved_media_urls));
  const displayMedia = listing.moderation_status === "approved" ? approvedMediaUrls : mediaUrls;

  return {
    ...listing,
    price: Number((listing.price_cents / 100).toFixed(2)),
    media_urls: mediaUrls,
    approved_media_urls: approvedMediaUrls,
    display_media_urls: displayMedia,
    primary_image_url: displayMedia[0] || mediaUrls[0] || listing.image_url || null,
  };
}

function parseSearch(value) {
  const cleaned = sanitizeText(value, 80).replace(/[%_,]/g, "");
  return cleaned;
}

function parseImageUrl(value) {
  return parseHttpUrl(value, 700);
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
      const moderationState =
        sanitizeText(getQueryParam(req, "moderation_status"), 20).toLowerCase() || "";
      const sellerEmail = sanitizeText(getQueryParam(req, "seller_email"), 160).toLowerCase();
      const limit = clampInt(getQueryParam(req, "limit"), 1, 60, 24);
      const offset = clampInt(getQueryParam(req, "offset"), 0, 5000, 0);

      let sellerId = null;

      if (sellerEmail) {
        if (!isValidEmail(sellerEmail)) {
          return sendJson(res, 400, { error: "seller_email has invalid format." });
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
          return sendJson(res, 200, { count: 0, listings: [] });
        }
        sellerId = sellerResult.data.id;
      }

      let query = supabase
        .from("listings")
        .select(
          "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at, sold_at"
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (sellerId) {
        query = query.eq("seller_id", sellerId);
      }

      if (moderationState) {
        if (moderationState !== "all" && !MODERATION_STATES.has(moderationState)) {
          return sendJson(res, 400, {
            error: "moderation_status must be pending, approved, rejected, or all.",
          });
        }
        if (moderationState !== "all") {
          query = query.eq("moderation_status", moderationState);
        }
      } else if (!sellerId) {
        query = query.eq("moderation_status", PUBLIC_MODERATION_STATE);
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
      const imageUrls = parseMediaUrls(body.images || body.imageUrls || body.media_urls);
      const videoUrl = parseHttpUrl(body.videoUrl || body.video_url, 700);
      const rawPrice = body.price_cents ?? body.priceCents ?? body.price;
      const priceCents = toPriceCents(rawPrice);

      const mediaUrls = imageUrls.slice();
      if (imageUrl && !mediaUrls.includes(imageUrl)) {
        mediaUrls.unshift(imageUrl);
      }

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

      if (mediaUrls.length === 0) {
        return sendJson(res, 400, {
          error: "At least one image URL is required.",
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
          image_url: mediaUrls[0] || imageUrl,
          media_urls: mediaUrls,
          approved_media_urls: [],
          video_url: videoUrl,
          moderation_status: "pending",
          moderation_reason: null,
          moderated_at: null,
          status: "active",
        })
        .select(
          "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at, sold_at"
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
          "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at, sold_at"
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

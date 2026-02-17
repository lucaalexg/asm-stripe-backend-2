const {
  clampInt,
  getQueryParam,
  getSupabaseAdmin,
  isNoRowsError,
  readJsonBody,
  sanitizeText,
  sendJson,
  setCors,
} = require("./_shared");

const MODERATION_ACTIONS = new Set(["approve", "reject"]);
const MODERATION_STATES = new Set(["pending", "approved", "rejected"]);

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
  const raw = Array.isArray(value) ? value : normalizeJsonArray(value);
  const seen = new Set();
  const urls = [];

  for (const item of raw) {
    const url = parseHttpUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= maxItems) break;
  }
  return urls;
}

function getConfiguredAdminToken() {
  return process.env.MARKETPLACE_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "";
}

function extractBearerToken(req) {
  const authorization = String(req.headers.authorization || "").trim();
  if (!authorization) return "";
  const [scheme, token] = authorization.split(/\s+/);
  if (!token || String(scheme).toLowerCase() !== "bearer") return "";
  return token.trim();
}

function buildWhiteBackgroundImageUrl(url) {
  const input = parseHttpUrl(url);
  if (!input) return null;

  // For Cloudinary URLs, force the first approved image into a white product canvas.
  if (input.includes("res.cloudinary.com") && input.includes("/upload/")) {
    return input.replace(
      "/upload/",
      "/upload/c_pad,b_white,w_1400,h_1750,f_auto,q_auto/"
    );
  }
  return input;
}

function formatListing(listing) {
  const mediaUrls = parseMediaUrls(listing.media_urls);
  const approvedMediaUrls = parseMediaUrls(listing.approved_media_urls);
  return {
    ...listing,
    media_urls: mediaUrls,
    approved_media_urls: approvedMediaUrls,
    primary_image_url: approvedMediaUrls[0] || mediaUrls[0] || parseHttpUrl(listing.image_url),
    price: Number((listing.price_cents / 100).toFixed(2)),
  };
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const configuredAdminToken = getConfiguredAdminToken();
  if (!configuredAdminToken) {
    return sendJson(res, 500, {
      error: "MARKETPLACE_ADMIN_TOKEN is required for moderation endpoints.",
    });
  }

  try {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const requestAdminToken =
      extractBearerToken(req) ||
      sanitizeText(getQueryParam(req, "admin_token"), 500) ||
      sanitizeText(body.admin_token || body.adminToken, 500);

    if (!requestAdminToken || requestAdminToken !== configuredAdminToken) {
      return sendJson(res, 401, { error: "Unauthorized moderation request." });
    }

    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const moderationState =
        sanitizeText(getQueryParam(req, "moderation_status"), 20).toLowerCase() || "pending";
      const limit = clampInt(getQueryParam(req, "limit"), 1, 80, 40);
      const offset = clampInt(getQueryParam(req, "offset"), 0, 10000, 0);

      if (moderationState !== "all" && !MODERATION_STATES.has(moderationState)) {
        return sendJson(res, 400, {
          error: "moderation_status must be pending, approved, rejected, or all.",
        });
      }

      let query = supabase
        .from("listings")
        .select(
          "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at"
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (moderationState !== "all") {
        query = query.eq("moderation_status", moderationState);
      }

      const listingResult = await query;
      if (listingResult.error) {
        throw listingResult.error;
      }

      const listings = listingResult.data || [];
      const sellerIds = [...new Set(listings.map((item) => item.seller_id).filter(Boolean))];
      let sellerMap = new Map();

      if (sellerIds.length > 0) {
        const sellerResult = await supabase
          .from("seller_profiles")
          .select("id, email")
          .in("id", sellerIds);
        if (sellerResult.error) {
          throw sellerResult.error;
        }
        sellerMap = new Map((sellerResult.data || []).map((seller) => [seller.id, seller.email]));
      }

      return sendJson(res, 200, {
        count: listings.length,
        listings: listings.map((listing) => ({
          ...formatListing(listing),
          seller_email: sellerMap.get(listing.seller_id) || null,
        })),
      });
    }

    const listingId = sanitizeText(body.listingId || body.listing_id, 90);
    const action = sanitizeText(body.action, 20).toLowerCase();
    const reason = sanitizeText(body.reason, 500);

    if (!listingId || !MODERATION_ACTIONS.has(action)) {
      return sendJson(res, 400, {
        error: "listingId and action (approve|reject) are required.",
      });
    }

    const listingResult = await supabase
      .from("listings")
      .select(
        "id, title, image_url, media_urls, approved_media_urls, moderation_status, status, price_cents, currency, seller_id"
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
    const nowIso = new Date().toISOString();
    let updatePayload = {};

    if (action === "approve") {
      const submittedMedia = parseMediaUrls(listing.media_urls);
      const fallbackMedia = parseHttpUrl(listing.image_url);
      const media = submittedMedia.length > 0 ? submittedMedia : fallbackMedia ? [fallbackMedia] : [];

      if (media.length === 0) {
        return sendJson(res, 400, {
          error: "Cannot approve a listing without at least one valid image.",
        });
      }

      const primary = buildWhiteBackgroundImageUrl(media[0]) || media[0];
      const approvedMedia = [primary, ...media.slice(1)];

      updatePayload = {
        moderation_status: "approved",
        moderation_reason: null,
        moderated_at: nowIso,
        approved_media_urls: approvedMedia,
        image_url: primary,
        status: listing.status === "sold" ? "sold" : "active",
      };
    } else {
      updatePayload = {
        moderation_status: "rejected",
        moderation_reason: reason || "Listing rejected during moderation review.",
        moderated_at: nowIso,
      };

      if (listing.status === "active" || listing.status === "reserved") {
        updatePayload.status = "archived";
      }
    }

    const updateResult = await supabase
      .from("listings")
      .update(updatePayload)
      .eq("id", listing.id)
      .select(
        "id, seller_id, title, brand, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at"
      )
      .single();

    if (updateResult.error) {
      throw updateResult.error;
    }

    return sendJson(res, 200, {
      listing: formatListing(updateResult.data),
      action,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

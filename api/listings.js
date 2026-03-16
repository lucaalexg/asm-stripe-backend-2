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

function parsePriceFilter(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const cents = toPriceCents(value);
  if (!Number.isInteger(cents) || cents < 0) {
    return NaN;
  }
  return cents;
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
      const brand = sanitizeText(getQueryParam(req, "brand"), 80);
      const size = sanitizeText(getQueryParam(req, "size"), 40);
      const sort = sanitizeText(getQueryParam(req, "sort"), 20).toLowerCase() || "newest";
      const minPriceCents = parsePriceFilter(getQueryParam(req, "min_price"));
      const maxPriceCents = parsePriceFilter(getQueryParam(req, "max_price"));
      const moderationState =
        sanitizeText(getQueryParam(req, "moderation_status"), 20).toLowerCase() || "";
      const category = sanitizeText(getQueryParam(req, "category"), 80);
      const sellerEmail = sanitizeText(getQueryParam(req, "seller_email"), 160).toLowerCase();
      const limit = clampInt(getQueryParam(req, "limit"), 1, 60, 24);
      const offset = clampInt(getQueryParam(req, "offset"), 0, 5000, 0);

      if (Number.isNaN(minPriceCents) || Number.isNaN(maxPriceCents)) {
        return sendJson(res, 400, {
          error: "min_price and max_price must be numeric values.",
        });
      }

      if (
        minPriceCents !== null &&
        maxPriceCents !== null &&
        Number.isInteger(minPriceCents) &&
        Number.isInteger(maxPriceCents) &&
        minPriceCents > maxPriceCents
      ) {
        return sendJson(res, 400, {
          error: "min_price cannot be greater than max_price.",
        });
      }

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

      // Single listing by ID
      const singleId = sanitizeText(getQueryParam(req, "id"), 90);
      if (singleId) {
        const singleResult = await supabase
          .from("listings")
          .select(
            "id, seller_id, title, brand, category, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at, sold_at"
          )
          .eq("id", singleId)
          .maybeSingle();

        if (singleResult.error && !isNoRowsError(singleResult.error)) {
          throw singleResult.error;
        }

        if (!singleResult.data) {
          return sendJson(res, 404, { error: "Listing not found." });
        }

        const single = singleResult.data;
        // Enforce moderation visibility; sellers can see their own listing regardless of state
        const isOwner = sellerId !== null && sellerId === single.seller_id;
        if (!isOwner && single.moderation_status !== PUBLIC_MODERATION_STATE) {
          return sendJson(res, 404, { error: "Listing not found." });
        }

        return sendJson(res, 200, { listing: formatListing(single) });
      }

      let query = supabase
        .from("listings")
        .select(
          "id, seller_id, title, brand, category, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at, sold_at"
        )
        .range(offset, offset + limit - 1);

      if (sort === "price_asc") {
        query = query.order("price_cents", { ascending: true }).order("created_at", { ascending: false });
      } else if (sort === "price_desc") {
        query = query.order("price_cents", { ascending: false }).order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

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

      if (brand) {
        query = query.ilike("brand", `%${brand}%`);
      }

      if (size) {
        query = query.ilike("size", `%${size}%`);
      }

      if (minPriceCents !== null) {
        query = query.gte("price_cents", minPriceCents);
      }

      if (maxPriceCents !== null) {
        query = query.lte("price_cents", maxPriceCents);
      }

      if (search) {
        query = query.or(`title.ilike.%${search}%,brand.ilike.%${search}%`);
      }

      if (category) {
        query = query.eq("category", category);
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
      const category = sanitizeText(body.category, 80);
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
          error: "Seller has no payout account. Complete onboarding first.",
        });
      }

      const insertResult = await supabase
        .from("listings")
        .insert({
          seller_id: sellerResult.data.id,
          title,
          brand,
          category: category || null,
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
          "id, seller_id, title, brand, category, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at, sold_at"
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
      const sellerEmail = sanitizeText(body.sellerEmail || body.seller_email, 160).toLowerCase();

      if (!listingId) {
        return sendJson(res, 400, { error: "listingId is required." });
      }

      if (!isValidEmail(sellerEmail)) {
        return sendJson(res, 400, {
          error: "Valid sellerEmail is required for updates.",
        });
      }

      const rawStatus = body.status !== undefined ? sanitizeText(body.status, 20).toLowerCase() : null;
      if (rawStatus !== null && !SELLER_STATUS_UPDATES.has(rawStatus)) {
        return sendJson(res, 400, {
          error: "status must be one of: active, archived.",
        });
      }

      const rawPrice = body.price_cents !== undefined ? body.price_cents : body.price;
      let newPriceCents;
      if (rawPrice !== undefined) {
        newPriceCents = toPriceCents(rawPrice);
        if (!Number.isInteger(newPriceCents) || newPriceCents <= 0) {
          return sendJson(res, 400, { error: "price must be a positive number." });
        }
      }

      const newTitle = body.title !== undefined ? sanitizeText(body.title, 140) : undefined;
      const newBrand = body.brand !== undefined ? sanitizeText(body.brand, 80) : undefined;
      const newCategory = body.category !== undefined
        ? (sanitizeText(body.category, 60) || null)
        : undefined;
      const newDescription = body.description !== undefined
        ? sanitizeText(body.description, 4000)
        : undefined;
      const newSize = body.size !== undefined ? (sanitizeText(body.size, 40) || null) : undefined;
      const newCondition = body.condition !== undefined ? sanitizeText(body.condition, 60) : undefined;

      if (newTitle !== undefined && !newTitle) {
        return sendJson(res, 400, { error: "title cannot be empty." });
      }
      if (newBrand !== undefined && !newBrand) {
        return sendJson(res, 400, { error: "brand cannot be empty." });
      }
      if (newCondition !== undefined && !newCondition) {
        return sendJson(res, 400, { error: "condition cannot be empty." });
      }
      const rawVideoUrl = body.videoUrl !== undefined ? body.videoUrl : body.video_url;
      const newVideoUrl = rawVideoUrl !== undefined ? (parseHttpUrl(rawVideoUrl) || null) : undefined;

      const rawImages = body.images !== undefined
        ? body.images
        : body.imageUrls !== undefined
          ? body.imageUrls
          : body.media_urls;
      let newMediaUrls;
      let newImageUrl;
      if (rawImages !== undefined) {
        newMediaUrls = parseMediaUrls(Array.isArray(rawImages) ? rawImages : [rawImages]);
        if (newMediaUrls.length === 0) {
          return sendJson(res, 400, { error: "At least one valid image URL is required." });
        }
        newImageUrl = newMediaUrls[0];
      } else if (body.imageUrl !== undefined || body.image_url !== undefined) {
        const singleUrl = parseHttpUrl(body.imageUrl !== undefined ? body.imageUrl : body.image_url);
        if (singleUrl) {
          newImageUrl = singleUrl;
          newMediaUrls = [singleUrl];
        }
      }

      const updatePayload = {};
      if (rawStatus !== null) updatePayload.status = rawStatus;
      if (newPriceCents !== undefined) updatePayload.price_cents = newPriceCents;
      if (newTitle !== undefined) updatePayload.title = newTitle;
      if (newBrand !== undefined) updatePayload.brand = newBrand;
      if (newCategory !== undefined) updatePayload.category = newCategory;
      if (newDescription !== undefined) updatePayload.description = newDescription;
      if (newSize !== undefined) updatePayload.size = newSize;
      if (newCondition !== undefined) updatePayload.condition = newCondition;
      if (newVideoUrl !== undefined) updatePayload.video_url = newVideoUrl;
      if (newMediaUrls !== undefined) {
        updatePayload.media_urls = newMediaUrls;
        updatePayload.image_url = newImageUrl;
        updatePayload.approved_media_urls = [];
        updatePayload.moderation_status = "pending";
        updatePayload.moderation_reason = null;
        updatePayload.moderated_at = null;
      }

      if (Object.keys(updatePayload).length === 0) {
        return sendJson(res, 400, { error: "No valid update fields provided." });
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

      const existingResult = await supabase
        .from("listings")
        .select("id, status")
        .eq("id", listingId)
        .eq("seller_id", sellerResult.data.id)
        .maybeSingle();

      if (existingResult.error && !isNoRowsError(existingResult.error)) {
        throw existingResult.error;
      }

      if (!existingResult.data) {
        return sendJson(res, 404, { error: "Listing not found for this seller." });
      }

      if (existingResult.data.status === "sold") {
        return sendJson(res, 409, { error: "Sold listings cannot be edited." });
      }

      if (existingResult.data.status === "reserved" && "status" in updatePayload) {
        return sendJson(res, 409, { error: "Cannot change the status of a reserved listing." });
      }

      const updateResult = await supabase
        .from("listings")
        .update(updatePayload)
        .eq("id", listingId)
        .eq("seller_id", sellerResult.data.id)
        .select(
          "id, seller_id, title, brand, category, description, size, condition, is_new, price_cents, currency, image_url, media_urls, approved_media_urls, video_url, moderation_status, moderation_reason, moderated_at, status, created_at, sold_at"
        )
        .maybeSingle();

      if (updateResult.error && !isNoRowsError(updateResult.error)) {
        throw updateResult.error;
      }

      if (!updateResult.data) {
        return sendJson(res, 404, { error: "Listing not found for this seller." });
      }

      return sendJson(res, 200, {
        listing: formatListing(updateResult.data),
      });
    }

    if (req.method === "DELETE") {
      const body = await readJsonBody(req);

      const listingId = sanitizeText(body.listingId || body.id, 80);
      const sellerEmail = sanitizeText(body.sellerEmail || body.seller_email, 160).toLowerCase();

      if (!listingId) {
        return sendJson(res, 400, { error: "listingId is required." });
      }

      if (!isValidEmail(sellerEmail)) {
        return sendJson(res, 400, { error: "Valid sellerEmail is required." });
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

      const existingResult = await supabase
        .from("listings")
        .select("id, status")
        .eq("id", listingId)
        .eq("seller_id", sellerResult.data.id)
        .maybeSingle();

      if (existingResult.error && !isNoRowsError(existingResult.error)) {
        throw existingResult.error;
      }

      if (!existingResult.data) {
        return sendJson(res, 404, { error: "Listing not found for this seller." });
      }

      if (existingResult.data.status === "sold") {
        return sendJson(res, 409, { error: "Sold listings cannot be deleted." });
      }

      if (existingResult.data.status === "reserved") {
        return sendJson(res, 409, {
          error: "Reserved listings cannot be deleted while a checkout is in progress.",
        });
      }

      const deleteResult = await supabase
        .from("listings")
        .delete()
        .eq("id", listingId)
        .eq("seller_id", sellerResult.data.id);

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      return sendJson(res, 200, { deleted: true, id: listingId });
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

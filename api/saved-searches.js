const {
  clampInt,
  getQueryParam,
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  readJsonBody,
  sanitizeText,
  sendJson,
  setCors,
  toPriceCents,
} = require("./_shared");

const SORT_KEYS = new Set(["newest", "price_asc", "price_desc"]);

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

function toOptionalPriceCents(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const cents = toPriceCents(value);
  if (!Number.isInteger(cents) || cents < 0) return NaN;
  return cents;
}

function formatSavedSearch(item) {
  return {
    ...item,
    min_price: item.min_price_cents === null ? null : Number((item.min_price_cents / 100).toFixed(2)),
    max_price: item.max_price_cents === null ? null : Number((item.max_price_cents / 100).toFixed(2)),
  };
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
    const customerEmail = sanitizeText(
      req.method === "GET"
        ? getQueryParam(req, "customer_email")
        : body.customerEmail || body.customer_email,
      180
    ).toLowerCase();

    if (!isValidEmail(customerEmail)) {
      return sendJson(res, 400, { error: "Valid customer_email is required." });
    }

    const customer = await getCustomerByEmail(supabase, customerEmail);
    if (!customer) {
      if (req.method === "GET") {
        return sendJson(res, 200, { count: 0, searches: [] });
      }
      return sendJson(res, 404, {
        error: "Customer account not found. Create your customer account first.",
      });
    }

    if (req.method === "GET") {
      const limit = clampInt(getQueryParam(req, "limit"), 1, 50, 25);
      const offset = clampInt(getQueryParam(req, "offset"), 0, 5000, 0);
      const result = await supabase
        .from("saved_searches")
        .select(
          "id, customer_id, search_query, brand, size, condition, min_price_cents, max_price_cents, sort_key, notify_email, created_at, updated_at"
        )
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (result.error) {
        throw result.error;
      }

      return sendJson(res, 200, {
        count: (result.data || []).length,
        searches: (result.data || []).map(formatSavedSearch),
      });
    }

    if (req.method === "DELETE") {
      const savedSearchId = sanitizeText(body.savedSearchId || body.saved_search_id || body.id, 90);
      if (!savedSearchId) {
        return sendJson(res, 400, { error: "savedSearchId is required." });
      }

      const deleteResult = await supabase
        .from("saved_searches")
        .delete()
        .eq("id", savedSearchId)
        .eq("customer_id", customer.id);

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      return sendJson(res, 200, { removed: true, id: savedSearchId });
    }

    const searchQuery = sanitizeText(body.search || body.searchQuery || body.search_query, 120);
    const brand = sanitizeText(body.brand, 80);
    const size = sanitizeText(body.size, 40);
    const condition = sanitizeText(body.condition, 40);
    const sortKey = sanitizeText(body.sort || body.sort_key, 20).toLowerCase() || "newest";
    const notifyEmail = body.notify_email === undefined ? Boolean(body.notifyEmail !== false) : Boolean(body.notify_email);
    const minPriceCents = toOptionalPriceCents(body.min_price ?? body.minPrice ?? body.min_price_cents);
    const maxPriceCents = toOptionalPriceCents(body.max_price ?? body.maxPrice ?? body.max_price_cents);

    if (!SORT_KEYS.has(sortKey)) {
      return sendJson(res, 400, {
        error: "sort must be one of: newest, price_asc, price_desc.",
      });
    }

    if (Number.isNaN(minPriceCents) || Number.isNaN(maxPriceCents)) {
      return sendJson(res, 400, {
        error: "min_price/max_price must be positive numbers when provided.",
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
        error: "min_price cannot be higher than max_price.",
      });
    }

    const insertResult = await supabase
      .from("saved_searches")
      .insert({
        customer_id: customer.id,
        search_query: searchQuery || null,
        brand: brand || null,
        size: size || null,
        condition: condition || null,
        min_price_cents: minPriceCents,
        max_price_cents: maxPriceCents,
        sort_key: sortKey,
        notify_email: notifyEmail,
      })
      .select(
        "id, customer_id, search_query, brand, size, condition, min_price_cents, max_price_cents, sort_key, notify_email, created_at, updated_at"
      )
      .single();

    if (insertResult.error) {
      throw insertResult.error;
    }

    return sendJson(res, 201, {
      saved_search: formatSavedSearch(insertResult.data),
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

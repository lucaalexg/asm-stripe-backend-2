const {
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  readJsonBody,
  sanitizeText,
  sendJson,
  setCors,
} = require("./_shared");

function normalizePhone(value) {
  const input = sanitizeText(value, 40);
  if (!input) return "";
  let normalized = input.replace(/[^\d+]/g, "");
  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`;
  }
  if (!normalized.startsWith("+")) {
    normalized = `+${normalized.replace(/\+/g, "")}`;
  }
  return normalized;
}

function isValidPhone(value) {
  return typeof value === "string" && /^\+\d{7,18}$/.test(value);
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

  try {
    const body = await readJsonBody(req);
    const email = sanitizeText(body.email, 180).toLowerCase();
    const phone = normalizePhone(body.phone);
    const fullName = sanitizeText(body.fullName || body.full_name, 120);
    const marketingOptIn = Boolean(body.marketingOptIn || body.marketing_opt_in);

    if (!isValidEmail(email)) {
      return sendJson(res, 400, { error: "Please provide a valid email address." });
    }

    if (!isValidPhone(phone)) {
      return sendJson(res, 400, {
        error: "Please provide a valid phone number in international format.",
      });
    }

    const supabase = getSupabaseAdmin();
    const existingResult = await supabase
      .from("customer_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingResult.error && !isNoRowsError(existingResult.error)) {
      throw existingResult.error;
    }

    const upsertResult = await supabase
      .from("customer_profiles")
      .upsert(
        {
          email,
          phone,
          full_name: fullName || null,
          marketing_opt_in: marketingOptIn,
        },
        { onConflict: "email" }
      )
      .select("id, email, phone, full_name, marketing_opt_in, created_at, updated_at")
      .single();

    if (upsertResult.error) {
      throw upsertResult.error;
    }

    return sendJson(res, 200, {
      created: !existingResult.data,
      customer: upsertResult.data,
      message: !existingResult.data
        ? "Customer account created."
        : "Customer profile updated.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

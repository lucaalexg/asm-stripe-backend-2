const {
  getQueryParam,
  getStripeClient,
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  readJsonBody,
  sendJson,
  setCors,
} = require("./_shared");

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    let email = "";
    let stripeAccountId = "";

    if (req.method === "GET") {
      email = String(getQueryParam(req, "email") || "").trim().toLowerCase();
      stripeAccountId = String(getQueryParam(req, "stripe_account_id") || "").trim();
    } else {
      const body = await readJsonBody(req);
      email = String(body.email || "").trim().toLowerCase();
      stripeAccountId = String(body.stripe_account_id || "").trim();
    }

    if (!email && !stripeAccountId) {
      return sendJson(res, 400, {
        error: "Provide either email or stripe_account_id.",
      });
    }

    if (email && !isValidEmail(email)) {
      return sendJson(res, 400, { error: "Invalid email format." });
    }

    const supabase = getSupabaseAdmin();
    let sellerResult;

    if (email) {
      sellerResult = await supabase
        .from("seller_profiles")
        .select("id, email, stripe_account_id, onboarding_complete")
        .eq("email", email)
        .maybeSingle();
    } else {
      sellerResult = await supabase
        .from("seller_profiles")
        .select("id, email, stripe_account_id, onboarding_complete")
        .eq("stripe_account_id", stripeAccountId)
        .maybeSingle();
    }

    if (sellerResult.error && !isNoRowsError(sellerResult.error)) {
      throw sellerResult.error;
    }

    if (!sellerResult.data) {
      return sendJson(res, 404, {
        exists: false,
        onboarding_complete: false,
        error: "Seller profile not found. Start onboarding first.",
      });
    }

    const seller = sellerResult.data;
    const resolvedStripeId = stripeAccountId || seller.stripe_account_id;

    if (!resolvedStripeId) {
      return sendJson(res, 200, {
        exists: true,
        onboarding_complete: false,
        seller,
        stripe: null,
      });
    }

    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(resolvedStripeId);
    const onboardingComplete = Boolean(
      account.details_submitted && account.charges_enabled && account.payouts_enabled
    );

    if (seller.onboarding_complete !== onboardingComplete) {
      const updateResult = await supabase
        .from("seller_profiles")
        .update({ onboarding_complete: onboardingComplete })
        .eq("id", seller.id);
      if (updateResult.error) {
        throw updateResult.error;
      }
    }

    return sendJson(res, 200, {
      exists: true,
      onboarding_complete: onboardingComplete,
      seller: {
        ...seller,
        onboarding_complete: onboardingComplete,
      },
      stripe: {
        id: account.id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements_due:
          account.requirements && Array.isArray(account.requirements.currently_due)
            ? account.requirements.currently_due
            : [],
      },
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

const {
  getPublicOrigin,
  getQueryParam,
  getStripeClient,
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  readJsonBody,
  sendJson,
  setCors,
} = require("./_shared");

async function createExpressSellerAccount(stripe, email) {
  const account = await stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      platform: "archive-sur-mer",
    },
  });
  return account.id;
}

function shouldReplaceConnectedAccount(error) {
  const message = String((error && error.message) || "").toLowerCase();
  if (error && error.code === "resource_missing") return true;
  return (
    message.includes("custom") &&
    message.includes("express") &&
    message.includes("account link")
  );
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

  try {
    let email = "";
    let explicitOrigin = "";

    if (req.method === "GET") {
      email = String(getQueryParam(req, "email") || "").trim().toLowerCase();
      explicitOrigin = String(getQueryParam(req, "origin") || "").trim();
    } else {
      const body = await readJsonBody(req);
      email = String(body.email || "").trim().toLowerCase();
      explicitOrigin = String(body.origin || "").trim();
    }

    if (!isValidEmail(email)) {
      return sendJson(res, 400, { error: "A valid seller email is required." });
    }

    const publicOrigin = getPublicOrigin(req, explicitOrigin);
    if (!publicOrigin) {
      return sendJson(res, 500, {
        error: "PUBLIC_ORIGIN is missing or invalid. Expected https://your-domain.com",
      });
    }

    const stripe = getStripeClient();
    const supabase = getSupabaseAdmin();

    const sellerResult = await supabase
      .from("seller_profiles")
      .select("id, email, stripe_account_id")
      .eq("email", email)
      .maybeSingle();

    if (sellerResult.error && !isNoRowsError(sellerResult.error)) {
      throw sellerResult.error;
    }

    let stripeAccountId = sellerResult.data ? sellerResult.data.stripe_account_id : null;

    if (!stripeAccountId) {
      stripeAccountId = await createExpressSellerAccount(stripe, email);
    }

    const upsertResult = await supabase
      .from("seller_profiles")
      .upsert(
        {
          email,
          stripe_account_id: stripeAccountId,
          onboarding_complete: false,
        },
        { onConflict: "email" }
      )
      .select("id, email, stripe_account_id, onboarding_complete")
      .single();

    if (upsertResult.error) {
      throw upsertResult.error;
    }

    const returnUrl =
      `${publicOrigin}/sell-with-us.html?state=return&email=` + encodeURIComponent(email);
    const refreshUrl =
      `${publicOrigin}/sell-with-us.html?state=refresh&email=` + encodeURIComponent(email);

    let accountLink;
    try {
      accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        type: "account_onboarding",
        return_url: returnUrl,
        refresh_url: refreshUrl,
      });
    } catch (linkError) {
      if (!shouldReplaceConnectedAccount(linkError)) {
        throw linkError;
      }

      // Recover automatically if the stored account is missing/incompatible for account links.
      stripeAccountId = await createExpressSellerAccount(stripe, email);
      const replaceResult = await supabase
        .from("seller_profiles")
        .update({
          stripe_account_id: stripeAccountId,
          onboarding_complete: false,
        })
        .eq("email", email);
      if (replaceResult.error) {
        throw replaceResult.error;
      }

      accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        type: "account_onboarding",
        return_url: returnUrl,
        refresh_url: refreshUrl,
      });
    }

    if (req.method === "GET") {
      res.statusCode = 302;
      res.setHeader("Location", accountLink.url);
      res.setHeader("Cache-Control", "no-store");
      return res.end();
    }

    return sendJson(res, 200, {
      url: accountLink.url,
      stripe_account_id: stripeAccountId,
      seller: {
        ...upsertResult.data,
        stripe_account_id: stripeAccountId,
      },
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

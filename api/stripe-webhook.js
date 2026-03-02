const {
  getStripeClient,
  getSupabaseAdmin,
  isValidEmail,
  readRawBody,
  sendJson,
  setCors,
} = require("./_shared");

function extractBuyerEmail(session) {
  const raw =
    (session.customer_details && session.customer_details.email) ||
    session.customer_email ||
    (session.metadata && (session.metadata.buyer_email || session.metadata.buyerEmail)) ||
    "";
  const email = String(raw || "")
    .trim()
    .toLowerCase();
  return isValidEmail(email) ? email : null;
}

async function runSoldUpdate(supabase, basePayload, applyFilter) {
  let query = supabase.from("listings").update(basePayload).in("status", ["active", "reserved"]);
  query = applyFilter(query);
  const result = await query;
  if (!result.error) return result;

  if (!basePayload.buyer_email || !/buyer_email/i.test(result.error.message || "")) {
    throw result.error;
  }

  const fallbackPayload = { ...basePayload };
  delete fallbackPayload.buyer_email;

  let fallbackQuery = supabase
    .from("listings")
    .update(fallbackPayload)
    .in("status", ["active", "reserved"]);
  fallbackQuery = applyFilter(fallbackQuery);
  const fallbackResult = await fallbackQuery;
  if (fallbackResult.error) throw fallbackResult.error;

  return fallbackResult;
}

async function markListingSold(supabase, session) {
  const listingId = session.metadata && session.metadata.listing_id;
  const updatePayload = {
    status: "sold",
    sold_at: new Date().toISOString(),
    checkout_session_id: session.id,
  };
  const buyerEmail = extractBuyerEmail(session);
  if (buyerEmail) {
    updatePayload.buyer_email = buyerEmail;
  }

  if (listingId) {
    await runSoldUpdate(supabase, updatePayload, (query) => query.eq("id", listingId));
    return;
  }

  await runSoldUpdate(supabase, updatePayload, (query) => query.eq("checkout_session_id", session.id));
}

async function expireOpenOffers(supabase, listingId) {
  if (!listingId) return;
  const nowIso = new Date().toISOString();
  const expireResult = await supabase
    .from("offers")
    .update({ status: "expired", resolved_at: nowIso })
    .eq("listing_id", listingId)
    .in("status", ["pending", "countered"]);
  if (expireResult.error) throw expireResult.error;
}

async function releaseReservedListing(supabase, session) {
  const listingId = session.metadata && session.metadata.listing_id;

  let query = supabase.from("listings").update({ status: "active" }).eq("status", "reserved");

  if (listingId) {
    query = query.eq("id", listingId);
  } else {
    query = query.eq("checkout_session_id", session.id);
  }

  const releaseResult = await query;
  if (releaseResult.error) {
    throw releaseResult.error;
  }
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

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    return sendJson(res, 500, { error: "STRIPE_WEBHOOK_SECRET is required." });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return sendJson(res, 400, {
      error: "Missing Stripe-Signature header.",
    });
  }

  try {
    const stripe = getStripeClient();
    const supabase = getSupabaseAdmin();
    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);

    if (event.type === "checkout.session.completed") {
      const completedSession = event.data.object;
      await markListingSold(supabase, completedSession);
      const soldListingId = completedSession.metadata && completedSession.metadata.listing_id;
      await expireOpenOffers(supabase, soldListingId);
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      await releaseReservedListing(supabase, event.data.object);
    }

    return sendJson(res, 200, { received: true, type: event.type });
  } catch (error) {
    return sendJson(res, 400, {
      error: error && error.message ? error.message : "Invalid webhook event.",
    });
  }
};

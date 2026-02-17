const { getStripeClient, getSupabaseAdmin, readRawBody, sendJson, setCors } = require("./_shared");

async function markListingSold(supabase, session) {
  const listingId = session.metadata && session.metadata.listing_id;
  const updatePayload = {
    status: "sold",
    sold_at: new Date().toISOString(),
    checkout_session_id: session.id,
  };

  if (listingId) {
    const soldResult = await supabase
      .from("listings")
      .update(updatePayload)
      .eq("id", listingId)
      .in("status", ["active", "reserved"]);

    if (soldResult.error) {
      throw soldResult.error;
    }
    return;
  }

  const fallbackResult = await supabase
    .from("listings")
    .update(updatePayload)
    .eq("checkout_session_id", session.id)
    .in("status", ["active", "reserved"]);

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }
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
      await markListingSold(supabase, event.data.object);
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

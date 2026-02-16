const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

function getQueryParam(req, key) {
  const base = "http://" + (req.headers.host || "localhost");
  const url = new URL(req.url, base);
  return url.searchParams.get(key);
}

function normalizeOrigin(value) {
  if (!value) return null;
  const v = String(value).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(v)) return null;
  return v;
}

module.exports = async (req, res) => {
  // Optional: CORS fuer den Fall, dass du spaeter doch fetch nutzt
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const origin = normalizeOrigin(process.env.PUBLIC_ORIGIN);
    if (!origin) {
      return res.status(500).json({ error: "PUBLIC_ORIGIN missing/invalid (must be https://...)" });
    }

    let email = "";

    if (req.method === "GET") {
      email = String(getQueryParam(req, "email") || "").trim();
    } else if (req.method === "POST") {
      const body = req.body || {};
      email = String(body.email || "").trim();
    } else {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const account = await stripe.accounts.create({
      type: "express",
      email,
      capabilities: { transfers: { requested: true } }
    });

    const returnUrl = origin + "/pages/sell-with-us?state=return";
    const refreshUrl = origin + "/pages/sell-with-us?state=refresh";

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl
    });

    // Wichtig: Bei GET machen wir Redirect -> kein fetch, kein CORS
    if (req.method === "GET") {
      res.statusCode = 302;
      res.setHeader("Location", accountLink.url);
      res.setHeader("Cache-Control", "no-store");
      return res.end();
    }

    // Bei POST geben wir JSON zurueck (falls du es doch brauchst)
    return res.status(200).json({ url: accountLink.url, stripe_account_id: account.id });
  } catch (err) {
    return res.status(500).json({ error: err && err.message ? err.message : "Server error" });
  }
};

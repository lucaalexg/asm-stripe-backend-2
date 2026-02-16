const Stripe = require("stripe");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Missing email" });

    const account = await stripe.accounts.create({
      type: "express",
      email
    });

    const origin = process.env.PUBLIC_ORIGIN;

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${origin}/return`,
      return_url: `${origin}/return`,
      type: "account_onboarding"
    });

    return res.status(200).json({
      stripe_account_id: account.id,
      onboarding_url: link.url
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
};

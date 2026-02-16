const Stripe = require("stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const account = await stripe.accounts.create({
      type: "express",
      email: email,
      capabilities: {
        transfers: { requested: true }
      }
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: process.env.PUBLIC_ORIGIN + "/pages/sell-with-us",
      return_url: process.env.PUBLIC_ORIGIN + "/pages/sell-with-us",
      type: "account_onboarding"
    });

    res.status(200).json({ url: accountLink.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

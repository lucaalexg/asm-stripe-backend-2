const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body;

  try {

    const account = await stripe.accounts.create({
      type: "express",
      email: email,
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "https://archivesurmer.com",
      return_url: "https://archivesurmer.com",
      type: "account_onboarding",
    });

    res.status(200).json({ url: accountLink.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

};

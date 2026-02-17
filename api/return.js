module.exports = async (_req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Archive Sur Mer | Stripe Onboarding</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: "Inter", Arial, sans-serif;
        background: #f5f3ee;
        color: #121212;
      }
      main {
        max-width: 560px;
        margin: 12vh auto;
        padding: 28px;
        background: #fff;
        border: 1px solid #dfddd6;
      }
      h1 {
        margin-top: 0;
        font-family: "Times New Roman", serif;
        letter-spacing: 0.03em;
      }
      a {
        color: #121212;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Onboarding submitted</h1>
      <p>Your Stripe Connect details were received. Return to your seller page to check status and publish listings.</p>
      <p><a href="/sell-with-us.html">Back to seller dashboard</a></p>
    </main>
  </body>
</html>`);
};

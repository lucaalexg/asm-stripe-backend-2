const { v2: cloudinary } = require("cloudinary");
const { readJsonBody, sanitizeText, sendJson, setCors } = require("./_shared");

let cloudinaryReady = false;

function initCloudinary() {
  if (cloudinaryReady) return;

  if (process.env.CLOUDINARY_URL) {
    cloudinary.config(process.env.CLOUDINARY_URL);
    cloudinaryReady = true;
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary config. Provide CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET."
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  cloudinaryReady = true;
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
    const imageData = body.imageData || body.image || body.image_url;
    const folder = sanitizeText(body.folder, 120) || "archive-sur-mer/listings";

    if (!imageData || typeof imageData !== "string") {
      return sendJson(res, 400, {
        error: "imageData is required. Use a remote URL or base64 data URL.",
      });
    }

    if (imageData.length > 10_000_000) {
      return sendJson(res, 400, { error: "Image payload is too large." });
    }

    initCloudinary();

    const uploadResult = await cloudinary.uploader.upload(imageData, {
      folder,
      resource_type: "image",
    });

    return sendJson(res, 200, {
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      width: uploadResult.width,
      height: uploadResult.height,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error && error.message ? error.message : "Server error",
    });
  }
};

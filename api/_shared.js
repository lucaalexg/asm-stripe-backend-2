const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

let stripeClient = null;
let supabaseAdmin = null;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return stripeClient;
}

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return supabaseAdmin;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ALLOW_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Stripe-Signature"
  );
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function normalizeOrigin(value) {
  if (!value) return null;
  const trimmed = String(value).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function inferOriginFromRequest(req) {
  const host =
    String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();
  if (!host) return null;
  return normalizeOrigin(`${proto}://${host}`);
}

function getPublicOrigin(req, explicitOrigin) {
  return (
    normalizeOrigin(explicitOrigin) ||
    normalizeOrigin(process.env.PUBLIC_ORIGIN) ||
    inferOriginFromRequest(req)
  );
}

function getQueryParam(req, key) {
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get(key);
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseIntSafe(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) {
    return fallback;
  }
  return n;
}

function clampInt(value, min, max, fallback) {
  const parsed = parseIntSafe(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCurrency(value) {
  const raw = String(value || "eur")
    .trim()
    .toLowerCase();
  if (!/^[a-z]{3}$/.test(raw)) {
    return "eur";
  }
  return raw;
}

function toPriceCents(value) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  const n = Number.parseFloat(String(value));
  if (Number.isNaN(n)) {
    return NaN;
  }
  return Math.round(n * 100);
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function collectStream(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return Buffer.from(req.body);
  }

  if (req.rawBody) {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
    if (typeof req.rawBody === "string") return Buffer.from(req.rawBody);
  }

  return collectStream(req);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  const raw = await readRawBody(req);
  if (!raw || raw.length === 0) {
    return {};
  }
  return JSON.parse(raw.toString("utf8"));
}

function isNoRowsError(error) {
  if (!error) return false;
  return error.code === "PGRST116" || /0 rows/i.test(error.message || "");
}

module.exports = {
  clampInt,
  getPublicOrigin,
  getQueryParam,
  getStripeClient,
  getSupabaseAdmin,
  isNoRowsError,
  isValidEmail,
  normalizeCurrency,
  normalizeOrigin,
  parseIntSafe,
  readJsonBody,
  readRawBody,
  sanitizeText,
  sendJson,
  setCors,
  toPriceCents,
};

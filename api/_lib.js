// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.

import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const PLANS = {
  single: {
    label: "Judgy single check",
    amount: Number(process.env.PRICE_SINGLE || 2600), // in the smallest unit (fils): 26 AED ≈ $7
    days: 30, // an unused single check stays valid this long
  },
  pass: {
    label: "Judgy 30-day pass",
    amount: Number(process.env.PRICE_PASS || 5500), // 55 AED ≈ $15
    days: 30,
  },
};
export const CURRENCY = process.env.PRICE_CURRENCY || "AED";
export const ZIINA_API = "https://api-v2.ziina.com/api";

export function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export function onlyPost(req, res) {
  if (req.method === "POST") return false;
  res.setHeader("Allow", "POST");
  send(res, 405, { error: "method_not_allowed" });
  return true;
}

export function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

/* ---------- Key-value store (Upstash Redis REST, which Vercel KV also uses) ---------- */

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvEnabled = () => Boolean(KV_URL && KV_TOKEN);

export async function kv(...command) {
  if (!kvEnabled()) throw new Error("No key-value store configured");
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command.map(String)),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(`KV ${command[0]} failed: ${data.error || r.status}`);
  return data.result;
}

/* ---------- Visitor id for the one free check ---------- */

export function visitorKey(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = fwd || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  // Hashed so raw IP addresses are never stored
  return createHash("sha256").update(`${secret()}:${ip}`).digest("hex").slice(0, 32);
}

/* ---------- Signed access tokens ---------- */

function secret() {
  const s = process.env.TOKEN_SECRET;
  if (!s || s.length < 16) throw new Error("TOKEN_SECRET must be set (16+ characters)");
  return s;
}

const b64 = (buf) => Buffer.from(buf).toString("base64url");
const sign = (data) => createHmac("sha256", secret()).update(data).digest("base64url");

export function makeToken(plan, jti = randomUUID()) {
  const exp = Date.now() + PLANS[plan].days * 86400000;
  const data = b64(JSON.stringify({ p: plan, exp, jti }));
  return `${data}.${sign(data)}`;
}

export function readToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [data, mac] = token.split(".");
  try {
    const want = Buffer.from(sign(data));
    const got = Buffer.from(mac || "");
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (!PLANS[payload.p] || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

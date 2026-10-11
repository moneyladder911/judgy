// POST /api/redeem { id } → { token, plan, exp } once Ziina confirms the payment.
// Safe to call again for the same payment: it returns the same token.

import { send, body, onlyPost, kv, kvEnabled, makeToken, readToken, PLANS, CURRENCY, ZIINA_API } from "./_lib.js";

export function planFor(intent) {
  if (String(intent.currency_code || "").toUpperCase() !== CURRENCY) return null;
  const amount = Number(intent.amount);
  if (amount >= PLANS.pass.amount) return "pass";
  if (amount >= PLANS.single.amount) return "single";
  return null;
}

export default async function handler(req, res) {
  if (onlyPost(req, res)) return;
  const id = String(body(req).id || "");
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(id)) return send(res, 400, { error: "bad_id" });
  if (!process.env.ZIINA_API_KEY || !kvEnabled()) return send(res, 503, { error: "payments_not_configured" });

  try {
    const existing = await kv("GET", `redeemed:${id}`);
    const prior = readToken(existing);
    if (prior) return send(res, 200, { token: existing, plan: prior.p, exp: prior.exp });

    const r = await fetch(`${ZIINA_API}/payment_intent/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${process.env.ZIINA_API_KEY}` },
    });
    const intent = await r.json().catch(() => ({}));
    if (!r.ok) return send(res, 404, { error: "payment_not_found" });
    if (intent.status !== "completed") return send(res, 402, { error: "not_paid", status: intent.status || "unknown" });
    const plan = planFor(intent);
    if (!plan) return send(res, 402, { error: "amount_mismatch" });

    const token = makeToken(plan, id);
    // NX: if two tabs redeem at once, both get the first token
    const stored = await kv("SET", `redeemed:${id}`, token, "NX", "EX", 90 * 86400);
    const final = stored === null ? await kv("GET", `redeemed:${id}`) : token;
    const payload = readToken(final);
    return send(res, 200, { token: final, plan: payload.p, exp: payload.exp });
  } catch (err) {
    console.error("redeem failed", err);
    return send(res, 502, { error: "redeem_failed" });
  }
}

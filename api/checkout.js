// POST /api/checkout { plan: "single" | "pass" } → { url } of a Ziina payment page.
// After paying, Ziina sends the buyer back to /?paid=<payment id>, and the page
// calls /api/redeem to turn that payment into an access token.

import { send, body, onlyPost, siteUrl, PLANS, CURRENCY, ZIINA_API } from "./_lib.js";

export default async function handler(req, res) {
  if (onlyPost(req, res)) return;
  const plan = PLANS[body(req).plan] ? body(req).plan : null;
  if (!plan) return send(res, 400, { error: "unknown_plan" });
  if (!process.env.ZIINA_API_KEY) return send(res, 503, { error: "payments_not_configured" });

  const base = siteUrl(req);
  try {
    const r = await fetch(`${ZIINA_API}/payment_intent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.ZIINA_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: PLANS[plan].amount,
        currency_code: CURRENCY,
        message: PLANS[plan].label,
        success_url: `${base}/?paid={PAYMENT_INTENT_ID}`,
        cancel_url: `${base}/#pricing`,
        failure_url: `${base}/?payment=failed#pricing`,
        test: process.env.ZIINA_TEST === "true",
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.redirect_url) {
      console.error("ziina create failed", r.status, data);
      return send(res, 502, { error: "checkout_failed" });
    }
    return send(res, 200, { url: data.redirect_url });
  } catch (err) {
    console.error("ziina create failed", err);
    return send(res, 502, { error: "checkout_failed" });
  }
}

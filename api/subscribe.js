// POST /api/subscribe { email } → saves the email to the list.
// Stored in the key-value store (hash "emails": email → date joined), and also
// forwarded to FORM_ENDPOINT if one is set (for example a Formspree or newsletter form).

import { send, body, onlyPost, kv, kvEnabled } from "./_lib.js";

export default async function handler(req, res) {
  if (onlyPost(req, res)) return;
  const email = String(body(req).email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return send(res, 400, { error: "bad_email" });
  if (!kvEnabled() && !process.env.FORM_ENDPOINT) return send(res, 503, { error: "list_not_configured" });

  try {
    if (kvEnabled()) await kv("HSETNX", "emails", email, new Date().toISOString());
    if (process.env.FORM_ENDPOINT) {
      const r = await fetch(process.env.FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, source: "judgy" }),
      });
      if (!r.ok && !kvEnabled()) throw new Error(`form endpoint ${r.status}`);
    }
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error("subscribe failed", err);
    return send(res, 502, { error: "subscribe_failed" });
  }
}

// GET /api/config → which features are switched on, so the page knows what to show.
// Each one turns on when its keys are added in Vercel; nothing here is secret.

import { send, kvEnabled } from "./_lib.js";

export default function handler(req, res) {
  send(res, 200, {
    ai: Boolean(process.env.ANTHROPIC_API_KEY && kvEnabled() && process.env.TOKEN_SECRET),
    payments: Boolean(process.env.ZIINA_API_KEY && kvEnabled() && process.env.TOKEN_SECRET),
    email: Boolean(kvEnabled() || process.env.FORM_ENDPOINT),
    amazonTag: process.env.AMAZON_TAG || "",
    amazonDomain: process.env.AMAZON_DOMAIN || "www.amazon.com",
  });
}

// Runs the API routes against fake Anthropic, Ziina and key-value services.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TOKEN_SECRET = "test-secret-at-least-16";
process.env.KV_REST_API_URL = "https://kv.test";
process.env.KV_REST_API_TOKEN = "kv";
process.env.ANTHROPIC_API_KEY = "sk-test";
process.env.ZIINA_API_KEY = "zz";

const db = new Map();
let anthropicCalls = [];
let panelReply;
let intents = {};

function redis([cmd, key, ...args]) {
  switch (cmd) {
    case "SET": {
      if (args.includes("NX") && db.has(key)) return null;
      db.set(key, args[0]);
      return "OK";
    }
    case "GET": return db.get(key) ?? null;
    case "DEL": return db.delete(key) ? 1 : 0;
    case "INCR": { const n = Number(db.get(key) || 0) + 1; db.set(key, String(n)); return n; }
    case "EXPIRE": return 1;
    case "HSETNX": { const k = `${key}:${args[0]}`; if (db.has(k)) return 0; db.set(k, args[1]); return 1; }
    default: throw new Error(`unhandled ${cmd}`);
  }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith("https://kv.test")) return json({ result: redis(JSON.parse(init.body)) });
  if (url.includes("anthropic.com")) {
    const req = JSON.parse(init.body);
    anthropicCalls.push(req);
    return json({
      id: "msg_1", type: "message", role: "assistant", model: req.model, stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "text", text: typeof panelReply === "string" ? panelReply : JSON.stringify(panelReply) }],
    });
  }
  if (url.includes("ziina.com/api/payment_intent")) {
    if (init.method === "POST") return json({ id: "pi_new123", redirect_url: "https://pay.ziina.com/pi_new123" });
    const id = url.split("/").pop();
    return intents[id] ? json(intents[id]) : json({}, 404);
  }
  throw new Error(`unexpected fetch ${url}`);
};

const { default: verdict } = await import("../api/verdict.js");
const { default: checkout } = await import("../api/checkout.js");
const { default: redeem } = await import("../api/redeem.js");
const { default: subscribe } = await import("../api/subscribe.js");

async function call(handler, body, ip = "1.1.1.1") {
  const res = {
    statusCode: 200, headers: {}, body: "",
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b; },
  };
  await handler({ method: "POST", body, headers: { "x-forwarded-for": ip, host: "site.test" } }, res);
  return { status: res.statusCode, data: JSON.parse(res.body || "{}") };
}

beforeEach(() => {
  db.clear(); anthropicCalls = []; intents = {};
  panelReply = {
    verdict: "walk", score: 2.3, line: "Walk away.", flags: ["a", "b", "c", "d"],
    alternative: "Index fund", alternative_search: "", price: 0,
    votes: [{ judge: "FI", vote: "walk", says: "Scam pattern." }],
  };
});

test("first check is free and uses the small model; second one hits the paywall", async () => {
  const first = await call(verdict, { text: "crypto bot 2% a day" });
  assert.equal(first.status, 200);
  assert.equal(first.data.tier, "free");
  assert.equal(first.data.score, 2.5);
  assert.equal(first.data.flags.length, 3);
  assert.equal(first.data.votes.length, 5);
  assert.equal(anthropicCalls[0].model, "claude-haiku-5-5");
  assert.equal(anthropicCalls[0].tools, undefined);

  const second = await call(verdict, { text: "another thing" });
  assert.equal(second.status, 402);
  assert.equal(second.data.paywall, true);
  assert.equal(anthropicCalls.length, 1);
});

test("a failed panel call gives the free check back", async () => {
  panelReply = "not json";
  const r = await call(verdict, { text: "a sofa" });
  assert.equal(r.status, 503);
  assert.equal(r.data.fallback, true);
  panelReply = { verdict: "buy", score: 8, line: "", flags: [], alternative: "", alternative_search: "", price: 900, votes: [] };
  const again = await call(verdict, { text: "a sofa" });
  assert.equal(again.status, 200);
});

test("paying: checkout, redeem, single check works once", async () => {
  const c = await call(checkout, { plan: "single" });
  assert.equal(c.data.url, "https://pay.ziina.com/pi_new123");

  intents.pi_abc123 = { id: "pi_abc123", status: "pending", amount: 2600, currency_code: "AED" };
  assert.equal((await call(redeem, { id: "pi_abc123" })).status, 402);

  intents.pi_abc123.status = "completed";
  const r = await call(redeem, { id: "pi_abc123" });
  assert.equal(r.status, 200);
  assert.equal(r.data.plan, "single");
  const again = await call(redeem, { id: "pi_abc123" });
  assert.equal(again.data.token, r.data.token, "redeeming twice returns the same token");

  const v1 = await call(verdict, { text: "laptop", token: r.data.token }, "2.2.2.2");
  assert.equal(v1.status, 200);
  assert.equal(v1.data.tier, "single");
  assert.equal(anthropicCalls.at(-1).model, "claude-opus-5-5");
  assert.equal(anthropicCalls.at(-1).tools[0].type, "web_search_20260209");
  const v2 = await call(verdict, { text: "laptop", token: r.data.token }, "2.2.2.2");
  assert.equal(v2.status, 402);
});

test("pass works repeatedly; wrong amount or tampered token is refused", async () => {
  intents.pi_pass01 = { status: "completed", amount: 5500, currency_code: "AED" };
  const { data } = await call(redeem, { id: "pi_pass01" });
  assert.equal(data.plan, "pass");
  for (let i = 0; i < 3; i++) assert.equal((await call(verdict, { text: "a tv", token: data.token })).status, 200);

  intents.pi_cheap1 = { status: "completed", amount: 100, currency_code: "AED" };
  assert.equal((await call(redeem, { id: "pi_cheap1" })).status, 402);

  const [p, mac] = data.token.split(".");
  const forged = Buffer.from(JSON.stringify({ p: "pass", exp: Date.now() + 1e12, jti: "x" })).toString("base64url");
  const r = await call(verdict, { text: "a tv", token: `${forged}.${mac}` }, "9.9.9.9");
  assert.equal(r.data.tier, "free", "a forged token is treated as no token");
});

test("photos are sent to the panel; a photo alone is enough", async () => {
  const img = "A".repeat(200);
  const r = await call(verdict, { text: "", images: [img, "not base64!", 42] }, "5.5.5.5");
  assert.equal(r.status, 200);
  const content = anthropicCalls.at(-1).messages[0].content;
  assert.equal(content.filter((b) => b.type === "image").length, 1);
  assert.equal(content[0].source.data, img);
  assert.equal((await call(verdict, { text: "", images: [] }, "6.6.6.6")).status, 400);
});

test("email list", async () => {
  assert.equal((await call(subscribe, { email: "nope" })).status, 400);
  assert.equal((await call(subscribe, { email: "A@b.co" })).status, 200);
  assert.ok(db.has("emails:a@b.co"));
});

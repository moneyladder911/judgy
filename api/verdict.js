// POST /api/verdict { text, token? } → a verdict card from the AI panel.
// The first check per visitor is free (smaller model, no web search). Paid checks
// use the full model with live web search. Any failure tells the page to fall
// back to the in-browser demo, so the site never breaks.

import Anthropic from "@anthropic-ai/sdk";
import { send, body, onlyPost, kv, kvEnabled, visitorKey, readToken } from "./_lib.js";

const MODEL_PAID = process.env.VERDICT_MODEL || "claude-opus-5-5";
const MODEL_FREE = process.env.VERDICT_MODEL_FREE || "claude-haiku-5-5";
const PASS_DAILY_LIMIT = Number(process.env.PASS_DAILY_LIMIT || 40);

const JUDGE_IDS = ["AC", "FI", "BH", "SK", "FY"];
const VOTE = { type: "string", enum: ["buy", "wait", "walk"] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "score", "line", "flags", "alternative", "alternative_search", "price", "votes"],
  properties: {
    verdict: VOTE,
    score: { type: "number", description: "1 to 10, halves allowed. 7+ is buy, 4 to 6.5 is wait, below 4 is walk." },
    line: { type: "string", description: "One short sentence verdict in plain words, under 60 characters." },
    flags: { type: "array", items: { type: "string" }, description: "Exactly 3 red flags, most important first, each one sentence." },
    alternative: { type: "string", description: "One or two sentences: a cheaper or safer way to get the same result." },
    alternative_search: { type: "string", description: "A short shopping search for the alternative if it is a physical product (e.g. 'refurbished iPhone 16 Pro'), otherwise an empty string." },
    price: { type: "number", description: "Total price in US dollars if known, otherwise 0." },
    votes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["judge", "vote", "says"],
        properties: {
          judge: { type: "string", enum: JUDGE_IDS },
          vote: VOTE,
          says: { type: "string", description: "What this judge says, under 40 characters." },
        },
      },
    },
  },
};

const SYSTEM = `You are the panel behind "Judgy". A person describes something they are about to buy. Five judges each look at it from one angle and vote buy, wait or walk:

- AC, The Accountant: can they afford it? Total cost with fees and interest, and what it pushes aside.
- FI, The Fraud Investigator: does it match a scam or pressure-sales pattern? Guaranteed returns, DMs, fake deadlines, recruiting.
- BH, The Bargain Hunter: is there a better deal? Last year's model, refurbished, used, free alternatives, a better time to buy.
- SK, The Skeptic: does it do what it claims? Evidence, not testimonials.
- FY, Future You: will they be glad in six months? Need, want, or a bad week?

They may attach photos: an ad, a listing, a product, a price tag, a screenshot of a chat, or still frames from one video. Read them carefully for the product, price, seller and any claims, and use what you see.

Be direct and specific to this exact purchase. The judges are allowed to disagree. The overall verdict follows the score. Never recommend a specific seller. Never guarantee outcomes. This is an opinion to help someone think, not financial, legal or medical advice; if the purchase involves health or large investments, one flag should say to check with a qualified professional. If the text is not a purchase, score it 5, verdict wait, and use the flags to explain what to describe instead.`;

let client;
const anthropic = () => (client ||= new Anthropic());

const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 1_000_000; // base64 characters, about 750 KB per image

export function readImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((d) => typeof d === "string" && d.length > 100 && d.length <= MAX_IMAGE_CHARS && /^[A-Za-z0-9+/]+=*$/.test(d))
    .slice(0, MAX_IMAGES);
}

async function askPanel(text, images, paid) {
  const params = {
    model: paid ? MODEL_PAID : MODEL_FREE,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: paid ? "medium" : "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: [
        ...images.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
        { type: "text", text: text ? `Purchase to judge:\n\n${text}` : "Purchase to judge: it's in the photos. Work out what it is and the price from them." },
      ],
    }],
  };
  if (paid) params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }];

  let msg = await anthropic().messages.create(params);
  // A long web search can pause the turn; resend with the paused content to let it finish
  for (let i = 0; msg.stop_reason === "pause_turn" && i < 3; i++) {
    params.messages = [params.messages[0], { role: "assistant", content: msg.content }];
    msg = await anthropic().messages.create(params);
  }
  if (msg.stop_reason === "refusal") throw new Error("refused");
  if (msg.stop_reason !== "end_turn") throw new Error(`stopped: ${msg.stop_reason}`);
  const textBlock = msg.content.filter((b) => b.type === "text").at(-1);
  const raw = JSON.parse(textBlock?.text || "null");
  if (!raw || typeof raw !== "object") throw new Error("no verdict in reply");
  return normalise(raw);
}

const toVerdict = (s) => (s >= 7 ? "buy" : s >= 4 ? "wait" : "walk");
const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

export function normalise(raw) {
  const score = Math.round(Math.min(10, Math.max(1, Number(raw.score) || 5)) * 2) / 2;
  const byId = new Map((raw.votes || []).map((v) => [v.judge, v]));
  const votes = JUDGE_IDS.map((id) => {
    const v = byId.get(id);
    return { id, vote: ["buy", "wait", "walk"].includes(v?.vote) ? v.vote : toVerdict(score), says: clean(v?.says, 60) };
  });
  return {
    verdict: toVerdict(score),
    score,
    line: clean(raw.line, 90),
    flags: (raw.flags || []).map((f) => clean(f, 220)).filter(Boolean).slice(0, 3),
    alt: clean(raw.alternative, 300),
    altSearch: clean(raw.alternative_search, 80),
    price: Number(raw.price) > 0 ? Number(raw.price) : null,
    votes,
  };
}

export default async function handler(req, res) {
  if (onlyPost(req, res)) return;
  const { text = "", token, images: rawImages } = body(req);
  const purchase = String(text).trim().slice(0, 600);
  const images = readImages(rawImages);
  if (purchase.length < 3 && !images.length) return send(res, 400, { error: "describe_purchase" });
  if (!process.env.ANTHROPIC_API_KEY || !kvEnabled()) return send(res, 503, { fallback: true });

  // Work out which kind of check this is, and claim it before spending anything
  const pass = readToken(token);
  let claimed; // the key to release if the panel fails, so nobody loses a check
  try {
    if (pass?.p === "single") {
      claimed = `used:${pass.jti}`;
      if ((await kv("SET", claimed, "1", "NX", "EX", 60 * 86400)) === null) {
        return send(res, 402, { paywall: true, reason: "used" });
      }
    } else if (pass?.p === "pass") {
      const day = new Date().toISOString().slice(0, 10);
      const count = await kv("INCR", `rate:${pass.jti}:${day}`);
      if (count === 1) await kv("EXPIRE", `rate:${pass.jti}:${day}`, 86400 * 2);
      if (count > PASS_DAILY_LIMIT) return send(res, 429, { error: "daily_limit" });
    } else {
      claimed = `free:${visitorKey(req)}`;
      if ((await kv("SET", claimed, "1", "NX", "EX", 365 * 86400)) === null) {
        return send(res, 402, { paywall: true, reason: "free_used" });
      }
    }
  } catch (err) {
    console.error("verdict access check failed", err);
    return send(res, 503, { fallback: true });
  }

  try {
    const result = await askPanel(purchase, images, Boolean(pass));
    return send(res, 200, { ...result, tier: pass ? pass.p : "free" });
  } catch (err) {
    console.error("panel failed", err);
    if (claimed) await kv("DEL", claimed).catch(() => {});
    return send(res, 503, { fallback: true });
  }
}

// Judgy — site behaviour and the in-browser demo verdict

// What the server has switched on. Filled from /api/config; until then (or on a
// plain static host) everything runs as the in-browser demo.
const CONFIG = { ai: false, payments: false, email: false, amazonTag: "", amazonDomain: "www.amazon.com" };
const TOKEN_KEY = "judgy_access";

document.documentElement.classList.remove("no-js");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);

$("#year").textContent = new Date().getFullYear();

/* ---------- Nav ---------- */
const toggle = $(".nav__toggle");
const links = $("#nav-links");
const setMenu = (open) => {
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  links.classList.toggle("is-open", open);
};
toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
links.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

/* ---------- Cursor glow ---------- */
const glow = $(".glow");
if (window.matchMedia("(pointer: fine)").matches && !reduceMotion) {
  document.documentElement.classList.add("has-pointer");
  let raf = 0;
  window.addEventListener("pointermove", (e) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; });
  });
}

/* ---------- Reveal on scroll ---------- */
const revealables = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("is-in");
      io.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  revealables.forEach((el) => io.observe(el));
} else {
  revealables.forEach((el) => el.classList.add("is-in"));
}

/* ---------- Demo verdict engine ----------
   A quick keyword check that runs in the browser so visitors can feel the
   product. It is labelled as a sample on the page; the real panel researches
   the actual purchase. */

const CATEGORIES = [
  {
    key: "scheme", base: 1.5,
    test: /crypto|bitcoin|forex|trading bot|signals?\b|% ?a (day|week|month)|per day returns|passive income|pyramid|mlm|network marketing|timeshare|vacation club|nft|presale|airdrop/i,
    flags: [
      "Returns this high, this steady, are the classic pattern of a scam.",
      "Test a small withdrawal before anything else. Many of these schemes let money in but not out.",
      "If you’re asked to recruit friends or deposit more to unlock profits, that’s the model, not a bonus.",
    ],
    alt: "A low-cost index fund. Boring, regulated, and nobody DMs you about it.",
    lines: { buy: "Even a scheme can’t get a Buy from us.", wait: "Don’t send a cent until you’ve tested a withdrawal.", walk: "Walk away. This is the scam pattern." },
  },
  {
    key: "course", base: 4,
    test: /course|coaching|coach\b|mentorship|mentor|masterclass|bootcamp|program|academy|blueprint|dropship|amazon fba|seminar/i,
    flags: [
      "Income screenshots usually come from the top few students, not the typical one.",
      "Find the refund policy in writing before you pay, not after.",
      "Much of this is likely free on YouTube, in a library book, or in a free course audit.",
    ],
    alt: "Spend two weeks on free material first. If you’re still doing the work, a $30 book or a $50 course is the next step.",
    lines: { buy: "Worth it if you’ll actually do the work.", wait: "Do two weeks of free material first.", walk: "Walk away. You’re buying the dream, not the skill." },
  },
  {
    key: "car", base: 6,
    test: /\bcar\b|truck|suv|sedan|bmw|audi|mercedes|toyota|honda|tesla|ford|corolla|civic|miles|mileage|dealer/i,
    flags: [
      "Get an independent pre-purchase inspection, roughly $100–$200, before you sign anything.",
      "Pull the vehicle history report and check for accidents and title problems.",
      "Compare the total price including interest, not the monthly payment.",
    ],
    alt: "The same model a year or two older, certified pre-owned, financed through your own bank or credit union.",
    lines: { buy: "Solid buy, once the inspection comes back clean.", wait: "Get it inspected and price the total loan first.", walk: "Walk away. The numbers and the risks don’t add up." },
  },
  {
    key: "home", base: 5,
    test: /mattress|sofa|couch|sectional|bed frame|recliner|furniture|dining table|washing machine|washer|dryer|fridge|refrigerator|dishwasher|oven|appliance/i,
    flags: [
      "Furniture and mattress “sales” run most of the year, so the list price is rarely the real price.",
      "Check the trial period and who pays for a return before you buy.",
      "Measure your space and doorways. Big items are expensive to send back.",
    ],
    alt: "A well-reviewed online brand with a long home trial, often far cheaper than the showroom.",
    lines: { buy: "Good buy for something you use every day.", wait: "Find the real price; this sale will come back.", walk: "Walk away. You’re paying showroom markup." },
  },
  {
    key: "tech", base: 6,
    test: /iphone|phone|samsung|galaxy|pixel|laptop|macbook|ipad|tablet|\btv\b|television|headphones|airpods|camera|console|ps5|playstation|xbox|switch|smart ?watch|smart ring|gpu|graphics card/i,
    flags: [
      "Check when the next model is due. Buying weeks before a launch is the worst timing.",
      "Buy from the maker or an authorised seller so the full warranty applies.",
      "Extended warranties and protection plans are mostly profit for the seller.",
    ],
    alt: "If you want to save, last year’s model or a manufacturer-refurbished unit with a full warranty is often 20–30% less. New is still the safer bet for battery life and the longest software support.",
    lines: { buy: "Good timing and a fair price. Go for it.", wait: "Check if a new model is due before you pay.", walk: "Walk away. Last year’s model does this for less." },
  },
  {
    key: "flex", base: 5,
    test: /sneaker|jordans?|yeezy|designer|handbag|\bbag\b|rolex|watch|gucci|louis vuitton|hype|limited drop|resale/i,
    flags: [
      "Resale prices swing hard. You’re paying for hype that may not last.",
      "Fakes are common secondhand. Only buy authenticated.",
      "Ask yourself honestly: would you still want it if nobody saw it?",
    ],
    alt: "Wait a month and check the price again. If you still want it then, buy it authenticated.",
    lines: { buy: "If you’ll wear it to death, enjoy it.", wait: "Wait a month. If you still want it, buy authenticated.", walk: "Walk away. You’re paying for hype." },
  },
  {
    key: "wellness", base: 4,
    test: /supplement|gummies|vitamin|detox|cleanse|serum|skincare|cream|collagen|peptide|weight loss|fat burner|red light/i,
    flags: [
      "Supplements don’t have to prove they work before they’re sold.",
      "Before-and-after photos and testimonials aren’t evidence.",
      "Look for independent third-party testing on the label.",
    ],
    alt: "Ask a pharmacist or doctor what actually has evidence for your goal. Often it’s the cheap, boring option.",
    lines: { buy: "Reasonable, if it has real evidence behind it.", wait: "Ask for evidence before you pay.", walk: "Walk away. Big claims, no proof." },
  },
  {
    key: "everyday", base: 6.5,
    test: /toothbrush|toothpaste|floss|mouthwash|shampoo|conditioner|soap|razor|deodorant|perfume|cologne|towel|socks|underwear|t-?shirt|jeans|hoodie|jacket|shoes|trainers|backpack|groceries|snack|coffee|kitchen|frying pan|\bpan\b|knife|blender|air fryer|kettle|toaster|charger|cable|phone case|lamp|bedding|pillow|water bottle/i,
    flags: [
      (p) => p ? `At $${p.toLocaleString("en-US")}, find out what the basic, well-reviewed version costs. That gap is what you’re paying for the brand.` : "Check what the basic, well-reviewed version costs. That’s your baseline.",
      "Think cost per use: how often will you actually use it, and for how long?",
      "Read the 1-star reviews. Cheap-feeling build and fast wear show up there first.",
    ],
    alt: "The best-reviewed basic version. Put the difference toward something you’ll actually notice.",
    lines: { buy: "Low stakes, real use. Buy it.", wait: "Fine if you need it, but not at this price.", walk: "Walk away. The basic version does the same job." },
  },
  {
    key: "general", base: 6, test: /.*/,
    flags: [
      "Sleep on it. A 48-hour wait kills most impulse buys.",
      "Read the return policy before you pay.",
      "Search the product name plus “problems” and read the 1-star reviews.",
    ],
    alt: "The same thing used or refurbished, or a cheaper version with most of the features.",
    lines: { buy: "Looks like a sensible buy.", wait: "Compare two alternatives before you tap pay.", walk: "Walk away. It doesn’t earn its price." },
  },
];

const SIGNALS = [
  { test: /today only|limited time|last chance|ends (tonight|today|soon)|only \d+ left|flash sale|act now|expires|countdown|\b\d+% off\b/i, delta: -1.5,
    flag: "The deadline is a sales tactic. Real deals come back." },
  { test: /guarantee|risk[- ]free|can'?t lose|100% (safe|returns?)|no risk|double your/i, delta: -2,
    flag: "“Guaranteed” results are a red flag, not a promise." },
  { test: /\bdm\b|dmed|dm'?d|messaged me|reached out|influencer|instagram|tiktok|telegram|whatsapp/i, delta: -1,
    flag: "It found you through a DM or an influencer. That’s how pressure sales work." },
  { test: /financ|monthly|per month|\/mo\b|a month\b|installments?|klarna|afterpay|affirm|0% apr|0% interest|payment plan/i, delta: -0.75,
    flag: "Paying monthly hides the real price. Look at the total cost." },
  { test: /miracle|ancient|ancestral|secret formula|clinically proven|doctors hate|instant results|whitening|all[- ]natural|100% natural/i, delta: -0.75,
    flag: "Bold claims like “miracle”, “ancient” or “clinically proven” need a source. Ask for it before you pay." },
  { test: /broken|broke|died|dead|stopped working|replace|replacement|for (my )?(work|job|business|school|uni|university|studies)|need (it|one|a)/i, delta: 1.75, good: true },
  { test: /certified|inspected|warranty|trial|return policy|reviews?|4\.\d stars|official store|apple store|authori[sz]ed/i, delta: 0.75, good: true },
];

const JUDGES = [
  { id: "AC", name: "The Accountant", color: "var(--buy)", bias: 0,
    says: { buy: "The numbers work.", wait: "Price it in full first.", walk: "Not with this cost." } },
  { id: "FI", name: "The Fraud Investigator", color: "var(--walk)", bias: 0.5,
    says: { buy: "No scam pattern here.", wait: "Some pressure tactics.", walk: "I’ve seen this one." } },
  { id: "BH", name: "The Bargain Hunter", color: "var(--wait)", bias: -1,
    says: { buy: "Fair price.", wait: "There’s a better deal.", walk: "Way overpriced." } },
  { id: "SK", name: "The Skeptic", color: "var(--lime)", bias: -0.75,
    says: { buy: "Claims check out.", wait: "Prove it first.", walk: "Doesn’t add up." } },
  { id: "FY", name: "Future You", color: "var(--violet)", bias: 0.25,
    says: { buy: "You’ll be glad.", wait: "Ask me in 3 days.", walk: "You’ll regret this." } },
];

const LINES = {
  buy: "Go for it. You did your homework.",
  wait: "Not yet. Give it 72 hours.",
  walk: "Walk away. Your wallet will thank you.",
};
const LABEL = { buy: "Buy", wait: "Wait", walk: "Walk away" };

function parsePrice(text) {
  let best = null;
  // "$24k", "$1,800" or "500 dollars"; a bare "68k" is usually miles, so it's ignored
  // also "45$", "€45", "AED 200" and "200 dirhams" (dirhams converted to dollars)
  const re = /(?:\$|€|£|\baed|\bdhs?)\s?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?|(\d[\d,]*(?:\.\d+)?)\s*(k\b)?\s*(\$|€|£|dollars|usd|bucks|euros?|pounds|aed|dhs?\b|dirhams?)/gi;
  let m;
  while ((m = re.exec(text))) {
    const raw = (m[1] || m[3]).replace(/,/g, "");
    let n = parseFloat(raw);
    if (/k/i.test(m[2] || m[4] || "")) n *= 1000;
    if (/aed|dh|dirham/i.test(m[0])) n = Math.round(n / 3.67);
    if (!Number.isNaN(n) && (best === null || n > best)) best = n;
  }
  return best;
}

// The product words from a description, minus prices and sales talk
function productWords(text) {
  const head = text.replace(/\$\s?[\d,.]+k?/gi, " ").split(/,|\s-\s|\bon\b|\bfor\b|\bwith\b|\d+% off/i)
    .map((part) => part.trim()).find(Boolean) || "";
  return head.replace(/^(a|an|the|my|new)\s+/i, "").split(/\s+/).slice(0, 4).join(" ");
}

const toVerdict = (s) => (s >= 7 ? "buy" : s >= 4 ? "wait" : "walk");
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function judge(text) {
  const cat = CATEGORIES.find((c) => c.test.test(text));
  let score = cat.base;
  const flags = [];
  SIGNALS.forEach((s) => {
    if (!s.test.test(text)) return;
    score += s.delta;
    if (s.flag) flags.push(s.flag);
  });
  const price = parsePrice(text);
  // Low stakes earn some slack; big money needs a stronger case
  if (price !== null) score += price < 60 ? 0.75 : price < 300 ? 0 : price < 2000 ? -0.25 : price < 20000 ? -0.5 : -0.75;
  // No pressure, no financing, no big claims: an ordinary purchase from a normal seller deserves credit
  const clean = !SIGNALS.slice(0, 5).some((sig) => sig.test.test(text));
  if (clean && ["tech", "home", "everyday", "general", "car"].includes(cat.key)) score += 0.75;
  // Everyday items have a cheap baseline, so a premium price needs a reason
  if (cat.key === "everyday" && price !== null && price >= 40) score -= 1.75;
  const has = (re) => re.test(text);
  const urgent = has(SIGNALS[0].test) || has(SIGNALS[2].test);
  const claims = cat.key === "scheme" || cat.key === "course" || cat.key === "wellness" || has(SIGNALS[4].test);
  const need = has(SIGNALS[5].test);
  const tidy = (f) => (typeof f === "function" ? f(price) : f);
  flags.push(tidy(cat.flags[0]));
  if (price === null) flags.push("No price given. Write down the total, fees included, before you decide.");
  cat.flags.slice(1).forEach((f) => flags.push(tidy(f)));
  // A genuine need (something broke) doesn't need a cooling-off period
  if (need) flags.splice(0, flags.length, ...flags.filter((f) => !f.startsWith("Sleep on it")));
  score = Math.round(clamp(score, 1, 9.5) * 2) / 2;
  const verdict = toVerdict(score);
  // Each judge weighs a different risk, so they don't all vote the same way
  const lens = {
    AC: (price ?? 0) >= 2000 ? -0.75 : price !== null && price < 100 ? 0.75 : 0,
    FI: urgent ? -1.5 : cat.key === "scheme" ? -9 : 0.5,
    BH: price !== null && price < 300 ? 0 : -0.75,
    SK: claims ? -1.25 : 0.25,
    FY: need ? 1 : cat.key === "flex" ? -0.75 : 0,
  };
  const votes = JUDGES.map((j) => ({ id: j.id, vote: toVerdict(score + j.bias + lens[j.id]) }));
  // Gadgets: a renewed version of what they typed. Furniture: the same thing, to compare prices.
  const words = productWords(text);
  const altSearch = cat.key === "tech" ? `${words} renewed` : cat.key === "home" ? words : "";
  return { verdict, score, line: cat.lines[verdict], flags: flags.slice(0, 3), alt: cat.alt, altSearch, price, votes };
}


/* ---------- Access (free check, single check, 30-day pass) ---------- */

const store = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } },
  set(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch {} },
};

// The token's payload is readable (the server checks the signature); used only for display
function access() {
  const t = store.get();
  try {
    const p = JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    if (p.exp > Date.now()) return p;
  } catch {}
  return null;
}

const note = $("#demo-note");
function renderNote() {
  const a = access();
  const until = (p) => new Date(p.exp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (!CONFIG.ai) {
    note.textContent = "Live demo: verdicts here come from a quick rule check in your browser. The real panel researches your exact purchase.";
  } else if (a?.p === "pass") {
    note.textContent = `30-day pass active until ${until(a)}. Every check gets the full panel with live price research.`;
  } else if (a?.p === "single") {
    note.textContent = "You have a paid check ready. Type your purchase and it goes to the full panel.";
  } else {
    note.textContent = "Type your purchase or add a photo for a real verdict. Your first one is free. The example buttons show quick samples.";
  }
}

/* ---------- Verdict card ---------- */
const form = $("#demo");
const input = $("#purchase");
const card = $("#vcard");
const deliberate = $("#deliberate");
const list = $("#deliberate-list");
const wage = $("#wage");
const JUDGE_BY_ID = Object.fromEntries(JUDGES.map((j) => [j.id, j]));
let current = { price: 1800 };

function voteColor(v) { return v === "buy" ? "var(--buy)" : v === "wait" ? "var(--wait)" : "var(--walk)"; }
const said = (v) => v.says || JUDGE_BY_ID[v.id].says[v.vote];

function renderHours() {
  const wrap = $("#v-hours-wrap");
  const w = parseFloat(wage.value);
  wrap.hidden = !current.price;
  if (!current.price) return;
  if (!w || w <= 0) { $("#v-hours").textContent = "Enter your hourly pay"; return; }
  const h = current.price / w;
  const txt = h >= 80 ? `≈ ${Math.round(h / 8)} working days` : `≈ ${h < 10 ? h.toFixed(1) : Math.round(h)} hours of work`;
  $("#v-hours").textContent = txt;
}
wage.addEventListener("input", renderHours);

function setRing(score) {
  const C = 2 * Math.PI * 52;
  $("#v-bar").style.strokeDashoffset = String(C * (1 - score / 10));
  $("#v-ring").setAttribute("aria-label", `Score ${score} out of 10`);
}

function countUp(el, to) {
  if (reduceMotion) { el.textContent = String(to); return; }
  const start = performance.now();
  const dur = 900;
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const val = to * (1 - Math.pow(1 - p, 3));
    el.textContent = p < 1 ? val.toFixed(1).replace(/\.0$/, "") : String(to);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Disclosed affiliate link to the cheaper alternative, when it's a product
function renderAltLink(r) {
  const link = $("#v-alt-link");
  const note = $("#v-aff");
  const q = (r.altSearch || "").trim();
  link.hidden = note.hidden = !q;
  if (!q) return;
  const url = new URL(`https://${CONFIG.amazonDomain}/s`);
  url.searchParams.set("k", q);
  if (CONFIG.amazonTag) url.searchParams.set("tag", CONFIG.amazonTag);
  link.href = url.toString();
  link.textContent = `Compare prices: ${q} ↗`;
  note.hidden = !CONFIG.amazonTag;
}

function renderCard(text, r, tag, pics = []) {
  current = { ...r, text };
  card.dataset.verdict = r.verdict;
  $("#v-tag").textContent = tag;
  const label = text || (pics.length > 1 ? `${pics.length} photos` : "Your photo");
  const clipped = label.length > 110 ? label.slice(0, 107).trimEnd() + "…" : label;
  $("#v-item").textContent = text ? `“${clipped}”` : clipped;
  const strip = $("#v-photos");
  strip.hidden = !pics.length;
  strip.replaceChildren(...pics.map((p) => { const img = document.createElement("img"); img.src = p.url; img.alt = ""; return img; }));
  $("#v-stamp").textContent = LABEL[r.verdict];
  $("#v-line").textContent = r.line || LINES[r.verdict];
  $("#v-flags").replaceChildren(...r.flags.map((f) => { const li = document.createElement("li"); li.textContent = f; return li; }));
  $("#v-alt").textContent = r.alt;
  // On a Buy, the flags are checks and the alternative is optional savings, not a reason not to buy
  $("#v-flags-label").textContent = r.verdict === "buy" ? "Check before you pay" : "Top 3 red flags";
  $("#v-alt-label").textContent = r.verdict === "buy" ? "Want to spend less?" : "Cheaper or safer instead";
  renderAltLink(r);

  $("#v-votes").replaceChildren(...r.votes.map((v) => {
    const s = document.createElement("span");
    const i = document.createElement("i");
    i.textContent = v.id;
    i.style.background = voteColor(v.vote);
    s.append(i, document.createTextNode(LABEL[v.vote]));
    s.title = `${JUDGE_BY_ID[v.id].name}: ${said(v)}`;
    return s;
  }));

  setRing(0);
  card.classList.remove("is-new");
  void card.offsetWidth;
  card.classList.add("is-new");
  requestAnimationFrame(() => setRing(r.score));
  countUp($("#v-score"), r.score);
  renderHours();
  $("#share-msg").textContent = "";
}

// Judges "think" until the result arrives, then reveal their votes one by one
async function deliberation(pending) {
  list.replaceChildren();
  const rows = JUDGES.map((j, idx) => {
    const li = document.createElement("li");
    li.style.animationDelay = `${idx * 90}ms`;
    const av = document.createElement("span");
    av.className = "judge__av";
    av.style.background = j.color;
    av.textContent = j.id;
    const p = document.createElement("p");
    const b = document.createElement("b");
    b.textContent = j.name;
    const words = document.createElement("span");
    words.textContent = "Thinking";
    p.append(b, words);
    const state = document.createElement("span");
    state.className = "dots";
    state.innerHTML = "<i></i><i></i><i></i>";
    li.append(av, p, state);
    list.append(li);
    return { id: j.id, words, state };
  });
  const wait = (ms) => new Promise((ok) => setTimeout(ok, reduceMotion ? 0 : ms));
  const [result] = await Promise.all([pending, wait(700)]);
  if (!result.ok) return result;
  const byId = Object.fromEntries(result.r.votes.map((v) => [v.id, v]));
  for (const row of rows) {
    const v = byId[row.id];
    row.words.textContent = said(v);
    const chip = document.createElement("span");
    chip.className = "vote";
    chip.textContent = LABEL[v.vote];
    chip.style.background = voteColor(v.vote);
    chip.style.color = "#0b0b10";
    row.state.replaceWith(chip);
    await wait(380);
  }
  await wait(120);
  return result;
}

// Ask the real panel; anything other than a verdict or a paywall falls back to the demo
async function askPanel(text, pics) {
  try {
    const res = await fetch("/api/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, images: pics.map((p) => p.data), token: store.get() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.verdict) {
      if (data.tier === "single") store.set("");
      return { ok: true, r: data, tag: data.tier === "free" ? "Your free verdict" : "Panel verdict" };
    }
    if (res.status === 402) {
      if (data.reason === "used") store.set("");
      return { ok: false, paywall: true };
    }
    if (res.status === 429) return { ok: false, message: "You’ve hit today’s limit. The panel will be back tomorrow." };
  } catch {}
  return { ok: true, r: judge(text), tag: "Demo verdict" };
}

/* ---------- Photos, screenshots and video frames ---------- */
const MAX_PHOTOS = 4;
let photos = []; // { data: base64 JPEG, url: data URL for thumbnails }
const photoInput = $("#photos");
const thumbs = $("#thumbs");
const mediaMsg = $("#media-msg");

function renderThumbs() {
  thumbs.replaceChildren(...photos.map((p, i) => {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = p.url;
    img.alt = `Photo ${i + 1}`;
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.setAttribute("aria-label", `Remove photo ${i + 1}`);
    x.addEventListener("click", () => { photos.splice(i, 1); renderThumbs(); });
    li.append(img, x);
    return li;
  }));
  mediaMsg.textContent = photos.length >= MAX_PHOTOS ? `Up to ${MAX_PHOTOS} photos.` : "";
}

// Shrinks to at most 1280px on the long side as a JPEG, small enough to send quickly
function toJpeg(source, w, h) {
  const scale = Math.min(1, 1280 / Math.max(w, h));
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  cv.getContext("2d").drawImage(source, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL("image/jpeg", 0.82);
  return { url, data: url.split(",")[1] };
}

function imageToJpeg(file) {
  return new Promise((ok, fail) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(src); ok(toJpeg(img, img.naturalWidth, img.naturalHeight)); };
    img.onerror = () => { URL.revokeObjectURL(src); fail(new Error("unreadable image")); };
    img.src = src;
  });
}

// A video becomes up to 3 still frames from across the clip
function videoToJpegs(file, count) {
  return new Promise((ok, fail) => {
    const v = document.createElement("video");
    const src = URL.createObjectURL(file);
    const frames = [];
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const done = () => { URL.revokeObjectURL(src); frames.length ? ok(frames) : fail(new Error("no frames")); };
    v.onerror = done;
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
      const times = Array.from({ length: count }, (_, i) => (d * (i + 1)) / (count + 1));
      const next = () => {
        if (!times.length) return done();
        v.currentTime = times.shift();
      };
      v.onseeked = () => {
        if (v.videoWidth) frames.push(toJpeg(v, v.videoWidth, v.videoHeight));
        next();
      };
      next();
    };
    v.src = src;
  });
}

async function addFiles(files) {
  for (const file of files) {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) break;
    try {
      if (file.type.startsWith("video/")) {
        mediaMsg.textContent = "Grabbing frames from your video…";
        photos.push(...(await videoToJpegs(file, Math.min(3, room))));
      } else if (file.type.startsWith("image/")) {
        photos.push(await imageToJpeg(file));
      }
    } catch {
      mediaMsg.textContent = "Couldn’t read that file. Try a screenshot instead.";
      continue;
    }
    renderThumbs();
  }
}

photoInput.addEventListener("change", () => { addFiles([...photoInput.files]); photoInput.value = ""; });
input.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) { e.preventDefault(); addFiles(files); }
});

let busy = false;
async function run(text, { example = false, pics = example ? [] : photos } = {}) {
  if (busy) return;
  const value = text.trim();
  if (value.length < 3 && !pics.length) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
    setTimeout(() => input.removeAttribute("aria-invalid"), 600);
    return;
  }
  busy = true;
  const btn = $(".demo__go");
  btn.disabled = true;
  const pending = example || !CONFIG.ai
    ? Promise.resolve({ ok: true, r: judge(value), tag: example ? "Sample verdict" : "Demo verdict" })
    : askPanel(value, pics);
  card.hidden = true;
  deliberate.hidden = false;
  if (window.matchMedia("(max-width: 900px)").matches) {
    deliberate.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }
  const result = await deliberation(pending);
  deliberate.hidden = true;
  card.hidden = false;
  if (result.ok) {
    renderCard(value, result.r, result.tag, pics);
    if (!example) { photos = []; renderThumbs(); }
  } else if (result.paywall) openPaywall("You’ve used your free check. Pick a plan and the panel will take this one.");
  else $("#share-msg").textContent = result.message;
  renderNote();
  btn.disabled = false;
  busy = false;
}

form.addEventListener("submit", (e) => { e.preventDefault(); run(input.value); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(input.value); }
});
document.querySelectorAll("[data-example]").forEach((chip) => {
  chip.addEventListener("click", () => { input.value = chip.dataset.example; run(input.value, { example: true }); });
});

// Initial sample card, filled in by the same engine
renderCard("A $1,800 mattress, 40% off today only", judge("A $1,800 mattress, 40% off today only"), "Sample verdict");

/* ---------- Share and download ---------- */
const shareText = () =>
  `The panel said ${LABEL[card.dataset.verdict].toUpperCase()} (${current.score}/10) on ${$("#v-item").textContent}. Ask before you buy:`;
const pageUrl = () => location.origin + location.pathname;

$("#share").addEventListener("click", async () => {
  const msg = $("#share-msg");
  try {
    if (navigator.share) {
      await navigator.share({ title: "Judgy", text: shareText(), url: pageUrl() });
      return;
    }
    await navigator.clipboard.writeText(`${shareText()} ${pageUrl()}`);
    msg.textContent = "Copied. Paste it anywhere.";
  } catch (err) {
    if (err && err.name === "AbortError") return;
    msg.textContent = "Couldn’t share from this browser.";
  }
});

// Draws the verdict as a 1080×1350 image, the size Instagram and TikTok show best
async function cardImage() {
  const W = 1080, H = 1350, pad = 80;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const col = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const tone = { buy: col("--buy", "#22d27c"), wait: col("--wait", "#ffb21f"), walk: col("--walk", "#ff4152") }[current.verdict];
  const lime = col("--lime", "#d4ff3a");
  try { await document.fonts.ready; } catch {}

  c.fillStyle = "#0b0b10";
  c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W * 0.85, 120, 40, W * 0.85, 120, 700);
  g.addColorStop(0, tone + "55");
  g.addColorStop(1, "#0b0b1000");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  const wrap = (text, x, y, max, lh, maxLines = 4) => {
    const words = text.split(/\s+/);
    let line = "", lines = 0;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (c.measureText(test).width > max && line) {
        if (++lines === maxLines) { c.fillText(line.replace(/\s*\S*$/, "") + "…", x, y); return y + lh; }
        c.fillText(line, x, y); y += lh; line = w;
      } else line = test;
    }
    if (line) { c.fillText(line, x, y); y += lh; }
    return y;
  };

  // Brand
  c.fillStyle = lime;
  c.save(); c.translate(pad + 26, 118); c.rotate(Math.PI / 4); c.fillRect(-22, -22, 44, 44); c.restore();
  c.fillStyle = "#0b0b10"; c.font = "900 30px Unbounded, sans-serif"; c.textAlign = "center"; c.fillText("?", pad + 26, 129);
  c.textAlign = "left"; c.fillStyle = "#f4f4f6"; c.font = "800 34px Unbounded, sans-serif"; c.fillText("Judgy", pad + 72, 130);

  // What they asked
  c.fillStyle = "#b9b9c6"; c.font = "500 40px Inter, sans-serif";
  let y = wrap($("#v-item").textContent, pad, 240, W - pad * 2, 54, 3);

  // Verdict stamp and score
  y += 40;
  c.save(); c.translate(pad, y); c.rotate(-0.05);
  c.strokeStyle = tone; c.lineWidth = 8; c.fillStyle = tone; c.font = "900 92px Unbounded, sans-serif";
  const label = LABEL[current.verdict].toUpperCase();
  const lw = c.measureText(label).width;
  c.strokeRect(-10, -20, lw + 60, 140); c.fillText(label, 20, 90); c.restore();
  c.textAlign = "right"; c.fillStyle = "#f4f4f6"; c.font = "900 140px Unbounded, sans-serif";
  c.fillText(String(current.score), W - pad - 90, y + 110);
  c.fillStyle = "#8a8a99"; c.font = "700 44px Unbounded, sans-serif"; c.fillText("/10", W - pad, y + 110);
  c.textAlign = "left";
  y += 200;
  c.fillStyle = "#f4f4f6"; c.font = "600 42px Inter, sans-serif";
  y = wrap($("#v-line").textContent, pad, y, W - pad * 2, 54, 2) + 30;

  // Red flags
  c.fillStyle = lime; c.font = "700 28px 'JetBrains Mono', monospace"; c.fillText($("#v-flags-label").textContent.toUpperCase(), pad, y); y += 56;
  c.font = "500 34px Inter, sans-serif";
  current.flags.forEach((f, i) => {
    c.fillStyle = tone; c.fillText(`${i + 1}`, pad, y);
    c.fillStyle = "#e4e4ea"; y = wrap(f, pad + 50, y, W - pad * 2 - 50, 46, 2) + 14;
  });

  // Alternative
  y += 16;
  c.fillStyle = lime; c.font = "700 28px 'JetBrains Mono', monospace"; c.fillText($("#v-alt-label").textContent.toUpperCase(), pad, y); y += 56;
  c.fillStyle = "#e4e4ea"; c.font = "500 34px Inter, sans-serif";
  wrap(current.alt, pad, y, W - pad * 2, 46, 3);

  // Footer
  c.fillStyle = lime; c.fillRect(0, H - 120, W, 120);
  c.fillStyle = "#0b0b10"; c.font = "800 38px Unbounded, sans-serif";
  c.fillText("Ask before you buy", pad, H - 48);
  c.textAlign = "right"; c.font = "700 32px 'JetBrains Mono', monospace";
  c.fillText(location.host || "judgy", W - pad, H - 50);

  return new Promise((ok) => cv.toBlob(ok, "image/png"));
}

$("#download").addEventListener("click", async () => {
  const msg = $("#share-msg");
  try {
    const blob = await cardImage();
    const file = new File([blob], `verdict-${current.verdict}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ files: [file], text: shareText(), url: pageUrl() });
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    msg.textContent = "Saved. Post it anywhere.";
  } catch (err) {
    if (err && err.name === "AbortError") return;
    msg.textContent = "Couldn’t make the image in this browser.";
  }
});

/* ---------- Checkout (Ziina) ---------- */
const paywall = $("#paywall");
const payMsg = $("#pay-msg");

function openPaywall(lead) {
  $("#pay-lead").textContent = lead || "Pick a plan and the full panel is yours.";
  payMsg.textContent = CONFIG.payments ? "" : "Checkout opens very soon. Join the list below and we’ll tell you the moment it’s live.";
  if (typeof paywall.showModal === "function") paywall.showModal();
  else paywall.setAttribute("open", "");
}
$("#pay-close").addEventListener("click", () => paywall.close());
paywall.addEventListener("click", (e) => { if (e.target === paywall) paywall.close(); });

async function checkout(plan, btn) {
  if (!CONFIG.payments) { openPaywall(); return; }
  btn.disabled = true;
  payMsg.textContent = "Opening secure checkout…";
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error();
    const keep = (data) => { try { sessionStorage.setItem("judgy_pending", JSON.stringify(data)); return true; } catch { return false; } };
    // Photos can be too big for session storage; then at least keep the text
    keep({ text: input.value.trim(), photos }) || keep({ text: input.value.trim(), photos: [] });
    location.href = data.url;
  } catch {
    payMsg.textContent = "Checkout didn’t open. Try again in a moment.";
    btn.disabled = false;
  }
}
document.querySelectorAll("[data-plan]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!paywall.open && !CONFIG.payments) { openPaywall(); return; }
    checkout(btn.dataset.plan, btn);
  });
});

// Back from Ziina: swap the payment for an access token, then run what they typed before paying
async function redeemReturn() {
  const params = new URLSearchParams(location.search);
  const id = params.get("paid");
  const failed = params.get("payment") === "failed";
  if (!id && !failed) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const msg = $("#share-msg");
  if (failed) { msg.textContent = "The payment didn’t go through. You haven’t been charged."; return; }
  msg.textContent = "Confirming your payment…";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        store.set(data.token);
        renderNote();
        msg.textContent = data.plan === "pass" ? "Your 30-day pass is active. Ask away." : "Your check is ready.";
        let saved = null;
        try { saved = JSON.parse(sessionStorage.getItem("judgy_pending") || "null"); sessionStorage.removeItem("judgy_pending"); } catch {}
        if (saved && (saved.text || saved.photos?.length)) {
          input.value = saved.text || "";
          photos = saved.photos || [];
          renderThumbs();
          run(input.value);
        }
        return;
      }
      if (data.status && !["pending", "requires_user_action", "requires_payment_instrument"].includes(data.status)) break;
    } catch {}
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  msg.textContent = "We couldn’t confirm the payment yet. Refresh in a minute, or email us with your receipt.";
}

/* ---------- Email list ---------- */
const signup = $("#signup");
const smsg = $("#signup-msg");
signup.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = signup.elements.email;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
  email.setAttribute("aria-invalid", String(!ok));
  if (!ok) { smsg.textContent = "That email doesn’t look right."; smsg.className = "signup__msg is-err"; return; }
  if (!CONFIG.email) {
    smsg.textContent = "The list opens at launch. This form isn’t connected yet.";
    smsg.className = "signup__msg is-err";
    return;
  }
  const btn = signup.querySelector("button");
  btn.disabled = true;
  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value.trim() }),
    });
    if (!res.ok) throw new Error(String(res.status));
    signup.reset();
    smsg.textContent = "You’re in. First email lands this week.";
    smsg.className = "signup__msg is-ok";
  } catch {
    smsg.textContent = "That didn’t go through. Try again in a moment.";
    smsg.className = "signup__msg is-err";
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Start ---------- */
// Guide pages link here with ?q= to pre-fill the box
const preset = new URLSearchParams(location.search).get("q");
if (preset) { input.value = preset.slice(0, 220); history.replaceState(null, "", location.pathname + location.hash); }

renderNote();
fetch("/api/config")
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => { if (cfg) Object.assign(CONFIG, cfg); })
  .catch(() => {})
  .finally(() => { renderNote(); renderAltLink(current); redeemReturn(); });

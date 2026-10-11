// Builds the "Should I buy…?" guide pages from content/guides.json.
//   node scripts/build-guides.mjs            → guides/<slug>/index.html + guides/index.html
//   SITE_URL=https://example.com node …      → also sitemap.xml and canonical links
// Re-run after editing the guides and commit the output.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guides = JSON.parse(readFileSync(join(root, "content/guides.json"), "utf8"));
const site = (process.env.SITE_URL || "").replace(/\/+$/, "");
const LABEL = { buy: "Buy", wait: "Wait", walk: "Walk away" };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const page = ({ title, description, path, body, jsonld }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${site ? `<link rel="canonical" href="${site}${path}">` : ""}
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta name="theme-color" content="#0b0b10">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/styles.css">
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
  <header class="nav">
    <div class="wrap nav__inner">
      <a class="brand" href="/" aria-label="Judgy home">
        <span class="brand__mark" aria-hidden="true">?</span>
        <span class="brand__name">Judgy</span>
      </a>
      <a class="btn btn--small btn--lime" href="/#try">Check yours free</a>
    </div>
  </header>
  <main class="guide">
    <div class="wrap guide__wrap">
${body}
    </div>
  </main>
  <footer class="footer">
    <div class="wrap footer__inner">
      <a class="brand" href="/"><span class="brand__mark" aria-hidden="true">?</span><span class="brand__name">Judgy</span></a>
      <p class="fine"><a href="/guides/">All guides</a> · General guidance to help you decide, not financial, legal or medical advice.</p>
    </div>
  </footer>
</body>
</html>
`;

const outDir = join(root, "guides");
if (existsSync(outDir)) rmSync(outDir, { recursive: true });

for (const g of guides) {
  const body = `      <p class="guide__crumbs"><a href="/guides/">Guides</a> / ${esc(g.question)}</p>
      <h1>${esc(g.question)}</h1>
      <div class="guide__verdict v-${g.verdict}">
        <span class="mini__stamp">${LABEL[g.verdict]}</span>
        <span class="guide__score">${g.score}<small>/10</small></span>
        <p class="guide__short">${esc(g.short)}</p>
      </div>
      <p class="guide__fine">The panel’s general take. Your exact price, seller and situation can change the verdict, so check yours below.</p>

      <h2>Top 3 red flags</h2>
      <ol>
${g.flags.map((f) => `        <li>${esc(f)}</li>`).join("\n")}
      </ol>

      <h2>Cheaper or safer instead</h2>
      <p>${esc(g.alt)}</p>

      <h2>Before you pay</h2>
      <ul>
${g.checks.map((c) => `        <li>${esc(c)}</li>`).join("\n")}
      </ul>

      <section class="guide__cta">
        <h2>Get a verdict on your exact one</h2>
        <p>Tell the panel the price, the seller and what they promised. Five judges argue it out and you get Buy, Wait or Walk away in about a minute. Your first check is free.</p>
        <a class="btn btn--lime" href="/?q=${encodeURIComponent(g.q)}#try">Check my purchase</a>
      </section>`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [{ "@type": "Question", name: g.question, acceptedAnswer: { "@type": "Answer", text: g.short } }],
  };
  const dir = join(outDir, g.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), page({
    title: `${g.question} The panel's verdict | Judgy`,
    description: `${LABEL[g.verdict]} (${g.score}/10). ${g.short}`.slice(0, 158),
    path: `/guides/${g.slug}/`,
    body,
    jsonld,
  }));
}

const index = `      <p class="eyebrow">Guides</p>
      <h1>Should I buy…?</h1>
      <p class="lede">Quick verdicts on the purchases people ask about most. For your exact price and seller, ask the panel.</p>
      <ul class="guide-list">
${guides.map((g) => `        <li><a href="/guides/${g.slug}/" class="v-${g.verdict}"><span class="mini__stamp">${LABEL[g.verdict]}</span><b>${esc(g.question)}</b></a></li>`).join("\n")}
      </ul>`;
writeFileSync(join(outDir, "index.html"), page({
  title: "Should I buy…? Guides | Judgy",
  description: "Quick verdicts on common purchases: courses, cars, warranties, phones, crypto bots and more. Buy, Wait or Walk away.",
  path: "/guides/",
  body: index,
}));

const urls = ["/", "/guides/", ...guides.map((g) => `/guides/${g.slug}/`)];
if (site) {
  writeFileSync(join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${site}${u}</loc></url>`).join("\n")}
</urlset>
`);
}
writeFileSync(join(root, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ""}`);

console.log(`Built ${guides.length} guides${site ? " and sitemap.xml" : " (set SITE_URL to also build sitemap.xml)"}`);

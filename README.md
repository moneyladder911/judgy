# Judgy

Describe a purchase and an AI panel gives a verdict card: Buy, Wait or Walk away, a score out of 10, the top 3 red flags and a cheaper alternative. First check free, then $7 per check or $15 for a 30-day pass.

## What's here

| Path | What it is |
|---|---|
| `index.html`, `assets/` | The site. Plain HTML, CSS and JavaScript. |
| `api/` | Vercel serverless routes: `verdict`, `checkout`, `redeem`, `subscribe`, `config`. |
| `guides/` | "Should I buy…?" pages for Google, generated from `content/guides.json`. |
| `content/tiktok-scripts.md` | 30 days of short-video scripts (not deployed). |
| `.env.example` | Every setting, with notes. |

## How it switches on

The site works with no settings at all: verdicts come from a quick rule check in the browser and are labelled "Demo verdict". Each feature turns on when its keys are added in Vercel (Project → Settings → Environment Variables), then redeploy:

| Feature | Needs |
|---|---|
| Real AI verdicts | `ANTHROPIC_API_KEY`, `TOKEN_SECRET`, a key-value store |
| Ziina checkout | `ZIINA_API_KEY`, `TOKEN_SECRET`, a key-value store, `SITE_URL` |
| Email list | a key-value store (or `FORM_ENDPOINT`) |
| Affiliate links | `AMAZON_TAG` (and `AMAZON_DOMAIN` for a non-US store) |

The key-value store is Upstash Redis from the Vercel Marketplace; adding it fills in `KV_REST_API_URL` and `KV_REST_API_TOKEN`. It holds the one-free-check-per-visitor record, which single checks are used, and the email list (Redis hash `emails`).

### How a check is paid for

1. The first check per visitor is free. It uses a small, cheap model with no web search.
2. After that, the page shows the plans. Picking one calls `/api/checkout`, which creates a Ziina payment and sends the buyer to Ziina.
3. Ziina sends them back to `/?paid=<payment id>`. The page calls `/api/redeem`, which asks Ziina whether that payment is completed and how much was paid, then returns a signed access token (single check or 30-day pass). The page keeps it in the browser and re-runs what they typed before paying.
4. Paid checks use the full model with live web search. A single-check token works once; a pass works for 30 days (up to `PASS_DAILY_LIMIT` checks a day).

If the AI call fails, the visitor keeps their check and sees the demo verdict instead.

Prices are charged in AED by default (26 AED ≈ $7, 55 AED ≈ $15); change them with `PRICE_SINGLE`, `PRICE_PASS` and `PRICE_CURRENCY` (amounts in the smallest unit). Ziina has no subscriptions, so the $15 plan is a one-time 30-day pass. Use `ZIINA_TEST=true` to try checkout without real money.

## Guide pages

Edit `content/guides.json`, then:

```sh
SITE_URL=https://your-domain.com npm run guides
```

This rewrites `guides/`, `robots.txt` and (with `SITE_URL`) `sitemap.xml`. Commit the output.

## Run and test locally

```sh
npm install
npm test                    # API routes against fake Anthropic, Ziina and key-value services
python3 -m http.server 8000 # the static site in demo mode
```

`vercel dev` runs the site and the API together with your real keys from a local `.env`.

## Notes

- The example cards and the scrolling ticker on the home page are illustrative, not real customer verdicts.
- Example buttons in the hero always show the quick in-browser sample, so they never use up someone's free check.

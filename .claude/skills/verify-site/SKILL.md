---
name: verify-site
description: Playwright smoke-check the static WireMark site pages before deploy — confirm pages load, carousels initialize, and there are no console errors or broken asset references. Run before committing page/copy changes that affect JS-driven components.
disable-model-invocation: false
---

# Verify the site renders

`npm test` is a broken stub — this skill is the real verification. Playwright is the only dependency.

## Setup

Playwright is installed. Browsers may need `npx playwright install chromium` if not already present.

## Checks

Serve the static root (any static file server, e.g. `python3 -m http.server` or `npx serve`) and run Playwright against it. For each page in [`sitemap.xml`](../../../sitemap.xml) (all 18 live pages) verify:

1. **Loads** — HTTP 200, no navigational timeout.
2. **No console errors** — assert zero `console.error` / uncaught page errors. (`new Swiper(...)` init failures and missing Splite/GSAP pieces surface here.)
3. **Carousels initialize** — the Synex template drives hero/testimonials/team/brands/product-tour/mobile carousels with Swiper 14 and GSAP 3.15 (see `PACKAGES.md`); confirm at least one `.swiper` instance on pages that declare one initializes (no `Error` in console is the primary signal).
4. **Asset integrity** — no 404s for referenced CSS/JS/img (all assets are self-contained under `assets/`, no CDN).

## Target pages that exercise the most JS

- `index.html` / `index-3.html` — hero + `ripple-2` raw-WebGL ripple (`.ripple-image`).
- `index-2.html` — product-tour + GSAP ScrollSmoother.
- `index-5.html` — alternate hero layout.

If any check fails, report the failing page and the console message verbatim, then fix before committing.
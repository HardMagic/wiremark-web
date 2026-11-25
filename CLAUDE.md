# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Static marketing site for **WireMark** (HardMagic), deployed to GitHub Pages at `wiremark.net`. No framework. `wiremark.net` is the only public WireMark surface: it shows features only, and every WireMark app stays on the private network (Ziti) (wiremark/ops#21). Vendor configuration and rationale live in [`PACKAGES.md`](PACKAGES.md); read it before touching `assets/` or adding/removing a vendored package.

## Build, test, deploy

- **Allow-list build, no framework.** `sh scripts/build-site.sh _site` copies only the site files (`*.html`, `assets/`, `CNAME`, `robots.txt`, `sitemap.xml`) into `_site/`; `.github/workflows/pages.yml` publishes `_site/`, never the repo root. A new top-level site file must be added to that script.
- **Public-surface gate.** `node scripts/check-public-surface.mjs _site` fails on a password field or form, an internal hostname, a price, an `app.wiremark.net` link without the private-network note nearby, any other `*.wiremark.net` link, or a Cloudflare `/cdn-cgi/` rewrite (Email Obfuscation, wiremark/ops#20). It runs in GitLab CI (`public-surface` job) and before the GitHub Pages upload; `--live` runs the same rules on every sitemap page as wiremark.net serves it, after each deploy and hourly in `.github/workflows/pages.yml`; `--self-test` checks every rule against `tests/public-surface/`. When you add a rule, add a fixture.
- **Hero idle check.** `node scripts/check-hero-idle.mjs _site` (GitLab CI job `hero-idle`, Playwright image matching `package-lock.json`) loads index-2 and index-3 with software WebGL and fails when an idle `.image-distortion` effect draws a frame, runs code or owns a long task (Long Animation Frames attribution; long tasks of other scripts or of the browser itself are reported, see wiremark/site#6), on a rAF loop that does not stop after hover, and on a canvas under reduced motion or without WebGL (wiremark/site#5). Its windows run with the page's own animation as it is; they also fail when any script asks for frames in a loop, an infinite animation or autoplay carousel runs off screen (or does not run on screen), or anything runs under reduced motion (wiremark/site#6). Bump the `playwright` package and the job's image together.
- **Idle motion.** `assets/js/idle-motion.js` loads right after `main.js` on every page: it pauses infinite animations and carousel autoplay off screen and under reduced motion, and lets GSAP's ticker and ScrollTrigger's `_rafBugFix` loop sleep at scroll rest. A new page that loads `main.js` loads it too. Why each workaround exists: `PACKAGES.md`.
- **`npm test` is a broken stub** (`echo "Error: no test specified" && exit 1`) — do not run it as a test gate. The only real verification is Playwright (only dependency) run against the built/served pages.
- **Deploy is merge-to-main.** CI deploys automatically. There is no preview environment.

## Dist vs. gitignore gotcha (important)

- `dist/` is in `.gitignore`, **but** `dist/visual-sitemap/*` is deliberately force-added and **tracked** — it must survive as a committed artifact.
- After regenerating the visual sitemap, stage it explicitly with `git add -f dist/visual-sitemap/`. A plain `git add .` will silently skip it.

## Sitemap chore (recurring)

`wiremark.net/sitemap.xml` lists all 15 site pages (the 16th, `404.html`, is intentionally excluded) and `/robots.txt` points search engines at it. Keep it in sync whenever you add/rename/remove a page, and regenerate `dist/visual-sitemap/` alongside it — see the `/regenerate-sitemap` skill. The regeneration tooling itself lives outside this repo.

## Content conventions

- Multiple hero variants ship as `index-2.html` … `index-5.html` in addition to `index.html`; all are real pages in the sitemap, not dead files.
- `404.html` is real (used by GitHub Pages) but deliberately omitted from the sitemap — preserve that.
- Site copy changes pair a page edit with a sitemap + visual-sitemap resync (this is the standing chore pattern in git history).
- Features only: no sign-in form, no prices or plans with prices, no customer names, logos, testimonials or placeholder people, no internal hostnames. The gate cannot read text inside images, so check new images by eye. Every link to `https://app.wiremark.net` carries `<small class="wm-private-note">Needs our private network (Ziti)</small>` right after it.
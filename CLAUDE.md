# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Static marketing site for **WireMark** (HardMagic), deployed to GitHub Pages at `wiremark.net`. No framework, no build step — the repo root *is* what gets served. Vendor configuration and rationale live in [`PACKAGES.md`](PACKAGES.md); read it before touching `assets/` or adding/removing a vendored package.

## Build, test, deploy

- **No build step.** Push to `main` → `.github/workflows/pages.yml` uploads the repo root and serves it. There is no local build.
- **`npm test` is a broken stub** (`echo "Error: no test specified" && exit 1`) — do not run it as a test gate. The only real verification is Playwright (only dependency) run against the built/served pages.
- **Deploy is push-to-main.** Update a page → commit → push; CI deploys automatically. There is no preview environment.

## Dist vs. gitignore gotcha (important)

- `dist/` is in `.gitignore`, **but** `dist/visual-sitemap/*` is deliberately force-added and **tracked** — it must survive as a committed artifact.
- After regenerating the visual sitemap, stage it explicitly with `git add -f dist/visual-sitemap/`. A plain `git add .` will silently skip it.

## Sitemap chore (recurring)

`wiremark.net/sitemap.xml` lists all 18 site pages (the 19th, `404.html`, is intentionally excluded) and `/robots.txt` points search engines at it. Keep it in sync whenever you add/rename/remove a page, and regenerate `dist/visual-sitemap/` alongside it — see the `/regenerate-sitemap` skill. The regeneration tooling itself lives outside this repo.

## Content conventions

- Multiple hero variants ship as `index-2.html` … `index-5.html` in addition to `index.html`; all are real pages in the sitemap, not dead files.
- `404.html` is real (used by GitHub Pages) but deliberately omitted from the sitemap — preserve that.
- Site copy/pricing changes pair a page edit with a sitemap + visual-sitemap resync (this is the standing chore pattern in git history).
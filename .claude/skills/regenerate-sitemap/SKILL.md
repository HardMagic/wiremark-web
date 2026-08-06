---
name: regenerate-sitemap
description: Regenerate sitemap.xml and the tracked dist/visual-sitemap artifacts whenever the site page set or copy/pricing changes. Run this after adding, renaming, or removing a page, or after a content/pricing edit that changes what should be indexed.
disable-model-invocation: false
---

# Regenerate sitemap + visual sitemap

The recurring "chore(site): regenerate sitemap + visual sitemap" workflow. Trigger it when:
- a page is added, renamed, or removed, or
- copy/pricing changed in a way that should be reflected in what's indexed,

then commit the artifacts together in one `chore(site): regenerate sitemap + visual sitemap for <what changed>` commit.

## Steps

1. **Update `sitemap.xml`** to list all live pages under `https://wiremark.net/`.
   - Included (18 pages): `about`, `contact`, `faq`, the five `index` variants (`index`, `index-2` … `index-5`), `news`, `news-details`, `news-grid`, `pricing`, `project`, `project-details`, `service`, `service-details`, `team`, `team-details` — all as `.html`.
   - **Excluded:** `404.html` (real page, serves the GitHub Pages 404, but must NOT appear in the sitemap).
   - `<lastmod>` should be bumped for changed pages.
2. **Regenerate the visual sitemap** into `dist/visual-sitemap/`. The regeneration tooling lives **outside this repo** — do not write a build script here. If you don't have the tool, produce/refresh the artifacts it would have (manifest, per-page shot) via the repository's established method and note the source in the commit.
3. **`dist/visual-sitemap/` is tracked despite `dist/` being gitignored.** Stage it explicitly — a plain `git add .` will silently skip it:
   ```bash
   git add sitemap.xml dist/visual-sitemap/
   ```
   Use `git add -f dist/visual-sitemap/` if git refuses due to the ignore rule.
4. Commit with the chore convention: `chore(site): regenerate sitemap + visual sitemap for <what changed>`.

Do not commit a page/content change and the sitemap resync separately — they belong in the same logical change when the trigger is that same edit.
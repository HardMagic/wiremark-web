# WireMark.net — Package & Asset Manifest

This site is a vendored build of the **Synex** SaaS HTML template with every framework
and JS/CSS package raised to its latest stable version. All JS/CSS vendored libraries are
self-contained under `assets/` — no runtime CDN for libraries. **The one external request
is the Google Fonts `@import`** in `assets/css/main.css` (line 20) that loads **Plus Jakarta
Sans** (variable font, wght 200–800, normal + italic, `display=swap` — verified current as
of Aug 2026).

**2026-08 postured up:** dropped jQuery entirely and replaced every abandoned jQuery
plugin with a modern vanilla-JS equivalent. The site now ships **zero jQuery consumer
code** (no abandoned plugins, no `$`), a curated modern framework set (Bootstrap,
Swiper, GSAP, GLightbox, three-free), and first-party IntersectionObserver reveals.

Site build date: 2026-08-05. Posture-up date: 2026-08-06.

---

## Upgrade table

| Package | Shipped version | Notes |
|---|---|---|
| Bootstrap | **5.3.8** | Latest stable (verified npm `latest`). `bootstrap.min.css` + `bootstrap.bundle.min.js` — standalone, no jQuery dependency. |
| Swiper | **14.0.7** | Latest stable (2026-07-28). `swiper-bundle.min.js` + `swiper-bundle.min.css`. All carousels (hero, testimonials, team, brands, product-tour, mobile) verified in headless browser. |
| GSAP + plugins | **3.15.0** | Latest stable. ScrollTrigger, ScrollSmoother, ScrollToPlugin, SplitText, TextPlugin — all free-tier (moved off Club in 3.13). Drives scroll reveals, smooth scrolling, text splits, panel pins. **Replaces the old WOW.js / jQuery reveal role.** |
| Font Awesome | **Free 6.7.2** | Last 6.x (verified). 7.x exists but restructures the icon class system (416 `fa-solid` + 73 `fa-regular` usages) for no visual benefit — deliberate keep, documented. Replaced the template's Pro webfonts with the Free set. |
| **GLightbox** | **3.3.1** | **New** (MIT, vanilla JS, ~11KB gz). Replaces magnific-popup for the live `.video-popup` (index-2) and future `.img-popup` galleries. `glightbox.min.js` + `glightbox.min.css`. The only newly-added dependency. |
| three.js | — (removed) | The template's WebGL hero (`webgl.js`) was **dead code** — class never instantiated, target DOM (`#canvas-slider`, `.slide-img`) doesn't exist on any page. Removed `webgl.js`, `three.core.min.js`, `three.module.min.js` entirely. No r118 or 0.183 code ships. |
| jQuery | **— (removed)** | **Dropped completely.** Every abandoned jQuery plugin was replaced or removed (see below), so no jQuery consumer remains. `main.js` and `distortion-img.js` rewritten to 100% vanilla JS. |

## Replaced / removed jQuery plugins

| Old plugin | Was | Now | Live usage |
|---|---|---|---|
| WOW.js | jQuery scroll-reveal | **IntersectionObserver** (first-party in `main.js`) | 55 `wow animate__fadeInUp` elements, all 19 pages |
| magnific-popup | jQuery lightbox | **GLightbox 3.3.1** | 1 `.video-popup` (index-2); `.img-popup` markup absent (dead) |
| ripple-2.js | jQuery WebGL water-ripple | **removed** | 2 `.ripple-image`, decorative gimmick; bg already set in `main.js` before the old `.ripples()` call — zero visual regression |
| counterup + waypoints | jQuery scroll count-up | **GSAP ScrollTrigger tween** (in `main.js`) | `.count` markup absent on all pages |
| nice-select | jQuery styled `<select>` | **removed** | `.single-select` markup absent on all pages |
| chroma.js | 2019 vendored color lib | **removed** | loaded but never invoked (dead reference) |

## Still-vendored, deliberately kept

| File | Why |
|---|---|
| `bootstrap.bundle.min.js` | Bootstrap's own bundled JS (offcanvas, collapse, etc.) — standalone, no jQuery. |
| `distortion-img-depend.js` | Runtime dependency of the live `distortion-img.js` ES module (WebGL image-distortion on `.image-distortion`). |
| `main.css.map` | Sourcemap for `main.css`; harmless. |

## Notes for the copywriter

- All icon markup renders from the Font Awesome Free set — no Pro-only glyphs.
- The image-distortion WebGL effect and all Swiper carousels / GSAP animations are
  unchanged and in production.
- `assets/img/` photos are untouched.
- The `.wow animate__fadeInUp` + `data-wow-delay` markup is unchanged — the first-party
  IntersectionObserver reveal reads the existing classes, so **editing copy does not
  require touching the reveal logic**.
# WireMark.net — Package & Asset Manifest

This site is a vendored build of the **Synex** SaaS HTML template with every framework
and JS/CSS package raised to its latest stable version. All assets are self-contained
under `assets/` — no external CDN or font requests are made at runtime.

Site build date: 2026-08-05.

---

## Upgrade table

| Package | Shipped version | Previous | Migration notes |
|---|---|---|---|
| Bootstrap | **5.3.8** | 5.3.2 | Drop-in replacement of `assets/css/bootstrap.min.css` + `assets/js/bootstrap.bundle.min.js` (5.3.x minor; no markup changes). |
| Swiper | **14.0.7** | 8.3.2 | Replaced `swiper-bundle.min.js` + `swiper-bundle.min.css`. The theme's init code in `assets/js/main.js` uses the stable `new Swiper(selector, {…})` API (`loop`, `effect: "fade"`, `autoplay`, `navigation`, `pagination`, `breakpoints`), all unchanged across 8→14. All carousels (hero, testimonials, team, brands, product-tour, mobile) verified in headless browser. 14.x also picks up the CVE-2026-27212 fix (fixed upstream in 12.1.2+). |
| GSAP | **3.15.0** | (r118-era bundled) | Replaced `gsap.min.js`, `ScrollTrigger.min.js`, `ScrollSmoother.min.js`, `ScrollToPlugin.min.js`, `SplitText.min.js`, `TextPlugin.min.js` with the official 3.15.0 dist builds. ScrollSmoother + SplitText are free as of GSAP 3.13, so no Club/paid trial watermark. `main.js` API usage (`gsap.registerPlugin`, `gsap.matchMedia`, `ScrollSmoother.create`) is unchanged. |
| Font Awesome | **Free 6.7.2** | Pro 6.0.0 (webfonts) | The template shipped **Pro** webfonts (light/thin/duotone) requiring a paid license. Replaced `assets/css/all.min.css` and the `assets/webfonts/` set with the Font Awesome **Free** 6.7.2 package (fa-solid-900, fa-regular-400, fa-brands-400, fa-v4compatibility; woff2 + ttf). Removed Pro-only glyph files (fa-light-300, fa-thin-100, fa-duotone-900). `assets/css/main.css` referenced the Pro family name `"Font Awesome 6 Pro"` in three accordion-icon rules — rewritten to `"Font Awesome 6 Free"`. **Pro-only icon substituted:** `fa-arrow-up-right` (411 occurrences, a Pro-only glyph not in the Free set) → **`fa-up-right-from-square`** (free solid, canonical up-right external-link arrow) so every icon renders. Font Awesome 7.x exists but was deliberately not adopted: it restructures the icon class system and would require markup changes for no visual benefit; 6.7.2 is the last 6.x and matches the template's class usage. |
| three.js | **0.184.0** (ESM) | r118 (UMD `three.js`) | See "three.js decision" below. |
| jQuery | **3.7.1** (kept) | 3.7.1 | **Deliberate pin.** jQuery 4.0.0 drops legacy APIs that the template's jQuery plugins (nice-select, counterup, waypoints, magnific-popup, ripple-2) rely on; upgrading would break them with no site benefit. 3.7.1 is the final 3.x. |
| animate.css | **4.1.1** | 3.7.2 | Breaking class rename applied across all 19 HTML files: `wow fadeInUp` → `wow animate__fadeInUp` (and `fadeInLeft` / `fadeInRight` / `bounceInUp`). `assets/js/main.js` now inits WOW with `new WOW({ animateClass: "animate__animated" })` so the 4.x `animate__animated` base class is added on reveal. |
| WOW.js | vendored (kept) | vendored | Deprecated but functional; kept as-is. AOS migration was evaluated but would require rewriting every `data-wow-*` attribute and reveal class across 19 pages for equivalent behavior — not worth the churn. Works with animate.css 4.1.1 via the `animateClass` option above. |
| chroma.js | 1.x-era (2019, vendored, kept) | 1.x-era | **Deliberate keep.** `chroma.min.js` is **loaded but never invoked** on any page (dead reference inherited from the template). The latest chroma-js 3.2.0 npm package ships ESM/CJS builds only — its `index.umd.js` is actually a source ESM entry (`import … from './src/…'`) and breaks when loaded as a classic `<script>`. Since nothing calls chroma, the original working UMD build is kept vendored rather than risk a broken module parse. |
| magnific-popup | 1.1.0 (vendored, kept) | 1.1.0 | Abandoned upstream (2018) but fully functional under jQuery 3.7.1; used for `.img-popup` / `.video-popup`. No maintained successor adopted. |
| nice-select | 1.9.39 (vendored, kept) | — | jQuery plugin used for `.single-select`; abandoned upstream, works under jQuery 3.7.1. |
| waypoints | 4.0.1 (vendored, kept) | — | jQuery Waypoints; counterup dependency. |
| counterup | 1.0.0 (vendored, kept) | — | jQuery counter-up plugin; requires waypoints. Abandoned, functional. |
| ripple-2.js | vendored (kept) | — | jQuery `ripples` plugin (self-contained raw-WebGL ripple effect for `.ripple-image`, used on index/index-3). Independent of three.js. |

## three.js decision

The template ships a custom WebGL hero (`assets/js/webgl.js`) against three r118.

**Discovery:** the WebGL hero is **not wired into any page** — `webgl.js` defines a
`WebGL` class that is never instantiated, and its target DOM (`#canvas-slider`,
`.slide-img`, `#showcase-slider-holder`) does not exist in any HTML file. The hero
therefore never rendered even in the stock template.

**Migration performed:** three r118 was upgraded to **0.184.0**. Because three.js
removed its UMD global build after r160, the migration converts the loading model to
ES modules:

- `assets/js/three.module.js` — official `three@0.184.0` ESM build (vendored).
- `assets/js/webgl.js` — rewritten to `import * as THREE from "./three.module.js";`
  (the class body already uses the `THREE.*` API surface: `WebGLRenderer`,
  `PerspectiveCamera`, `TextureLoader`, `ShaderMaterial`, `PlaneGeometry`, `Mesh`,
  `RepeatWrapping`, `Vector4`, all present in the 0.184.0 ESM build).
- All 19 HTML pages: removed the plain `<script src="assets/js/three.js">` tag and
  changed `webgl.js` to `<script type="module" src="assets/js/webgl.js">`.

The module loads with zero console errors in the verified build. Because the hero is
dead code, the class is defined but not executed on any page; the migration is
forward-compatible so the hero can be wired up against modern three if a future
product decision adds it. No r118 code ships.

## Dead-weight removals

Removed (unreferenced in HTML/CSS/JS):

- `assets/css/datepickerboot.css`
- `assets/css/meanmenu.css`
- `assets/js/ajax-mail.js`
- `assets/js/bootstrap-datepicker.js`
- `assets/js/jquery.meanmenu.min.js`
- `assets/js/parallaxie.js`
- `assets/js/split-type.min.js`
- `assets/js/three.js` (old r118 UMD, superseded by `three.module.js`)

**Kept despite the initial removal list:** `assets/js/distortion-img-depend.js` —
it is the runtime dependency of the live `distortion-img.js` ES module
(`import { Renderer, Program, … } from "./distortion-img-depend.js"`), which drives the
`.image-distortion` effect on index / index-2..5 / about. Removing it would break the
module import and produce console errors on every page.

## Notes for the copywriter

- All icon markup already renders from the Font Awesome Free set — no Pro-only glyph
  placeholders remain. If you introduce new icons, stick to Free solid/regular/brands.
- `assets/img/` photos and images are untouched and were not regenerated.
- The hero/slider/carousel DOM classes are stable and will not change if you only edit
  copy text.

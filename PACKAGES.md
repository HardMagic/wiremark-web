# WireMark.net — Package & Asset Manifest

This site is a vendored build of the **Synex** SaaS HTML template with every framework
and JS/CSS package raised to its latest stable version. All JS/CSS vendored libraries are
self-contained under `assets/` — no runtime CDN for libraries or fonts. **Plus Jakarta Sans is self-hosted** (variable font, wght 200-800, normal + italic,
`display=swap`, the same files and `unicode-range` subsets Google Fonts serves, as `assets/webfonts/plus-jakarta-sans-*.woff2`,
declared at the top of `assets/css/main.css`; verified current as of Aug 2026).

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
| Font Awesome | **Free 6.7.2** | Last 6.x (verified). 7.x exists but restructures the icon class system (416 `fa-solid` + 73 `fa-regular` usages) for no visual benefit — deliberate keep, documented. Replaced the template's Pro webfonts with the Free set. **`fa-solid-900.woff2` and `fa-regular-400.woff2` are subsets** with only the glyphs the pages use (the full fonts remain as the `.ttf` files, which browsers never load). Not built in CI: the subsets are committed, made and regenerated as in [Font Awesome subset](#font-awesome-subset) below. |
| **GLightbox** | **3.3.1** | **New** (MIT, vanilla JS, ~11KB gz). Replaces magnific-popup for the live `.video-popup` (index-2) and future `.img-popup` galleries. `glightbox.min.js` + `glightbox.min.css`. The only newly-added dependency. |
| three.js | — (removed) | The template's WebGL hero (`webgl.js`) was **dead code** — class never instantiated, target DOM (`#canvas-slider`, `.slide-img`) doesn't exist on any page. Removed `webgl.js`, `three.core.min.js`, `three.module.min.js` entirely. No r118 or 0.183 code ships. |
| jQuery | **— (removed)** | **Dropped completely.** Every abandoned jQuery plugin was replaced or removed (see below), so no jQuery consumer remains. `main.js` and `distortion-img.js` rewritten to 100% vanilla JS. |

## Font Awesome subset

`assets/css/all.min.css` (Font Awesome Free 6.7.2, unchanged) declares every Font Awesome face with the
`.woff2` first and the `.ttf` as fallback, so browsers load only the `.woff2` files. Two of them are
subsets committed to git; nothing builds them, and `scripts/build-site.sh` copies them as they are:

| File | Glyphs | Source |
|---|---|---|
| `assets/webfonts/fa-solid-900.woff2` | the codepoints below | `assets/webfonts/fa-solid-900.ttf` (full Free font) |
| `assets/webfonts/fa-regular-400.woff2` | the codepoints below the regular face has | `assets/webfonts/fa-regular-400.ttf` (full Free font) |

`fa-brands-400.woff2` and `fa-v4compatibility.woff2` are the stock Free files.

**How it was made (2026-11, wiremark/site performance pass).** The codepoint set is the union of:

1. every `fa-*` class in a `class="…"` attribute of a top-level `*.html` page or `assets/js/main.js`, mapped
   to its codepoint through the `.fa-<name>{--fa:"\\<hex>"}` rules of `all.min.css` (the style classes
   `fa-solid`, `fa-regular`, `fa-brands` have none);
2. `fa-chevron-up` and `fa-chevron-down`, which `main.js` toggles at runtime;
3. U+002B, U+F068 and U+F00D, the `::before` content of the accordion plus/minus and close rules in
   `assets/css/main.css`.

Both fonts were subset to that set as WOFF2 with every OpenType layout feature kept, hinting dropped and the
`.notdef` outline kept (Chrome draws it for an icon the face lacks, as for the `fa-regular` icons the Free
regular font does not ship). This was a fonttools script until wiremark/site#9 removed it
(wiremark/ops#6: no Python in the Wiremark group). The set today, 16 codepoints for 15 classes
(`fa-arrow-left/right/up`, `fa-check`, `fa-chevron-down/left/right/up`, `fa-circle-check`, `fa-envelope`,
`fa-house`, `fa-plus`, `fa-star`, `fa-times`, `fa-up-right-from-square`):

```
U+002B,U+F005,U+F00C,U+F00D,U+F015,U+F053,U+F054,U+F058,U+F060,U+F061,U+F062,U+F068,U+F077,U+F078,U+F0E0,U+F35D
```

**Regenerate it** when a page or `main.js` starts using an icon outside that set (an icon missing from the
subset renders as an empty box). The tools are HarfBuzz `hb-subset` and Google's `woff2_compress`, both C
(Debian/Ubuntu: `apt install libharfbuzz-bin woff2`; no Python, no fonttools):

```sh
# 1. Icon classes in use (add fa-chevron-up/down; ignore fa-solid/fa-regular/fa-brands).
grep -ohE "class\s*=\s*[\"'][^\"']*[\"']" *.html assets/js/main.js | grep -oE '\bfa-[a-z0-9-]+' | sort -u
# 2. Codepoint of a class, e.g. fa-house -> "\f015" (a one-character value is the character itself).
grep -oE '(\.fa-[a-z0-9-]+,)*\.fa-house[,{][^}]*\}' assets/css/all.min.css
# 3. Subset both fonts to the old set plus the new codepoints.
U='U+002B,U+F005,U+F00C,U+F00D,U+F015,U+F053,U+F054,U+F058,U+F060,U+F061,U+F062,U+F068,U+F077,U+F078,U+F0E0,U+F35D'
tmp=$(mktemp -d)
for f in fa-solid-900 fa-regular-400; do
  hb-subset "assets/webfonts/$f.ttf" --unicodes="$U" --layout-features='*' --no-hinting --notdef-outline \
    --output-file="$tmp/$f.ttf"
  woff2_compress "$tmp/$f.ttf"            # writes $tmp/$f.woff2
  cp "$tmp/$f.woff2" assets/webfonts/
done
```

Then update the set above in this file, and check the new icon renders on its page (`/verify-site`).

## Replaced / removed jQuery plugins

| Old plugin | Was | Now | Live usage |
|---|---|---|---|
| WOW.js | jQuery scroll-reveal | **IntersectionObserver** (first-party in `main.js`) | 55 `wow animate__fadeInUp` elements, all 16 pages |
| magnific-popup | jQuery lightbox | **GLightbox 3.3.1** | 1 `.video-popup` (index-2); `.img-popup` markup absent (dead) |
| ripple-2.js | jQuery WebGL water-ripple | **removed** | 2 `.ripple-image`, decorative gimmick; bg already set in `main.js` before the old `.ripples()` call — zero visual regression |
| counterup + waypoints | jQuery scroll count-up | **GSAP ScrollTrigger tween** (in `main.js`) | `.count` markup absent on all pages |
| nice-select | jQuery styled `<select>` | **removed** | `.single-select` markup absent on all pages |
| chroma.js | 2019 vendored color lib | **removed** | loaded but never invoked (dead reference) |

## Still-vendored, deliberately kept

| File | Why |
|---|---|
| `bootstrap.bundle.min.js` | Bootstrap's own bundled JS (offcanvas, collapse, etc.) — standalone, no jQuery. |
| `distortion-img-depend.js` | Runtime dependency of the live `distortion-img.js` ES module (WebGL image-distortion on `.image-distortion`). Since wiremark/site#5 `distortion-img.js` draws on demand: once when the image loads, then only while the flow settles after pointer movement; it starts near the viewport, pauses off screen, uses a 128 Flowmap (OGL default) and shows the plain background with `prefers-reduced-motion` or without WebGL. `scripts/check-hero-idle.mjs` proves it in CI (`hero-idle`). |
| `main.css.map` | Sourcemap for `main.css`; harmless. |

## First-party idle motion (`assets/js/idle-motion.js`)

No new dependency: a small vanilla script, loaded right after `main.js` by every page, that lets a page stop
producing frames when nothing on it moves (wiremark/site#6). It works around three behaviours of the vendored
packages above without patching them, so upgrading them stays a file swap:

| Package behaviour | What idle-motion does |
|---|---|
| Infinite CSS keyframes (`cir36`, marquees, `bounce-x`, `float-bob`, `ShapeAnim`, `scroll`) run whether or not they can be seen. | Pauses each one while its element is off screen (IntersectionObserver, `Animation.pause()`/`play()`), and all of them, on their first frame, under `prefers-reduced-motion`. On screen with motion allowed nothing changes. The marquees in `main.css` move with `transform` rather than `left`/`right`, which laid out the page every frame. |
| **Swiper 14** autoplay keeps a `requestAnimationFrame` loop running for as long as it plays, only to emit `autoplayTimeLeft` (unused here). | Stops Swiper's autoplay and advances the carousel on a timer instead (same `delay` or slide `data-swiper-autoplay`, `slideNext()` at the configured `speed`, restarted after every slide change), only while the carousel is on screen and not under reduced motion. The carousel shows `data-idle-autoplay="on\|off"`. |
| **ScrollTrigger 3.15** starts `_rafBugFix`, a `requestAnimationFrame` that re-requests itself for the life of the page (a Firefox repaint workaround); only `ScrollTrigger.disable()`, which undoes every trigger, stops it. GSAP's ticker also ticks while anything is scheduled. | When the scroll has been at rest for 800 ms and no top-level GSAP animation is running or waiting, puts `gsap.ticker` to sleep and parks `_rafBugFix` (it wraps `window.requestAnimationFrame` and holds only the callback of that name). Scroll, wheel, touch, pointer-down, keys and resize wake both; GSAP wakes its ticker itself for any new tween. |

`scripts/check-hero-idle.mjs` (CI job `hero-idle`) proves it on index-2 and index-3 without pausing anything
itself: in every idle window no callback asks for frames in a loop, off-screen infinite animations and carousels are
paused, on-screen ones run, and under reduced motion none run. **After upgrading GSAP or Swiper**, read that job:
a renamed `_rafBugFix` or a new autoplay API shows there as a frame loop or a carousel that does not move.

## Notes for the copywriter

- All icon markup renders from the Font Awesome Free set — no Pro-only glyphs.
- The image-distortion WebGL effect and all Swiper carousels / GSAP animations are
  unchanged and in production.
- `assets/img/` photos are untouched.
- The `.wow animate__fadeInUp` + `data-wow-delay` markup is unchanged — the first-party
  IntersectionObserver reveal reads the existing classes, so **editing copy does not
  require touching the reveal logic**.
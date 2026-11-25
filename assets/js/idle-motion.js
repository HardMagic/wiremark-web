/* =========================================================
   Idle motion (wiremark/site#6)

   Lets a page stop producing frames when nothing on it moves:
   1. Infinite decorative CSS/Web animations (marquees, rotating stars,
      floating shapes) run only while their element is on screen, and not at
      all under prefers-reduced-motion (they rest on their first frame).
   2. Swiper carousels autoplay only while on screen, and not under
      prefers-reduced-motion (their arrows and dots still work), on a timer
      rather than Swiper's own autoplay, which asks for every frame.
   3. While the scroll is at rest and no GSAP animation is active, GSAP's
      ticker sleeps and ScrollTrigger's _rafBugFix loop is parked.
      ScrollTrigger 3.15 keeps that loop (a requestAnimationFrame that
      re-requests itself, a Firefox repaint workaround) running for the life
      of the page; only ScrollTrigger.disable() stops it, which would undo
      every trigger. Scrolling, wheel, touch, keys and resizing wake both;
      GSAP wakes its ticker by itself for any new tween.
   Nothing changes for an animation that is on screen with motion allowed.

   Load after main.js (classic script, end of body). No dependencies; GSAP
   and Swiper are used only when the page has them.
   scripts/check-hero-idle.mjs proves it in CI (hero-idle job).
========================================================= */
(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Time after the last input before the scroll counts as at rest.
    var REST_AFTER_MS = 800;
    // While a GSAP animation or the smooth scroller is still moving, check again after this.
    var BUSY_RECHECK_MS = 250;

    if (!("IntersectionObserver" in window)) return;

    // Element -> whether it intersects the viewport, as IntersectionObserver last said.
    var onScreen = new WeakMap();

    /* ---------- 1. Infinite CSS/Web animations ---------- */

    // Animations this module paused, so it resumes only those.
    var paused = new Set();
    var watchedTargets = new WeakSet();

    function isInfinite(animation) {
        var effect = animation.effect;
        return !!(effect && effect.getTiming && effect.getTiming().iterations === Infinity && effect.target);
    }

    function infiniteAnimationsOf(element) {
        return document.getAnimations().filter(function (a) {
            return isInfinite(a) && a.effect.target === element;
        });
    }

    function applyAnimation(animation) {
        if (animation.playState === "idle") { // cancelled, e.g. its class went away
            paused.delete(animation);
            return;
        }
        var run = !reduceMotion.matches && onScreen.get(animation.effect.target) === true;
        if (run) {
            if (paused.has(animation)) {
                paused.delete(animation);
                animation.play();
            }
        } else if (animation.playState === "running") {
            animation.pause();
            // Reduced motion: rest on the first frame rather than wherever it stopped.
            if (reduceMotion.matches) animation.currentTime = 0;
            paused.add(animation);
        }
    }

    var animationObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            onScreen.set(entry.target, entry.isIntersecting);
            infiniteAnimationsOf(entry.target).forEach(applyAnimation);
        });
    });

    function watchAnimation(animation) {
        var target = animation.effect.target;
        if (onScreen.has(target)) applyAnimation(animation);
        else if (reduceMotion.matches) applyAnimation(animation); // no need to wait for the observer
        if (!watchedTargets.has(target)) {
            watchedTargets.add(target);
            animationObserver.observe(target);
        }
    }

    function scanAnimations() {
        document.getAnimations().filter(isInfinite).forEach(watchAnimation);
    }

    /* ---------- 2. Swiper autoplay ---------- */

    // Swiper 14's own autoplay runs a requestAnimationFrame loop for as long as
    // it plays, only to report autoplayTimeLeft, which nothing here uses. So
    // carousels autoplay on a timer instead: the same delay (or a slide's
    // data-swiper-autoplay), the same slideNext and speed, restarted after
    // every slide change, the user's included (disableOnInteraction: false).
    // The carousel element says data-idle-autoplay="on" or "off".
    var carousels = [];

    function Autoplay(swiper) {
        var params = swiper.params.autoplay;
        var timer = 0;
        var running = false;

        function delay() {
            var slide = swiper.slides && swiper.slides[swiper.activeIndex];
            var own = slide && parseInt(slide.getAttribute("data-swiper-autoplay"), 10);
            return own > 0 ? own : (params.delay || 3000);
        }

        function schedule() {
            if (timer) window.clearTimeout(timer);
            timer = running ? window.setTimeout(advance, delay()) : 0;
        }

        function advance() {
            timer = 0;
            if (!running || swiper.destroyed) return;
            var moved;
            if (swiper.isEnd && !swiper.params.loop && !swiper.params.rewind) moved = swiper.slideTo(0);
            else moved = swiper.slideNext();
            // No transition (nothing to move to): try again after the delay.
            if (!moved) schedule();
        }

        swiper.on("slideChangeTransitionEnd", schedule);
        if (swiper.autoplay && swiper.autoplay.running) swiper.autoplay.stop();

        return {
            swiper: swiper,
            set: function (run) {
                if (run === running) return;
                running = run;
                swiper.el.dataset.idleAutoplay = run ? "on" : "off";
                schedule();
            }
        };
    }

    function applyCarousel(carousel) {
        if (carousel.swiper.destroyed) return carousel.set(false);
        carousel.set(!reduceMotion.matches && onScreen.get(carousel.swiper.el) === true);
    }

    var carouselObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            onScreen.set(entry.target, entry.isIntersecting);
            carousels.forEach(function (carousel) {
                if (carousel.swiper.el === entry.target) applyCarousel(carousel);
            });
        });
    });

    function scanCarousels() {
        document.querySelectorAll(".swiper, .swiper-container").forEach(function (el) {
            var swiper = el.swiper;
            var params = swiper && swiper.params && swiper.params.autoplay;
            if (!params || !params.enabled || el.dataset.idleAutoplay) return;
            var carousel = Autoplay(swiper);
            carousels.push(carousel);
            carousel.set(false);
            carouselObserver.observe(el);
        });
    }

    /* ---------- 3. GSAP ticker and ScrollTrigger's _rafBugFix at rest ---------- */

    function restWhenIdle(gsap) {
        var requestFrame = window.requestAnimationFrame;
        var resting = false;
        var parkedLoop = null;
        var restTimer = 0;

        // ScrollTrigger re-requests _rafBugFix through the global
        // requestAnimationFrame on every frame; while resting, keep it instead.
        // Every other callback passes through untouched.
        window.requestAnimationFrame = function requestAnimationFrame(callback) {
            if (resting && typeof callback === "function" && callback.name === "_rafBugFix") {
                parkedLoop = callback;
                return 0;
            }
            return requestFrame.call(window, callback);
        };

        function moving() {
            var Smoother = window.ScrollSmoother;
            var smoother = Smoother && Smoother.get && Smoother.get();
            if (smoother && Math.abs(smoother.getVelocity()) > 0.01) return true;
            // As GSAP's own autoSleep: any top-level tween or timeline that is
            // neither paused nor finished, a delayed one waiting to start included.
            return gsap.globalTimeline.getChildren(false, true, true).some(function (animation) {
                return !animation.paused() && animation.totalProgress() < 1;
            });
        }

        function rest() {
            restTimer = 0;
            if (moving()) {
                restTimer = window.setTimeout(rest, BUSY_RECHECK_MS);
                return;
            }
            resting = true;
            gsap.ticker.sleep();
        }

        function wake() {
            if (resting) {
                resting = false;
                gsap.ticker.wake();
                if (parkedLoop) {
                    var loop = parkedLoop;
                    parkedLoop = null;
                    requestFrame.call(window, loop);
                }
            }
            if (restTimer) window.clearTimeout(restTimer);
            restTimer = window.setTimeout(rest, REST_AFTER_MS);
        }

        var passive = { passive: true, capture: true };
        ["scroll", "wheel", "touchstart", "touchmove", "pointerdown", "keydown"].forEach(function (type) {
            window.addEventListener(type, wake, passive);
        });
        window.addEventListener("resize", wake, passive);
        wake();
    }

    /* ---------- Start ---------- */

    function start() {
        scanAnimations();
        scanCarousels();
        // CSS animations that start later (a class added on scroll or hover).
        document.addEventListener("animationstart", function (event) {
            infiniteAnimationsOf(event.target).forEach(watchAnimation);
        }, true);
        var onMotionChange = function () {
            document.getAnimations().filter(isInfinite).forEach(applyAnimation);
            paused.forEach(applyAnimation);
            carousels.forEach(applyCarousel);
        };
        if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", onMotionChange);
        else if (reduceMotion.addListener) reduceMotion.addListener(onMotionChange);
        if (window.gsap && window.gsap.ticker && window.gsap.globalTimeline) restWhenIdle(window.gsap);
        document.documentElement.dataset.idleMotion = "on";
    }

    // main.js builds the carousels on DOMContentLoaded; this file loads after
    // it, so its own listener runs after main.js's.
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();

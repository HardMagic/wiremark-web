(function () {
    "use strict";

    /* =========================================================
       Tiny vanilla query/utility helpers (replaces jQuery)
    ========================================================= */
    function $(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }
    function find(el, selector) { return Array.prototype.slice.call(el.querySelectorAll(selector)); }
    function onEach(nodes, eventName, handler) { nodes.forEach(function (n) { n.addEventListener(eventName, handler); }); }
    function addClass(el, cls) { el.classList.add(cls); }
    function removeClass(el, cls) { el.classList.remove(cls); }

    /* Height-animation helper (replaces jQuery slideUp / slideDown / slideToggle).
       Works with the CSS `height`/`overflow` model used by the accordion + mobile menu. */
    function slide(el, show) {
        if (!el || el.dataset.sliding) return;
        // capture final height before we touch anything
        el.style.display = "block";
        var fullHeight = el.scrollHeight;
        // if there is genuinely nothing to show
        if (fullHeight <= 0 && !el.children.length) { el.style.display = ""; return; }

        el.dataset.sliding = "1";
        el.style.overflow = "hidden";
        el.style.transition = "height 0.3s ease";
        el.style.height = el.scrollHeight + "px";

        // force reflow so the browser registers the open height before collapsing
        void el.offsetHeight;

        if (!show) {
            el.style.height = "0px";
            window.setTimeout(function () {
                el.style.display = "none";
                el.style.height = "";
                el.style.overflow = "";
                delete el.dataset.sliding;
            }, 300);
        } else {
            el.style.height = fullHeight + "px";
            window.setTimeout(function () {
                el.style.height = "auto";
                el.style.overflow = "";
                delete el.dataset.sliding;
            }, 300);
        }
    }
    function slideToggle(el) {
        var visible = el.offsetHeight > 0 && getComputedStyle(el).display !== "none";
        slide(el, !visible);
    }

    document.addEventListener("DOMContentLoaded", function () {

        /* =========================================================
        MOBILE MENU OPEN
        ========================================================= */
        $(".mobile-topbar .bars").forEach(function (btn) {
            btn.addEventListener("click", function (e) {
                $(".mobile-menu-overlay, .mobile-menu-main").forEach(function (n) { addClass(n, "active"); });
                addClass(document.body, "no-scroll");
                e.preventDefault();
            });
        });

        /* =========================================================
        MOBILE MENU CLOSE
        ========================================================= */
        onEach($(".close-mobile-menu, .mobile-menu-overlay"), "click", function () {
            $(".mobile-menu-overlay, .mobile-menu-main").forEach(function (n) { removeClass(n, "active"); });
            removeClass(document.body, "no-scroll");
            // reset all menus
            $(".sub-mobile-menu ul, .sub-child-menu ul").forEach(function (n) { slide(n, false); });
            // reset icons
            $(".sub-mobile-menu i, .sub-child-menu i").forEach(function (n) {
                removeClass(n, "fa-chevron-up");
                addClass(n, "fa-chevron-down");
            });
        });

        /* =========================================================
        MOBILE SUB MENU INITIAL STATE
        ========================================================= */
        $(".sub-mobile-menu > ul, .sub-child-menu > ul").forEach(function (n) { n.style.display = "none"; });

        /* =========================================================
        LEVEL 1 MENU
        ========================================================= */
        $(".sub-mobile-menu > a").forEach(function (link) {
            link.addEventListener("click", function (e) {
                var parent = link.parentElement;
                var submenu = parent.querySelector(":scope > ul");
                if (!submenu || submenu.children.length === 0) return;
                e.preventDefault();
                e.stopPropagation();
                // close other level-1 menus
                $(".sub-mobile-menu").forEach(function (p) {
                    if (p !== parent) {
                        var u = p.querySelector(":scope > ul");
                        if (u) slide(u, false);
                    }
                });
                // also close level-2 menus
                $(".sub-child-menu > ul").forEach(function (u) { slide(u, false); });
                slideToggle(submenu);
                // reset icons
                $(".sub-mobile-menu > a i, .sub-child-menu > a i").forEach(function (n) {
                    removeClass(n, "fa-chevron-up");
                    addClass(n, "fa-chevron-down");
                });
                var icon = link.querySelector("i");
                if (icon) icon.classList.toggle("fa-chevron-up");
            });
        });

        /* =========================================================
        LEVEL 2 MENU
        ========================================================= */
        $(".sub-child-menu > a").forEach(function (link) {
            link.addEventListener("click", function (e) {
                var parent = link.parentElement;
                var submenu = parent.querySelector(":scope > ul");
                if (!submenu || submenu.children.length === 0) return;
                e.preventDefault();
                e.stopPropagation();
                // close sibling level-2 menus
                $(".sub-child-menu").forEach(function (p) {
                    if (p !== parent) {
                        var u = p.querySelector(":scope > ul");
                        if (u) slide(u, false);
                    }
                });
                slideToggle(submenu);
                // reset sibling icons
                $(".sub-child-menu i").forEach(function (n) {
                    removeClass(n, "fa-chevron-up");
                    addClass(n, "fa-chevron-down");
                });
                var icon = link.querySelector("i");
                if (icon) icon.classList.toggle("fa-chevron-up");
            });
        });

        /* =========================================================
        OFFCANVAS MENU
        ========================================================= */
        $(".offcanvas-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                $(".offcanvas-menu, .offcanvas-overlay").forEach(function (n) { addClass(n, "active"); });
                addClass(document.body, "no-scroll");
            });
        });

        $(".offcanvas-overlay, .offcasvas-close").forEach(function (btn) {
            btn.addEventListener("click", function () {
                $(".offcanvas-menu, .offcanvas-overlay").forEach(function (n) { removeClass(n, "active"); });
                removeClass(document.body, "no-scroll");
            });
        });

        /* =========================================================
        STICKY HEADER (FINAL FIX)
        ========================================================= */
        window.addEventListener("scroll", function () {
            var scroll = window.scrollY;
            // Mobile OR Offcanvas open -> sticky completely disabled
            if (
                document.querySelector(".mobile-menu-overlay.active") ||
                document.querySelector(".offcanvas-overlay.active")
            ) {
                return;
            }
            var header = document.getElementById("sticky-header");
            var spacer = document.getElementById("header-fixed-height");
            if (!header || !spacer) return;
            if (scroll < 120) {
                removeClass(header, "sticky-menu");
                removeClass(spacer, "active-height");
            } else {
                addClass(header, "sticky-menu");
                addClass(spacer, "active-height");
            }
        });

        /*----------------------------------------------
            # Background Color
        ----------------------------------------------*/
        $("[data-bg-color]").forEach(function (el) {
            el.style.backgroundColor = el.getAttribute("data-bg-color");
        });

        /*----------------------------------------------
            # Background Image
        ----------------------------------------------*/
        $("[data-background]").forEach(function (el) {
            el.style.backgroundImage = "url(" + el.getAttribute("data-background") + ")";
        });

        /*----------------------------------------------
            # Width
        ----------------------------------------------*/
        $("[data-width]").forEach(function (el) {
            el.style.width = el.getAttribute("data-width");
        });

        /*----------------------------------------------
            # Text Color
        ----------------------------------------------*/
        $("[data-text-color]").forEach(function (el) {
            el.style.color = el.getAttribute("data-text-color");
        });

        /* ================================
        Lightbox Js Start (replaces Magnific Popup)
        ====================== ========== */
        if (typeof GLightbox !== "undefined") {
            GLightbox({ selector: ".img-popup", touchNavigation: true, loop: true });
            GLightbox({ selector: ".video-popup" });
        }

        /* ================================
        Counter-up Js Start (GSAP ScrollTrigger count-up)
        ================================ */
        document.querySelectorAll(".count").forEach(function (el) {
            var target = parseFloat(el.textContent.replace(/[^0-9.-]/g, "")) || 0;
            if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
            var counter = { val: 0 };
            gsap.to(counter, {
                val: target,
                duration: 4,
                ease: "power1.out",
                scrollTrigger: { trigger: el, start: "top 85%", once: true },
                onUpdate: function () {
                    el.innerText = Math.floor(counter.val).toLocaleString();
                }
            });
        });

        /* ================================
        Wow Animation Js — IntersectionObserver reveal
        ================================ */
        var wowEls = $(".wow");
        if ("IntersectionObserver" in window && wowEls.length) {
            var wowObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var el = entry.target;
                    // derive the actual animate.css animation class already on the element
                    var anim = null;
                    Array.prototype.forEach.call(el.classList, function (c) {
                        if (/^animate__/.test(c)) anim = c;
                    });
                    el.style.animationDelay = el.getAttribute("data-wow-delay") || "";
                    el.style.visibility = "visible";
                    if (anim) el.classList.add(anim);
                    wowObserver.unobserve(el);
                });
            }, { threshold: 0.15 });
            wowEls.forEach(function (el) { wowObserver.observe(el); });
        } else {
            // fallback: show everything immediately
            $(".wow").forEach(function (el) { el.style.visibility = "visible"; });
        }

        /* ================================
        Hover Active Js Start
        ================================ */
        $(".service-card-items-two").forEach(function (card) {
            card.addEventListener("mouseenter", function () {
                $(".service-card-items-two").forEach(function (c) { removeClass(c, "active"); });
                addClass(card, "active");
            });
        });

        /* ================================
        Custom Accordion Js Start
        ================================ */
        if ($(".accordion-box").length) {
            $(".accordion-box").forEach(function (outerBox) {
                outerBox.addEventListener("click", function (e) {
                    var accBtn = e.target.closest(".acc-btn");
                    if (!accBtn) return;
                    var target = accBtn.closest(".accordion");
                    var accContent = accBtn.nextElementSibling;
                    var outer = accBtn.closest(".accordion-box");
                    if (!target || !accContent) return;
                    if (target.classList.contains("active-block")) {
                        // Already open, so close it
                        removeClass(accBtn, "active");
                        removeClass(target, "active-block");
                        slide(accContent, false);
                    } else {
                        // Close all others
                        $(".accordion", outer).forEach(function (a) { removeClass(a, "active-block"); });
                        $(".acc-btn", outer).forEach(function (b) { removeClass(b, "active"); });
                        $(".acc-content", outer).forEach(function (c) { slide(c, false); });
                        // Open clicked one
                        addClass(accBtn, "active");
                        addClass(target, "active-block");
                        slide(accContent, true);
                    }
                });
            });
        }

        if (document.querySelector(".hero-slider-2")) {
            new Swiper(".hero-slider-2", {
                loop: true,
                speed: 1000,
                effect: "fade",
                fadeEffect: { crossFade: true },
                autoplay: { delay: 4000, disableOnInteraction: false },
                navigation: { nextEl: ".array-next", prevEl: ".array-prev" }
            });
        }

        /* ================================
        Team Slider Js Start
        ================================ */
        if (document.querySelector(".team-slider")) {
            new Swiper(".team-slider", {
                spaceBetween: 30,
                speed: 1300,
                loop: true,
                autoplay: { delay: 2000, disableOnInteraction: false },
                navigation: { nextEl: ".array-next", prevEl: ".array-prev" },
                pagination: { el: ".dot", clickable: true },
                breakpoints: {
                    1199: { slidesPerView: 4 },
                    991: { slidesPerView: 3 },
                    767: { slidesPerView: 2.5 },
                    575: { slidesPerView: 1.4 },
                    400: { slidesPerView: 1 },
                    0: { slidesPerView: 1 }
                }
            });
        }

        if (document.querySelector(".testimonial-slider")) {
            new Swiper(".testimonial-slider", {
                spaceBetween: 30,
                speed: 1300,
                loop: true,
                centeredSlides: true,
                autoplay: { delay: 2000, disableOnInteraction: false },
                navigation: { nextEl: ".array-next", prevEl: ".array-prev" },
                pagination: { el: ".dot2", clickable: true },
                breakpoints: {
                    1399: { slidesPerView: 4 },
                    1199: { slidesPerView: 3.4 },
                    991: { slidesPerView: 3 },
                    767: { slidesPerView: 2 },
                    575: { slidesPerView: 1.5 },
                    0: { slidesPerView: 1.2 }
                }
            });
        }

        if (document.querySelector(".testimonial-slider-2")) {
            new Swiper(".testimonial-slider-2", {
                spaceBetween: 30,
                speed: 1300,
                loop: true,
                autoplay: { delay: 2000, disableOnInteraction: false },
                breakpoints: {
                    1199: { slidesPerView: 2 },
                    991: { slidesPerView: 1 },
                    767: { slidesPerView: 1 },
                    575: { slidesPerView: 1 },
                    0: { slidesPerView: 1 }
                }
            });
        }

        /* ================================
        GT Brand Slider Js Start
        ================================ */
        if (document.querySelector(".gt-brand-slider")) {
            new Swiper(".gt-brand-slider", {
                spaceBetween: 30,
                speed: 1300,
                loop: true,
                autoplay: { delay: 2000, disableOnInteraction: false },
                navigation: { nextEl: ".array-prev", prevEl: ".array-next" },
                breakpoints: {
                    1399: { slidesPerView: 6 },
                    1199: { slidesPerView: 5 },
                    991: { slidesPerView: 4 },
                    767: { slidesPerView: 2 },
                    575: { slidesPerView: 2 },
                    400: { slidesPerView: 2 },
                    0: { slidesPerView: 1 }
                }
            });
        }

        if (document.querySelector(".gt-product-tour-slider")) {
            new Swiper(".gt-product-tour-slider", {
                spaceBetween: 30,
                speed: 1300,
                loop: true,
                centeredSlides: true,
                pagination: {
                    el: ".gt-product-dot",
                    clickable: true,
                    renderBullet: function (index, className) {
                        var dots = document.querySelectorAll(".gt-product-dot .dot-content");
                        return '<span class="' + className + '">' + (dots[index] ? dots[index].outerHTML : "") + "</span>";
                    }
                },
                breakpoints: {
                    1199: { slidesPerView: 3 },
                    991: { slidesPerView: 2 },
                    767: { slidesPerView: 1 },
                    575: { slidesPerView: 1 },
                    400: { slidesPerView: 1 },
                    0: { slidesPerView: 1 }
                }
            });
        }

        /* ================================
        Mobile Slider Js Start
        ================================ */
        if (document.querySelector(".mobile-slider")) {
            new Swiper(".mobile-slider", {
                spaceBetween: 30,
                speed: 1300,
                loop: true,
                autoplay: { delay: 2000, disableOnInteraction: false },
                breakpoints: {
                    1199: { slidesPerView: 5 },
                    991: { slidesPerView: 3 },
                    767: { slidesPerView: 2 },
                    575: { slidesPerView: 2 },
                    0: { slidesPerView: 1 }
                }
            });
        }

        /* (ripples feature removed — decorative WebGL gimmick dropped) */

        /* ================================
        Gt Hero Image Rotate Style Start
        ================================ */
        if (document.querySelector(".gt-hero-image")) {
            window.addEventListener("scroll", function () {
                var scrollPos = window.scrollY;
                var left = $(".gt-hero-left");
                var right = $(".gt-hero-right");
                if (scrollPos > 50) {
                    left.forEach(function (el) { el.style.transform = "rotate(-15deg)"; });
                    right.forEach(function (el) { el.style.transform = "rotate(15deg)"; });
                } else {
                    left.forEach(function (el) { el.style.transform = "rotate(0deg)"; });
                    right.forEach(function (el) { el.style.transform = "rotate(0deg)"; });
                }
            });
        }

        /* ================================
        Mouse Cursor Animation Js Start
        ================================ */
        if (document.querySelector(".mouseCursor").length > 0) {
            var myCursor = document.querySelector(".mouseCursor");
            if (myCursor) {
                if (document.body) {
                    var e = document.querySelector(".cursor-inner");
                    var t = document.querySelector(".cursor-outer");
                    var n = 0, i = 0, o = false;
                    window.onmousemove = function (s) {
                        if (!o) {
                            t.style.transform = "translate(" + s.clientX + "px, " + s.clientY + "px)";
                        }
                        e.style.transform = "translate(" + s.clientX + "px, " + s.clientY + "px)";
                        n = s.clientY;
                        i = s.clientX;
                    };
                    document.body.addEventListener("mouseenter", function (event) {
                        if (event.target.closest && (event.target.closest("button, a, .cursor-pointer"))) {
                            e.classList.add("cursor-hover");
                            t.classList.add("cursor-hover");
                        }
                    }, true);
                    document.body.addEventListener("mouseleave", function (event) {
                        var target = event.target.closest && event.target.closest("button, a, .cursor-pointer");
                        if (!(target && target.closest(".cursor-pointer"))) {
                            e.classList.remove("cursor-hover");
                            t.classList.remove("cursor-hover");
                        }
                    }, true);
                    e.style.visibility = "visible";
                    t.style.visibility = "visible";
                }
            }
        }

        /* ================================
        Back To Top Button Js Start
        ================================ */
        window.addEventListener("scroll", function () {
            var windowScrollTop = window.scrollY;
            var windowHeight = window.innerHeight;
            var documentHeight = document.documentElement.scrollHeight;
            var backTop = document.getElementById("back-top");
            if (!backTop) return;
            if (windowScrollTop + windowHeight >= documentHeight - 10) {
                addClass(backTop, "show");
            } else {
                removeClass(backTop, "show");
            }
        });

        var backTopBtn = document.getElementById("back-top");
        if (backTopBtn) {
            backTopBtn.addEventListener("click", function () {
                window.scrollTo({ top: 0, behavior: "smooth" });
            });
        }

        /* ================================
        Search Popup Toggle Js Start
        ================================ */
        $(".search-toggler").forEach(function (btn) {
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                $(".search-popup").forEach(function (n) { n.classList.toggle("active"); });
                document.body.classList.toggle("locked");
            });
        });

        /* ================================
        Smooth Scroller And Title Animation Js Start
        ================================ */
        if (document.getElementById("smooth-wrapper") && document.getElementById("smooth-content")) {
            gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);
            gsap.config({ nullTargetWarn: false });
            ScrollSmoother.create({
                wrapper: "#smooth-wrapper",
                content: "#smooth-content",
                smooth: 2,
                effects: true,
                smoothTouch: 0.1,
                normalizeScroll: false,
                ignoreMobileResize: true
            });
        }

        /* ================================
        Text Anim Js Start
        ================================ */
        if (typeof SplitText !== "undefined" && document.querySelectorAll(".split-title").length > 0) {
            document.querySelectorAll(".split-title").forEach(function (title) {
                var split = new SplitText(title, { type: "words,chars" });
                split.chars.forEach(function (char) { char.classList.add("char"); });
                gsap.to(split.chars, {
                    scrollTrigger: { trigger: title, start: "top 90%", toggleActions: "play none none none" },
                    duration: 0.8,
                    clipPath: "inset(0% 0% -15% 0%)",
                    x: 0,
                    opacity: 1,
                    ease: "power4.out",
                    stagger: 0.03
                });
            });
        }

        if (typeof gsap !== "undefined") {
            gsap.registerPlugin(ScrollTrigger, SplitText);
            var mm = gsap.matchMedia();
            mm.add("(min-width: 1200px)", function () {
                var splits = [];
                // tz-sub-tilte
                $(".tz-sub-tilte").forEach(function (el) {
                    var split = new SplitText(el, { type: "lines,words,chars", linesClass: "split-line" });
                    splits.push(split);
                    gsap.set(split.chars, { opacity: 0, x: 7 });
                    gsap.to(split.chars, {
                        scrollTrigger: { trigger: el, start: "top 90%", end: "top 60%", scrub: 1 },
                        x: 0, opacity: 1, duration: 0.7, stagger: 0.2
                    });
                });
                // tz-itm-title
                $(".tz-itm-title").forEach(function (el) {
                    var split = new SplitText(el, { type: "lines,words,chars", linesClass: "split-line" });
                    splits.push(split);
                    gsap.set(split.chars, { opacity: 0.3, x: -7 });
                    gsap.to(split.chars, {
                        scrollTrigger: { trigger: el, start: "top 92%", end: "top 60%", scrub: 1 },
                        x: 0, opacity: 1, duration: 0.7, stagger: 0.2
                    });
                });
                // refresh after layout
                ScrollTrigger.refresh();
                // cleanup on breakpoint change
                return function () {
                    splits.forEach(function (s) { s.revert(); });
                    ScrollTrigger.getAll().forEach(function (st) { st.kill(); });
                };
            });
        }

        if (document.querySelectorAll(".wa_title_spilt_1").length) {
            gsap.registerPlugin(SplitText, ScrollTrigger);
            document.querySelectorAll(".wa_title_spilt_1").forEach(function (atEl) {
                var atSplit = new SplitText(atEl, { type: "words,chars", wordsClass: "word", charsClass: "char" });
                var atDuration = parseFloat(atEl.getAttribute("data-speed")) || 0.6;
                var atDelay = parseFloat(atEl.getAttribute("data-delay")) || 0;
                if (window.innerWidth <= 768) atDuration = atDuration * 0.5;
                gsap.set(atSplit.words, { willChange: "transform", perspective: 1000, transformStyle: "preserve-3d" });
                gsap.set(atSplit.chars, { willChange: "transform", opacity: 0, rotateX: -80, transformOrigin: "center center -10px" });
                gsap.set(atEl, { perspective: 1000, transformStyle: "preserve-3d" });
                gsap.to(atSplit.chars, {
                    scrollTrigger: { trigger: atEl, start: "top 85%" },
                    opacity: 1, rotateX: 0, duration: atDuration, delay: atDelay,
                    ease: "power2.out",
                    stagger: { each: 0.025, from: "center" }
                });
            });
        }

        var mm2 = gsap.matchMedia();
        mm2.add("(min-width: 1199px)", function () {
            var panels = document.querySelectorAll(".oit-panel-pin");
            panels.forEach(function (section) {
                var startVal = section.dataset.start || "top 30%";
                var endVal = section.dataset.end || "bottom 90%";
                gsap.fromTo(section, {
                    transformOrigin: "100% 0% 0px", x: 0, y: 0, rotate: 0, scale: 1
                }, {
                    yPercent: 5, rotate: 20, scale: 0.75, ease: "none",
                    scrollTrigger: {
                        trigger: section, pin: section, scrub: 1,
                        start: startVal, end: endVal, endTrigger: ".oit-panel-pin-area",
                        pinSpacing: false, markers: false
                    }
                });
            });
        });

        function initTextSplit() {
            var els = $(".tz-split-1");
            if (!els.length) return;
            if (typeof gsap === "undefined" || typeof SplitText === "undefined") {
                console.warn("GSAP or SplitText not loaded");
                return;
            }
            gsap.registerPlugin(SplitText);
            els.forEach(function (el) {
                new SplitText(el, { type: "words", wordsClass: "split-line" });
            });
        }
        initTextSplit();

        var split2 = new SplitText(".text_invert-2", { type: "lines" });
        split2.lines.forEach(function (target) {
            gsap.to(target, {
                backgroundPositionX: 0,
                ease: "none",
                scrollTrigger: { trigger: target, scrub: 1, start: "top 85%", end: "bottom center" }
            });
        });

        if (window.innerWidth > 1199) {
            var items = document.querySelectorAll(".advance-wrap .advance-item");
            if (items.length >= 4) {
                var advanced = gsap.timeline({
                    scrollTrigger: {
                        trigger: ".advance-wrap", start: "top 60%", toggleActions: "play none none reverse", markers: false
                    },
                    defaults: { ease: "power1.out", duration: 1 }
                });
                advanced
                    .from(items[0], { xPercent: 100, rotate: -8 })
                    .from(items[1], { xPercent: 30, rotate: 4.13 }, "<")
                    .from(items[2], { xPercent: -30, rotate: -6.42 }, "<")
                    .from(items[3], { xPercent: -60, rotate: -12.15 }, "<");
            }
        }

        if (document.querySelectorAll(".hero-animation").length) {
            $(".hero-animation").forEach(function (el) {
                if (window.innerWidth <= 1199) return;
                gsap.timeline({
                    scrollTrigger: { trigger: el, start: "top 60%", end: "top 10%", scrub: true, markers: false }
                }).from(el, {
                    rotateX: 40, y: -180, duration: 2, ease: "power2.out",
                    transformOrigin: "bottom center", force3D: true
                });
            });
        }

        /* ================================
        Service Panel / Clip Animation Js Start
        ================================ */
        function initClipAnimation() {
            var wrappers = document.querySelectorAll(".tp-clip-anim");
            if (!wrappers.length) return;
            var observer = new IntersectionObserver(function (entries, instance) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var wrapper = entry.target;
                    var img = wrapper.querySelector(".tp-anim-img[data-animate='true']");
                    if (!img) return;
                    var url = img.getAttribute("src");
                    if (getComputedStyle(wrapper).position === "static") wrapper.style.position = "relative";
                    wrapper.querySelectorAll(".mask").forEach(function (m) { m.remove(); });
                    var fragment = document.createDocumentFragment();
                    for (var i = 0; i < 9; i++) {
                        var mask = document.createElement("div");
                        mask.className = "mask mask-" + (i + 1);
                        mask.style.backgroundImage = "url(" + url + ")";
                        fragment.appendChild(mask);
                    }
                    wrapper.appendChild(fragment);
                    instance.unobserve(wrapper);
                });
            }, { threshold: 0.2 });
            wrappers.forEach(function (w) { observer.observe(w); });
        }
        initClipAnimation();
    }); // End DOMContentLoaded

    /* ================================
    Pricing Toggle Js Start
    ================================ */
    document.addEventListener("DOMContentLoaded", function () {
        var monthlyBtn = document.querySelector(".monthly-label");
        var yearlyBtn = document.querySelector(".yearly-label");
        var byokBtn = document.querySelector(".byok-label");
        var hostedBtn = document.querySelector(".hosted-label");
        var prices = document.querySelectorAll(".price");
        if (!monthlyBtn || !yearlyBtn || prices.length === 0) return;

        var currentMode = "byok";
        var isAnimating = false;

        function setModeNote() {
            var note = document.getElementById("billingModeNote");
            if (note) {
                note.textContent = currentMode === "byok"
                    ? "BYOK — connect your own AI key; inference usage is billed to you."
                    : "Hosted — WireMark manages inference; every plan includes a monthly AI-credit allowance.";
            }
        }

        function setModeFeatures() {
            document.querySelectorAll("[data-byok-text]").forEach(function (el) {
                if (el.classList.contains("credit-line")) {
                    if (currentMode === "hosted") {
                        el.style.display = "";
                        el.textContent = el.getAttribute("data-hosted-text");
                    } else {
                        el.style.display = "none";
                    }
                    return;
                }
                el.textContent = currentMode === "byok"
                    ? el.getAttribute("data-byok-text")
                    : el.getAttribute("data-hosted-text");
            });
        }

        function renderPrice(price, type) {
            var suffix = type.charAt(0).toUpperCase() + type.slice(1);
            var value = price.dataset[currentMode + suffix + "Value"];
            var sub = price.dataset[currentMode + suffix + "Sub"];
            if (value === undefined) {
                value = price.dataset[type + "Value"];
                sub = price.dataset[type + "Sub"];
            }
            if (value === undefined) return;
            sub = sub || (type === "monthly" ? "/mo" : "/mo billed annually");
            price.innerHTML = "$" + value + "<sub>" + sub + "</sub>";
        }

        function changePrice(type) {
            if (isAnimating) return;
            isAnimating = true;
            prices.forEach(function (price) {
                price.classList.add("fade-out");
                window.setTimeout(function () {
                    renderPrice(price, type);
                    price.classList.remove("fade-out");
                    price.classList.add("fade-in");
                    window.setTimeout(function () {
                        price.classList.remove("fade-in");
                        isAnimating = false;
                    }, 300);
                }, 300);
            });
        }

        function setMode(mode) {
            currentMode = mode;
            if (mode === "byok") {
                byokBtn.classList.add("active");
                hostedBtn.classList.remove("active");
            } else {
                hostedBtn.classList.add("active");
                byokBtn.classList.remove("active");
            }
            setModeNote();
            setModeFeatures();
            var cycle = monthlyBtn.classList.contains("active") ? "monthly" : "yearly";
            changePrice(cycle);
        }

        setModeNote();
        setModeFeatures();

        if (byokBtn && hostedBtn) {
            byokBtn.addEventListener("click", function () { if (currentMode !== "byok") setMode("byok"); });
            hostedBtn.addEventListener("click", function () { if (currentMode !== "hosted") setMode("hosted"); });
        }

        monthlyBtn.addEventListener("click", function () {
            if (!this.classList.contains("active")) {
                monthlyBtn.classList.add("active");
                yearlyBtn.classList.remove("active");
                changePrice("monthly");
            }
        });
        yearlyBtn.addEventListener("click", function () {
            if (!this.classList.contains("active")) {
                yearlyBtn.classList.add("active");
                monthlyBtn.classList.remove("active");
                changePrice("yearly");
            }
        });
    });

    /* ================================
    Panel Pin (GSAP) — runs at top level
    ================================ */
    var pr = gsap.matchMedia();
    pr.add("(min-width: 1199px)", function () {
        var tl = gsap.timeline();
        var panels = document.querySelectorAll(".tp-panel-pin");
        panels.forEach(function (section) {
            tl.to(section, {
                scrollTrigger: {
                    trigger: section, pin: section, scrub: 1,
                    start: "top 14%", end: "bottom 85%", endTrigger: ".tp-panel-pin-area",
                    pinSpacing: false, markers: false
                }
            });
        });
    });

    /* ================================
    Preloader Js Start
    ================================ */
    window.addEventListener("load", function () {
        var preloader = document.getElementById("preloader");
        if (preloader) {
            window.setTimeout(function () {
                preloader.style.transition = "opacity 0.5s ease";
                preloader.style.opacity = "0";
                window.setTimeout(function () { preloader.style.display = "none"; }, 500);
            }, 500);
        }
    });
})();
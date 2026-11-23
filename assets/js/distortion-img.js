import {
    Renderer,
    Program,
    Mesh,
    Vec2,
    Texture,
    Flowmap,
    Plane
} from "./distortion-img-depend.js";

/*
 * Hover distortion for every .image-distortion element (wiremark/site#5).
 *
 * The WebGL scene draws a frame only when the picture can change: once when
 * the image has loaded (or the element was resized), and while the flow is
 * still moving after pointer movement. When the pointer is at rest and the
 * flow has faded, the loop stops and the canvas keeps its last frame; the next
 * pointermove starts it again. Nothing is created until the element comes
 * near the viewport, and an element off screen draws nothing.
 *
 * Without WebGL, and when the visitor prefers reduced motion, the element
 * keeps its plain CSS background image (main.js sets it from
 * data-background) and no canvas is added.
 *
 * Each element carries its state for scripts/check-hero-idle.mjs:
 *   data-distortion         pending | loading | running | idle | static | fallback
 *   data-distortion-frames  frames drawn so far
 */
(function () {
"use strict";

const vertex = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, .45);
}
`;

const fragment = `
precision highp float;
uniform sampler2D tImage;
uniform sampler2D tFlow;
varying vec2 vUv;

void main() {
    vec3 flow = texture2D(tFlow, vUv).rgb;
    vec2 uv = vUv;
    uv += (flow.rg * flow.b * 50.0);
    vec3 tex = texture2D(tImage, uv).rgb;
    gl_FragColor.rgb = tex;
    gl_FragColor.a = 1.0;
}
`;

// OGL's default Flowmap size. The flow is a soft, linearly filtered blob, so
// 128x128 looks the same as the template's 1000x1000 at 1/60 of the fill cost.
const FLOWMAP_SIZE = 128;
const FALLOFF = 0.3;
const DISSIPATION = 0.95;
// Pointer spring, as in the template.
const SPRING = 0.04;
const FRICTION = 0.8;
// Below this (in UV units per frame) the pointer spring counts as at rest.
const REST = 1e-4;
// Frames the flow needs to fade once the pointer is at rest:
// DISSIPATION^120 is about 0.002, below one 8-bit colour step after the x50.
const FADE_FRAMES = 120;
// Start the scene a little before the element scrolls into view.
const NEAR_VIEWPORT = "200px 0px";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setState(el, state) {
    el.dataset.distortion = state;
}

function showPlainImage(el, state) {
    const src = el.getAttribute("data-background");
    if (src && !el.style.backgroundImage) el.style.backgroundImage = "url(" + src + ")";
    setState(el, state);
}

class DistortionImage {
    constructor(el) {
        this.el = el;
        this.visible = true;
        this.raf = 0;
        this.frames = 0;
        this.ready = false;
        // Start settled: nothing moves until the pointer does.
        this.settleFrames = FADE_FRAMES;
        this.aspect = 1;

        this.mouse = new Vec2(0.5);
        this.lastMouse = new Vec2(0.5);
        this.velocity = new Vec2();
        this.springVel = new Vec2();

        this.frame = this.frame.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onContextLost = this.onContextLost.bind(this);

        const renderer = new Renderer({ dpr: 1 });
        if (!renderer.gl) throw new Error("no WebGL context");
        this.renderer = renderer;
        this.gl = renderer.gl;
        this.canvas = this.gl.canvas;
        this.canvas.addEventListener("webglcontextlost", this.onContextLost);

        this.flowmap = new Flowmap(this.gl, { falloff: FALLOFF, dissipation: DISSIPATION, size: FLOWMAP_SIZE });
        this.texture = new Texture(this.gl);
        const program = new Program(this.gl, {
            vertex,
            fragment,
            uniforms: {
                tImage: { value: this.texture },
                tFlow: this.flowmap.uniform
            }
        });
        this.mesh = new Mesh(this.gl, { geometry: new Plane(this.gl), program });

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(el);
        el.addEventListener("pointermove", this.onPointerMove, { passive: true });

        setState(el, "loading");
        this.loadImage(el.getAttribute("data-background"));
    }

    loadImage(src) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => {
            if (this.disposed) return;
            this.texture.image = img;
            this.ready = true;
            this.resize();
            // The canvas goes in only once it holds the picture, so the CSS
            // background shows until then instead of an empty canvas.
            this.el.appendChild(this.canvas);
            setState(this.el, "idle");
            // A pointer that moved while the image loaded starts the flow now.
            this.schedule();
        };
        img.onerror = () => {
            if (this.disposed) return;
            console.warn("distortion-img: could not load " + src + "; showing the plain background");
            this.dispose("fallback");
        };
        img.src = src;
    }

    resize() {
        const rect = this.el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.aspect = rect.width / rect.height;
        this.renderer.setSize(rect.width, rect.height);
        // Resizing clears the canvas: draw the current picture again now.
        if (this.ready) this.draw(false);
    }

    onPointerMove(event) {
        const rect = this.el.getBoundingClientRect();
        this.mouse.set(
            (event.clientX - rect.left) / rect.width,
            1 - (event.clientY - rect.top) / rect.height
        );
        this.settleFrames = 0;
        this.schedule();
    }

    setVisible(visible) {
        this.visible = visible;
        if (visible) {
            this.schedule();
        } else if (this.raf) {
            cancelAnimationFrame(this.raf);
            this.raf = 0;
            setState(this.el, "idle");
        }
    }

    schedule() {
        if (this.raf || !this.ready || !this.visible || this.disposed) return;
        if (this.settleFrames >= FADE_FRAMES) return;
        setState(this.el, "running");
        this.raf = requestAnimationFrame(this.frame);
    }

    draw(advance) {
        if (advance) {
            this.springVel.copy(this.mouse).sub(this.lastMouse).multiply(SPRING);
            this.velocity.add(this.springVel).multiply(FRICTION);
            this.lastMouse.add(this.velocity);

            this.flowmap.mouse.copy(this.lastMouse);
            this.flowmap.velocity.copy(this.velocity);
            this.flowmap.aspect = this.aspect;
            this.flowmap.update();
        }
        this.renderer.render({ scene: this.mesh });
        this.frames += 1;
        this.el.dataset.distortionFrames = String(this.frames);
    }

    frame() {
        this.raf = 0;
        this.draw(true);

        const moving =
            Math.hypot(this.velocity[0], this.velocity[1]) > REST ||
            Math.hypot(this.mouse[0] - this.lastMouse[0], this.mouse[1] - this.lastMouse[1]) > REST;
        this.settleFrames = moving ? 0 : this.settleFrames + 1;

        if (this.settleFrames < FADE_FRAMES && this.visible) {
            this.raf = requestAnimationFrame(this.frame);
        } else {
            setState(this.el, "idle");
        }
    }

    onContextLost() {
        console.warn("distortion-img: WebGL context lost; showing the plain background");
        this.dispose("fallback");
    }

    dispose(state) {
        if (this.disposed) return;
        this.disposed = true;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.resizeObserver.disconnect();
        this.el.removeEventListener("pointermove", this.onPointerMove);
        this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
        this.canvas.remove();
        const lose = this.gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
        showPlainImage(this.el, state);
    }
}

const elements = Array.from(document.querySelectorAll(".image-distortion"));
const instances = new Map();
let observer = null;

function create(el) {
    try {
        instances.set(el, new DistortionImage(el));
    } catch (error) {
        console.warn("distortion-img: WebGL unavailable (" + error.message + "); showing the plain background");
        // Do not try again for this element.
        observer.unobserve(el);
        showPlainImage(el, "fallback");
    }
}

function start() {
    observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const instance = instances.get(entry.target);
            if (instance) {
                instance.setVisible(entry.isIntersecting);
            } else if (entry.isIntersecting) {
                create(entry.target);
            }
        });
    }, { rootMargin: NEAR_VIEWPORT });
    elements.forEach((el) => {
        if (el.dataset.distortion !== "fallback") setState(el, "pending");
        observer.observe(el);
    });
}

function stop() {
    if (observer) observer.disconnect();
    observer = null;
    instances.forEach((instance) => instance.dispose("static"));
    instances.clear();
    elements.forEach((el) => {
        if (el.dataset.distortion !== "fallback") showPlainImage(el, "static");
    });
}

if (reducedMotion.matches) stop(); else start();
reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) stop(); else start();
});

})();

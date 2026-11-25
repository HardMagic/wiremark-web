#!/usr/bin/env node
// Hero idle check (wiremark/site#5, wiremark/site#6): once a hero page has
// drawn and nothing moves, it stops producing frames. The .image-distortion
// WebGL hover effect leaves the main thread idle and stops its
// requestAnimationFrame loop, and the page's own animation (CSS keyframes,
// carousels, GSAP) runs only where it can be seen (assets/js/idle-motion.js).
//
//   node scripts/check-hero-idle.mjs _site [--report .hero-idle/report.json]
//
// Serves the built site from a local Node server (no other tools) and, for
// index-2 and index-3 in headless Chromium with software WebGL (SwiftShader,
// the same kind of GPU the wiremark/qa Lighthouse and Lost Pixel jobs get):
//   1. load: every effect in view draws, then 3 s in which the effect draws
//      no frame, runs no code and owns no long task;
//   2. scroll: every effect on the page draws once it is in view, then the
//      same 3 s check;
//   3. hover: pointer movement starts the loop, which stops by itself once the
//      flow has settled, and leaves no long task behind;
// Every idle window runs with the page's own animation as it is; nothing is
// paused for the check. In each, besides the effect:
//   - no script requests frames in a loop (GSAP's ticker and ScrollTrigger's
//     _rafBugFix sleep while the scroll is at rest);
//   - every infinite CSS/Web animation off screen is paused, every one on
//     screen runs (the look is unchanged), and autoplay carousels run only on
//     screen;
//   - long tasks, style recalculations and layouts are reported.
//   4. prefers-reduced-motion: no canvas, plain background, state "static";
//      no infinite animation and no carousel autoplay runs;
//   5. no WebGL: no canvas, plain background, state "fallback", no error.
// Runs 4 and 5 first print the window right after scrolling, as the
// evidence of pipeline 166007 measured it (the before/after of site#6).
// The page reports each effect's state in data-distortion and the frames it
// drew in data-distortion-frames (assets/js/distortion-img.js).
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, extname, dirname, sep } from 'node:path';
import { chromium } from 'playwright';

const PAGES = ['index-2.html', 'index-3.html'];
const IDLE_WINDOW_MS = 3000;
const SETTLE_TIMEOUT_MS = 30000;
const HOVER_SETTLE_TIMEOUT_MS = 120000;
const QUIET_GRACE_MS = 2000;
// More frame requests than this from one callback in an idle window is a loop
// (60 Hz is 180 in 3 s; a carousel slide change asks for a few).
const FRAME_LOOP_LIMIT = 20;
// Scripts of the WebGL effect, as long animation frames name them.
const EFFECT_SCRIPT = /distortion-img/;
const VIEWPORT = { width: 1280, height: 800 };
// Software WebGL in headless Chromium; Chromium no longer falls back to
// SwiftShader for WebGL on its own.
const CHROMIUM_ARGS = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain', '.map': 'application/json',
};

function usage(message) {
  console.error(`check-hero-idle: ${message}\nusage: node scripts/check-hero-idle.mjs <site-dir> [--report <file>]`);
  process.exit(2);
}

const args = process.argv.slice(2);
let siteDir = null;
let reportPath = '.hero-idle/report.json';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--report') {
    reportPath = args[++i];
    if (!reportPath) usage('--report needs a file');
  } else if (args[i].startsWith('-')) usage(`unknown option ${args[i]}`);
  else siteDir = args[i];
}
if (!siteDir) usage('no site directory');
const root = resolve(siteDir);

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      const file = resolve(join(root, path.endsWith('/') ? path + 'index.html' : path));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500).end(String(error.code || error));
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok(server));
  });
}

// Runs in the page before any site script: record every long task.
// Long animation frames name the scripts behind a long task.
function recordLongTasks() {
  window.__longTasks = [];
  window.__longFrames = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__longTasks.push({ start: Math.round(e.startTime), duration: Math.round(e.duration) });
  }).observe({ type: 'longtask', buffered: true });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__longFrames.push({
          start: Math.round(e.startTime),
          duration: Math.round(e.duration),
          blocking: Math.round(e.blockingDuration),
          render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
          style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
          scripts: e.scripts.map((s) => `${s.invokerType} ${s.invoker} ${(s.sourceURL || '').split('/').pop()}:${s.sourceFunctionName || '?'} ${Math.round(s.duration)}ms`),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (error) {
    window.__longFramesError = String(error);
  }
  // Every requestAnimationFrame request: the callback's name and the script
  // that asked (the first one in the stack other than idle-motion.js, which
  // only passes requests through). The callback itself is not wrapped, so
  // long animation frames still name the script that runs it.
  window.__frameRequests = [];
  const requestFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = function requestAnimationFrame(callback) {
    if (window.__frameRequests.length < 100000) {
      const files = (new Error().stack || '').match(/[\w.-]+\.m?js(?=[?#:])/g) || [];
      const source = files.find((f) => f !== 'idle-motion.js') || 'inline';
      window.__frameRequests.push({ t: performance.now(), name: (callback && callback.name) || 'anonymous', source });
    }
    return requestFrame.call(window, callback);
  };
}

// Runs in the page before any site script: a browser without WebGL.
function withoutWebGL() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/i.test(String(type))) return null;
    return getContext.call(this, type, ...rest);
  };
}

const effects = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.image-distortion')].map((el) => ({
    state: el.dataset.distortion || 'none',
    frames: Number(el.dataset.distortionFrames || 0),
    canvas: !!el.querySelector('canvas'),
    background: el.style.backgroundImage !== '' || getComputedStyle(el).backgroundImage !== 'none',
  })));

// Wait until no effect is loading or running: each has drawn its picture and stopped.
const settled = (page) => page.waitForFunction(() =>
  [...document.querySelectorAll('.image-distortion')]
    .every((el) => !['loading', 'running'].includes(el.dataset.distortion)),
  null, { timeout: SETTLE_TIMEOUT_MS, polling: 100 });

// Name the step a failure happened in.
async function step(name, fn) {
  try {
    return await fn();
  } catch (error) {
    throw new Error(`${name}: ${error.message.split('\n')[0]}`);
  }
}

// Scroll an effect into view (through ScrollSmoother where the page has one,
// which eases the content after the scroll position) and wait until it is on
// screen and has drawn, or shows its plain background.
async function scrollTo(page, index) {
  await step(`scroll to effect ${index}`, async () => {
    await page.evaluate((i) => {
      const el = document.querySelectorAll('.image-distortion')[i];
      const smoother = window.ScrollSmoother && window.ScrollSmoother.get();
      if (smoother) smoother.scrollTo(el, false, 'center center');
      else el.scrollIntoView({ block: 'center' });
    }, index);
    await page.waitForFunction((i) => {
      const r = document.querySelectorAll('.image-distortion')[i].getBoundingClientRect();
      return r.bottom > 80 && r.top < window.innerHeight - 80;
    }, index, { timeout: SETTLE_TIMEOUT_MS, polling: 100 });
    await page.waitForFunction((i) => {
      const s = document.querySelectorAll('.image-distortion')[i].dataset.distortion;
      return s === 'idle' || s === 'fallback' || s === 'static';
    }, index, { timeout: SETTLE_TIMEOUT_MS, polling: 100 });
  });
}

// The page's infinite CSS/Web animations and autoplay carousels, each with
// whether it intersects the viewport, as an IntersectionObserver sees it (the
// same test assets/js/idle-motion.js uses, so clipping counts alike).
const motionCensus = (page) => page.evaluate(async () => {
  const anims = document.getAnimations().filter((a) => a.effect && a.effect.target
    && a.effect.getTiming().iterations === Infinity);
  const carousels = [...document.querySelectorAll('.swiper, .swiper-container')]
    .filter((el) => el.swiper && el.swiper.params && el.swiper.params.autoplay && el.swiper.params.autoplay.enabled);
  const targets = [...new Set([...anims.map((a) => a.effect.target), ...carousels])];
  const seen = new Map();
  if (targets.length) {
    await Promise.race([
      new Promise((ok) => {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((e) => seen.set(e.target, e.isIntersecting));
          if (seen.size >= targets.length) { io.disconnect(); ok(); }
        });
        targets.forEach((t) => io.observe(t));
      }),
      new Promise((ok) => setTimeout(ok, 2000)),
    ]);
  }
  const where = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
  return {
    animations: anims.map((a) => ({
      name: a.animationName || a.id || 'animation',
      on: where(a.effect.target) + (a.effect.pseudoElement || ''),
      state: a.playState,
      inView: seen.get(a.effect.target) === true,
      // Paused by the page's own CSS (animation-play-state), not by idle-motion.
      cssPaused: /paused/.test(getComputedStyle(a.effect.target, a.effect.pseudoElement || null).animationPlayState || ''),
    })),
    carousels: carousels.map((el) => ({
      on: where(el),
      // idle-motion autoplays on its own timer (data-idle-autoplay); without it, Swiper's.
      running: el.dataset.idleAutoplay ? el.dataset.idleAutoplay === 'on' : !!(el.swiper.autoplay.running && !el.swiper.autoplay.paused),
      inView: seen.get(el) === true,
    })),
  };
});

const cdpMetrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

// Watch a quiet window with the page's animation as it is: no script asks for
// frames in a loop, the effect draws nothing and owns no long task, infinite
// animations and carousels run on screen only (none under reduced motion).
// report: evidence only, no grace and no assertions.
async function idleWindow(page, cdp, label, failures, { report = false, reducedMotion = false } = {}) {
  if (report) failures = [];
  // Let frames in flight, scroll-triggered work (ScrollTrigger's own
  // requestAnimationFrame after a scroll) and the scroll smoother come to rest.
  else await page.waitForTimeout(QUIET_GRACE_MS);
  const before = await effects(page);
  const t0 = await page.evaluate(() => performance.now());
  const m0 = await cdpMetrics(cdp);
  await page.waitForTimeout(IDLE_WINDOW_MS);
  const m1 = await cdpMetrics(cdp);
  const after = await effects(page);
  const census = await motionCensus(page);
  const allLongTasks = await page.evaluate((t) => window.__longTasks.filter((e) => e.start >= t), t0);
  const longFrames = await page.evaluate((t) => window.__longFrames.filter((e) => e.start + e.duration >= t), t0);
  const requests = await page.evaluate(({ t, ms }) => window.__frameRequests.filter((r) => r.t >= t && r.t < t + ms), { t: t0, ms: IDLE_WINDOW_MS });
  const frameRequests = {};
  for (const r of requests) {
    const key = r.source + ':' + r.name;
    frameRequests[key] = (frameRequests[key] || 0) + 1;
  }
  const metrics = {
    recalcStyles: Math.round(m1.RecalcStyleCount - m0.RecalcStyleCount),
    layouts: Math.round(m1.LayoutCount - m0.LayoutCount),
    taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
  };
  // Who owns a long task, from the long animation frames around it. The
  // effect only runs code in requestAnimationFrame, pointer, resize and
  // observer callbacks, all inside a frame, so its work is named there
  // (distortion-img*.js). A long task of other scripts (GSAP, Swiper) is the
  // page's; one in which no script ran is the browser's own (garbage
  // collection, decoding, IPC), which a one-CPU software-GPU pod shows now and
  // then (main pipeline 166056). The effect's fail the check; the others are
  // reported, and the frame loops and animations behind them are asserted below.
  const owner = (task) => {
    const frames = longFrames.filter((f) => task.start < f.start + f.duration && f.start < task.start + task.duration);
    const scripts = frames.flatMap((f) => f.scripts);
    if (scripts.some((s) => EFFECT_SCRIPT.test(s))) return 'effect';
    return scripts.length ? 'page' : 'browser';
  };
  const longTasks = allLongTasks.filter((t) => owner(t) === 'effect');
  const pageLongTasks = allLongTasks.filter((t) => owner(t) === 'page');
  const browserLongTasks = allLongTasks.filter((t) => owner(t) === 'browser');
  // The effect must not run at all while idle, long task or not.
  const effectFrames = longFrames.filter((f) => f.scripts.some((s) => EFFECT_SCRIPT.test(s)));
  if (effectFrames.length) failures.push(`${label}: the effect ran while idle: ${JSON.stringify(effectFrames)}`);
  const framesInWindow = after.reduce((n, e, i) => n + e.frames - before[i].frames, 0);
  const running = after.filter((e) => e.state === 'running').length;
  if (longTasks.length) failures.push(`${label}: ${longTasks.length} long task(s) of the effect while idle: ${JSON.stringify(longTasks)}; long animation frames: ${JSON.stringify(longFrames)}`);
  if (framesInWindow) failures.push(`${label}: ${framesInWindow} frame(s) drawn while nothing moved (rAF did not stop)`);
  if (running) failures.push(`${label}: ${running} effect(s) still running while idle`);
  // The page itself: no frame loop, motion only where it can be seen.
  const loops = Object.entries(frameRequests).filter(([, n]) => n > FRAME_LOOP_LIMIT);
  if (loops.length) failures.push(`${label}: frames requested in a loop while idle (more than ${FRAME_LOOP_LIMIT} in ${IDLE_WINDOW_MS} ms): ${JSON.stringify(Object.fromEntries(loops))}`);
  const show = (rows) => JSON.stringify(rows.map((r) => r.name ? r.name + ' on ' + r.on : r.on));
  const anims = census.animations;
  const runningAnims = anims.filter((a) => a.state === 'running');
  if (reducedMotion) {
    if (runningAnims.length) failures.push(`${label}: ${runningAnims.length} infinite animation(s) run under reduced motion: ${show(runningAnims)}`);
    const autoplaying = census.carousels.filter((c) => c.running);
    if (autoplaying.length) failures.push(`${label}: ${autoplaying.length} carousel(s) autoplay under reduced motion: ${show(autoplaying)}`);
  } else {
    const offScreen = runningAnims.filter((a) => !a.inView);
    if (offScreen.length) failures.push(`${label}: ${offScreen.length} infinite animation(s) run off screen: ${show(offScreen)}`);
    const stopped = anims.filter((a) => a.inView && a.state !== 'running' && !a.cssPaused);
    if (stopped.length) failures.push(`${label}: ${stopped.length} infinite animation(s) on screen do not run (the look changed): ${show(stopped)}`);
    const offCarousels = census.carousels.filter((c) => c.running && !c.inView);
    if (offCarousels.length) failures.push(`${label}: ${offCarousels.length} carousel(s) autoplay off screen: ${show(offCarousels)}`);
    const stoppedCarousels = census.carousels.filter((c) => !c.running && c.inView);
    if (stoppedCarousels.length) failures.push(`${label}: ${stoppedCarousels.length} carousel(s) on screen do not autoplay: ${show(stoppedCarousels)}`);
  }
  return {
    windowMs: IDLE_WINDOW_MS,
    allLongTasks: allLongTasks.length,
    allLongTaskMs: allLongTasks.map((e) => e.duration),
    longTasks: longTasks.length,
    longTaskMs: longTasks.map((e) => e.duration),
    pageLongTasks,
    browserLongTasks,
    framesInWindow,
    frameRequests,
    metrics,
    animations: {
      total: anims.length,
      running: runningAnims.length,
      runningOnScreen: runningAnims.filter((a) => a.inView).length,
      pausedOffScreen: anims.filter((a) => !a.inView && a.state !== 'running').length,
    },
    carousels: census.carousels,
    states: after.map((e) => e.state),
    longFrames,
  };
}

async function hover(page, cdp, index, failures, label) {
  await scrollTo(page, index);
  await page.waitForTimeout(1000); // let a smooth scroller come to rest
  const box = await page.evaluate((i) => {
    const r = document.querySelectorAll('.image-distortion')[i].getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    return { left: r.left, top: r.top, width: r.width, height: r.height, y: (top + bottom) / 2, vw: window.innerWidth, vh: window.innerHeight };
  }, index);
  const before = (await effects(page))[index].frames;
  const x0 = box.left + box.width * 0.25;
  const hit = await page.evaluate(({ i, x, y }) => {
    const el = document.querySelectorAll('.image-distortion')[i];
    const top = document.elementFromPoint(x, y);
    window.__pointerMoves = 0;
    el.addEventListener('pointermove', () => { window.__pointerMoves += 1; });
    return { inside: !!top && el.contains(top), top: top ? top.tagName + '.' + String(top.className).split(' ').join('.') : null };
  }, { i: index, x: x0, y: box.y });
  await page.mouse.move(x0, box.y);
  await page.mouse.move(box.left + box.width * 0.75, box.y + 40, { steps: 25 });
  // Give the loop a few frames to start.
  await page.waitForTimeout(200);
  const during = (await effects(page))[index];
  const pointerMoves = await page.evaluate(() => window.__pointerMoves);
  const restarted = during.frames > before;
  if (!restarted) failures.push(`${label}: pointer movement drew no frame (the loop did not restart; ${pointerMoves} pointermove events reached the effect, topmost element ${JSON.stringify(hit)} at ${JSON.stringify(box)}, state ${during.state})`);
  const t0 = Date.now();
  // The flow fades over a fixed number of frames; a software GPU draws few per second.
  await step('settle after hover', () => page.waitForFunction(() =>
    [...document.querySelectorAll('.image-distortion')].every((el) => el.dataset.distortion !== 'running'),
    null, { timeout: HOVER_SETTLE_TIMEOUT_MS, polling: 250 }));
  const settleMs = Date.now() - t0;
  const quiet = await idleWindow(page, cdp, `${label} after hover`, failures);
  return { restarted, framesDuringHover: during.frames - before, settleMs, quiet };
}

async function checkPage(browser, base, name) {
  const failures = [];
  const result = { page: name };

  // 1-3: WebGL, motion allowed.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.addInitScript(recordLongTasks);
    const resp = await page.goto(base + name, { waitUntil: 'load', timeout: 60000 });
    if (!resp || resp.status() !== 200) failures.push(`${name}: HTTP ${resp ? resp.status() : 'no response'}`);
    await step('first frames after load', () => settled(page));
    result.idleMotion = await page.evaluate(() => document.documentElement.dataset.idleMotion || 'absent');
    result.webgl = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      return gl ? gl.getParameter(gl.VERSION) : null;
    });
    result.load = await idleWindow(page, cdp, `${name} after load`, failures);

    const count = (await effects(page)).length;
    for (let i = 0; i < count; i++) await scrollTo(page, i);
    await step('first frames after scrolling', () => settled(page));
    // Scrolling starts lazy images loading: let the page finish loading them
    // (network idle, every loaded image decoded) before the window opens.
    await step('lazy images after scrolling', async () => {
      await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS });
      await page.evaluate(() => Promise.all([...document.images]
        .filter((img) => img.complete && img.naturalWidth)
        .map((img) => img.decode().catch(() => undefined))));
    });
    const all = await effects(page);
    result.effects = all;
    all.forEach((e, i) => {
      if (e.state !== 'idle' || !e.canvas || e.frames < 1) {
        failures.push(`${name}: effect ${i} did not draw with WebGL (state ${e.state}, frames ${e.frames}, canvas ${e.canvas})`);
      }
    });
    result.scrolled = await idleWindow(page, cdp, `${name} after scrolling every effect into view`, failures);
    // Hover the last effect: the scroll loop has just brought it to rest in view.
    result.hover = await hover(page, cdp, count - 1, failures, `${name} hover`);
    if (errors.length) failures.push(...errors.map((e) => `${name}: ${e}`));
    await context.close();
  }

  // 4: prefers-reduced-motion, 5: no WebGL.
  for (const [mode, state, setup] of [
    ['reduced-motion', 'static', (ctx) => ctx],
    ['no-webgl', 'fallback', async (ctx) => { await ctx.addInitScript(withoutWebGL); return ctx; }],
  ]) {
    const reducedMotion = mode === 'reduced-motion';
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    await setup(context);
    await context.addInitScript(recordLongTasks);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(base + name, { waitUntil: 'load', timeout: 60000 });
    const count = (await effects(page)).length;
    for (let i = 0; i < count; i++) await scrollTo(page, i);
    const all = await effects(page);
    all.forEach((e, i) => {
      if (e.state !== state || e.canvas || !e.background) {
        failures.push(`${name} ${mode}: effect ${i} is ${e.state}, canvas ${e.canvas}, background ${e.background}; want ${state}, no canvas, background image`);
      }
    });
    result[mode] = all.map((e) => e.state);
    // Evidence: right after scrolling, as pipeline 166007 measured it.
    result[mode + 'Evidence'] = await idleWindow(page, cdp, `${name} ${mode} evidence`, failures, { report: true, reducedMotion });
    result[mode + 'Idle'] = await idleWindow(page, cdp, `${name} ${mode} at rest`, failures, { reducedMotion });
    if (errors.length) failures.push(...errors.map((e) => `${name} ${mode}: ${e}`));
    await context.close();
  }

  result.failures = failures;
  return result;
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const results = [];
try {
  for (const name of PAGES) {
    try {
      results.push(await checkPage(browser, base, name));
    } catch (error) {
      results.push({ page: name, failures: [`${name}: check did not finish: ${error.message}`] });
    }
  }
} finally {
  await browser.close();
  server.close();
}

const failures = results.flatMap((r) => r.failures);
for (const r of results) {
  console.log(`${r.failures.length ? 'FAIL' : 'PASS'} ${r.page}`);
  if (r.webgl !== undefined) console.log(`  webgl: ${r.webgl}`);
  // One line per window: every long task (and whose), frame requests per
  // script, style recalculations and layouts, and where motion runs.
  const line = (label, w) => {
    if (!w) return;
    const requests = Object.entries(w.frameRequests).map(([k, n]) => k + ' ' + n).join(', ') || 'none';
    const owners = w.allLongTasks ? ` (effect ${w.longTasks}, other scripts ${w.pageLongTasks.length}, no script ${w.browserLongTasks.length})` : '';
    console.log(`  ${label}: ${w.allLongTasks} long tasks ${JSON.stringify(w.allLongTaskMs)}${owners} in ${w.windowMs} ms; ${w.metrics.recalcStyles} style recalcs, ${w.metrics.layouts} layouts, ${w.metrics.taskMs} ms main-thread work; frame requests: ${requests}; infinite animations ${w.animations.runningOnScreen} running on screen, ${w.animations.pausedOffScreen} paused off screen of ${w.animations.total}; carousels autoplaying ${w.carousels.filter((c) => c.running).length}/${w.carousels.length}; effect frames ${w.framesInWindow}`);
    if (w.pageLongTasks.length) console.log(`    long animation frames of other scripts: ${JSON.stringify(w.longFrames.filter((f) => f.scripts.length && !f.scripts.some((s) => EFFECT_SCRIPT.test(s))).flatMap((f) => f.scripts))}`);
  };
  if (r.idleMotion) console.log(`  idle-motion: ${r.idleMotion}`);
  line('after load', r.load);
  if (r.effects) console.log(`  frames drawn per effect after scrolling: ${r.effects.map((e) => e.frames).join(',')}`);
  line('after scroll', r.scrolled);
  if (r.hover) {
    console.log(`  hover: restarted ${r.hover.restarted} (${r.hover.framesDuringHover} frames), settled in ${r.hover.settleMs} ms`);
    line('after hover', r.hover.quiet);
  }
  if (r['reduced-motion']) console.log(`  reduced motion: ${r['reduced-motion'].join(',')}`);
  line('reduced motion, right after scrolling (evidence)', r['reduced-motionEvidence']);
  line('reduced motion, at rest', r['reduced-motionIdle']);
  if (r['no-webgl']) console.log(`  no WebGL: ${r['no-webgl'].join(',')}`);
  line('no WebGL, right after scrolling (evidence)', r['no-webglEvidence']);
  line('no WebGL, at rest', r['no-webglIdle']);
  for (const f of r.failures) console.log(`  - ${f}`);
}
try {
  await mkdir(dirname(resolve(reportPath)), { recursive: true });
  await writeFile(reportPath, JSON.stringify(results, null, 2) + '\n');
} catch (error) {
  console.error(`check-hero-idle: could not write ${reportPath}: ${error.message}`);
  process.exitCode = 1;
}
if (failures.length) {
  console.log(`\ncheck-hero-idle: ${failures.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\ncheck-hero-idle: every effect drew, then no script asked for frames in a loop, the effect stayed idle, and infinite animations and carousels ran on screen only');
}

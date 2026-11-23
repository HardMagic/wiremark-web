#!/usr/bin/env node
// Hero idle check (wiremark/site#5): the .image-distortion WebGL hover effect
// must leave the main thread idle once it has drawn, and must stop its
// requestAnimationFrame loop when nothing moves.
//
//   node scripts/check-hero-idle.mjs _site [--report .hero-idle/report.json]
//
// Serves the built site from a local Node server (no other tools) and, for
// index-2 and index-3 in headless Chromium with software WebGL (SwiftShader,
// the same kind of GPU the wiremark/qa Lighthouse and Lost Pixel jobs get):
//   1. load: every effect in view draws, then 3 s with no long task and no
//      frame drawn;
//   2. scroll: every effect on the page draws once it is in view, then 3 s
//      with no long task and no frame drawn;
//   3. hover: pointer movement starts the loop, which stops by itself once the
//      flow has settled;
//   4. prefers-reduced-motion: no canvas, plain background, state "static";
//   5. no WebGL: no canvas, plain background, state "fallback", no error.
// The page reports each effect's state in data-distortion and the frames it
// drew in data-distortion-frames (assets/js/distortion-img.js).
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, extname, dirname, sep } from 'node:path';
import { chromium } from 'playwright';

const PAGES = ['index-2.html', 'index-3.html'];
const IDLE_WINDOW_MS = 3000;
const SETTLE_TIMEOUT_MS = 30000;
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

async function scrollTo(page, index) {
  await page.evaluate((i) => {
    const el = document.querySelectorAll('.image-distortion')[i];
    const smoother = window.ScrollSmoother && window.ScrollSmoother.get();
    if (smoother) smoother.scrollTo(el, false, 'center center');
    else el.scrollIntoView({ block: 'center' });
  }, index);
  await page.waitForFunction((i) => {
    const s = document.querySelectorAll('.image-distortion')[i].dataset.distortion;
    return s === 'idle' || s === 'fallback' || s === 'static';
  }, index, { timeout: SETTLE_TIMEOUT_MS, polling: 100 });
}

// Watch a quiet window: no long task starts in it and no effect draws a frame.
async function idleWindow(page, label, failures) {
  const before = await effects(page);
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForTimeout(IDLE_WINDOW_MS);
  const after = await effects(page);
  const longTasks = await page.evaluate((t) => window.__longTasks.filter((e) => e.start >= t), t0);
  const longFrames = await page.evaluate((t) => window.__longFrames.filter((e) => e.start + e.duration >= t && e.blocking > 0), t0);
  const framesInWindow = after.reduce((n, e, i) => n + e.frames - before[i].frames, 0);
  const running = after.filter((e) => e.state === 'running').length;
  if (longTasks.length) failures.push(`${label}: ${longTasks.length} long task(s) while idle: ${JSON.stringify(longTasks)}; long animation frames: ${JSON.stringify(longFrames)}`);
  if (framesInWindow) failures.push(`${label}: ${framesInWindow} frame(s) drawn while nothing moved (rAF did not stop)`);
  if (running) failures.push(`${label}: ${running} effect(s) still running while idle`);
  return { windowMs: IDLE_WINDOW_MS, longTasks: longTasks.length, framesInWindow, states: after.map((e) => e.state) };
}

async function hover(page, index, failures, label) {
  await scrollTo(page, index);
  await page.waitForTimeout(1000); // let a smooth scroller come to rest
  const box = await page.evaluate((i) => {
    const r = document.querySelectorAll('.image-distortion')[i].getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    return { left: r.left, width: r.width, y: (top + bottom) / 2 };
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
  if (!restarted) failures.push(`${label}: pointer movement drew no frame (the loop did not restart; ${pointerMoves} pointermove events reached the effect, topmost element ${JSON.stringify(hit)}, state ${during.state})`);
  const t0 = Date.now();
  await settled(page);
  const settleMs = Date.now() - t0;
  const quiet = await idleWindow(page, `${label} after hover`, failures);
  return { restarted, framesDuringHover: during.frames - before, settleMs, quiet };
}

async function checkPage(browser, base, name) {
  const failures = [];
  const result = { page: name };

  // 1-3: WebGL, motion allowed.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.addInitScript(recordLongTasks);
    const resp = await page.goto(base + name, { waitUntil: 'load', timeout: 60000 });
    if (!resp || resp.status() !== 200) failures.push(`${name}: HTTP ${resp ? resp.status() : 'no response'}`);
    await settled(page);
    result.webgl = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      return gl ? gl.getParameter(gl.VERSION) : null;
    });
    result.load = await idleWindow(page, `${name} after load`, failures);

    const count = (await effects(page)).length;
    for (let i = 0; i < count; i++) await scrollTo(page, i);
    await settled(page);
    const all = await effects(page);
    result.effects = all;
    all.forEach((e, i) => {
      if (e.state !== 'idle' || !e.canvas || e.frames < 1) {
        failures.push(`${name}: effect ${i} did not draw with WebGL (state ${e.state}, frames ${e.frames}, canvas ${e.canvas})`);
      }
    });
    result.scrolled = await idleWindow(page, `${name} after scrolling every effect into view`, failures);
    result.hover = await hover(page, 0, failures, `${name} hover`);
    result.longTasksBeforeIdle = await page.evaluate(() => window.__longTasks.length);
    if (errors.length) failures.push(...errors.map((e) => `${name}: ${e}`));
    await context.close();
  }

  // 4: prefers-reduced-motion, 5: no WebGL.
  for (const [mode, state, setup] of [
    ['reduced-motion', 'static', (ctx) => ctx],
    ['no-webgl', 'fallback', async (ctx) => { await ctx.addInitScript(withoutWebGL); return ctx; }],
  ]) {
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference' });
    await setup(context);
    const page = await context.newPage();
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
    if (errors.length) failures.push(...errors.map((e) => `${name} ${mode}: ${e}`));
    result[mode] = all.map((e) => e.state);
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
  if (r.load) console.log(`  after load:   ${r.load.windowMs} ms, ${r.load.longTasks} long tasks, ${r.load.framesInWindow} frames, states ${r.load.states.join(',')}`);
  if (r.scrolled) console.log(`  after scroll: ${r.scrolled.windowMs} ms, ${r.scrolled.longTasks} long tasks, ${r.scrolled.framesInWindow} frames, frames drawn per effect ${r.effects.map((e) => e.frames).join(',')}`);
  if (r.hover) console.log(`  hover: restarted ${r.hover.restarted} (${r.hover.framesDuringHover} frames), settled in ${r.hover.settleMs} ms, then ${r.hover.quiet.longTasks} long tasks and ${r.hover.quiet.framesInWindow} frames in ${r.hover.quiet.windowMs} ms`);
  if (r['reduced-motion']) console.log(`  reduced motion: ${r['reduced-motion'].join(',')}`);
  if (r['no-webgl']) console.log(`  no WebGL: ${r['no-webgl'].join(',')}`);
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
  console.log('\ncheck-hero-idle: every effect drew, then the main thread stayed idle and rAF stopped');
}

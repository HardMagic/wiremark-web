// Verify the LIVE wiremark.net serves the lazy-load build across key pages.
import { chromium } from 'playwright';

const PAGES = ['index.html', 'index-2.html', 'index-3.html', 'index-5.html', 'about.html', 'service.html'];
const BASE = 'https://wiremark.net/';
const b = await chromium.launch();
let allClean = true;
for (const p of PAGES) {
  const ctx = await b.newContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const resp = await pg.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => null);
  await pg.waitForTimeout(1500);
  const stats = await pg.evaluate(() => ({
    lazy: document.querySelectorAll('img[loading=lazy]').length,
    eagerHigh: document.querySelectorAll('img[fetchpriority=high]').length,
    svgLazy: document.querySelectorAll('img[src$=".svg"][loading=lazy]').length,
    gl: typeof window.GLightbox !== 'undefined',
    gs: typeof window.gsap !== 'undefined',
    sw: typeof window.Swiper !== 'undefined',
    jquery: typeof window.jQuery !== 'undefined',
  })).catch(e => ({ evalErr: String(e) }));
  const clean = resp && resp.status() === 200 && errs.length === 0;
  if (!clean) allClean = false;
  console.log(`${clean ? 'CLEAN' : 'ISSUE'} ${p} status=${resp ? resp.status() : 0} ${JSON.stringify(stats)} errs=${errs.length}${errs.length ? ' ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
console.log(allClean ? '\nALL KEY PAGES CLEAN — lazy-load build is live' : '\nSOME ISSUES FOUND');
await b.close();
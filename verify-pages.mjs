import { chromium } from 'playwright';

const PAGES = [
  'index.html', 'index-2.html', 'index-3.html', 'index-4.html', 'index-5.html',
  '404.html', 'about.html', 'contact.html', 'faq.html', 'pricing.html',
  'news.html', 'news-details.html', 'news-grid.html',
  'project.html', 'project-details.html', 'service.html', 'service-details.html',
  'team.html', 'team-details.html'
];

const BASE = 'http://localhost:8917/';

function summarizeErrors(errors) {
  // De-duplicate + group
  const counts = {};
  for (const e of errors) {
    const key = (e.type === 'requestfailed' ? '[REQ] ' : '[ERR] ') + e.text;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).map(([k, v]) => `${v}x ${k}`);
}

const browser = await chromium.launch();
const results = [];
let totalErrors = 0;

for (const page of PAGES) {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const errors = [];
  const failedRequests = [];

  pg.on('console', (msg) => {
    if (msg.type() === 'error') errors.push({ type: 'console', text: msg.text() });
    // ignore 'warning' — Swiper loop + WebGL perf messages are benign/preexisting
  });
  pg.on('pageerror', (err) => {
    errors.push({ type: 'pageerror', text: String(err.message || err) });
  });
  pg.on('requestfailed', (req) => {
    failedRequests.push(`[REQFAIL] ${req.url()} → ${(req.failure() || {}).errorText || ''}`);
  });

  const resp = await pg.goto(BASE + page, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => null);
  await pg.waitForTimeout(1500);

  const title = await pg.title().catch(() => '?');
  // Check key globals/behaviors
  const probes = await pg.evaluate(() => {
    const out = {};
    out.glightboxJs = typeof window.GLightbox !== 'undefined';
    out.gsap = typeof window.gsap !== 'undefined';
    out.swiper = typeof window.Swiper !== 'undefined';
    out.wowBlocks = document.querySelectorAll('.wow').length;
    const wowVisible = [...document.querySelectorAll('.wow')].filter(e => getComputedStyle(e).visibility !== 'hidden').length;
    out.wowVisible = wowVisible;
    out.mobileMenu = !!document.querySelector('.mobile-topbar .bars');
    out.vanillaJQueryGone = typeof window.jQuery === 'undefined';
    return out;
  }).catch(e => ({ evalError: String(e) }));

  const allErrors = [...errors.map(e => e.text)]
    .concat(failedRequests)
    .concat(probes.evalError ? [probes.evalError] : []);
  const clean = allErrors.length === 0;

  results.push({ page, status: resp ? resp.status() : 0, title, clean, errors: allErrors, probes });
  totalErrors += allErrors.length;
  await ctx.close();
}

await browser.close();

console.log('\n================= PER-PAGE REPORT =================');
for (const r of results) {
  const statusIcon = r.status === 200 ? '✓' : `✗${r.status}`;
  const cleanIcon = r.clean ? 'CLEAN' : 'ERRORS';
  console.log(`\n[${statusIcon}] ${r.page} — ${cleanIcon} — "${r.title}"`);
  if (r.probes && !r.probes.evalError) {
    console.log(`    glightbox=${r.probes.glightboxJs} gsap=${r.probes.gsap} swiper=${r.probes.swiper} wow=${r.probes.wowBlocks} wowVisible=${r.probes.wowVisible} jquery=${r.probes.vanillaJQueryGone ? 'removed' : 'PRESENT'}`);
  }
  if (r.errors.length) {
    summarizeErrors(r.errors).forEach(e => console.log(`    ⚠ ${e}`));
  }
}

console.log(`\n================= SUMMARY =================`);
console.log(`Total pages: ${results.length}`);
console.log(`Fully clean (no errors): ${results.filter(r => r.clean).length}`);
console.log(`With errors: ${results.filter(r => !r.clean).length}`);
console.log(`Total error/failed-request lines: ${totalErrors}`);
process.exit(totalErrors > 0 ? 1 : 0);
import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'fs';
const base = 'http://127.0.0.1:8918/';
const files = readdirSync('.').filter(f => f.endsWith('.html') && f !== '404.html');
const b = await chromium.launch();
const fsResult = {};
for (const page of files) {
  const ctx = await b.newContext({ viewport:{width:1280,height:900} });
  const pg = await ctx.newPage();
  await pg.goto(base+page, { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(400);
  const above = await pg.evaluate(() => {
    const vh = window.innerHeight;
    return [...document.querySelectorAll('img')]
      .filter(i => { const r = i.getBoundingClientRect(); return r.width>0 && r.height>0; })
      .filter(i => i.getBoundingClientRect().top < vh)
      .map(i => (i.currentSrc||i.src||'').split('/assets/')[1])
      .filter(s => !/[.-]svg$/i.test(s) && !s.includes('/logo/'));
  });
  console.log(`${page}: ${above.length} above-fold raster imgs`);
  fsResult[page] = above;
}
await b.close();
writeFileSync('/tmp/wm-abovefold.json', JSON.stringify(fsResult, null, 1));
console.log('saved above-fold map');
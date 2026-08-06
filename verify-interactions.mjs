import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage();
pg.on('pageerror', (e) => console.log(`PAGEERROR: ${e.message}`));
pg.on('console', (m) => { if (m.type()==='error') console.log(`CONSOLE ERR: ${m.text()}`); });

await pg.goto('http://127.0.0.1:8917/index-2.html', { waitUntil:'networkidle' });

// 1) GLightbox video-popup opens
const videoLink = await pg.$('.video-popup');
if (videoLink) {
  await videoLink.click();
  await pg.waitForTimeout(1200);
  const glightboxOpen = await pg.evaluate(() => !!document.querySelector('.glightbox-container, .glightbox-mobile, #glightbox-body, .glightbox-wrap'));
  console.log(`GLIGHTBOX video popup opens: ${glightboxOpen}`);
  // close
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(600);
} else {
  console.log('no .video-popup on index-2 (unexpected)');
}

// 2) Mobile menu toggle (mobile viewport — topbar only visible at narrow width)
const mctx = await b.newContext({ viewport: { width: 390, height: 800 } });
const mpg = await mctx.newPage();
mpg.on('pageerror', (e) => console.log(`MOBILE PAGEERROR: ${e.message}`));
await mpg.goto('http://127.0.0.1:8917/index-2.html', { waitUntil:'networkidle' });
const mbars = await mpg.$('.mobile-topbar .bars');
if (mbars) {
  await mbars.click();
  await mpg.waitForTimeout(400);
  const overlayActive = await mpg.evaluate(() => document.querySelector('.mobile-menu-overlay')?.classList.contains('active'));
  const bodyNoscroll = await mpg.evaluate(() => document.body.classList.contains('no-scroll'));
  console.log(`MOBILE MENU opens (390px): overlayActive=${overlayActive} bodyNoscroll=${bodyNoscroll}`);
  // open a submenu via the level-1 handler (slideToggle)
  const subMenuLink = await mpg.$('.sub-mobile-menu > a');
  if (subMenuLink) {
    await subMenuLink.click();
    await mpg.waitForTimeout(400);
    const ulVisible = await mpg.evaluate(() => {
      const u = document.querySelector('.sub-mobile-menu > ul');
      return u ? (u.offsetHeight > 0) : null;
    });
    console.log(`MOBILE SUBMENU expands via slideToggle: ${ulVisible}`);
  }
  // close
  await mpg.evaluate(() => { document.querySelector('.close-mobile-menu')?.click(); });
  await mpg.waitForTimeout(400);
  const overlayClosed = await mpg.evaluate(() => !document.querySelector('.mobile-menu-overlay')?.classList.contains('active'));
  console.log(`MOBILE MENU closes: ${overlayClosed}`);
} else {
  console.log('no .mobile-topbar .bars at 390px (check)');
}
await mctx.close();

await pg.goto('http://127.0.0.1:8917/index.html', { waitUntil:'networkidle' });

// 3) Accordion toggle (if present)
const accBtn = await pg.$('.acc-btn');
if (accBtn) {
  const before = await pg.evaluate(() => document.querySelector('.accordion')?.classList.contains('active-block'));
  await accBtn.click();
  await pg.waitForTimeout(400);
  const after = await pg.evaluate(() => document.querySelector('.accordion')?.classList.contains('active-block'));
  console.log(`ACCORDION toggles: before=${before} after=${after} (should differ)`);
} else {
  console.log('no .acc-btn on index (ok)');
}

await b.close();
console.log('interactions done');
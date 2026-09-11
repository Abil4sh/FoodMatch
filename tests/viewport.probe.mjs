import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/tmp/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

// A spread of real laptop / phone viewports
const VIEWPORTS = [
  ['MacBook Air 13 (browser chrome)', 1440, 780],
  ['Laptop 1366x768', 1366, 640],
  ['Laptop 1280x800', 1280, 700],
  ['Large desktop', 1920, 1080],
  ['Tablet portrait', 820, 1000],
  ['iPhone', 390, 844]
];

for (const [name, w, h] of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
  await page.goto(BASE + '/create', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));

  const info = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const cta = btns.find((b) => b.textContent.includes('Continue to invites'));
    if (!cta) return { cta: false };
    const r = cta.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const doc = document.documentElement;
    return {
      cta: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      viewportH: window.innerHeight,
      belowFold: r.bottom > window.innerHeight,
      offBy: Math.round(r.bottom - window.innerHeight),
      // is the CTA actually clickable at its centre?
      clickable: hit ? cta.contains(hit) || hit === cta : false,
      pageScrollable: doc.scrollHeight > doc.clientHeight,
      scrollHeight: doc.scrollHeight,
      clientHeight: doc.clientHeight
    };
  });
  console.log(name.padEnd(32), JSON.stringify(info));
  await page.close();
}
await browser.close();

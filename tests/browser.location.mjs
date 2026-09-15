import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
let failures = 0;
const out = [];
const check = (l, c, d = '') => {
  if (c) out.push('  PASS  ' + l);
  else {
    failures += 1;
    out.push('  FAIL  ' + l + (d ? '  -> ' + d : ''));
  }
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/tmp/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/403|favicon|fonts\.|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text());
});

const apiCalls = [];
page.on('request', (r) => {
  if (/:8000\//.test(r.url())) apiCalls.push(r.url());
});

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const headerArea = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Delivering to/i.test(b.innerText));
    return btn ? btn.innerText.replace(/Delivering to/i, '').replace(/[▾▼\s]/g, ' ').trim() : null;
  });
const openPicker = async () => {
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => /Delivering to/i.test(b.innerText))?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
};
const pickArea = async (name) => {
  const ok = await page.evaluate((n) => {
    const btn = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.innerText.trim().startsWith(n));
    if (!btn) return false;
    btn.click();
    return true;
  }, name);
  await new Promise((r) => setTimeout(r, 1400));
  return ok;
};
const deckNames = () =>
  page.evaluate(() => [...document.querySelectorAll('article h2')].map((h) => h.textContent.trim()));

await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

// ---------- FLOW 1: pick a popular area ----------
check('Header shows the default area', (await headerArea()) === 'HSR Layout', await headerArea());
await openPicker();
const sheet = await text();
check('Location sheet opens', /Where are you eating\?/i.test(sheet), sheet.slice(0, 120));
check('Sheet lists popular areas', /Koramangala/.test(sheet) && /Whitefield/.test(sheet));
check('Sheet offers device location', /Use my location/i.test(sheet));

const before = apiCalls.length;
check('Picked Koramangala', await pickArea('Koramangala'));
check('Header updates to the new area', (await headerArea()) === 'Koramangala', await headerArea());
const feedCalls = apiCalls.slice(before).filter((u) => u.includes('/api/feed/'));
check('Changing area refetches the feed exactly once', feedCalls.length === 1, JSON.stringify(feedCalls));
check('Feed request carries the new coordinates', /lat=12\.9352/.test(feedCalls[0] || ''), feedCalls[0]);

// ---------- FLOW 6: persistence ----------
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
check('Selected area survives a refresh', (await headerArea()) === 'Koramangala', await headerArea());
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.location.v1')));
check('Area persisted with coordinates', stored?.name === 'Koramangala' && stored.latitude === 12.9352, JSON.stringify(stored));

// ---------- FLOW 2: typed search ----------
await openPicker();
const callsBeforeTyping = apiCalls.length;
await page.evaluate(() => {
  const input = document.querySelector('[role="dialog"] input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  for (const value of ['W', 'Wh', 'Whi', 'Whit', 'White']) {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await new Promise((r) => setTimeout(r, 200));
const duringTyping = apiCalls.slice(callsBeforeTyping).filter((u) => u.includes('/locations/search/'));
check('Typing does not fire a request per keystroke', duringTyping.length === 0, JSON.stringify(duringTyping));
await new Promise((r) => setTimeout(r, 1000));
const afterDebounce = apiCalls.slice(callsBeforeTyping).filter((u) => u.includes('/locations/search/'));
check('One search fires after the debounce', afterDebounce.length === 1, JSON.stringify(afterDebounce));
check('Search results show the typed area', /Whitefield/.test(await text()));
check('Picked Whitefield from search', await pickArea('Whitefield'));
check('Header updates to Whitefield', (await headerArea()) === 'Whitefield', await headerArea());

// ---------- FLOW 3: menu on the detail screen ----------
await page.goto(BASE + '/restaurant/r_ramen_house', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 900));
const detail = await text();
check('Detail shows typical spend', /Typical spend/i.test(detail), detail.slice(0, 300));
check('Detail shows a popular dishes section', /Popular dishes/i.test(detail));
check('Detail lists representative dishes', /Tonkotsu Ramen/.test(detail) && /Gyoza/.test(detail));
check('Detail shows dish prices', /₹380|₹480|₹240/.test(detail), detail.slice(0, 400));
check('Prices are marked approximate', /Approx\./i.test(detail) && /indicative/i.test(detail));

await page.evaluate(() => {
  window.__opened = null;
  window.open = (url) => {
    window.__opened = url;
    return null;
  };
});
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Directions')?.click());
await new Promise((r) => setTimeout(r, 400));
const opened = await page.evaluate(() => window.__opened);
check('Directions still works', /google\.com\/maps\/dir\/\?api=1/.test(opened || ''), String(opened));
check('Directions has no API key', !/key=|AIza/i.test(opened || ''), String(opened));

// ---------- FLOW 5: restaurant with no curated menu ----------
await page.goto(BASE + '/restaurant/r_ramen_house', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const noMenu = await page.evaluate(async () => {
  // A live provider record has no curated menu; simulate reaching one.
  const res = await fetch('http://127.0.0.1:8000/api/restaurants/search/?q=ramen');
  return (await res.json()).source;
});
check('Search endpoint reachable for the no-menu case', typeof noMenu === 'string', String(noMenu));

// ---------- FLOW 4: dishes mode (solo browse) ----------
await page.goto(BASE + '/browse?mode=dishes', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
const dishText = await text();
const names = await deckNames();
check('Dishes mode shows a dish card', names.length > 0, JSON.stringify(names));
check('Dish card shows a price', /₹\d+/.test(dishText), dishText.slice(0, 220));
const deckCount = await page.evaluate(() => document.body.innerText.match(/\d+ \/ (\d+)/)?.[1]);
check('Dishes deck is the expanded curated catalog', Number(deckCount) > 12, String(deckCount));

check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(out.join('\n'));
console.log(failures === 0 ? '\nALL LOCATION + MENU CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
await browser.close();
process.exit(failures ? 1 : 0);

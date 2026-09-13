import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const W = Number(process.env.VW || 390);
const H = Number(process.env.VH || 844);
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
await page.setViewport({ width: W, height: H, isMobile: W < 500, hasTouch: W < 500 });
page.on('dialog', (d) => d.dismiss());
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/403|favicon|fonts\.googleapis|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const path = () => page.evaluate(() => location.pathname);
const clickText = async (label, exact = false) => {
  const h = await page.evaluateHandle(
    (l, e) =>
      [...document.querySelectorAll('button, a')].find((b) => {
        const t = b.textContent.replace(/\s+/g, ' ').trim();
        return e ? t.toLowerCase() === l.toLowerCase() : t.toLowerCase().includes(l.toLowerCase());
      }) || null,
    label,
    exact
  );
  const el = h.asElement();
  if (!el) throw new Error('missing control: ' + label + ' at ' + (await path()));
  await el.click();
  await new Promise((r) => setTimeout(r, 550));
};

await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());

// ---- empty states before any data ----
await page.goto(BASE + '/matches', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
check('Empty history state', /no matches yet/i.test(await text()), (await text()).slice(0, 160));

await page.goto(BASE + '/profile', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
check('Empty Food DNA state', /food dna is still blank/i.test(await text()), (await text()).slice(0, 200));

await page.goto(BASE + '/groups', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
check('Empty groups state', /no group running/i.test(await text()), (await text()).slice(0, 160));

await page.goto(BASE + '/restaurant/does_not_exist', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
check('Missing restaurant state', /can't find that place|cant find that place/i.test(await text()), (await text()).slice(0, 160));

await page.goto(BASE + '/total/nonsense/route', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
check('Invalid route state', /doesn't exist|does not exist/i.test(await text()), (await text()).slice(0, 160));
check('Invalid route does not crash', errors.length === 0, errors.slice(0, 2).join(' | '));

// ---- full flow ----
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));
await clickText('FoodMatch');
check('Reached create', (await path()) === '/create', await path());
await page.type('#matchName', 'Friday Dinner');
await clickText('Biryani', true);
await clickText('Continue to invites');

const rows = await page.$$('ul li button');
for (let i = 0; i < 3; i += 1) {
  const btns = await page.$$('ul li button');
  await btns[i].click();
  await new Promise((r) => setTimeout(r, 200));
}
check('Invited three friends', rows.length >= 3);
for (let i = 0; i < 40; i += 1) {
  const g = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1')));
  if (g.members.every((m) => m.status !== 'invited')) break;
  await new Promise((r) => setTimeout(r, 400));
}
await clickText('Start match');
check('Reached lobby', (await path()).startsWith('/lobby/'), await path());
for (let i = 0; i < 60; i += 1) {
  if (/everyone's ready/i.test(await text())) break;
  await new Promise((r) => setTimeout(r, 400));
}
await clickText('Start swiping');
check('Reached swipe', (await path()).startsWith('/swipe/'), await path());

for (let i = 0; i < 12; i += 1) {
  const b = await page.$(i % 4 === 0 ? '[aria-label="Pass on this"]' : '[aria-label="Like this"]');
  if (!b) break;
  await b.click();
  await new Promise((r) => setTimeout(r, 300));
}
for (let i = 0; i < 80; i += 1) {
  const g = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1')));
  if (g.result) break;
  await new Promise((r) => setTimeout(r, 400));
}
await clickText('See what you matched on');
check('Reached match reveal', (await path()).startsWith('/match/'), await path());

const store = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1')));
const winner = store.result.winner;

// ---- winner -> detail ----
await page.evaluate(() => document.querySelector('article button')?.click());
await new Promise((r) => setTimeout(r, 900));
check('Winner opens the detail screen', (await path()) === '/restaurant/' + winner.cardId, await path());
const detail = await text();
check('Detail shows the winner name', detail.includes(winner.card.name), detail.slice(0, 160));
check('Detail shows a description', /serves|known for/i.test(detail), detail.slice(0, 250));
check('Detail shows rating, distance and price', /★|\u2605/.test(detail) && /km/.test(detail) && /₹/.test(detail));
check('Detail shows the group match', /group match/i.test(detail), detail.slice(0, 300));
check(
  'Detail group match equals the engine',
  new RegExp(winner.percent + '%').test(detail) && new RegExp(winner.likes + ' of ' + store.result.totalMembers).test(detail),
  detail.slice(0, 320)
);
check('Detail offers directions and a new match', /directions/i.test(detail) && /start another foodmatch/i.test(detail));

const hasMenu = /what to order|also from here/i.test(detail);
if (hasMenu) {
  const before = await path();
  await page.evaluate(() => [...document.querySelectorAll('ul li button')].pop()?.click());
  await new Promise((r) => setTimeout(r, 800));
  check('Related dish opens its own detail', (await path()) !== before && (await path()).startsWith('/restaurant/'), await path());
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 600));
}

// ---- profile + food DNA ----
await page.goto(BASE + '/profile', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));
const profile = await text();
check('Profile shows the user', /abilash/i.test(profile), profile.slice(0, 160));
check('Profile shows Food DNA', /food dna/i.test(profile));
check('Food DNA is populated after swiping', !/still blank/i.test(profile), profile.slice(0, 260));
check('Profile shows statistics', /matches played/i.test(profile) && /places liked/i.test(profile));
const dnaBars = await page.evaluate(() => document.querySelectorAll('ul li [class*="bar"]').length);
check('Food DNA renders dimensions', dnaBars >= 5, String(dnaBars));

// ---- history ----
await page.goto(BASE + '/matches', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));
const hist = await text();
check('History lists the finished match', /friday dinner/i.test(hist), hist.slice(0, 200));
check('History shows the winner', hist.includes(winner.card.name), hist.slice(0, 220));
check('History shows the percentage', hist.includes(winner.percent + '%'), hist.slice(0, 220));
check('History shows a date', /today|yesterday|days ago|\d/i.test(hist));
await page.evaluate(() => document.querySelector('ul li button')?.click());
await new Promise((r) => setTimeout(r, 800));
check('History entry opens the detail', (await path()).startsWith('/restaurant/'), await path());

// ---- groups tab now reflects the live group ----
await page.goto(BASE + '/groups', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));
const groups = await text();
check('Groups shows the active match', /friday dinner/i.test(groups), groups.slice(0, 200));
check('Groups reflects the matched stage', /matched|see your match/i.test(groups), groups.slice(0, 200));

// ---- tab bar navigation ----
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));
const tabs = await page.evaluate(() => [...document.querySelectorAll('nav a')].map((a) => a.getAttribute('href')));
check('Tab bar links to all main sections', ['/', '/groups', '/matches', '/profile'].every((t) => tabs.includes(t)), JSON.stringify(tabs));
await page.evaluate(() => document.querySelector('nav a[href="/profile"]')?.click());
await new Promise((r) => setTimeout(r, 700));
check('Tab bar navigates', (await path()) === '/profile', await path());

// ---- persistence ----
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));
check('Profile survives a refresh', /food dna/i.test(await text()) && !/still blank/i.test(await text()));
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1')));
check('Match result survives a refresh', after.result?.winner?.cardId === winner.cardId);

check('No console errors across the whole product', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.goto(BASE + '/profile', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: '/tmp/m5-profile-' + (W < 500 ? 'mobile' : 'desktop') + '.png' });
await page.goto(BASE + '/restaurant/' + winner.cardId + '?from=match', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/m5-detail-' + (W < 500 ? 'mobile' : 'desktop') + '.png' });

console.log(`viewport ${W}x${H}`);
console.log(out.join('\n'));
console.log(failures === 0 ? '\nALL PRODUCT CHECKS PASSED' : '\n' + failures + ' PRODUCT CHECK(S) FAILED');
await browser.close();
process.exit(failures ? 1 : 0);

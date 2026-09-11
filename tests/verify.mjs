import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/tmp/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/403|favicon|fonts\.googleapis/.test(m.text()) && errors.push(m.text()));

const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1') || 'null'));
const snap = async (tag) => {
  const g = await store();
  console.log(
    `[${tag}]`,
    'members=' + (g?.members?.length ?? '-'),
    JSON.stringify(g?.members?.map((m) => m.id + ':' + m.status) || []),
    'voters=' + Object.keys(g?.votes || {}).length
  );
  return g;
};
const clickText = async (label, exact = false) => {
  const h = await page.evaluateHandle(
    (l, e) =>
      [...document.querySelectorAll('button')].find((b) => {
        const t = b.textContent.replace(/\s+/g, ' ').trim();
        return e ? t.toLowerCase() === l.toLowerCase() : t.toLowerCase().includes(l.toLowerCase());
      }) || null,
    label,
    exact
  );
  const el = h.asElement();
  if (!el) throw new Error('missing button: ' + label);
  await el.click();
  await new Promise((r) => setTimeout(r, 450));
};

await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));

await clickText('FoodMatch');
await page.type('#matchName', 'Friday Dinner');
await clickText('Biryani', true);
await clickText('Continue to invites');
await snap('after create');

// how many friends does the mock data actually offer?
const friendCount = await page.evaluate(
  () => document.querySelectorAll('ul li button').length
);
console.log('friend rows on invite screen:', friendCount);

// invite every friend shown
const names = await page.evaluate(() =>
  [...document.querySelectorAll('ul li button')].map((b) => b.querySelector('span')?.textContent?.trim() || b.textContent.trim().slice(0, 12))
);
console.log('friends:', JSON.stringify(names));
const inviteN = Number(process.env.INVITE || friendCount);
for (let i = 0; i < inviteN; i += 1) {
  const btns = await page.$$('ul li button');
  await btns[i].click();
  await new Promise((r) => setTimeout(r, 200));
}
await snap('after inviting all');

for (let i = 0; i < 40; i += 1) {
  const g = await store();
  if (g.members.every((m) => m.status !== 'invited')) break;
  await new Promise((r) => setTimeout(r, 400));
}
await snap('after joins');

await clickText('Start match');
await snap('in lobby');

for (let i = 0; i < 60; i += 1) {
  const g = await store();
  if (g.members.every((m) => m.status === 'ready' || m.status === 'host')) break;
  await new Promise((r) => setTimeout(r, 400));
}
await snap('all ready');

await clickText('Start swiping');
await new Promise((r) => setTimeout(r, 700));
await snap('entering swipe');

for (let i = 0; i < 12; i += 1) {
  const b = await page.$(i % 4 === 0 ? '[aria-label="Pass on this"]' : '[aria-label="Like this"]');
  if (!b) break;
  await b.click();
  await new Promise((r) => setTimeout(r, 300));
}
await snap('deck finished');

for (let i = 0; i < 80; i += 1) {
  const g = await store();
  if (g.result) break;
  await new Promise((r) => setTimeout(r, 400));
}
const g = await snap('after engine');

const r = g.result;
console.log('--- ENGINE OUTPUT ---');
console.log('totalMembers:', r.totalMembers);
console.log('winner:', r.winner.card.name, r.winner.likes + '/' + r.totalMembers, r.winner.percent + '%');
console.log('likedBy:', JSON.stringify(r.winner.likedBy));
console.log(
  'per-member vote counts:',
  JSON.stringify(Object.fromEntries(Object.entries(g.votes).map(([k, v]) => [k, Object.keys(v).length])))
);

await clickText('See what you matched on');
await new Promise((r2) => setTimeout(r2, 1200));
const shown = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
console.log('--- REVEAL TEXT ---');
console.log(shown.slice(0, 320));
await page.screenshot({ path: '/tmp/verify-reveal.png' });
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();

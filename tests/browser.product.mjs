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
// The real group journey is covered end-to-end by tests/browser.group.mjs
// with two live participants. Here we only need a restaurant to open, so we
// browse solo rather than re-driving a group session.
await page.goto(BASE + '/browse', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
check('Solo browse renders a deck', (await page.$('article')) !== null);

for (let i = 0; i < 40; i += 1) {
  const b = await page.$(i % 2 === 0 ? '[aria-label="Like this"]' : '[aria-label="Pass on this"]');
  if (!b) break;
  await b.click();
  await new Promise((r) => setTimeout(r, 200));
}
await new Promise((r) => setTimeout(r, 900));
check('Solo finishes with a shortlist', /your shortlist/i.test(await text()), (await text()).slice(0, 160));
await page.evaluate(() => document.querySelector('ul li button')?.click());
await new Promise((r) => setTimeout(r, 1200));
const winner = { cardId: (await path()).split('/').pop(), card: { name: '' } };
check('Shortlist opens a restaurant', (await path()).startsWith('/restaurant/'), await path());

// ---- winner -> detail ----
await page.evaluate(() => document.querySelector('article button')?.click());
await new Promise((r) => setTimeout(r, 900));
const detail = await text();
check('Detail shows a description', /serves|known for/i.test(detail), detail.slice(0, 250));
check('Detail shows rating, distance and price', /★|\u2605/.test(detail) && /km/.test(detail) && /₹/.test(detail));
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

// ---- history + groups (populated by a real group session) ----
// tests/browser.group.mjs covers the full journey; here we seed one via the
// API so the history and groups screens have real data to render.
const seeded = await page.evaluate(async (base) => {
  const post = (path, body, token) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-FoodMatch-Participant': token } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }).then((r) => r.json());

  const created = await post('/api/groups/', {
    name: 'Friday Dinner',
    displayName: 'Abilash',
    mode: 'restaurants',
    latitude: 12.9121,
    longitude: 77.6446
  });
  const code = created.group.code;
  const host = created.participantToken;
  const guest = (await post(`/api/groups/${code}/join/`, { displayName: 'Rahul' })).participantToken;
  await post(`/api/groups/${code}/start/`, null, host);

  const deck = await fetch(base + `/api/groups/${code}/deck/`, {
    headers: { 'X-FoodMatch-Participant': host }
  }).then((r) => r.json());

  for (const card of deck.cards) {
    await post(`/api/groups/${code}/votes/`, { cardId: card.id, direction: 'like' }, host);
    await post(`/api/groups/${code}/votes/`, { cardId: card.id, direction: 'like' }, guest);
  }
  await post(`/api/groups/${code}/finish/`, null, host);
  await post(`/api/groups/${code}/finish/`, null, guest);

  localStorage.setItem('foodmatch.session.v1', JSON.stringify({ code, token: host }));
  return { code, cards: deck.cards.length };
}, 'http://127.0.0.1:8000');

check('Seeded a real group session', seeded.cards > 0, JSON.stringify(seeded));

await page.goto(BASE + '/match/' + seeded.code, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1800));
check('Reveal renders the server result', /people matched/i.test(await text()), (await text()).slice(0, 200));

await page.goto(BASE + '/matches', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 900));
const hist = await text();
check('History lists the finished match', /friday dinner/i.test(hist), hist.slice(0, 200));
check('History shows the percentage', /\d+%/.test(hist), hist.slice(0, 220));
await page.evaluate(() => document.querySelector('ul li button')?.click());
await new Promise((r) => setTimeout(r, 900));
check('History entry opens the detail', (await path()).startsWith('/restaurant/'), await path());

await page.goto(BASE + '/groups', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
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

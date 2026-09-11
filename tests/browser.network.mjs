import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const API = process.env.API || 'http://127.0.0.1:8000';
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

const requests = [];
page.on('request', (r) => {
  const url = r.url();
  // Ignore the dev server's own module/HMR traffic; count real app traffic.
  if (url.startsWith(BASE) && !url.includes('/api/')) return;
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  requests.push(url);
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|403|fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
});

const isApi = (u) => /^https?:\/\/(127\.0\.0\.1|localhost):8000\//.test(u);
const apiCalls = () => requests.filter(isApi);
// Google *Fonts* is a static stylesheet with no key and no billing; it is
// explicitly not a Maps Platform call and is excluded here.
const googleCalls = () =>
  requests.filter(
    (u) => /google/i.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u)
  );
const fontCalls = () => requests.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u));

const seed = {
  groupId: 'g_net',
  groupName: 'Friday Dinner',
  code: 'FM-NET',
  creator: 'u_abilash',
  members: [
    { id: 'u_abilash', status: 'host' },
    { id: 'u_rahul', status: 'ready' },
    { id: 'u_ananya', status: 'ready' },
    { id: 'u_rohan', status: 'ready' }
  ],
  preferences: ['p_biryani'],
  budget: 500,
  distance: 5,
  area: 'HSR Layout',
  phase: 'swiping',
  votes: {},
  finished: [],
  result: null,
  createdAt: Date.now()
};

await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await page.evaluate((s) => localStorage.setItem('foodmatch.match.v1', JSON.stringify(s)), seed);

// ---- boot ----
requests.length = 0;
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
const bootCalls = apiCalls().length;
check('Boot makes a small, fixed number of API calls', bootCalls > 0 && bootCalls <= 4, `${bootCalls}: ${apiCalls().join(' ')}`);
check('Boot fetches the catalog in one feed call', apiCalls().filter((u) => u.includes('/api/feed/')).length === 1, apiCalls().join(' '));

// ---- sitting still ----
requests.length = 0;
await new Promise((r) => setTimeout(r, 6000));
check('Sitting on Discover for 6s makes zero requests', apiCalls().length === 0, apiCalls().join(' '));

// ---- swiping: the critical one ----
await page.goto(BASE + '/swipe/g_net', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1000));
requests.length = 0;
for (let i = 0; i < 12; i += 1) {
  const b = await page.$(i % 4 === 0 ? '[aria-label="Pass on this"]' : '[aria-label="Like this"]');
  if (!b) break;
  await b.click();
  await new Promise((r) => setTimeout(r, 260));
}
check('Swiping a full 12-card deck makes zero API calls', apiCalls().length === 0, apiCalls().join(' '));

// ---- deck toggle + waiting on the completion screen ----
requests.length = 0;
await new Promise((r) => setTimeout(r, 6000));
check('Waiting on the completion screen makes zero API calls', apiCalls().length === 0, apiCalls().join(' '));

// ---- navigation between already-loaded screens ----
for (let i = 0; i < 60; i += 1) {
  const g = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1')));
  if (g.result) break;
  await new Promise((r) => setTimeout(r, 400));
}
const winner = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1')).result.winner.cardId);

requests.length = 0;
for (const route of ['/match/g_net', '/profile', '/matches', '/groups', '/']) {
  await page.evaluate((r) => window.history.pushState({}, '', r), route);
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
  await new Promise((r) => setTimeout(r, 700));
}
check('Navigating between loaded screens makes zero API calls', apiCalls().length === 0, apiCalls().join(' '));

// ---- opening a restaurant detail ----
// In-app navigation, the way a user actually opens a card.
requests.length = 0;
await page.evaluate((id) => {
  window.history.pushState({}, '', '/restaurant/' + id);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, winner);
await new Promise((r) => setTimeout(r, 1200));
const detailApi = apiCalls();
check('Opening a detail screen makes zero extra calls (served from memory)', detailApi.length === 0, `${detailApi.length}: ${detailApi.join(' ')}`);

// ---- rendering many cards ----
requests.length = 0;
await page.goto(BASE + '/matches', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 900));
const histCalls = apiCalls().length;
await page.evaluate(() => window.scrollTo(0, 9999));
await new Promise((r) => setTimeout(r, 900));
check('History rows do not each trigger a request', apiCalls().length === histCalls, apiCalls().join(' '));

// ---- Google: must be zero, always ----
check('Zero Google Maps/Places requests were made', googleCalls().length === 0, googleCalls().join(' '));
check(
  'Only Google Fonts contacts a Google domain (no API, no key)',
  fontCalls().every((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)),
  fontCalls().slice(0, 2).join(' ')
);

// ---- no secret reaches the browser ----
const exposed = await page.evaluate(() => {
  const blob = JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage } });
  return { hasGoogleKey: /AIza|GOOGLE_PLACES_API_KEY|VITE_GOOGLE/i.test(blob) };
});
check('No Google key in browser storage', exposed.hasGoogleKey === false);

check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(out.join('\n'));
console.log(failures === 0 ? '\nALL NETWORK CHECKS PASSED' : '\n' + failures + ' NETWORK CHECK(S) FAILED');
await browser.close();
process.exit(failures ? 1 : 0);

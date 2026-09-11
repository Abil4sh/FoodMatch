import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/tmp/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const SEED = {
  groupId: 'g_audit',
  groupName: 'Friday Dinner',
  code: 'FM-AUD',
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

const ROUTES = [
  ['/', 'Discover'],
  ['/create', 'Create'],
  ['/invite/g_audit', 'Invite'],
  ['/lobby/g_audit', 'Lobby'],
  ['/swipe/g_audit', 'Swipe'],
  ['/restaurant/r_ramen_house', 'Detail (restaurant)'],
  ['/restaurant/d_shawarma', 'Detail (dish)'],
  ['/groups', 'Groups'],
  ['/matches', 'History'],
  ['/profile', 'Profile'],
  ['/nope/nope', 'Not found']
];

const VIEWPORTS = [
  ['mobile', 360, 720],
  ['phone', 390, 844],
  ['laptop', 1366, 640],
  ['desktop', 1920, 1080]
];

const findings = [];

for (const [vpName, w, h] of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 });
  page.on('pageerror', (e) => findings.push(`[${vpName}] PAGEERROR ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/403|favicon|fonts\.googleapis/.test(m.text())) findings.push(`[${vpName}] CONSOLE ${m.text()}`);
  });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((seed) => localStorage.setItem('foodmatch.match.v1', JSON.stringify(seed)), SEED);

  for (const [route, label] of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 650));

    const report = await page.evaluate(() => {
      const issues = [];
      const doc = document.documentElement;

      // horizontal overflow
      if (doc.scrollWidth > doc.clientWidth + 1) issues.push(`h-overflow page ${doc.scrollWidth}>${doc.clientWidth}`);

      // any element sticking out sideways
      const vw = doc.clientWidth;
      [...document.querySelectorAll('body *')].forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.right > vw + 2 || r.left < -2) {
          const cls = (el.className.baseVal ?? el.className ?? '').toString().slice(0, 28);
          issues.push(`offscreen-x ${el.tagName}.${cls} [${Math.round(r.left)},${Math.round(r.right)}]`);
        }
      });

      // interactive elements without an accessible name
      [...document.querySelectorAll('button, a')].forEach((el) => {
        const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!name) {
          const cls = (el.className ?? '').toString().slice(0, 28);
          issues.push(`no-accessible-name ${el.tagName}.${cls}`);
        }
      });

      // touch target size on the primary controls
      [...document.querySelectorAll('button')].forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        if (r.height < 28 || r.width < 28) {
          const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20);
          issues.push(`small-target "${name}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      });

      // heading hierarchy
      const heads = [...document.querySelectorAll('h1,h2,h3,h4')].map((x) => Number(x.tagName[1]));
      if (heads.length === 0) issues.push('no-heading');
      else {
        if (heads[0] !== 1) issues.push(`first-heading-h${heads[0]}`);
        for (let i = 1; i < heads.length; i += 1) if (heads[i] - heads[i - 1] > 1) issues.push(`heading-jump h${heads[i - 1]}->h${heads[i]}`);
      }

      // images / graphics need a label
      [...document.querySelectorAll('img')].forEach((im) => {
        if (!im.getAttribute('alt')) issues.push('img-no-alt ' + (im.src || '').slice(-30));
      });
      [...document.querySelectorAll('[role="img"]')].forEach((im) => {
        if (!im.getAttribute('aria-label')) issues.push('roleimg-no-label');
      });

      return issues;
    });

    report.forEach((i) => findings.push(`[${vpName}] ${label} ${route} :: ${i}`));
  }
  await page.close();
}

// keyboard focus visibility, checked once
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE + '/create', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { none: true };
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
      outline: cs.outlineStyle + ' ' + cs.outlineWidth,
      boxShadow: cs.boxShadow.slice(0, 40)
    };
  });
  console.log('keyboard focus after 4 tabs:', JSON.stringify(focus));
  await page.close();
}

const unique = [...new Set(findings)];
console.log('\n--- AUDIT FINDINGS (' + unique.length + ') ---');
unique.forEach((f) => console.log(' ', f));
if (unique.length === 0) console.log('  none');
await browser.close();

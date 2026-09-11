import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const W = Number(process.env.VW || 1366);
const H = Number(process.env.VH || 640);
let failures = 0;
const out = [];
const check = (label, cond, detail = '') => {
  if (cond) out.push('  PASS  ' + label);
  else {
    failures += 1;
    out.push('  FAIL  ' + label + (detail ? '  -> ' + detail : ''));
  }
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/tmp/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, isMobile: W < 500, hasTouch: W < 500 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/403|favicon|fonts\.googleapis/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const textLC = async () => (await text()).toLowerCase();
const path = () => page.evaluate(() => location.pathname);

// clickByText only succeeds if the element is genuinely on screen and hit-testable
async function clickByText(label, exact = false) {
  const handle = await page.evaluateHandle(
    (label, exact) => {
      const els = [...document.querySelectorAll('button')];
      return (
        els.find((b) => {
          const t = b.textContent.replace(/\s+/g, ' ').trim();
          return exact ? t.toLowerCase() === label.toLowerCase() : t.toLowerCase().includes(label.toLowerCase());
        }) || null
      );
    },
    label,
    exact
  );
  const el = handle.asElement();
  if (!el) throw new Error('no button matching: ' + label);
  const vis = await el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      onScreen: r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth && r.left >= 0,
      hittable: hit ? n.contains(hit) || n === hit : false,
      disabled: n.disabled
    };
  });
  await el.click(); // puppeteer click fails if the element isn't clickable
  return vis;
}

await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));

// ---- Discover -> Create ----
await clickByText('FoodMatch');
await new Promise((r) => setTimeout(r, 500));
check('Reached /create', (await path()) === '/create', await path());

// ---- fill the form ----
await page.type('#matchName', 'Friday Dinner');
const nameOk = await page.$eval('#matchName', (i) => i.value);
check('Name field updates React state', nameOk === 'Friday Dinner', nameOk);

const chip = await clickByText('Biryani', true);
check('Preference chip is on screen and clickable', chip.onScreen && chip.hittable, JSON.stringify(chip));
const pressed = await page.evaluate(
  () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Biryani')?.getAttribute('aria-pressed')
);
check('Preference selection updates state', pressed === 'true', String(pressed));

const scrollable = await page.evaluate(() => {
  const body = document.querySelector('[class*="body"]');
  return { canScroll: body.scrollHeight > body.clientHeight, sh: body.scrollHeight, ch: body.clientHeight };
});
await clickByText('₹700', true);
const budgetOn = await page.evaluate(
  () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '₹700')?.getAttribute('aria-selected')
);
check('Budget is reachable and selectable', budgetOn === 'true', JSON.stringify(scrollable));
await clickByText('2 km', true);
const distOn = await page.evaluate(
  () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '2 km')?.getAttribute('aria-selected')
);
check('Distance is reachable and selectable', distOn === 'true');
check('Form scrolls inside the phone body, not the page', !scrollable.canScroll || scrollable.sh > scrollable.ch, JSON.stringify(scrollable));

// ---- the bug: is the CTA visible and clickable without manual scrolling? ----
const cta = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Continue to invites'));
  const r = b.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return {
    y: Math.round(r.y),
    bottom: Math.round(r.bottom),
    vh: innerHeight,
    onScreen: r.bottom <= innerHeight && r.top >= 0,
    hittable: hit ? b.contains(hit) || hit === b : false,
    disabled: b.disabled,
    scrollY: window.scrollY
  };
});
check('CTA is within the viewport without scrolling', cta.onScreen, JSON.stringify(cta));
check('CTA is hit-testable', cta.hittable, JSON.stringify(cta));
check('CTA is enabled after valid input', cta.disabled === false, JSON.stringify(cta));
check('No manual page scrolling was needed', cta.scrollY === 0, String(cta.scrollY));

await clickByText('Continue to invites');
await new Promise((r) => setTimeout(r, 600));
check('CTA navigates to /invite/:groupId', /^\/invite\/g_friday_dinner_/.test(await path()), await path());

// ---- Invite ----
const inviteText = await text();
check('Invite shows the match name', inviteText.toLowerCase().includes('friday dinner'));
check('Invite shows a code', /FM-[A-Z0-9]{4}/.test(inviteText), inviteText.slice(0, 120));
for (const friend of ['Rahul', 'Ananya', 'Rohan']) await clickByText(friend);
for (let i = 0; i < 30 && !(await textLC()).includes('joined'); i += 1) await new Promise((r) => setTimeout(r, 500));
check('Friends join', (await textLC()).includes('joined'), (await text()).slice(0, 300));

const startMatch = await clickByText('Start match');
check('Start match is on screen', startMatch.onScreen && startMatch.hittable, JSON.stringify(startMatch));
await new Promise((r) => setTimeout(r, 600));
check('Reached /lobby/:groupId', (await path()).startsWith('/lobby/'), await path());

// ---- Lobby ----
const lobbyText = await text();
check('Lobby shows budget', lobbyText.toLowerCase().includes('₹700 per head'), lobbyText.slice(0, 250));
check('Lobby shows distance', lobbyText.toLowerCase().includes('within 2 km'));

for (let i = 0; i < 40 && !(await textLC()).includes("everyone's ready"); i += 1) await new Promise((r) => setTimeout(r, 500));
check('Everyone becomes ready', (await textLC()).includes("everyone's ready"), (await text()).slice(0, 200));

const startSwipe = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Start swiping'));
  const r = b.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { onScreen: r.bottom <= innerHeight && r.top >= 0, hittable: hit ? b.contains(hit) : false, disabled: b.disabled };
});
check('Start swiping is on screen and enabled', startSwipe.onScreen && startSwipe.hittable && !startSwipe.disabled, JSON.stringify(startSwipe));
await clickByText('Start swiping');
await new Promise((r) => setTimeout(r, 700));
check('Reached /swipe/:groupId', (await path()).startsWith('/swipe/'), await path());

// ---- back navigation ----
await page.goBack({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 600));
check('Back navigation returns to the lobby', (await path()).startsWith('/lobby/'), await path());

check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`viewport ${W}x${H}`);
console.log(out.join('\n'));
console.log(failures === 0 ? '\nALL FLOW CHECKS PASSED' : '\n' + failures + ' FLOW CHECK(S) FAILED');
await browser.close();
process.exit(failures ? 1 : 0);

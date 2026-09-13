import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
const MOBILE = !process.env.VW;
let failures = 0;
const out = [];
function check(label, cond, detail = '') {
  if (cond) out.push('  PASS  ' + label);
  else {
    failures += 1;
    out.push('  FAIL  ' + label + (detail ? '  -> ' + detail : ''));
  }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/tmp/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({
  width: Number(process.env.VW || 390),
  height: Number(process.env.VH || 844),
  deviceScaleFactor: 1,
  isMobile: MOBILE,
  hasTouch: MOBILE
});

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/403|favicon|fonts\.googleapis|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.setItem(
    'foodmatch.match.v1',
    JSON.stringify({
      groupId: 'g_drag_test',
      groupName: 'Friday Dinner',
      code: 'FM-TEST',
      creator: 'u_abilash',
      members: [
        { id: 'u_abilash', status: 'host' },
        { id: 'u_rahul', status: 'ready' },
        { id: 'u_ananya', status: 'ready' }
      ],
      preferences: ['p_biryani'],
      budget: 500,
      distance: 5,
      area: 'HSR Layout',
      phase: 'swiping',
      votes: {},
      createdAt: Date.now()
    })
  );
});
await page.goto(BASE + '/swipe/g_drag_test', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));

const state = () =>
  page.evaluate(() => {
    const arts = [...document.querySelectorAll('article')];
    const top = arts[arts.length - 1];
    const r = top?.getBoundingClientRect();
    return {
      count: arts.length,
      name: top?.querySelector('h2')?.textContent,
      rect: r && { x: r.x, y: r.y, w: r.width, h: r.height },
      transform: top ? getComputedStyle(top).transform : null,
      progress: document.body.textContent.match(/(\d+) \/ (\d+)/)?.[0],
      youProgress: [...document.querySelectorAll('span')]
        .map((n) => n.textContent.trim())
        .find((tx) => /^\d+\/\d+$/.test(tx)),
      stamps: [...(top?.querySelectorAll('span') || [])]
        .map((s) => ({ t: s.textContent, o: getComputedStyle(s).opacity }))
        .filter((s) => s.t === 'Like' || s.t === 'Pass')
    };
  });

async function drag(dx, { release = true, touch = false } = {}) {
  const s = await state();
  const cx = s.rect.x + s.rect.w / 2;
  const cy = s.rect.y + s.rect.h / 2;
  let midStamps = null;
  if (touch) {
    const t = await page.createCDPSession();
    await t.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    for (const step of [0.3, 0.6, 1]) {
      await t.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + dx * step, y: cy }] });
      await new Promise((r) => setTimeout(r, 60));
    }
    midStamps = (await state()).stamps;
    if (release) await t.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await page.mouse.move(cx + dx * step, cy, { steps: 3 });
      await new Promise((r) => setTimeout(r, 50));
    }
    midStamps = (await state()).stamps;
    if (release) await page.mouse.up();
  }
  await new Promise((r) => setTimeout(r, 800));
  return { midStamps, after: await state() };
}

// --- card 1: drag right ---
const s0 = await state();
check('Deck renders three cards', s0.count === 3, String(s0.count));
const agree = (s) => s.progress?.replace(/ /g, '') === s.youProgress;
check('Header and your counter agree at start', agree(s0), JSON.stringify([s0.progress, s0.youProgress]));
check('Progress starts at 0 / 12', s0.progress === '0 / 12', s0.progress);
const d1 = await drag(200);
check('Card 1: LIKE stamp appears while dragging', Number(d1.midStamps.find((s) => s.t === 'Like')?.o) > 0.5, JSON.stringify(d1.midStamps));
check('Card 1: right drag commits', d1.after.progress === '1 / 12', d1.after.progress);
check('Card 1: next card became active', d1.after.name !== s0.name, `${s0.name} -> ${d1.after.name}`);
check('Header and your counter agree after a swipe', agree(d1.after), JSON.stringify([d1.after.progress, d1.after.youProgress]));

// --- card 2: drag left (the real test — this instance was previously non-interactive) ---
const d2 = await drag(-200);
check('Card 2: PASS stamp appears while dragging', Number(d2.midStamps.find((s) => s.t === 'Pass')?.o) > 0.5, JSON.stringify(d2.midStamps));
check('Card 2: left drag commits', d2.after.progress === '2 / 12', d2.after.progress);

// --- card 3: small drag should snap back ---
const before3 = await state();
const d3 = await drag(60);
check('Card 3: small drag does not commit', d3.after.progress === '2 / 12', d3.after.progress);
check('Card 3: card returned home', d3.after.name === before3.name, `${before3.name} -> ${d3.after.name}`);
check('Card 3: transform reset', /matrix\(1, 0, 0, 1, 0, 0\)|none/.test(d3.after.transform), d3.after.transform);

// --- card 3 again: touch drag ---
if (MOBILE) {
  const d4 = await drag(200, { touch: true });
  check('Touch drag commits', d4.after.progress === '3 / 12', d4.after.progress);
} else {
  const d4 = await drag(200);
  check('Card 3: mouse drag commits', d4.after.progress === '3 / 12', d4.after.progress);
}

// --- buttons ---
await page.click('[aria-label="Like this"]');
await new Promise((r) => setTimeout(r, 700));
const b1 = await state();
check('LIKE button commits', b1.progress === '4 / 12', b1.progress);
await page.click('[aria-label="Pass on this"]');
await new Promise((r) => setTimeout(r, 700));
const b2 = await state();
check('PASS button commits', b2.progress === '5 / 12', b2.progress);

const votes = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1')).votes.u_abilash);
check('Votes recorded via VOTE', Object.keys(votes).length === 5, JSON.stringify(votes));
check('Both directions recorded', Object.values(votes).includes('like') && Object.values(votes).includes('pass'), JSON.stringify(votes));
check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.screenshot({ path: '/tmp/swipe-' + (MOBILE ? 'mobile' : 'desktop') + '.png' });

console.log(out.join('\n'));
console.log(failures === 0 ? '\nALL BROWSER CHECKS PASSED' : '\n' + failures + ' BROWSER CHECK(S) FAILED');
await browser.close();
process.exit(failures ? 1 : 0);

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
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/403|favicon|fonts\.googleapis/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const path = () => page.evaluate(() => location.pathname);
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.match.v1')));

await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await page.evaluate(() =>
  localStorage.setItem(
    'foodmatch.match.v1',
    JSON.stringify({
      groupId: 'g_m4',
      groupName: 'Friday Dinner',
      code: 'FM-M4',
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
    })
  )
);
await page.goto(BASE + '/swipe/g_m4', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));

// swipe the whole deck with the buttons (gestures covered by browser.suite)
for (let i = 0; i < 12; i += 1) {
  const btn = await page.$(i % 3 === 0 ? '[aria-label="Pass on this"]' : '[aria-label="Like this"]');
  if (!btn) break;
  await btn.click();
  await new Promise((r) => setTimeout(r, 320));
}
await new Promise((r) => setTimeout(r, 600));

const afterDeck = await text();
check('Deck completion state appears', /that.s your lot/i.test(afterDeck), afterDeck.slice(0, 200));
check('Waiting state is shown', /still swiping|group is done/i.test(afterDeck));

const s1 = await store();
check('My votes recorded for all 12 cards', Object.keys(s1.votes.u_abilash || {}).length === 12, String(Object.keys(s1.votes.u_abilash || {}).length));
check('I am marked finished', (s1.finished || []).includes('u_abilash'), JSON.stringify(s1.finished));

// wait for the simulated group to finish and the engine to run
for (let i = 0; i < 80; i += 1) {
  const st = await store();
  if (st.result) break;
  await new Promise((r) => setTimeout(r, 500));
}
const s2 = await store();
check('Match engine produced a result', Boolean(s2.result), 'no result');
check('Friend votes were simulated', Object.keys(s2.votes).length === 4, JSON.stringify(Object.keys(s2.votes)));
check('Phase advanced to matched', s2.phase === 'matched', String(s2.phase));

if (s2.result) {
  const w = s2.result.winner;
  check('Winner has a stable card id', Boolean(w?.cardId), JSON.stringify(w?.cardId));
  check('Winner percent matches likes/members', w.percent === Math.round((w.likes / s2.result.totalMembers) * 100), `${w.percent} vs ${w.likes}/${s2.result.totalMembers}`);
  check('likedBy length equals likes', w.likedBy.length === w.likes, JSON.stringify(w.likedBy));
  check('Results are ranked by score descending', s2.result.results.every((r, i, a) => i === 0 || a[i - 1].score >= r.score));
  check('Runners-up are present', s2.result.runnersUp.length > 0, String(s2.result.runnersUp.length));
}

// reveal
const cta = await page.evaluateHandle(() =>
  [...document.querySelectorAll('button')].find((b) => b.textContent.includes('See what you matched on'))
);
check('Reveal CTA is enabled', Boolean(cta.asElement()) && !(await cta.asElement()?.evaluate((n) => n.disabled)));
await cta.asElement().click();
await new Promise((r) => setTimeout(r, 1400));
check('Routes to /match/:groupId', (await path()) === '/match/g_m4', await path());

const reveal = await text();
check('Reveal announces a match', /you have a match/i.test(reveal), reveal.slice(0, 200));
check('Winner name is shown', reveal.includes(s2.result.winner.card.name), reveal.slice(0, 250));
check('Group percentage is shown', reveal.includes(s2.result.winner.percent + '%'), reveal.slice(0, 250));
check('Likes out of members is shown', new RegExp(s2.result.winner.likes + ' of ' + s2.result.totalMembers, 'i').test(reveal), reveal.slice(0, 300));
check('Runners-up section is shown', /also in the running/i.test(reveal));
const avatarCount = await page.evaluate(() => document.querySelectorAll('article img, article [class*="avatar"]').length);
check('Members who liked it are shown', avatarCount >= 1, String(avatarCount));

await page.screenshot({ path: '/tmp/match-' + (W < 500 ? 'mobile' : 'desktop') + '.png' });

// refresh must not corrupt the stored result
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
const after = await text();
check('Refresh keeps the reveal', (await path()) === '/match/g_m4' && after.includes(s2.result.winner.card.name), await path());
const s3 = await store();
check('Stored result is unchanged by refresh', JSON.stringify(s3.result.winner) === JSON.stringify(s2.result.winner));

const history = await page.evaluate(() => JSON.parse(localStorage.getItem('foodmatch.history.v1') || '[]'));
check('Match history entry written', history.length === 1 && history[0].groupId === 'g_m4', JSON.stringify(history).slice(0, 160));
check('History stores the winner', history[0]?.winner?.cardId === s2.result.winner.cardId, JSON.stringify(history[0]?.winner));

// --- denominator verification against the live group -----------------------
const live = await store();
const groupSize = live.members.length;
check('Result denominator equals the live group size', s2.result.totalMembers === groupSize, `${s2.result.totalMembers} vs ${groupSize}`);
check('Every result row carries the group size', s2.result.results.every((r) => r.totalMembers === groupSize));
check(
  'Every member has simulated or real votes',
  live.members.every((m) => Object.keys(live.votes[m.id] || {}).length > 0),
  JSON.stringify(live.members.map((m) => m.id + ':' + Object.keys(live.votes[m.id] || {}).length))
);
check(
  'Percent equals likes / group size for every row',
  s2.result.results.every((r) => r.percent === Math.round((r.likes / groupSize) * 100))
);

// the two rendered numbers must agree with each other and with the group
const rendered = await page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, ' ');
  const pct = t.match(/(\d+)% GROUP MATCH/i);
  const frac = t.match(/(\d+) OF (\d+) LIKED THIS/i);
  return { pct: pct && Number(pct[1]), likes: frac && Number(frac[1]), total: frac && Number(frac[2]) };
});
check('Rendered denominator equals the group size', rendered.total === groupSize, JSON.stringify(rendered) + ' group=' + groupSize);
check('Rendered likes match the engine', rendered.likes === s2.result.winner.likes, JSON.stringify(rendered));
const avatars = await page.evaluate(
  () => document.querySelectorAll('article [class*="avatarSlot"]').length
);
check('One avatar per member who liked the winner', avatars === s2.result.winner.likes, `${avatars} avatars vs ${s2.result.winner.likes} likes`);
const winnerFacts = await page.evaluate(() => {
  const a = document.querySelector('article');
  return a ? a.innerText.replace(/\s+/g, ' ') : '';
});
const wc = s2.result.winner.card;
check('Winner card shows its own rating', winnerFacts.includes(String(wc.rating)), winnerFacts.slice(0, 160));
check('Winner card shows its own distance', winnerFacts.includes(wc.distanceKm + ' km'), winnerFacts.slice(0, 160));
check(
  'Winner card shows its own price',
  winnerFacts.includes(String(wc.type === 'dish' ? wc.price : wc.priceForTwo)),
  winnerFacts.slice(0, 160)
);

check('Rendered percent matches the rendered fraction', rendered.pct === Math.round((rendered.likes / rendered.total) * 100), JSON.stringify(rendered));

check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`viewport ${W}x${H}`);
console.log(out.join('\n'));
console.log(failures === 0 ? '\nALL MATCH CHECKS PASSED' : '\n' + failures + ' MATCH CHECK(S) FAILED');
await browser.close();
process.exit(failures ? 1 : 0);

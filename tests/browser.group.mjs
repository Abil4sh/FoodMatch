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

const errors = [];
async function newPerson(label) {
  // A separate context per person: separate localStorage, so these really are
  // two different participants rather than one browser pretending.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => {
    // Chrome logs non-2xx responses as console errors; those are asserted on
    // directly elsewhere (e.g. the invalid-code case expects a 404).
    if (m.type() === 'error' && !/403|404|409|410|favicon|fonts\.|Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) {
      errors.push(`${label}: ${m.text()}`);
    }
  });
  return page;
}

const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const path = (page) => page.evaluate(() => location.pathname);
const clickText = async (page, label) => {
  const ok = await page.evaluate((l) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.innerText.replace(/\s+/g, ' ').trim().toLowerCase().includes(l.toLowerCase())
    );
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }, label);
  await new Promise((r) => setTimeout(r, 700));
  return ok;
};
const type = async (page, selector, value) => {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    selector,
    value
  );
  await new Promise((r) => setTimeout(r, 200));
};
const swipeAll = async (page, likeEvery = 2) => {
  for (let i = 0; i < 30; i += 1) {
    const btn = await page.$(i % likeEvery === 0 ? '[aria-label="Like this"]' : '[aria-label="Pass on this"]');
    if (!btn) break;
    await btn.click();
    await new Promise((r) => setTimeout(r, 260));
  }
  await new Promise((r) => setTimeout(r, 900));
};

// ---------- host creates ----------
const host = await newPerson('host');
await host.goto(BASE + '/', { waitUntil: 'networkidle0' });
await host.evaluate(() => localStorage.clear());
await host.goto(BASE + '/create', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

await type(host, '#matchName', 'Friday Dinner');
await host.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Biryani')?.click());
await new Promise((r) => setTimeout(r, 200));
check('Host can continue', await clickText(host, 'Continue to invites'));
await new Promise((r) => setTimeout(r, 1200));
check('Host reaches the invite screen', (await path(host)).startsWith('/invite/'), await path(host));

const code = (await path(host)).split('/').pop();
check('A six-character code was issued', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);
const inviteText = await text(host);
check('Invite screen shows the code', inviteText.includes(code));
check('Host is listed as host', /Host/.test(inviteText));
check('Start is blocked with nobody else', /Waiting for someone to join/i.test(inviteText), inviteText.slice(0, 200));

// ---------- guest joins ----------
const guest = await newPerson('guest');
await guest.goto(BASE + '/join/' + code, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
const prefilled = await guest.evaluate(() => document.querySelector('#joinCode')?.value);
check('Shared link pre-fills the code', prefilled === code, String(prefilled));
await type(guest, '#joinName', 'Rahul');
check('Guest can join', await clickText(guest, 'Join'));
await new Promise((r) => setTimeout(r, 1400));
check('Guest joined without an account', /\/(invite|lobby)\//.test(await path(guest)), await path(guest));

// ---------- host sees the guest arrive (polling) ----------
let sawGuest = false;
for (let i = 0; i < 10; i += 1) {
  if (/Rahul/.test(await text(host))) {
    sawGuest = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 1200));
}
check('Host sees the real participant appear', sawGuest, (await text(host)).slice(0, 200));

// ---------- invalid code ----------
const stranger = await newPerson('stranger');
await stranger.goto(BASE + '/join', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 900));
await type(stranger, '#joinCode', 'ZZZZZZ');
await type(stranger, '#joinName', 'Nobody');
await clickText(stranger, 'Join');
await new Promise((r) => setTimeout(r, 1200));
check('Unknown code is refused with a message', /no foodmatch with that code/i.test(await text(stranger)), (await text(stranger)).slice(0, 200));
check('Unknown code does not navigate away', (await path(stranger)) === '/join', await path(stranger));
await stranger.close();

// ---------- host starts ----------
check('Host can start once someone joined', await clickText(host, 'Start match'));
await new Promise((r) => setTimeout(r, 1400));
check('Host reaches the lobby', (await path(host)).startsWith('/lobby/'), await path(host));
check('Lobby shows real participant states', /Joined|Swiping/i.test(await text(host)));

await clickText(host, 'Start swiping');
await new Promise((r) => setTimeout(r, 1500));
check('Host reaches the swipe deck', (await path(host)).startsWith('/swipe/'), await path(host));

// ---------- identical decks ----------
await guest.goto(BASE + '/swipe/' + code, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1600));
const deckOf = (page) => page.evaluate(() => [...document.querySelectorAll('article h2')].map((h) => h.textContent.trim()));
const hostTop = await deckOf(host);
const guestTop = await deckOf(guest);
check('Both participants see a deck', hostTop.length > 0 && guestTop.length > 0, JSON.stringify([hostTop, guestTop]));
check('Both see the same first card', hostTop[hostTop.length - 1] === guestTop[guestTop.length - 1], JSON.stringify([hostTop, guestTop]));

// ---------- everyone swipes ----------
await swipeAll(host, 2);
const hostDone = await text(host);
check('Host finishes the deck', /that.s your lot/i.test(hostDone), hostDone.slice(0, 200));
check('Reveal is gated until everyone finishes', /waiting for the group/i.test(hostDone), hostDone.slice(0, 260));

await swipeAll(guest, 2);
await new Promise((r) => setTimeout(r, 1500));

let unlocked = false;
for (let i = 0; i < 12; i += 1) {
  if (/see what you matched on/i.test(await text(host))) {
    unlocked = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 1500));
}
check('Reveal unlocks once everyone is finished', unlocked, (await text(host)).slice(0, 260));

// ---------- reveal ----------
check('Host opens the reveal', await clickText(host, 'See what you matched on'));
await new Promise((r) => setTimeout(r, 1800));
check('Host reaches the match screen', (await path(host)).startsWith('/match/'), await path(host));
const reveal = await text(host);
check('Reveal states how many people matched', /\d+ of \d+ people matched/i.test(reveal), reveal.slice(0, 260));
check('Reveal shows a group percentage', /\d+%/.test(reveal), reveal.slice(0, 260));
check('Reveal names who liked it', /Abilash|Rahul/.test(reveal), reveal.slice(0, 300));

// ---------- winner -> detail -> directions ----------
await host.evaluate(() => document.querySelector('article button')?.click());
await new Promise((r) => setTimeout(r, 1400));
check('Winner opens the restaurant detail', (await path(host)).startsWith('/restaurant/'), await path(host));

await host.evaluate(() => {
  window.__opened = null;
  window.open = (url) => {
    window.__opened = url;
    return null;
  };
});
await host.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Directions')?.click());
await new Promise((r) => setTimeout(r, 500));
const opened = await host.evaluate(() => window.__opened);
check('Directions still opens a keyless maps URL', /google\.com\/maps\/dir\/\?api=1/.test(opened || ''), String(opened));
check('Directions carries no API key', !/key=|AIza/i.test(opened || ''), String(opened));

// ---------- persistence ----------
await host.goto(BASE + '/match/' + code, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1600));
check('Session survives a refresh', /people matched|nobody found/i.test(await text(host)), (await text(host)).slice(0, 200));

check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(out.join('\n'));
console.log(failures === 0 ? '\nALL GROUP SESSION CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
await browser.close();
process.exit(failures ? 1 : 0);

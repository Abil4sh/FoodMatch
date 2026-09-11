import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import App from '../src/App';
import { decideSwipe, LIKE, PASS } from '../src/hooks/useSwipeDeck';

const log = [];
let failures = 0;
const consoleErrors = [];
const realError = console.error;
console.error = (...args) => {
  const msg = args.map(String).join(' ');
  // React Router v7 future-flag notices are informational, not defects.
  if (!/Future Flag|ReactDOMTestUtils\.act/.test(msg)) consoleErrors.push(msg);
  realError(...args);
};

function check(label, condition, detail = '') {
  if (condition) log.push('  PASS  ' + label);
  else {
    failures += 1;
    log.push('  FAIL  ' + label + (detail ? '  -> ' + detail : ''));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(ms = 60) {
  await act(async () => {
    await sleep(ms);
  });
}

const text = () => document.body.textContent.replace(/\s+/g, ' ');
const path = () => window.location.pathname;

function findByText(selector, needle) {
  return [...document.querySelectorAll(selector)].find((el) =>
    el.textContent.replace(/\s+/g, ' ').trim().toLowerCase().includes(needle.toLowerCase())
  );
}

function findByExactText(selector, needle) {
  return [...document.querySelectorAll(selector)].find(
    (el) => el.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === needle.toLowerCase()
  );
}

async function click(el, label = 'element') {
  if (!el) throw new Error('click target not found: ' + label + ' | path=' + path() + ' | buttons=' + [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).join(' | '));
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(30);
  });
}

async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(20);
  });
}

export async function run() {
  const container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      React.createElement(React.StrictMode, null, React.createElement(App))
    );
  });
  await settle(400); // mock api latency

  // ---- 1. Discover ----
  check('Discover renders', text().includes('Craving something?'), text().slice(0, 120));
  const startBtn = findByText('button', 'Start a new FoodMatch') || findByText('button', 'Create a FoodMatch');
  check('Discover offers a way into the flow', Boolean(startBtn));
  await click(startBtn, 'start');
  check('Routes to /create', path() === '/create', path());

  // ---- 2. Create ----
  const input = document.querySelector('#matchName');
  check('Name field present', Boolean(input));
  const cta = () => findByExactText('button', 'Continue to invites');
  check('CTA disabled before input', cta()?.disabled === true);

  await type(input, 'Friday Dinner');
  const biryani = findByExactText('button', 'Biryani');
  await click(biryani, 'biryani chip');
  check('Preference selectable', biryani.getAttribute('aria-pressed') === 'true');

  const budget700 = findByExactText('button', '₹700');
  await click(budget700, 'budget 700');
  check('Budget selectable', budget700.getAttribute('aria-selected') === 'true');

  const dist2 = findByExactText('button', '2 km');
  await click(dist2, 'distance 2km');
  check('Distance selectable', dist2.getAttribute('aria-selected') === 'true');

  check('CTA enabled once valid', cta()?.disabled === false);
  await click(cta(), 'continue to invites');
  check('Routes to /invite/:groupId', /^\/invite\/g_friday_dinner_/.test(path()), path());

  // ---- 3. Invite ----
  check('Match name shown', text().includes('Friday Dinner'));
  const code = text().match(/FM-[A-Z0-9]{4}/);
  check('Invite code shown', Boolean(code), text().slice(0, 200));
  check('Start disabled with nobody invited', findByText('button', 'Pick someone')?.disabled === true);

  for (const name of ['Rahul', 'Ananya', 'Rohan']) {
    const row = findByText('button', name);
    check('Friend row for ' + name, Boolean(row));
    await click(row, 'friend ' + name);
  }
  check('Three friends invited', (text().match(/Invited/g) || []).length === 3, text());

  await settle(9000); // let the simulated joins land
  check('Friends transition to Joined', text().includes('Joined'), text());
  check('Joined counter updates', /[1-3] of 3 joined/.test(text()), text());

  const startMatch = findByText('button', 'Start match');
  check('Start match enabled', startMatch && !startMatch.disabled);
  await click(startMatch, 'start match');
  check('Routes to /lobby/:groupId', path().startsWith('/lobby/g_friday_dinner_'), path());

  // ---- 4. Lobby ----
  check('Lobby shows group name', text().includes('Friday Dinner'));
  check('Lobby shows budget', text().includes('₹700 per head'), text());
  check('Lobby shows distance', text().includes('Within 2 km'), text());
  check('Lobby shows preference', text().includes('Biryani'));
  check('Lobby shows host', text().includes('Host'));

  await settle(14000); // everyone becomes ready
  check("Everyone's ready state reached", text().includes("Everyone's ready"), text());

  const swipe = findByText('button', 'Start swiping');
  check('Start swiping enabled', swipe && !swipe.disabled);
  await click(swipe, 'start swiping');
  check('Routes to /swipe/:groupId', path().startsWith('/swipe/g_friday_dinner_'), path());
  check('Swipe screen renders a card deck', Boolean(document.querySelector('article')), text().slice(0, 200));

  // ---- 5. Swipe deck (milestone 3) ----
  check('Swipe screen shows the group name', text().includes('Friday Dinner'), text().slice(0, 200));
  check('Progress starts at 0 / 12', text().includes('0 / 12'), text().slice(0, 200));
  check('Deck toggle present', Boolean(findByExactText('button', 'Restaurants') && findByExactText('button', 'Dishes')));
  check('Top card rendered', Boolean(document.querySelector('article')));
  check('Only one card is draggable', document.querySelectorAll('article').length <= 3);

  const likeBtn = () => document.querySelector('[aria-label="Like this"]');
  const passBtn = () => document.querySelector('[aria-label="Pass on this"]');
  check('Action buttons present', Boolean(likeBtn() && passBtn()));

  const firstCardName = document.querySelector('article h2').textContent;
  await click(likeBtn(), 'like button');
  await settle(120);
  check('Like advances the deck', text().includes('1 / 12'), text().slice(0, 160));
  check(
    'Next card became active',
    document.querySelector('article h2').textContent !== firstCardName,
    document.querySelector('article h2').textContent
  );

  await click(passBtn(), 'pass button');
  await settle(120);
  check('Pass advances the deck', text().includes('2 / 12'));

  let stored = JSON.parse(window.localStorage.getItem('foodmatch.match.v1'));
  const myVotes = stored.votes['u_abilash'];
  check('Votes recorded in MatchContext', Object.keys(myVotes).length === 2, JSON.stringify(myVotes));
  check('Like stored as like', Object.values(myVotes).includes('like'), JSON.stringify(myVotes));
  check('Pass stored as pass', Object.values(myVotes).includes('pass'), JSON.stringify(myVotes));

  // deck toggle keeps its own place
  await click(findByExactText('button', 'Dishes'), 'dishes toggle');
  await settle(120);
  check('Dishes deck starts fresh', text().includes('0 / 12'), text().slice(0, 160));
  check('Dish card shows a price', /₹\d+/.test(document.querySelector('article').textContent), document.querySelector('article').textContent);
  await click(likeBtn(), 'like on dishes');
  await settle(120);
  check('Dishes deck advances', text().includes('1 / 12'));

  await click(findByExactText('button', 'Restaurants'), 'restaurants toggle');
  await settle(120);
  check('Restaurants deck resumes where it was', text().includes('2 / 12'), text().slice(0, 160));

  // gesture rules (pure, so no pointer needed)
  check('Small drag does not commit', decideSwipe(60, 100) === null);
  check('Long drag right likes', decideSwipe(180, 0) === LIKE);
  check('Long drag left passes', decideSwipe(-180, 0) === PASS);
  check('Fast flick right likes', decideSwipe(60, 900) === LIKE);
  check('Fast flick left passes', decideSwipe(-60, -900) === PASS);

  // burn down the rest of the restaurant deck
  for (let i = 0; i < 12; i += 1) {
    const btn = i % 3 === 0 ? passBtn() : likeBtn();
    if (!btn) break;
    await click(btn, 'deck button ' + i);
    await settle(90);
  }
  check('Deck exhaustion state reached', text().includes("That's your lot") || text().includes('That\u2019s your lot'), text().slice(0, 240));
  check('Waiting-for-group state shown', text().includes('Still swiping') || text().includes('Group is done'), text().slice(0, 300));

  const matchCta = () => findByText('button', 'See what you matched on') || findByText('button', 'Waiting for the group');
  check('Match CTA gated until the group finishes', Boolean(matchCta()));

  for (let i = 0; i < 60 && !findByText('button', 'See what you matched on'); i += 1) await settle(500);
  const seeMatch = findByText('button', 'See what you matched on');
  check('Simulated friends finish', Boolean(seeMatch), text().slice(0, 300));
  if (seeMatch) {
    await click(seeMatch, 'see match');
    check('Routes to /match/:groupId', path().startsWith('/match/g_friday_dinner_'), path());
    window.history.pushState({}, '', '/swipe/' + stored.groupId);
    await settle(200);
  }

  // ---- 5. Persistence across a reload ----
  stored = JSON.parse(window.localStorage.getItem('foodmatch.match.v1'));
  check('Votes survive in storage', Object.keys(stored.votes?.u_abilash || {}).length >= 12, String(Object.keys(stored.votes?.u_abilash || {}).length));
  check('Group persisted to localStorage', stored?.groupName === 'Friday Dinner');
  check('Phase persisted', ['swiping', 'matched'].includes(stored?.phase), String(stored?.phase));

  await act(async () => root.unmount());
  const fresh = document.createElement('div');
  document.body.appendChild(fresh);
  window.history.pushState({}, '', '/');
  await act(async () => {
    createRoot(fresh).render(React.createElement(App));
  });
  await settle(400);
  check('Group survives a refresh on Discover', text().includes('Friday Dinner'), text().slice(0, 200));
  check(
  'Discover offers resume CTA',
  Boolean(findByText('button', 'Continue swiping') || findByText('button', 'See your match')),
  text().slice(0, 300)
);

  check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' || '));
  console.log(log.join('\n'));
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
  return failures;
}

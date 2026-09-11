import { computeResults, compareResults, verdictFor } from '../src/services/matchEngine.js';
import { simulateVotes, membersMissingVotes } from '../src/services/simulateVotes.js';

let failures = 0;
const log = [];
function check(label, cond, detail = '') {
  if (cond) log.push('  PASS  ' + label);
  else {
    failures += 1;
    log.push('  FAIL  ' + label + (detail ? '  -> ' + detail : ''));
  }
}

const members = [{ id: 'you' }, { id: 'rahul' }, { id: 'ananya' }, { id: 'rohan' }];
const card = (id, rating = 4.5, distanceKm = 2) => ({ id, name: id, rating, distanceKm, cuisines: ['Japanese'] });

// --- core percentages -------------------------------------------------------
{
  const cards = [card('a'), card('b'), card('c')];
  const votes = {
    you: { a: 'like', b: 'like', c: 'like' },
    rahul: { a: 'like', b: 'like', c: 'pass' },
    ananya: { a: 'like', b: 'pass', c: 'pass' },
    rohan: { a: 'pass', b: 'pass', c: 'pass' }
  };
  const r = computeResults({ cards, members, votes });
  const byId = Object.fromEntries(r.results.map((x) => [x.cardId, x]));
  check('3 of 4 likes is 75%', byId.a.percent === 75, String(byId.a.percent));
  check('2 of 4 likes is 50%', byId.b.percent === 50, String(byId.b.percent));
  check('1 of 4 likes is 25%', byId.c.percent === 25, String(byId.c.percent));
  check('winner is the highest consensus', r.winner.cardId === 'a', r.winner.cardId);
  check('runners-up are ranked below the winner', r.runnersUp.map((x) => x.cardId).join(',') === 'b,c');
  check('likedBy lists the right members', byId.a.likedBy.join(',') === 'you,rahul,ananya', byId.a.likedBy.join(','));
  check('ranks are 1-based and ordered', r.results.map((x) => x.rank).join(',') === '1,2,3');
}

// --- unanimity --------------------------------------------------------------
{
  const cards = [card('a')];
  const votes = Object.fromEntries(members.map((m) => [m.id, { a: 'like' }]));
  const r = computeResults({ cards, members, votes });
  check('4 of 4 likes is 100%', r.winner.percent === 100, String(r.winner.percent));
  check('unanimous verdict copy', verdictFor(r.winner, 4).includes('everybody'), verdictFor(r.winner, 4));
}

// --- nobody liked anything --------------------------------------------------
{
  const cards = [card('a'), card('b')];
  const votes = Object.fromEntries(members.map((m) => [m.id, { a: 'pass', b: 'pass' }]));
  const r = computeResults({ cards, members, votes });
  check('everyone passing yields no winner', r.winner === null);
  check('likedAnything is false', r.likedAnything === false);
  check('results are still returned', r.results.length === 2, String(r.results.length));
  check('fallback copy is friendly', verdictFor(null, 4).includes('Nobody found a perfect match'));
}

// --- tie-breaking -----------------------------------------------------------
{
  // same score and likes -> higher rating wins
  const cards = [card('lowRating', 4.1, 1), card('highRating', 4.8, 5)];
  const votes = { you: { lowRating: 'like', highRating: 'like' } };
  const r = computeResults({ cards, members: [{ id: 'you' }], votes });
  check('tie broken by rating', r.winner.cardId === 'highRating', r.winner.cardId);
}
{
  // same score, likes and rating -> nearer wins
  const cards = [card('far', 4.5, 9), card('near', 4.5, 1)];
  const votes = { you: { far: 'like', near: 'like' } };
  const r = computeResults({ cards, members: [{ id: 'you' }], votes });
  check('tie broken by distance', r.winner.cardId === 'near', r.winner.cardId);
}
{
  // identical on every criterion -> original deck order, deterministic
  const a = { ...card('first', 4.5, 2) };
  const b = { ...card('second', 4.5, 2) };
  const votes = { you: { first: 'like', second: 'like' } };
  const r1 = computeResults({ cards: [a, b], members: [{ id: 'you' }], votes });
  const r2 = computeResults({ cards: [a, b], members: [{ id: 'you' }], votes });
  check('full tie falls back to deck order', r1.winner.cardId === 'first', r1.winner.cardId);
  check('identical input gives identical output', JSON.stringify(r1) === JSON.stringify(r2));
}

// --- more likes beats better rating at equal score is impossible; check the
//     score-before-likes ordering explicitly
{
  check(
    'score outranks raw likes',
    compareResults({ score: 0.5, likes: 1, rating: 5, distanceKm: 0, order: 0 }, { score: 0.9, likes: 9, rating: 5, distanceKm: 0, order: 1 }) > 0
  );
  check(
    'likes outrank rating',
    compareResults({ score: 0.5, likes: 3, rating: 3, distanceKm: 0, order: 0 }, { score: 0.5, likes: 1, rating: 5, distanceKm: 0, order: 1 }) < 0
  );
}

// --- edge cases -------------------------------------------------------------
{
  check('empty deck does not crash', computeResults({ cards: [], members, votes: {} }).results.length === 0);
  check('no members does not crash', computeResults({ cards: [card('a')], members: [], votes: {} }).winner === null);
  check('no arguments at all does not crash', computeResults().results.length === 0);
  check('missing votes object does not crash', computeResults({ cards: [card('a')], members }).winner === null);
  const solo = computeResults({ cards: [card('a')], members: [{ id: 'you' }], votes: { you: { a: 'like' } } });
  check('single member scores 100%', solo.winner.percent === 100, String(solo.winner.percent));
  check('single member verdict copy', verdictFor(solo.winner, 1) === 'Your pick for tonight.');
  const partial = computeResults({ cards: [card('a')], members, votes: { you: { a: 'like' } } });
  check('unfinished group scores against the whole group', partial.winner.percent === 25, String(partial.winner.percent));
  check('votedCount tracks who has voted', partial.votedCount === 1, String(partial.votedCount));
  const cardsWithJunk = [card('a'), null, { name: 'no id' }];
  check('cards without ids are ignored', computeResults({ cards: cardsWithJunk, members, votes: {} }).results.length === 1);
}

// --- simulated votes are deterministic --------------------------------------
{
  const cards = [card('a'), card('b'), card('c')];
  const args = { cards, memberIds: ['rahul', 'ananya'], groupId: 'g_friday', preferences: ['Japanese'] };
  const v1 = simulateVotes(args);
  const v2 = simulateVotes(args);
  check('simulated votes are stable across calls', JSON.stringify(v1) === JSON.stringify(v2));
  check('every member votes on every card', Object.values(v1).every((m) => Object.keys(m).length === 3));
  check('votes are only like or pass', Object.values(v1).every((m) => Object.values(m).every((d) => d === 'like' || d === 'pass')));
  const other = simulateVotes({ ...args, groupId: 'g_other' });
  check('a different group produces different votes', JSON.stringify(v1) !== JSON.stringify(other));

  check(
    'members with no votes are detected',
    membersMissingVotes(['you', 'rahul'], { you: { a: 'like' } }, cards).join(',') === 'rahul'
  );
  check(
    'members with votes are not overwritten',
    membersMissingVotes(['you'], { you: { a: 'like' } }, cards).length === 0
  );
}

// ===========================================================================
// Denominator verification: the group score must always divide by the size of
// the group, never by the number of members who happen to have vote records.
// ===========================================================================
{
  const four = [{ id: 'you' }, { id: 'rahul' }, { id: 'ananya' }, { id: 'rohan' }];
  const one = [card('ramen', 4.5, 1.2)];
  const likeAll = (ids) => Object.fromEntries(ids.map((id) => [id, { ramen: 'like' }]));
  const pct = (votes, members = four) => computeResults({ cards: one, members, votes }).results[0];

  // CASE 1 — 4 members, 4 likes
  const c1 = pct(likeAll(['you', 'rahul', 'ananya', 'rohan']));
  check('CASE 1: 4 of 4 likes is 100%', c1.percent === 100 && c1.likes === 4 && c1.totalMembers === 4, JSON.stringify([c1.likes, c1.totalMembers, c1.percent]));

  // CASE 2 — 4 members, 3 likes
  const c2 = pct({ ...likeAll(['you', 'rahul', 'ananya']), rohan: { ramen: 'pass' } });
  check('CASE 2: 3 of 4 likes is 75%', c2.percent === 75 && c2.likes === 3 && c2.totalMembers === 4, JSON.stringify([c2.likes, c2.totalMembers, c2.percent]));

  // CASE 3 — 4 members, 2 likes
  const c3 = pct({ ...likeAll(['you', 'rahul']), ananya: { ramen: 'pass' }, rohan: { ramen: 'pass' } });
  check('CASE 3: 2 of 4 likes is 50%', c3.percent === 50 && c3.likes === 2 && c3.totalMembers === 4, JSON.stringify([c3.likes, c3.totalMembers, c3.percent]));

  // CASE 4 — 4 members, 1 like
  const c4 = pct({ ...likeAll(['you']), rahul: { ramen: 'pass' }, ananya: { ramen: 'pass' }, rohan: { ramen: 'pass' } });
  check('CASE 4: 1 of 4 likes is 25%', c4.percent === 25 && c4.likes === 1 && c4.totalMembers === 4, JSON.stringify([c4.likes, c4.totalMembers, c4.percent]));

  // CASE 5 — 4 members, 0 likes
  const c5 = pct(Object.fromEntries(['you', 'rahul', 'ananya', 'rohan'].map((id) => [id, { ramen: 'pass' }])));
  check('CASE 5: 0 of 4 likes is 0%', c5.percent === 0 && c5.likes === 0 && c5.totalMembers === 4, JSON.stringify([c5.likes, c5.totalMembers, c5.percent]));

  // CASE 7 — single member group
  const c7 = computeResults({ cards: one, members: [{ id: 'you' }], votes: { you: { ramen: 'like' } } }).results[0];
  check('CASE 7: 1 of 1 like is 100%', c7.percent === 100 && c7.likes === 1 && c7.totalMembers === 1, JSON.stringify([c7.likes, c7.totalMembers, c7.percent]));

  // REGRESSION — the reported symptom. A four-member group where only two
  // members have vote records must read 2 of 4 / 50%, never 2 of 2 / 100%.
  const missing = pct({ you: { ramen: 'like' }, rahul: { ramen: 'like' } });
  check('Members with no vote records stay in the denominator', missing.totalMembers === 4, String(missing.totalMembers));
  check('2 likes in a group of 4 is 50%, not 100%', missing.percent === 50, String(missing.percent));
  check('likes count is not inflated by absent voters', missing.likes === 2, String(missing.likes));

  // A member who joined but swiped nothing at all still counts
  const silent = computeResults({ cards: one, members: four, votes: { you: { ramen: 'like' } } }).results[0];
  check('A wholly silent group still divides by group size', silent.percent === 25, String(silent.percent));
}

// CASE 6 — tie-breakers, in order
{
  const members4 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  // equal score+likes+rating -> nearer wins
  const t1 = computeResults({
    cards: [card('far', 4.4, 8), card('near', 4.4, 1)],
    members: members4,
    votes: { a: { far: 'like', near: 'like' }, b: { far: 'like', near: 'like' } }
  });
  check('CASE 6a: equal score, likes and rating -> nearer wins', t1.winner.cardId === 'near', t1.winner.cardId);

  // equal score+likes -> better rating wins regardless of distance
  const t2 = computeResults({
    cards: [card('near_low', 4.0, 1), card('far_high', 4.9, 9)],
    members: members4,
    votes: { a: { near_low: 'like', far_high: 'like' } }
  });
  check('CASE 6b: equal score and likes -> higher rating wins', t2.winner.cardId === 'far_high', t2.winner.cardId);

  // higher score wins even with worse rating and distance
  const t3 = computeResults({
    cards: [card('popular', 3.9, 9), card('niche', 5.0, 0.2)],
    members: members4,
    votes: { a: { popular: 'like', niche: 'like' }, b: { popular: 'like', niche: 'pass' } }
  });
  check('CASE 6c: higher group score outranks rating and distance', t3.winner.cardId === 'popular', t3.winner.cardId);
}

// Invariant: every row's percent is exactly its own likes/totalMembers, so the
// UI cannot show a percentage and a fraction that disagree.
{
  const members4 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const cards = ['p', 'q', 'r', 's'].map((id, i) => card(id, 4 + i * 0.2, i + 1));
  const votes = {
    a: { p: 'like', q: 'like', r: 'pass', s: 'like' },
    b: { p: 'like', q: 'pass', r: 'pass' },
    c: { p: 'like' },
    d: {}
  };
  const r = computeResults({ cards, members: members4, votes });
  check(
    'percent always equals likes / totalMembers',
    r.results.every((x) => x.percent === Math.round((x.likes / x.totalMembers) * 100)),
    JSON.stringify(r.results.map((x) => [x.cardId, x.likes, x.totalMembers, x.percent]))
  );
  check('every row carries the full group size', r.results.every((x) => x.totalMembers === 4));
  check('winner and runners-up share the same denominator', [r.winner, ...r.runnersUp].every((x) => x.totalMembers === 4));
  check('likedBy never exceeds the group', r.results.every((x) => x.likedBy.length <= 4));
}

console.log(log.join('\n'));
console.log(failures === 0 ? '\nALL ENGINE TESTS PASSED' : '\n' + failures + ' ENGINE TEST(S) FAILED');
process.exit(failures ? 1 : 0);

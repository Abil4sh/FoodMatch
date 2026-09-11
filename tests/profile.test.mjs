import { likedCardIdsFor, computeFoodDNA, computeStats, summarise } from '../src/services/profile.js';

let failures = 0;
const log = [];
const check = (l, c, d = '') => {
  if (c) log.push('  PASS  ' + l);
  else {
    failures += 1;
    log.push('  FAIL  ' + l + (d ? '  -> ' + d : ''));
  }
};

const card = (id, cuisines, veg) => ({ id, cuisines, veg });
const seed = { topCuisines: ['Ramen', 'Biryani', 'South Indian'], spice: 4, adventurous: 72, veg: false };

// --- collecting liked ids ---------------------------------------------------
{
  const group = { votes: { me: { a: 'like', b: 'pass', c: 'like' }, other: { d: 'like' } } };
  const history = [
    { userId: 'me', likedCardIds: ['c', 'e'] },
    { userId: 'someone_else', likedCardIds: ['zz'] }
  ];
  const ids = likedCardIdsFor('me', { group, history });
  check('Only my likes are collected', !ids.includes('d') && !ids.includes('zz'), JSON.stringify(ids));
  check('Passes are excluded', !ids.includes('b'), JSON.stringify(ids));
  check('Active group and history are merged', ['a', 'c', 'e'].every((x) => ids.includes(x)), JSON.stringify(ids));
  check('Duplicates are collapsed', ids.filter((x) => x === 'c').length === 1, JSON.stringify(ids));
  check('History alone still yields a profile', likedCardIdsFor('me', { history }).length === 2);
  check('No data does not crash', likedCardIdsFor('me').length === 0);
  check('Legacy entries without userId are counted', likedCardIdsFor('me', { history: [{ likedCardIds: ['q'] }] }).includes('q'));
}

// --- Food DNA ---------------------------------------------------------------
{
  const dna = computeFoodDNA(seed, []);
  check('Empty profile still returns every dimension', dna.length === 8, String(dna.length));
  check('All values are within 0-100', dna.every((d) => d.value >= 0 && d.value <= 100));
  check('Seed cuisines lean higher than unseeded ones', dna.find((d) => d.id === 'asian').value > dna.find((d) => d.id === 'fastFood').value);

  const asian = computeFoodDNA(seed, [card('a', ['Japanese']), card('b', ['Ramen']), card('c', ['Chinese'])]);
  check('Swiping Asian raises the Asian dimension', asian.find((d) => d.id === 'asian').value > 80, String(asian.find((d) => d.id === 'asian').value));
  check('Unswiped dimensions stay low', asian.find((d) => d.id === 'sweet').value < 20, String(asian.find((d) => d.id === 'sweet').value));

  const spicy = computeFoodDNA(seed, [card('a', ['Andhra']), card('b', ['Hyderabadi'])]);
  check('Spicy cuisines raise the spice dimension', spicy.find((d) => d.id === 'spicy').value > 60, String(spicy.find((d) => d.id === 'spicy').value));

  const veg = computeFoodDNA(seed, [card('a', ['Vegetarian'], true), card('b', ['Cafe'], true), card('c', ['Grill'], false)]);
  check('Vegetarian is a share of cards that declare it', veg.find((d) => d.id === 'vegetarian').value === 67, String(veg.find((d) => d.id === 'vegetarian').value));

  // one card can carry several cuisine tags, so breadth must not peg at 100
  const narrow = computeFoodDNA(seed, [card('a', ['Japanese']), card('b', ['Japanese']), card('c', ['Japanese'])]);
  const broad = computeFoodDNA(seed, [card('a', ['Japanese']), card('b', ['Andhra']), card('c', ['Pizza'])]);
  check('Breadth of cuisine raises Adventurous', broad.find((d) => d.id === 'adventurous').value > narrow.find((d) => d.id === 'adventurous').value);
  check('Adventurous does not peg at 100 for multi-tag cards', computeFoodDNA(seed, [card('a', ['Andhra', 'Biryani', 'Hyderabadi'])]).find((d) => d.id === 'adventurous').value < 100);
  check('Dimensions are stable for identical input', JSON.stringify(computeFoodDNA(seed, [card('a', ['Cafe'])])) === JSON.stringify(computeFoodDNA(seed, [card('a', ['Cafe'])])));
}

// --- stats ------------------------------------------------------------------
{
  const liked = [card('a', ['Japanese']), card('b', ['Japanese']), card('c', ['Cafe'])];
  const history = [{ winner: { cardId: 'a' } }, { winner: null }];
  const stats = computeStats({ history, liked });
  check('Matches played counts every round', stats.matchesPlayed === 2, String(stats.matchesPlayed));
  check('Matches found excludes rounds with no winner', stats.matchesFound === 1, String(stats.matchesFound));
  check('Places liked counts liked cards', stats.placesLiked === 3, String(stats.placesLiked));
  check('Favourite cuisine is the most liked', stats.favouriteCuisine === 'Japanese', String(stats.favouriteCuisine));

  const empty = computeStats({});
  check('Empty stats do not crash', empty.matchesPlayed === 0 && empty.favouriteCuisine === null);
  check('Empty summary invites a first swipe', /swipe a few places/i.test(summarise(empty, computeFoodDNA(seed, []))));
  check('Populated summary mentions the favourite', summarise(stats, computeFoodDNA(seed, liked)).includes('Japanese'));
}

console.log(log.join('\n'));
console.log(failures === 0 ? '\nALL PROFILE TESTS PASSED' : '\n' + failures + ' PROFILE TEST(S) FAILED');
process.exit(failures ? 1 : 0);

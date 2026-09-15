/*
 * Location persistence and menu-data tests. Pure logic; no network, no DOM
 * beyond a tiny localStorage stand-in.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const out = path.resolve('tests/.location-bundle.mjs');

// Minimal localStorage so the persistence module can be exercised in Node.
const store = new Map();
global.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  }
};

await esbuild.build({
  entryPoints: ['tests/entries/locationEntry.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  loader: { '.json': 'json' },
  define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: 'http://127.0.0.1:8000' }) }
});

const m = await import(out + '?t=' + Date.now());
const {
  DEFAULT_LOCATION, isValidLocation, toStoredLocation, readLocation, writeLocation, clearLocation,
  describeCard, hasMenu, menuFor, findCardById, findRestaurantById, venueFor,
  setCatalog, resetCatalog, normalizeRestaurant, normalizeDish
} = m;

let failures = 0;
const log = [];
const check = (label, cond, detail = '') => {
  if (cond) log.push('  PASS  ' + label);
  else { failures += 1; log.push('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

// --- validation --------------------------------------------------------------
check('Valid location accepted', isValidLocation({ name: 'Koramangala', latitude: 12.9, longitude: 77.6 }));
check('Missing name rejected', !isValidLocation({ latitude: 12.9, longitude: 77.6 }));
check('Blank name rejected', !isValidLocation({ name: '   ', latitude: 12.9, longitude: 77.6 }));
check('Out-of-range latitude rejected', !isValidLocation({ name: 'X', latitude: 91, longitude: 77 }));
check('Out-of-range longitude rejected', !isValidLocation({ name: 'X', latitude: 12, longitude: 181 }));
check('Non-numeric coordinates rejected', !isValidLocation({ name: 'X', latitude: 'abc', longitude: 77 }));
check('Null rejected', !isValidLocation(null));

const stored = toStoredLocation({ name: '  Whitefield  ', latitude: '12.9698', longitude: '77.75', id: 'a1', extra: 'dropped' });
check('Stored shape trims the name', stored.name === 'Whitefield', stored.name);
check('Stored shape coerces coordinates to numbers', stored.latitude === 12.9698 && stored.longitude === 77.75);
check('Stored shape drops unknown fields', stored.extra === undefined, JSON.stringify(stored));
check('Invalid input yields null', toStoredLocation({ name: 'X' }) === null);

// --- persistence -------------------------------------------------------------
store.clear();
check('Defaults to HSR Layout before any choice', readLocation().name === DEFAULT_LOCATION.name);
check('Write reports success', writeLocation({ name: 'Indiranagar', latitude: 12.9719, longitude: 77.6412, id: 'i' }) === true);
check('Selection survives a read (persistence)', readLocation().name === 'Indiranagar', readLocation().name);
check('Coordinates survive a read', readLocation().latitude === 12.9719);
check('Refusing to persist an invalid location', writeLocation({ name: 'X' }) === false);
check('Invalid write leaves the previous value intact', readLocation().name === 'Indiranagar');
store.set('foodmatch.location.v1', '{not json');
check('Corrupt storage falls back to the default', readLocation().name === DEFAULT_LOCATION.name);
store.set('foodmatch.location.v1', JSON.stringify({ name: 'Nowhere' }));
check('Stored value failing validation falls back', readLocation().name === DEFAULT_LOCATION.name);
clearLocation();
check('Clearing returns to the default', readLocation().name === DEFAULT_LOCATION.name);

// --- menu data ---------------------------------------------------------------
const curated = normalizeRestaurant({
  id: 'r_ramen_house', name: 'Ramen House', area: 'Koramangala', cuisines: ['Japanese'],
  rating: 4.5, distanceKm: 1.2, priceForTwo: 700, typicalSpendMin: 350, typicalSpendMax: 500,
  pricingIsApproximate: true, address: '12th Main, Koramangala'
});
const live = normalizeRestaurant({
  id: 'geo_p0', name: 'Nagarjuna', area: 'Koramangala', cuisines: ['Indian'],
  distanceKm: 3.3, address: 'Nagarjuna, Koramangala, Bengaluru', source: 'geoapify'
});
const dishes = [
  normalizeDish({ id: 'd_ramen_house_gyoza', name: 'Gyoza', restaurantId: 'r_ramen_house', restaurantName: 'Ramen House', price: 240, isApproximate: true, cuisines: ['Japanese'] }),
  normalizeDish({ id: 'd_ramen_house_tonkotsu', name: 'Tonkotsu Ramen', restaurantId: 'r_ramen_house', restaurantName: 'Ramen House', price: 480, isApproximate: true, cuisines: ['Japanese'] })
];

check('Curated spend range normalizes', curated.typicalSpendMin === 350 && curated.typicalSpendMax === 500);
check('Curated pricing is flagged approximate', curated.pricingIsApproximate === true);
check('Live record has no spend range', live.typicalSpendMin === null && live.typicalSpendMax === null);
check('Live record is not flagged approximate', live.pricingIsApproximate === false);
check('Dish prices are flagged approximate', dishes.every((d) => d.isApproximate === true));

// deck is live data; curated restaurants remain in the reference pool
resetCatalog();
setCatalog({ restaurants: [live], dishes, reference: [curated] });

check('Curated restaurant has a menu', hasMenu('r_ramen_house'));
check('Menu returns its representative dishes', menuFor('r_ramen_house').length === 2, String(menuFor('r_ramen_house').length));
check('Live restaurant has no curated menu', !hasMenu('geo_p0'));
check('Menu for an unknown id is empty, not an error', menuFor('nope').length === 0);

// dish -> parent restaurant while the deck is live data
const dish = findCardById('d_ramen_house_gyoza');
check('Dish resolves by id', dish?.name === 'Gyoza');
check('Dish knows its parent restaurant id', dish.restaurantId === 'r_ramen_house');
const parent = venueFor(dish);
check('Dish resolves its parent restaurant from the reference pool', parent?.name === 'Ramen House', JSON.stringify(parent));
check('Parent carries the address Directions needs', Boolean(parent.address));
check('Live deck restaurant still resolves', findRestaurantById('geo_p0')?.name === 'Nagarjuna');

// --- descriptions never print nulls -----------------------------------------
const liveText = describeCard(live);
check('Live description mentions the place', liveText.includes('Nagarjuna'));
check('Live description prints no null', !/null|undefined|NaN/.test(liveText), liveText);
check('Live description omits a price it does not have', !liveText.includes('\u20B9'), liveText);
const curatedText = describeCard(curated);
check('Curated description quotes the spend range', curatedText.includes('350') && curatedText.includes('500'), curatedText);
check('Curated description prints no null', !/null|undefined|NaN/.test(curatedText), curatedText);
const dishText = describeCard(dish);
check('Dish description prints no null', !/null|undefined|NaN/.test(dishText), dishText);

fs.rmSync(out, { force: true });
console.log(log.join('\n'));
console.log(failures === 0 ? '\nALL LOCATION + MENU UNIT TESTS PASSED' : '\n' + failures + ' UNIT TEST(S) FAILED');
process.exit(failures ? 1 : 0);

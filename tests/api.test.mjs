/*
 * API boundary tests. `fetch` is replaced with a stub for every case, so this
 * suite never touches the network — not the internet, and not a local Django.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const API_BASE = 'http://127.0.0.1:8000';
const out = path.resolve('tests/.api-bundle.mjs');

await esbuild.build({
  entryPoints: ['tests/entries/apiEntry.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  loader: { '.js': 'js', '.json': 'json' },
  define: {
    'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: API_BASE, DEV: false })
  }
});

const mod = await import(out + '?t=' + Date.now());
const { api, urlFor, BASE_URL, ApiError, normalizeRestaurant, normalizeDish, loadCatalog, SOURCE } = mod;

let failures = 0;
const log = [];
const check = (label, cond, detail = '') => {
  if (cond) log.push('  PASS  ' + label);
  else {
    failures += 1;
    log.push('  FAIL  ' + label + (detail ? '  -> ' + detail : ''));
  }
};

const calls = [];
function stubFetch(handler) {
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    return handler(String(url), options);
  };
}
const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

// --- 1. URL construction ----------------------------------------------------
check('Base URL comes from VITE_API_BASE_URL', BASE_URL === API_BASE, BASE_URL);
check('URLs are built against the base', urlFor('/api/restaurants/') === API_BASE + '/api/restaurants/', urlFor('/api/restaurants/'));
check('Ids are URL-encoded', urlFor('/api/restaurants/' + encodeURIComponent('a b') + '/').includes('a%20b'));

{
  calls.length = 0;
  stubFetch(() => jsonResponse([]));
  await api.getRestaurants();
  check('getRestaurants hits /api/restaurants/', calls[0] === API_BASE + '/api/restaurants/', calls[0]);
  calls.length = 0;
  await api.getRestaurant('r_ramen_house').catch(() => {});
  check('getRestaurant hits the detail route', calls[0] === API_BASE + '/api/restaurants/r_ramen_house/', calls[0]);
  calls.length = 0;
  await api.getDish('d_shawarma').catch(() => {});
  check('getDish hits the dish route', calls[0] === API_BASE + '/api/dishes/d_shawarma/', calls[0]);
}

// --- 2/3. successful fetches ------------------------------------------------
{
  stubFetch(() =>
    jsonResponse([
      { id: 'r_a', name: 'Ramen House', cuisines: ['Japanese'], rating: 4.5, distanceKm: 1.2, priceForTwo: 700 }
    ])
  );
  const restaurants = await api.getRestaurants();
  check('Restaurant fetch returns normalized records', restaurants.length === 1 && restaurants[0].type === 'restaurant', JSON.stringify(restaurants[0]));
  check('Restaurant fields survive normalization', restaurants[0].name === 'Ramen House' && restaurants[0].rating === 4.5);
}
{
  stubFetch(() => jsonResponse([{ id: 'd_a', name: 'Shawarma', price: 170, veg: false, cuisines: ['Middle Eastern'] }]));
  const dishes = await api.getDishes();
  check('Dish fetch returns normalized records', dishes.length === 1 && dishes[0].type === 'dish', JSON.stringify(dishes[0]));
  check('Dish price survives normalization', dishes[0].price === 170);
}

// --- 4. non-2xx handling ----------------------------------------------------
{
  stubFetch(() => jsonResponse({ error: 'not_found', detail: 'Restaurant not found.' }, 404));
  let caught = null;
  await api.getRestaurant('r_missing').catch((e) => {
    caught = e;
  });
  check('404 rejects with an ApiError', caught instanceof ApiError, String(caught));
  check('404 carries the status', caught?.status === 404, String(caught?.status));
  check('404 carries the API error code', caught?.code === 'not_found', String(caught?.code));
  check('Errors are not silently swallowed', caught !== null);
}
{
  stubFetch(() => jsonResponse({ error: 'invalid_request' }, 400));
  const caught = await api.getRestaurants().catch((e) => e);
  check('400 rejects rather than returning data', caught instanceof ApiError, String(caught));
}
{
  stubFetch(() => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }));
  const caught = await api.getRestaurants().catch((e) => e);
  check('Malformed JSON rejects cleanly', caught instanceof ApiError && caught.code === 'bad_payload', String(caught?.code));
}
{
  stubFetch(() => { throw new TypeError('Failed to fetch'); });
  const caught = await api.getFeed().catch((e) => e);
  check('Network failure rejects with a safe message', caught instanceof ApiError && caught.code === 'unreachable', String(caught?.code));
  check('Network error message leaks no internals', !/Failed to fetch|stack/i.test(caught.message), caught.message);
}

// --- 5. fallback ------------------------------------------------------------
{
  calls.length = 0;
  stubFetch(() => { throw new TypeError('Failed to fetch'); });
  const result = await loadCatalog();
  check('Unreachable API falls back to local data', result.source === SOURCE.LOCAL, result.source);
  check('Fallback still supplies restaurants', result.feed.restaurants.length > 0, String(result.feed.restaurants.length));
  check('Fallback still supplies dishes', result.feed.dishes.length > 0, String(result.feed.dishes.length));
  check('Fallback still supplies a user', Boolean(result.user?.id), JSON.stringify(result.user));
  check('Fallback still supplies friends', result.friends.length > 0, String(result.friends.length));
  check('loadCatalog never rejects', true);
  check('Fallback does not retry the API', calls.length <= 3, `${calls.length} calls: ${calls.join(' ')}`);
}
{
  // a reachable API with nothing in it is treated as unusable
  stubFetch((url) => {
    if (url.endsWith('/api/feed/')) return jsonResponse({ restaurants: [], dishes: [], cravings: [], activeMatch: null });
    if (url.endsWith('/api/me/')) return jsonResponse({ id: 'u_x', name: 'X' });
    return jsonResponse([]);
  });
  const result = await loadCatalog();
  check('Empty API catalog falls back to local', result.source === SOURCE.LOCAL, result.source);
}
{
  stubFetch((url) => {
    if (url.endsWith('/api/feed/')) {
      return jsonResponse({
        restaurants: [{ id: 'r_a', name: 'A', cuisines: ['Japanese'], rating: 4, distanceKm: 1 }],
        dishes: [{ id: 'd_a', name: 'D', price: 100 }],
        cravings: [],
        activeMatch: null
      });
    }
    if (url.endsWith('/api/me/')) return jsonResponse({ id: 'u_x', name: 'X' });
    return jsonResponse([{ id: 'u_y', name: 'Y' }]);
  });
  const result = await loadCatalog();
  check('Healthy API is preferred over local data', result.source === SOURCE.API, result.source);
  check('API catalog is the one loaded', result.feed.restaurants[0].id === 'r_a', JSON.stringify(result.feed.restaurants));
}

// --- 6/7. normalization edge cases -----------------------------------------
{
  check('Record without an id is dropped', normalizeRestaurant({ name: 'No id' }) === null);
  check('Null record is dropped', normalizeRestaurant(null) === null);
  const sparse = normalizeRestaurant({ id: 'r_x' });
  check('Missing name gets a safe default', typeof sparse.name === 'string' && sparse.name.length > 0, sparse.name);
  // A live provider (Geoapify) supplies no rating or price. These must stay
  // null so the UI omits them; 0 would render as a real zero-star rating.
  check('Missing rating stays null, never 0', sparse.rating === null, String(sparse.rating));
  check('Missing distance stays null, never 0', sparse.distanceKm === null, String(sparse.distanceKm));
  check('Missing price stays null, never 0', sparse.priceForTwo === null, String(sparse.priceForTwo));
  check('Missing rating is never NaN', !Number.isNaN(sparse.rating));
  const full = normalizeRestaurant({ id: 'r_z', rating: 4.5, distanceKm: 1.2, priceForTwo: 700 });
  check('Real values still pass through', full.rating === 4.5 && full.distanceKm === 1.2 && full.priceForTwo === 700);
  check('Zero is preserved as zero, not nulled', normalizeRestaurant({ id: 'r_0', rating: 0 }).rating === 0);
  check('Missing cuisines becomes an array', Array.isArray(sparse.cuisines), JSON.stringify(sparse.cuisines));
  check('type is always set for restaurants', sparse.type === 'restaurant');

  const dish = normalizeDish({ id: 'd_x', price: '250', rating: 'not a number' });
  check('Numeric strings are coerced', dish.price === 250, String(dish.price));
  check('Unparseable numbers fall back to 0 for dishes', dish.rating === 0, String(dish.rating));
  check('veg defaults to false, never undefined', dish.veg === false);
  check('type is always set for dishes', dish.type === 'dish');

  const junk = normalizeRestaurant({ id: 'r_y', cuisines: [1, 'Japanese', null], tags: 'not-an-array' });
  check('Non-string cuisines are filtered out', JSON.stringify(junk.cuisines) === '["Japanese"]', JSON.stringify(junk.cuisines));
  check('Non-array tags become an array', Array.isArray(junk.tags), JSON.stringify(junk.tags));
}

// --- no Google, ever --------------------------------------------------------
check('No request went to a Google host', !calls.some((u) => /google/i.test(u)), calls.filter((u) => /google/i.test(u)).join(' '));

fs.rmSync(out, { force: true });
console.log(log.join('\n'));
console.log(failures === 0 ? '\nALL API TESTS PASSED' : '\n' + failures + ' API TEST(S) FAILED');
process.exit(failures ? 1 : 0);

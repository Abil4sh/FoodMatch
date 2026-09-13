// Bundle entry for tests/api.test.mjs — re-exports the frontend modules under
// test so esbuild can resolve their JSON imports and import.meta.env.
export { api, urlFor, BASE_URL, ApiError } from '../../src/services/api.js';
export { loadCatalog, SOURCE } from '../../src/services/catalogSource.js';
export { normalizeRestaurant, normalizeDish } from '../../src/services/normalize.js';

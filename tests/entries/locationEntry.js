// Bundle entry for tests/location.test.mjs
export { DEFAULT_LOCATION, isValidLocation, toStoredLocation, readLocation, writeLocation, clearLocation } from '../../src/services/location.js';
export { describe as describeCard, hasMenu, menuFor, findCardById, findRestaurantById, venueFor } from '../../src/services/catalog.js';
export { setCatalog, resetCatalog } from '../../src/services/catalogStore.js';
export { normalizeRestaurant, normalizeDish } from '../../src/services/normalize.js';

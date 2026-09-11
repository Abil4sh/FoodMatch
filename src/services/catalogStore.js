// In-memory catalog, filled once when the app boots.
//
// The catalog is fetched a single time by SessionContext and parked here so
// that synchronous callers (the swipe deck, the detail screen, match history,
// the profile) can look a card up by id without triggering a request.
//
// This is the mechanism that keeps request volume flat: rendering a hundred
// cards reads from this object a hundred times and calls the API zero times.

let catalog = { restaurants: [], dishes: [], ready: false };

export function setCatalog({ restaurants = [], dishes = [] } = {}) {
  catalog = { restaurants, dishes, ready: true };
}

export function getCatalog() {
  return catalog;
}

export function isCatalogReady() {
  return catalog.ready;
}

// Test helper; not used by the app.
export function resetCatalog() {
  catalog = { restaurants: [], dishes: [], ready: false };
}

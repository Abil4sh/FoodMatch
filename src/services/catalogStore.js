// In-memory catalog, filled once when the app boots.
//
// The catalog is fetched a single time by SessionContext and parked here so
// that synchronous callers (the swipe deck, the detail screen, match history,
// the profile) can look a card up by id without triggering a request.
//
// This is the mechanism that keeps request volume flat: rendering a hundred
// cards reads from this object a hundred times and calls the API zero times.

let catalog = { restaurants: [], dishes: [], reference: [], ready: false };

/**
 * @param restaurants the deck, which may be live provider results
 * @param reference   the curated catalog, always kept for id lookups so a dish
 *   can still resolve its parent restaurant when the deck is live data
 */
export function setCatalog({ restaurants = [], dishes = [], reference = [] } = {}) {
  catalog = { restaurants, dishes, reference, ready: true };
}

export function getCatalog() {
  return catalog;
}

export function isCatalogReady() {
  return catalog.ready;
}

// Test helper; not used by the app.
export function resetCatalog() {
  catalog = { restaurants: [], dishes: [], reference: [], ready: false };
}

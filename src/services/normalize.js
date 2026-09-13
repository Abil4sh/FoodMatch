/*
 * Normalization boundary.
 *
 * Django currently serves the same JSON the app grew up on, so most of this is
 * a pass-through today. It exists anyway because it is the single place where
 * an upstream shape gets mapped onto the shape the UI expects. When the
 * catalog is eventually sourced from somewhere else, this file changes and no
 * component does.
 *
 * Two jobs beyond mapping:
 *   - fill in defaults so a missing field can never crash a screen or the
 *     matching engine (`rating` and `distanceKm` in particular are read by
 *     matchEngine's tie-breakers)
 *   - drop records with no stable id, since every downstream lookup is by id
 */

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
const list = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);

export function normalizeRestaurant(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    type: 'restaurant',
    name: str(raw.name, 'Unnamed place'),
    cuisines: list(raw.cuisines),
    area: str(raw.area),
    distanceKm: num(raw.distanceKm),
    etaMin: num(raw.etaMin),
    rating: num(raw.rating),
    reviews: num(raw.reviews),
    priceForTwo: num(raw.priceForTwo),
    priceTier: num(raw.priceTier, 1),
    photoLabel: str(raw.photoLabel),
    groupMatchPct: num(raw.groupMatchPct),
    tags: list(raw.tags),
    hours: str(raw.hours),
    address: str(raw.address)
  };
}

export function normalizeDish(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    type: 'dish',
    name: str(raw.name, 'Unnamed dish'),
    restaurantId: str(raw.restaurantId),
    restaurantName: str(raw.restaurantName),
    area: str(raw.area),
    price: num(raw.price),
    rating: num(raw.rating),
    distanceKm: num(raw.distanceKm),
    etaMin: num(raw.etaMin),
    photoLabel: str(raw.photoLabel),
    cuisines: list(raw.cuisines),
    veg: raw.veg === true
  };
}

export function normalizePerson(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  const person = {
    id: raw.id,
    name: str(raw.name, 'Someone'),
    initials: str(raw.initials, str(raw.name, '?').slice(0, 1).toUpperCase()),
    color: str(raw.color, 'var(--cream-2)'),
    area: str(raw.area)
  };
  // Only the signed-in user carries these.
  if (raw.fullName) person.fullName = str(raw.fullName);
  if (raw.city) person.city = str(raw.city);
  if (raw.foodDNA && typeof raw.foodDNA === 'object') person.foodDNA = raw.foodDNA;
  return person;
}

export function normalizeCraving(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  return { id: raw.id, label: str(raw.label), cuisine: str(raw.cuisine) };
}

const mapClean = (value, fn) => (Array.isArray(value) ? value.map(fn).filter(Boolean) : []);

export const normalizeRestaurants = (value) => mapClean(value, normalizeRestaurant);
export const normalizeDishes = (value) => mapClean(value, normalizeDish);
export const normalizePeople = (value) => mapClean(value, normalizePerson);
export const normalizeCravings = (value) => mapClean(value, normalizeCraving);

/** The boot payload: `/api/feed/` or the bundled local catalog. */
export function normalizeFeed(raw) {
  const feed = raw && typeof raw === 'object' ? raw : {};
  return {
    restaurants: normalizeRestaurants(feed.restaurants),
    dishes: normalizeDishes(feed.dishes),
    cravings: normalizeCravings(feed.cravings),
    activeMatch: feed.activeMatch ?? null
  };
}

/** `/api/restaurants/<id>/` returns the restaurant plus the dishes it serves. */
export function normalizeRestaurantDetail(raw) {
  const restaurant = normalizeRestaurant(raw);
  if (!restaurant) return null;
  return { ...restaurant, dishes: normalizeDishes(raw?.dishes) };
}

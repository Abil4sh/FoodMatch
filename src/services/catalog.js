import { getCatalog } from './catalogStore';

/*
 * Lookups over the catalog held in memory by catalogStore.
 *
 * Every function here is synchronous and performs no I/O. Screens call these
 * freely during render; none of it reaches the network. The data arrives once,
 * from the Django API, via SessionContext.
 */

export function allRestaurants() {
  return getCatalog().restaurants;
}

export function allDishes() {
  return getCatalog().dishes;
}

/** Restaurants and dishes share an id space, so one lookup covers both. */
export function findCardById(id) {
  if (!id) return null;
  const { restaurants, dishes, reference } = getCatalog();
  return (
    restaurants.find((r) => r.id === id) ||
    dishes.find((d) => d.id === id) ||
    // Curated restaurants stay resolvable even when the deck is live data, so
    // a dish can always open its parent restaurant.
    reference.find((r) => r.id === id) ||
    null
  );
}

export function findRestaurantById(id) {
  const { restaurants, reference } = getCatalog();
  return restaurants.find((r) => r.id === id) || reference.find((r) => r.id === id) || null;
}

/** Representative dishes for a restaurant, or an empty list when we have none. */
export function menuFor(restaurantId) {
  return dishesForRestaurant(restaurantId);
}

/** True when we hold curated menu data for this place. */
export function hasMenu(restaurantId) {
  return dishesForRestaurant(restaurantId).length > 0;
}

/** Dishes served by a restaurant, used for the "what to order" section. */
export function dishesForRestaurant(restaurantId) {
  return getCatalog().dishes.filter((d) => d.restaurantId === restaurantId);
}

/**
 * For a dish, the restaurant behind it. For a restaurant, itself. Lets the
 * detail screen treat both card types with one code path.
 */
export function venueFor(card) {
  if (!card) return null;
  return card.type === 'dish' ? findRestaurantById(card.restaurantId) : card;
}

const present = (value) => value !== null && value !== undefined && value !== '';

/**
 * Short blurb assembled from the catalog fields rather than stored per row.
 *
 * Every clause is conditional: a live provider record has no rating, price or
 * ETA, and a sentence reading "around ₹null for two" is worse than no sentence.
 */
export function describe(card) {
  if (!card) return '';
  const venue = venueFor(card);

  if (card.type === 'dish') {
    const opening = `${card.name} is one of the things ${venue?.name || 'this kitchen'} is known for${
      card.area ? ` in ${card.area}` : ''
    }.`;
    const details = [
      card.veg ? 'Vegetarian' : 'Non-vegetarian',
      present(card.rating) ? `${card.rating} stars` : null,
      present(card.etaMin) ? `about ${card.etaMin} minutes away` : null
    ].filter(Boolean);
    return `${opening} ${details.join(', ')}.`;
  }

  const cuisines = (card.cuisines || []).join(' and ');
  const tags = (card.tags || []).join(', ').toLowerCase();
  const opening = `${card.name}${cuisines ? ` serves ${cuisines}` : ''}${card.area ? ` in ${card.area}` : ''}${
    tags ? ` and is known for being ${tags}` : ''
  }.`;

  if (present(card.typicalSpendMin) && present(card.typicalSpendMax)) {
    return `${opening} Expect roughly \u20B9${card.typicalSpendMin}\u2013\u20B9${card.typicalSpendMax} per person.`;
  }
  if (present(card.priceForTwo)) {
    return `${opening} Expect around \u20B9${card.priceForTwo} for two.`;
  }
  return opening;
}

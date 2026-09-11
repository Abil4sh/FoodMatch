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
  const { restaurants, dishes } = getCatalog();
  return restaurants.find((r) => r.id === id) || dishes.find((d) => d.id === id) || null;
}

export function findRestaurantById(id) {
  return getCatalog().restaurants.find((r) => r.id === id) || null;
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

/** Short blurb assembled from the catalog fields rather than stored per row. */
export function describe(card) {
  if (!card) return '';
  const venue = venueFor(card);
  if (card.type === 'dish') {
    return `${card.name} is one of the things ${venue?.name || 'this kitchen'} is known for in ${card.area}. ${
      card.veg ? 'Vegetarian' : 'Non-vegetarian'
    }, ${card.rating} stars, about ${card.etaMin} minutes away.`;
  }
  const tags = (card.tags || []).join(', ').toLowerCase();
  return `${card.name} serves ${(card.cuisines || []).join(' and ')} in ${card.area}${
    tags ? ` and is known for being ${tags}` : ''
  }. Expect around \u20B9${card.priceForTwo} for two.`;
}

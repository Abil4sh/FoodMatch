import { allRestaurants, allDishes } from './catalog.js';

/*
 * Builds the swipe deck from the existing mock JSON. Milestone 7 swaps the two
 * imports for a fetch and everything downstream is unchanged.
 */

// Preference ids from matchOptions.json -> cuisines as they appear in the data.
const PREFERENCE_CUISINES = {
  p_south_indian: ['South Indian', 'Breakfast'],
  p_biryani: ['Hyderabadi', 'Andhra', 'Biryani'],
  p_north_indian: ['North Indian', 'Awadhi'],
  p_asian: ['Japanese', 'Ramen', 'Chinese', 'Burmese'],
  p_fast_food: ['Pizza', 'American', 'Burgers', 'Middle Eastern', 'Grill'],
  p_healthy: ['Vegetarian'],
  p_cafe: ['Cafe', 'Bakery'],
  p_desserts: ['Cafe', 'Bakery']
};

export const DECK_MODES = [
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'dishes', label: 'Dishes' }
];

function wanted(preferences = []) {
  return new Set(preferences.flatMap((p) => PREFERENCE_CUISINES[p] || []));
}

/**
 * Nothing is filtered out — a group that picked biryani still deserves to see
 * the ramen place — but anything matching their preferences is dealt first.
 */
export function buildDeck(mode, group) {
  const source = mode === 'dishes' ? allDishes() : allRestaurants();
  const wants = wanted(group?.preferences);
  const scored = source.map((item, i) => ({
    item,
    i,
    hit: item.cuisines?.some((c) => wants.has(c)) ? 0 : 1
  }));
  scored.sort((a, b) => a.hit - b.hit || a.i - b.i);
  return scored.map((s) => s.item);
}

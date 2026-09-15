import { api } from './api';
import {
  normalizeCravings,
  normalizeDishes,
  normalizeFeed,
  normalizePeople,
  normalizePerson,
  normalizeRestaurants
} from './normalize';

import localRestaurants from '../data/restaurants.json';
import localDishes from '../data/dishes.json';
import localFriends from '../data/friends.json';
import localUser from '../data/user.json';
import localCravings from '../data/cravings.json';
import localActiveMatch from '../data/activeMatch.json';

/*
 * Decides where the catalog comes from.
 *
 * Django first. If the API cannot be reached — it is not running, the port is
 * wrong, CORS rejects the origin — the bundled JSON is used instead so the app
 * still works end to end. That fallback is what keeps this a portfolio project
 * you can clone and run with one command.
 *
 * Deliberately: one attempt, no retry, no timer, no polling. A failure yields
 * local data immediately rather than a queue of pending requests.
 */

export const SOURCE = { API: 'api', LOCAL: 'local' };

/** The curated catalog, always available for id lookups. */
export function referenceRestaurants() {
  return normalizeRestaurants(localRestaurants);
}

/** The same shape `/api/feed/` returns, built from the bundled JSON. */
function localBundle() {
  return {
    user: normalizePerson(localUser),
    friends: normalizePeople(localFriends),
    feed: normalizeFeed({
      restaurants: normalizeRestaurants(localRestaurants),
      dishes: normalizeDishes(localDishes),
      cravings: normalizeCravings(localCravings),
      activeMatch: localActiveMatch
    })
  };
}

/**
 * @returns {Promise<{source, user, friends, feed, error}>} never rejects
 */
export async function loadCatalog(location) {
  try {
    const [user, feed, friends] = await Promise.all([api.getMe(), api.getFeed(location), api.getFriends()]);

    // A reachable API that returns an empty catalog is not usable; treat it
    // the same as unreachable rather than rendering an empty app.
    if (!feed.restaurants.length && !feed.dishes.length) {
      throw new Error('API returned an empty catalog.');
    }

    return { source: SOURCE.API, user, feed, friends, error: null };
  } catch (err) {
    // Message only — never the error object, which could carry request detail.
    const reason = err?.message || 'Unknown error';
    if (import.meta.env?.DEV) {
      console.info('[FoodMatch] API unavailable, using bundled catalog. Reason: ' + reason);
    }
    return { ...localBundle(), source: SOURCE.LOCAL, error: reason };
  }
}

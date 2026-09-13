// The only module in the frontend that performs network I/O.
//
// Everything above this file (screens, hooks, the swipe deck, the matching
// engine) stays synchronous and offline. That is deliberate: it is what stops
// a render, a swipe, or a card mount from ever becoming a request.
//
// There is no Google here. The browser talks to our Django API and nothing
// else. No third-party endpoint, no API key, no credential of any kind.

export const BASE_URL = (import.meta.env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

/** Exposed so tests can assert URL construction without a live server. */
export const urlFor = (path) => BASE_URL + path;

// A request that hangs forever is worse than one that fails, so every call is
// bounded. There is no retry loop anywhere in this file, by design.
const TIMEOUT_MS = 8000;

import {
  normalizeCravings,
  normalizeDish,
  normalizeDishes,
  normalizeFeed,
  normalizePeople,
  normalizePerson,
  normalizeRestaurantDetail,
  normalizeRestaurants
} from './normalize';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(urlFor(path), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: controller.signal
    });
  } catch {
    // Covers offline, DNS failure, CORS rejection and the timeout abort. The
    // underlying error is not re-thrown, so nothing internal reaches the UI.
    throw new ApiError('Could not reach the FoodMatch API.', { code: 'unreachable' });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let code = 'http_error';
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') code = body.error;
    } catch {
      /* non-JSON error body; the status code is enough */
    }
    throw new ApiError(`Request failed (${response.status}).`, { status: response.status, code });
  }

  try {
    return await response.json();
  } catch {
    throw new ApiError('The API returned a malformed response.', { code: 'bad_payload' });
  }
}

// Every function normalizes before returning, so nothing above this file ever
// sees a raw API payload and no component repeats a transformation.
export const api = {
  health: () => request('/api/health/'),
  getMe: () => request('/api/me/').then(normalizePerson),
  getFriends: () => request('/api/friends/').then(normalizePeople),
  getCravings: () => request('/api/cravings/').then(normalizeCravings),
  getRestaurants: () => request('/api/restaurants/').then(normalizeRestaurants),
  getDishes: () => request('/api/dishes/').then(normalizeDishes),
  // One call on boot supplies the whole catalog. The deck, detail screen and
  // profile then read from memory rather than fetching per card.
  getFeed: () => request('/api/feed/').then(normalizeFeed),
  getRestaurant: (id) => request(`/api/restaurants/${encodeURIComponent(id)}/`).then(normalizeRestaurantDetail),
  getDish: (id) => request(`/api/dishes/${encodeURIComponent(id)}/`).then(normalizeDish)
};

export function formatINR(value) {
  return '\u20B9' + Number(value).toLocaleString('en-IN');
}

export function priceTierLabel(tier) {
  return ['\u20B9', '\u20B9\u20B9', '\u20B9\u20B9\u20B9'][tier - 1] || '\u20B9';
}

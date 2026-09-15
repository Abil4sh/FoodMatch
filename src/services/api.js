// The only module in the frontend that performs network I/O.
//
// Everything above this file (screens, hooks, the swipe deck, the matching
// engine) stays synchronous and offline. That is deliberate: it is what stops
// a render, a swipe, or a card mount from ever becoming a request.
//
// There is no Google here. The browser talks to our Django API and nothing
// else. No third-party endpoint, no API key, no credential of any kind.

/*
 * Where the Django API lives.
 *
 * Configured, never hardcoded: a Vercel deployment sets VITE_API_BASE_URL to
 * the real backend origin. The localhost default applies only in development,
 * because shipping it to production would point a deployed site at the
 * visitor's own machine and fail silently. In a production build with no
 * variable set we fall back to a same-origin relative path, which works behind
 * a proxy or rewrite, and say so loudly in the console.
 */
function resolveBaseUrl() {
  const configured = import.meta.env?.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }
  if (import.meta.env?.DEV) return 'http://127.0.0.1:8000';
  if (typeof console !== 'undefined') {
    console.warn('[FoodMatch] VITE_API_BASE_URL is not set; falling back to same-origin /api requests.');
  }
  return '';
}

export const BASE_URL = resolveBaseUrl();

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

async function request(path, { method = 'GET', body, token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // The participant token is this browser's identity inside one group. It is
  // never a secret shared between people, and never goes in a URL.
  if (token) headers['X-FoodMatch-Participant'] = token;

  let response;
  try {
    response = await fetch(urlFor(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
    // The API returns a human-readable `detail`; showing it beats a bare
    // status code, and it is written to be safe for a user to read.
    let detail = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') code = body.error;
      if (typeof body?.detail === 'string' && body.detail.trim()) detail = body.detail;
    } catch {
      /* non-JSON error body; the status code is enough */
    }
    throw new ApiError(detail, { status: response.status, code });
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
  // Optional coordinates make the feed follow the selected area.
  getFeed: (location) => {
    const query =
      location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
        ? `?lat=${encodeURIComponent(location.latitude)}&lng=${encodeURIComponent(location.longitude)}`
        : '';
    return request('/api/feed/' + query).then(normalizeFeed);
  },
  searchLocations: (text) => request('/api/locations/search/?q=' + encodeURIComponent(text)),
  getPopularAreas: () => request('/api/locations/popular/'),

  // --- real group sessions -------------------------------------------------
  createGroup: (payload) => request('/api/groups/', { method: 'POST', body: payload }),
  joinGroup: (code, displayName, token) =>
    request(`/api/groups/${encodeURIComponent(code)}/join/`, {
      method: 'POST',
      body: { displayName },
      token
    }),
  getGroup: (code, token) => request(`/api/groups/${encodeURIComponent(code)}/`, { token }),
  startGroup: (code, token) =>
    request(`/api/groups/${encodeURIComponent(code)}/start/`, { method: 'POST', token }),
  getGroupDeck: (code, token) => request(`/api/groups/${encodeURIComponent(code)}/deck/`, { token }),
  submitVote: (code, token, cardId, direction) =>
    request(`/api/groups/${encodeURIComponent(code)}/votes/`, {
      method: 'POST',
      body: { cardId, direction },
      token
    }),
  finishSwiping: (code, token) =>
    request(`/api/groups/${encodeURIComponent(code)}/finish/`, { method: 'POST', token }),
  getGroupResults: (code, token) => request(`/api/groups/${encodeURIComponent(code)}/results/`, { token }),
  getRestaurant: (id) => request(`/api/restaurants/${encodeURIComponent(id)}/`).then(normalizeRestaurantDetail),
  getDish: (id) => request(`/api/dishes/${encodeURIComponent(id)}/`).then(normalizeDish)
};

export function formatINR(value) {
  return '\u20B9' + Number(value).toLocaleString('en-IN');
}

export function priceTierLabel(tier) {
  return ['\u20B9', '\u20B9\u20B9', '\u20B9\u20B9\u20B9'][tier - 1] || '\u20B9';
}

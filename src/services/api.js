// The only module in the frontend that performs network I/O.
//
// Everything above this file (screens, hooks, the swipe deck, the matching
// engine) stays synchronous and offline. That is deliberate: it is what stops
// a render, a swipe, or a card mount from ever becoming a request.
//
// There is no Google here. The browser talks to our Django API and nothing
// else. No third-party endpoint, no API key, no credential of any kind.

const BASE_URL = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

// A request that hangs forever is worse than one that fails, so every call is
// bounded. There is no retry loop anywhere in this file, by design.
const TIMEOUT_MS = 8000;

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
    response = await fetch(BASE_URL + path, {
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

export const api = {
  health: () => request('/api/health/'),
  getMe: () => request('/api/me/'),
  getFriends: () => request('/api/friends/'),
  getCravings: () => request('/api/cravings/'),
  getRestaurants: () => request('/api/restaurants/'),
  getDishes: () => request('/api/dishes/'),
  // One call on boot supplies the whole catalog. The deck, detail screen and
  // profile then read from memory rather than fetching per card.
  getFeed: () => request('/api/feed/'),
  getRestaurant: (id) => request(`/api/restaurants/${encodeURIComponent(id)}/`),
  getDish: (id) => request(`/api/dishes/${encodeURIComponent(id)}/`)
};

export function formatINR(value) {
  return '\u20B9' + Number(value).toLocaleString('en-IN');
}

export function priceTierLabel(tier) {
  return ['\u20B9', '\u20B9\u20B9', '\u20B9\u20B9\u20B9'][tier - 1] || '\u20B9';
}

export { BASE_URL };

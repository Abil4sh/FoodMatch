/*
 * The area the user is browsing.
 *
 * Persisted the same way the active match is: one versioned localStorage key,
 * read synchronously at boot so the header never flashes the wrong place.
 *
 * The shape is deliberately minimal — a label and coordinates are all the feed
 * needs, and all the backend accepts.
 */

const STORAGE_KEY = 'foodmatch.location.v1';

/** Where FoodMatch starts before the user has chosen anything. */
export const DEFAULT_LOCATION = {
  id: 'area_hsr',
  name: 'HSR Layout',
  context: 'Bengaluru, Karnataka',
  latitude: 12.9121,
  longitude: 77.6446,
  source: 'default'
};

export function isValidLocation(value) {
  return Boolean(
    value &&
      typeof value.name === 'string' &&
      value.name.trim() &&
      Number.isFinite(Number(value.latitude)) &&
      Number.isFinite(Number(value.longitude)) &&
      Math.abs(Number(value.latitude)) <= 90 &&
      Math.abs(Number(value.longitude)) <= 180
  );
}

/** Trims whatever a provider returned down to what we store. */
export function toStoredLocation(raw) {
  if (!isValidLocation(raw)) return null;
  return {
    id: String(raw.id || `${raw.latitude},${raw.longitude}`),
    name: raw.name.trim(),
    context: typeof raw.context === 'string' ? raw.context : '',
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    source: typeof raw.source === 'string' ? raw.source : 'unknown'
  };
}

export function readLocation() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCATION;
    const parsed = toStoredLocation(JSON.parse(raw));
    return parsed || DEFAULT_LOCATION;
  } catch {
    return DEFAULT_LOCATION;
  }
}

export function writeLocation(location) {
  const stored = toStoredLocation(location);
  if (!stored) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    // Private mode or quota: the app still works, it just forgets on refresh.
    return false;
  }
}

export function clearLocation() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

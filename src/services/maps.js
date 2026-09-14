/*
 * Builds a destination link for an external maps app or website.
 *
 * This uses Google's Maps URLs scheme, which is a plain website link: it needs
 * no API key, no Google Cloud project and no billing. It is not the Maps
 * JavaScript API, the Directions API, or any other metered service.
 * https://developers.google.com/maps/documentation/urls/get-started
 *
 * No origin is supplied on purpose. Passing only a destination lets the maps
 * app route from wherever the person already is, so FoodMatch never has to ask
 * for GPS permission or handle a location of its own.
 */

const DIRECTIONS_BASE = 'https://www.google.com/maps/dir/?api=1';

const hasCoords = (place) =>
  typeof place?.lat === 'number' &&
  typeof place?.lon === 'number' &&
  Number.isFinite(place.lat) &&
  Number.isFinite(place.lon);

/**
 * The most precise destination we can describe for a place.
 *
 * Coordinates when the provider gave us them, otherwise the name plus whatever
 * address detail exists — which is what the bundled catalog records have.
 */
export function destinationFor(place) {
  if (!place) return null;
  if (hasCoords(place)) return `${place.lat},${place.lon}`;

  const parts = [place.name, place.address || place.area].filter(
    (part) => typeof part === 'string' && part.trim()
  );
  return parts.length ? parts.join(', ') : null;
}

/**
 * @returns {string|null} a maps URL, or null when the place has no location
 *   at all and a link would just open a blank map.
 */
export function directionsUrl(place) {
  const destination = destinationFor(place);
  if (!destination) return null;
  return `${DIRECTIONS_BASE}&destination=${encodeURIComponent(destination)}`;
}

/**
 * Opens the destination in a new tab. `noopener` keeps the new page from
 * reaching back into FoodMatch through window.opener.
 */
export function openDirections(place) {
  const url = directionsUrl(place);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

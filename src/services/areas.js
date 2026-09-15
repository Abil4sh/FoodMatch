import { api } from './api';
import localAreas from '../data/areas.json';

/*
 * Area lookups for the location picker, with the same API-first, local-fallback
 * shape the catalog uses.
 *
 * The bundled list matters more than it looks: without it the picker would be
 * empty whenever Django is down, which would strand the user on whatever area
 * they last chose.
 */

const bundled = () => localAreas.map((area) => ({ ...area, source: 'bundled' }));

/** The shortcut list shown before the user types. Never rejects. */
export async function loadPopularAreas() {
  try {
    const body = await api.getPopularAreas();
    const results = body?.results || [];
    return results.length ? { source: 'api', results } : { source: 'bundled', results: bundled() };
  } catch {
    return { source: 'bundled', results: bundled() };
  }
}

/** Typed search. Never rejects; falls back to filtering the bundled list. */
export async function searchAreas(text) {
  const needle = (text || '').trim().casefold?.() ?? (text || '').trim().toLowerCase();
  const offline = () => ({
    source: 'bundled',
    results: bundled().filter((area) => area.name.toLowerCase().includes(needle))
  });

  try {
    const body = await api.searchLocations(text);
    const results = body?.results || [];
    return results.length ? { source: body.source || 'api', results } : offline();
  } catch {
    return offline();
  }
}

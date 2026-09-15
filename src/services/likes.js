/*
 * Cards this browser has liked, across solo browsing and group sessions.
 *
 * Food DNA is built from what you actually liked, so it needs a record that
 * outlives a single group. Votes themselves live on the server (they belong to
 * a group); this is the local, personal trail.
 *
 * Ids only — no names, no prices. The catalog resolves them.
 */

const KEY = 'foodmatch.likes.v1';
const MAX = 300;

export function readLikes() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Appends without duplicates, newest last. */
export function recordLike(cardId) {
  if (!cardId) return readLikes();
  try {
    const current = readLikes().filter((id) => id !== cardId);
    const next = [...current, cardId].slice(-MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return readLikes();
  }
}

export function clearLikes() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

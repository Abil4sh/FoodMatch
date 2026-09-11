/*
 * Foundation for the Match History screen in a later milestone. Stored under
 * its own key so resetting or replacing the active group never wipes the
 * record of what the group ate.
 */

const KEY = 'foodmatch.history.v1';
const MAX = 20;

export function readHistory() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Re-running a match for the same group replaces its entry rather than stacking duplicates. */
export function saveHistoryEntry(entry) {
  if (!entry?.groupId) return readHistory();
  try {
    const next = [entry, ...readHistory().filter((e) => !(e.groupId === entry.groupId && e.mode === entry.mode))].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return readHistory();
  }
}

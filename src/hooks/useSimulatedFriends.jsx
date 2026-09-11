import { useEffect, useRef } from 'react';

/**
 * Prototype stand-in for real-time presence. Any member currently sitting in
 * `from` is advanced by `advance(id)` after a staggered delay, so the invite
 * and lobby screens feel alive without a server.
 *
 * Milestone 6 replaces this hook with socket events and the screens above it
 * do not change — they only ever read member status from MatchContext.
 */
export function useSimulatedFriends({ members = [], from, advance, baseDelay = 2000, stagger = 1500, enabled = true }) {
  const timers = useRef(new Map());
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    if (!enabled) return;
    members
      .filter((m) => m.status === from)
      .forEach((m, i) => {
        if (timers.current.has(m.id)) return;
        const delay = baseDelay + i * stagger + Math.random() * 600;
        const id = setTimeout(() => {
          timers.current.delete(m.id);
          advanceRef.current(m.id);
        }, delay);
        timers.current.set(m.id, id);
      });
  }, [members, from, baseDelay, stagger, enabled]);

  // Clearing the map here (not just the timeouts) lets StrictMode's remount
  // reschedule cleanly instead of silently dropping the simulation.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((id) => clearTimeout(id));
      map.clear();
    };
  }, []);
}

import { useEffect, useMemo, useRef, useState } from 'react';

/*
 * Fakes the rest of the group working through the same deck. Purely local:
 * no sockets, no fake network layer, just a timer nudging counters upward so
 * the prototype communicates that this is a group activity.
 *
 * Milestone 6 replaces this with real presence; the screen above it only reads
 * `progress[id]`, so nothing else changes.
 */
export function useSimulatedProgress({ memberIds = [], total = 0, enabled = true, rush = false }) {
  const key = memberIds.join(',') + ':' + total;
  const [progress, setProgress] = useState({});
  const keyRef = useRef(key);

  // Seed each friend a few cards in, so the group never looks frozen at zero.
  useEffect(() => {
    keyRef.current = key;
    if (!total || memberIds.length === 0) return;
    const seeded = {};
    memberIds.forEach((id, i) => {
      seeded[id] = Math.min(total, 1 + ((i * 3 + 2) % Math.max(1, Math.floor(total / 2))));
    });
    setProgress(seeded);
  }, [key, total]);

  useEffect(() => {
    if (!enabled || !total || memberIds.length === 0) return undefined;
    const tick = setInterval(
      () => {
        setProgress((prev) => {
          const behind = memberIds.filter((id) => (prev[id] || 0) < total);
          if (behind.length === 0) return prev;
          const pick = behind[Math.floor(Math.random() * behind.length)];
          return { ...prev, [pick]: Math.min(total, (prev[pick] || 0) + 1) };
        });
      },
      rush ? 420 : 1250
    );
    return () => clearInterval(tick);
  }, [key, enabled, total, rush]);

  const allFinished = useMemo(
    () => memberIds.length > 0 && memberIds.every((id) => (progress[id] || 0) >= total),
    [memberIds, progress, total]
  );

  return { progress, allFinished };
}

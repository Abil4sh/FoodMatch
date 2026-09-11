import { useCallback, useMemo, useRef, useState } from 'react';

export const LIKE = 'like';
export const PASS = 'pass';

/*
 * Deck state only — no DOM, no motion values, no styling.
 *
 * The index is derived from the votes already recorded in MatchContext rather
 * than kept in local state, which means a refresh (or flipping between the
 * restaurants and dishes decks) resumes exactly where the user left off
 * without any extra bookkeeping.
 *
 * The pointer position lives inside SwipeCard as a Framer motion value on
 * purpose: dragging must not re-render the deck on every frame.
 */
export const DISTANCE_THRESHOLD = 110; // px of travel that commits a swipe
export const VELOCITY_THRESHOLD = 550; // px/s, so a quick flick counts too

/**
 * Decides what a released drag means. Pure so the gesture rules can be
 * reasoned about (and tested) without a pointer.
 */
export function decideSwipe(offsetX, velocityX) {
  const past = Math.abs(offsetX) > DISTANCE_THRESHOLD;
  const flicked = Math.abs(velocityX) > VELOCITY_THRESHOLD && Math.abs(offsetX) > 40;
  if (!past && !flicked) return null;
  return offsetX > 0 || (Math.abs(offsetX) <= 40 && velocityX > 0) ? LIKE : PASS;
}

export function useSwipeDeck({ cards = [], votes = {}, onVote, visible = 3 }) {
  const [lastDirection, setLastDirection] = useState(null);
  const busy = useRef(false);

  const remaining = useMemo(() => cards.filter((c) => !votes[c.id]), [cards, votes]);
  const index = cards.length - remaining.length;
  const exhausted = cards.length > 0 && remaining.length === 0;
  const visibleCards = useMemo(() => remaining.slice(0, visible), [remaining, visible]);
  const currentCard = visibleCards[0] || null;

  // One commit path for gestures and buttons alike, guarded so a fast
  // double-input can't spend two cards on one swipe.
  const swipe = useCallback(
    (dir) => {
      if (busy.current) return;
      const card = remaining[0];
      if (!card) return;
      busy.current = true;
      setLastDirection(dir);
      onVote?.(card, dir);
      // released on the next frame, once the deck has re-rendered
      requestAnimationFrame(() => {
        busy.current = false;
      });
    },
    [remaining, onVote]
  );

  const swipeLeft = useCallback(() => swipe(PASS), [swipe]);
  const swipeRight = useCallback(() => swipe(LIKE), [swipe]);

  return {
    cards,
    index,
    total: cards.length,
    currentCard,
    visibleCards,
    remainingCount: remaining.length,
    exhausted,
    lastDirection,
    swipe,
    swipeLeft,
    swipeRight
  };
}

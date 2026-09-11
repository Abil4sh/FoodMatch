import { useCallback } from 'react';
import { computeResults, toHistoryEntry } from '../services/matchEngine.js';
import { simulateVotes, membersMissingVotes } from '../services/simulateVotes.js';
import { saveHistoryEntry } from '../services/history.js';
import { useMatch } from '../store/MatchContext';

/**
 * The one place a round is closed out. Screens call `finalize()` and get a
 * computed result back; everything it touches is a pure function or a reducer
 * action, so there is no hidden state to reason about.
 *
 * When a real backend arrives, `simulateVotes` drops out and the rest stands.
 */
export function useMatchResult({ cards = [], mode = 'restaurants' } = {}) {
  const { group, members, mergeVotes, computeResult } = useMatch();

  const finalize = useCallback(() => {
    if (!group || cards.length === 0) return null;

    const memberIds = members.map((m) => m.id);
    const existing = group.votes || {};

    // Fill in only the members who never voted on this deck; a real vote is
    // never overwritten by a simulated one.
    const missing = membersMissingVotes(memberIds, existing, cards);
    const simulated = missing.length
      ? simulateVotes({ cards, memberIds: missing, groupId: group.groupId, preferences: group.preferences })
      : {};

    const allVotes = { ...existing };
    Object.entries(simulated).forEach(([id, v]) => {
      allVotes[id] = { ...(allVotes[id] || {}), ...v };
    });

    const computed = computeResults({ cards, members, votes: allVotes });

    if (missing.length) mergeVotes(simulated);
    computeResult({ ...computed, mode, computedAt: Date.now() });
    const me = group.creator;
    saveHistoryEntry(
      toHistoryEntry({
        groupId: group.groupId,
        groupName: group.groupName,
        mode,
        computed,
        at: Date.now(),
        userId: me,
        likedCardIds: Object.entries(allVotes[me] || {})
          .filter(([, dir]) => dir === 'like')
          .map(([cardId]) => cardId)
      })
    );

    return computed;
  }, [group, members, cards, mode, mergeVotes, computeResult]);

  return { finalize };
}

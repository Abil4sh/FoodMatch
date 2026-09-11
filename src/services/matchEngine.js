/*
 * Pure group-consensus engine. No React, no context, no side effects, no
 * randomness, no clock: same input always yields the same output. That is what
 * makes it testable now and swappable for a server implementation later.
 *
 * The scoring is deliberately transparent rather than clever. Nobody should
 * have to trust a black box to accept where the group is eating.
 */

export const LIKE = 'like';
export const PASS = 'pass';

/**
 * @param {object[]} cards        deck items, each with a stable `id`
 * @param {object[]} members      [{ id }] every member of the group
 * @param {object}   votes        { memberId: { cardId: 'like' | 'pass' } }
 * @returns {{ results, winner, runnersUp, totalMembers, likedAnything, votedCount }}
 */
export function computeResults({ cards = [], members = [], votes = {} } = {}) {
  const memberIds = members.map((m) => (typeof m === 'string' ? m : m?.id)).filter(Boolean);
  const totalMembers = memberIds.length;

  const results = cards
    .filter((card) => card && card.id)
    .map((card, order) => {
      const likedBy = [];
      const passedBy = [];
      let seenBy = 0;

      memberIds.forEach((memberId) => {
        const vote = votes[memberId]?.[card.id];
        if (!vote) return; // never reached this card
        seenBy += 1;
        if (vote === LIKE) likedBy.push(memberId);
        else passedBy.push(memberId);
      });

      // Share of the whole group, not of those who happened to vote: a card
      // two people never saw has not earned their agreement.
      const score = totalMembers ? likedBy.length / totalMembers : 0;

      return {
        card,
        cardId: card.id,
        // carried per result so the UI can never render a percentage from one
        // object and its "X of Y" from another
        totalMembers,
        likedBy,
        passedBy,
        seenBy,
        likes: likedBy.length,
        passes: passedBy.length,
        score,
        percent: Math.round(score * 100),
        rating: Number(card.rating) || 0,
        distanceKm: Number(card.distanceKm) || 0,
        order
      };
    });

  results.sort(compareResults);

  const ranked = results.map((r, i) => ({ ...r, rank: i + 1 }));
  const liked = ranked.filter((r) => r.likes > 0);

  return {
    results: ranked,
    winner: liked[0] || null,
    runnersUp: liked.slice(1, 4),
    totalMembers,
    likedAnything: liked.length > 0,
    votedCount: memberIds.filter((id) => Object.keys(votes[id] || {}).length > 0).length
  };
}

/**
 * Tie-breaking, in the order the brief specifies: consensus, then raw likes,
 * then rating, then proximity. `order` last so equal cards keep deck order and
 * the sort stays deterministic across engines.
 */
export function compareResults(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.likes !== a.likes) return b.likes - a.likes;
  if (b.rating !== a.rating) return b.rating - a.rating;
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  return a.order - b.order;
}

/** Copy small enough to sit under the winner without a second thought. */
export function verdictFor(result, totalMembers) {
  if (!result) return 'Nobody found a perfect match this time.';
  if (totalMembers <= 1) return 'Your pick for tonight.';
  if (result.likes === totalMembers) return 'A rare one: everybody said yes.';
  if (result.percent >= 75) return 'Close to unanimous.';
  if (result.percent >= 50) return 'The majority is on board.';
  return 'No clear favourite, but this came closest.';
}

/**
 * Trimmed down for localStorage so match history has something to read later
 * without persisting the entire deck.
 */
export function toHistoryEntry({ groupId, groupName, mode, computed, at, userId, likedCardIds = [] }) {
  return {
    groupId,
    groupName,
    mode,
    at,
    userId,
    likedCardIds,
    totalMembers: computed.totalMembers,
    winner: computed.winner
      ? {
          cardId: computed.winner.cardId,
          name: computed.winner.card.name,
          percent: computed.winner.percent,
          likes: computed.winner.likes,
          likedBy: computed.winner.likedBy
        }
      : null
  };
}

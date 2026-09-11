import { LIKE, PASS } from './matchEngine.js';

/*
 * Stand-in for the other members swiping. Pure and seeded: the same group, the
 * same deck and the same member always produce the same votes, so a refresh
 * never reshuffles a result the user has already been shown.
 *
 * Milestone 6 deletes this file and reads real votes off the wire. Nothing else
 * changes, because everything downstream only reads MatchContext.votes.
 */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // FNV alone leaves neighbouring inputs correlated, so ids like c1/c2/c3 came
  // out as a near-sequential ramp and votes tracked deck order. A murmur3-style
  // finaliser avalanches the bits so adjacent card ids look independent.
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // 0..1
}

/**
 * Each member gets a fixed appetite, so one friend is reliably fussier than
 * another across the whole deck instead of voting like noise.
 */
function appetiteFor(groupId, memberId) {
  return 0.18 + hash(groupId + '|appetite|' + memberId) * 0.22; // 0.18 - 0.40
}

/**
 * @returns {object} votes for the given members only: { memberId: { cardId: dir } }
 */
export function simulateVotes({ cards = [], memberIds = [], groupId = '', preferences = [] } = {}) {
  const wanted = new Set(preferences);
  const out = {};

  memberIds.forEach((memberId) => {
    const appetite = appetiteFor(groupId, memberId);
    const votes = {};

    cards.forEach((card) => {
      if (!card?.id) return;
      // A well-rated card, or one matching what the group asked for, is more
      // likely to get a yes — believable rather than uniform noise.
      const rating = Number(card.rating) || 4;
      const ratingBoost = (rating - 4) * 0.12;
      const prefBoost = card.cuisines?.some((c) => wanted.has(c)) ? 0.1 : 0;
      const threshold = Math.min(0.92, Math.max(0.08, appetite + ratingBoost + prefBoost));
      const roll = hash(groupId + '|' + memberId + '|' + card.id);
      votes[card.id] = roll < threshold ? LIKE : PASS;
    });

    out[memberId] = votes;
  });

  return out;
}

/** Members who have not voted on a single card in this deck. */
export function membersMissingVotes(memberIds = [], votes = {}, cards = []) {
  const ids = new Set(cards.map((c) => c?.id).filter(Boolean));
  return memberIds.filter((id) => {
    const mine = votes[id] || {};
    return !Object.keys(mine).some((cardId) => ids.has(cardId));
  });
}

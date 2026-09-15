"""Group matching.

Pure functions over plain data: no ORM objects, no clock, no randomness. The
same input always produces the same ranking, which is what makes it testable
and what makes a result reproducible when someone asks why a place won.

The frontend never computes a result. It renders what this produced.

Scoring
-------

    group match % = participants who liked it / participants who voted on it

The denominator is *voters on that card*, not the whole group. A card the last
two people never reached should not be punished for their absence; what matters
is agreement among those who actually expressed an opinion. `votedBy` is
returned alongside so the UI can be honest about the sample size.
"""

from __future__ import annotations

LIKE = "like"
PASS = "pass"

# Below this, a percentage is noise rather than consensus.
MIN_VOTERS_FOR_WINNER = 1


def compute_results(*, cards, votes, participants):
    """
    @param cards        [{id, ...}] the group's deck, in order
    @param votes        [{participantId, cardId, direction}]
    @param participants [{id, displayName}]
    @returns dict with ranked results, winner, runners-up and totals
    """
    participant_ids = [p["id"] for p in participants]
    names = {p["id"]: p.get("displayName", "") for p in participants}
    total_participants = len(participant_ids)
    valid = set(participant_ids)

    by_card: dict[str, dict[str, str]] = {}
    for vote in votes:
        # Votes from a participant who has since left are ignored rather than
        # counted against the current group.
        if vote["participantId"] not in valid:
            continue
        by_card.setdefault(vote["cardId"], {})[vote["participantId"]] = vote["direction"]

    results = []
    for order, card in enumerate(cards):
        card_id = card.get("id")
        if not card_id:
            continue
        cast = by_card.get(card_id, {})
        liked_by = [pid for pid, direction in cast.items() if direction == LIKE]
        passed_by = [pid for pid, direction in cast.items() if direction == PASS]
        voted_by = len(cast)

        score = (len(liked_by) / voted_by) if voted_by else 0.0

        results.append(
            {
                "cardId": card_id,
                "card": card,
                "likes": len(liked_by),
                "passes": len(passed_by),
                "votedBy": voted_by,
                "totalParticipants": total_participants,
                "score": score,
                "percent": round(score * 100),
                "likedBy": sorted(liked_by, key=lambda pid: participant_ids.index(pid)),
                "likedByNames": [names.get(pid, "") for pid in sorted(liked_by, key=lambda pid: participant_ids.index(pid))],
                "rating": _number(card.get("rating")),
                "distanceKm": _number(card.get("distanceKm")),
                "order": order,
            }
        )

    results.sort(key=_ranking_key)
    ranked = [{**r, "rank": i + 1} for i, r in enumerate(results)]
    liked = [r for r in ranked if r["likes"] > 0 and r["votedBy"] >= MIN_VOTERS_FOR_WINNER]

    return {
        "results": ranked,
        "winner": liked[0] if liked else None,
        "runnersUp": liked[1:4],
        "totalParticipants": total_participants,
        "votedParticipants": len({v["participantId"] for v in votes if v["participantId"] in valid}),
        "likedAnything": bool(liked),
    }


def _number(value, default=0.0):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed


def _ranking_key(result):
    """Deterministic ordering.

    Consensus first; then raw likes, so a 3/3 beats a 1/1; then how many people
    actually weighed in, because a wider sample is a stronger signal; then
    rating, then proximity; then deck order so the sort is total.
    """
    return (
        -result["score"],
        -result["likes"],
        -result["votedBy"],
        -result["rating"],
        result["distanceKm"],
        result["order"],
    )


def verdict_for(result, total_participants: int) -> str:
    """One line explaining the outcome, in plain language."""
    if not result:
        return "Nobody found a perfect match this time."
    if total_participants <= 1:
        return "Your pick for tonight."
    if result["likes"] == result["votedBy"] and result["votedBy"] > 1:
        return "A rare one: everybody who voted said yes."
    if result["percent"] >= 75:
        return "Close to unanimous."
    if result["percent"] >= 50:
        return "The majority is on board."
    return "No clear favourite, but this came closest."


def headline_for(result) -> str:
    """e.g. "3 of 4 people matched"."""
    if not result:
        return "No matches yet"
    return f"{result['likes']} of {result['votedBy']} people matched"

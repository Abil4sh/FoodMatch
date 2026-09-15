"""Group session API.

Every endpoint here is authoritative: the server owns membership, the deck, the
votes and the result. The client sends intent ("I liked this card") and reads
state back; it never computes a result and never asserts who is in a group.

Identity is a participant token sent as `X-FoodMatch-Participant`. It is
created on create/join, returned exactly once to its owner, and never included
in any group payload — so knowing a group code tells you nothing about how to
act as someone else in it.
"""

from __future__ import annotations

import logging

from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .models import CODE_ALPHABET, MAX_PARTICIPANTS, DeckCard, FoodMatchGroup, Participant, Vote
from .serializers import serialize_dish, serialize_restaurant
from .services import catalog, group_matching, restaurant_provider
from .validation import (
    ValidationError,
    validate_coordinates,
    validate_display_name,
    validate_group_code,
    validate_group_name,
    validate_mode,
    validate_vote_direction,
)

logger = logging.getLogger(__name__)

DECK_SIZE = 16


class GroupWriteThrottle(AnonRateThrottle):
    """Creating and joining groups; the endpoints that allocate rows."""

    scope = "group_write"


class GroupReadThrottle(AnonRateThrottle):
    """Status polling. Generous, because the lobby polls it."""

    scope = "group_read"


class VoteThrottle(AnonRateThrottle):
    """Voting is frequent but bounded by deck size."""

    scope = "vote"


# --- helpers ----------------------------------------------------------------


class NotAParticipant(Exception):
    """The caller supplied no token, or one that does not belong to this group."""


def _group_or_none(code: str):
    return FoodMatchGroup.objects.filter(code=code).first()


def _require_participant(request, group) -> Participant:
    token = request.headers.get("X-FoodMatch-Participant", "").strip()
    if not token:
        raise NotAParticipant()
    participant = Participant.objects.filter(token=token, group=group).select_related("group").first()
    if participant is None:
        raise NotAParticipant()
    return participant


def _participant_payload(participant: Participant, voted: int = 0, deck_size: int = 0) -> dict:
    """Public view of a participant. Deliberately excludes the token."""
    return {
        "id": str(participant.id),
        "displayName": participant.display_name,
        "initials": participant.initials,
        "isHost": participant.is_host,
        "state": participant.state,
        "voted": voted,
        "deckSize": deck_size,
    }


def _group_payload(group: FoodMatchGroup, me: Participant | None = None) -> dict:
    deck_size = group.deck.count()
    counts = {}
    for row in Vote.objects.filter(participant__group=group).values_list("participant_id", flat=True):
        counts[row] = counts.get(row, 0) + 1

    participants = list(group.participants.all())
    return {
        "code": group.code,
        "name": group.name,
        "mode": group.mode,
        "status": group.status,
        "area": {"name": group.area_name, "latitude": group.latitude, "longitude": group.longitude},
        "deckSize": deck_size,
        "maxParticipants": MAX_PARTICIPANTS,
        "createdAt": group.created_at.isoformat(),
        "startedAt": group.started_at.isoformat() if group.started_at else None,
        "completedAt": group.completed_at.isoformat() if group.completed_at else None,
        "everyoneFinished": group.everyone_finished(),
        "participants": [
            _participant_payload(p, counts.get(p.id, 0), deck_size) for p in participants
        ],
        "you": _participant_payload(me, counts.get(me.id, 0), deck_size) if me else None,
    }


def _error(code: str, detail: str, http_status: int):
    return Response({"error": code, "detail": detail}, status=http_status)


def _gone_or_missing(group):
    """Shared guard for the states a group can be unusable in."""
    if group is None:
        return _error("not_found", "No FoodMatch with that code.", status.HTTP_404_NOT_FOUND)
    if group.is_expired:
        return _error("expired", "That FoodMatch has expired.", status.HTTP_410_GONE)
    return None


def _build_deck(group: FoodMatchGroup) -> list[dict]:
    """Resolve the candidate set once and freeze it for the whole group.

    Restaurants come from the provider (or the bundled catalog); dishes come
    from the curated menu data, which is the only place dish-level information
    exists. Either way every participant is served this same stored list.
    """
    if group.mode == FoodMatchGroup.Mode.DISHES:
        cards = [serialize_dish(d) for d in catalog.get_dishes()][:DECK_SIZE]
    else:
        outcome = restaurant_provider.search_restaurants(
            query="",
            latitude=group.latitude,
            longitude=group.longitude,
            radius_m=restaurant_provider.DEFAULT_RADIUS_M,
            limit=DECK_SIZE,
        )
        cards = [serialize_restaurant(r) for r in outcome["results"]][:DECK_SIZE]

    DeckCard.objects.bulk_create(
        [
            DeckCard(group=group, card_id=card["id"], position=index, payload=card)
            for index, card in enumerate(cards)
        ],
        ignore_conflicts=True,
    )
    return cards


# --- endpoints --------------------------------------------------------------


@api_view(["POST"])
@throttle_classes([GroupWriteThrottle])
def create_group(request):
    """Create a FoodMatch and become its host."""
    data = request.data if isinstance(request.data, dict) else {}
    name = validate_group_name(data.get("name"))
    display_name = validate_display_name(data.get("displayName"))
    mode = validate_mode(data.get("mode"))
    latitude, longitude = validate_coordinates(data.get("latitude"), data.get("longitude"))
    area_name = validate_group_name(data.get("areaName") or "Bengaluru", field="areaName")

    with transaction.atomic():
        group = FoodMatchGroup.create_with_code(
            name=name, mode=mode, area_name=area_name, latitude=latitude, longitude=longitude
        )
        host = Participant.objects.create(group=group, display_name=display_name, is_host=True)

    return Response(
        {"group": _group_payload(group, host), "participantToken": host.token},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@throttle_classes([GroupWriteThrottle])
def join_group(request, code):
    """Join an existing FoodMatch with its code. No account required."""
    code = validate_group_code(code)
    group = _group_or_none(code)
    problem = _gone_or_missing(group)
    if problem:
        return problem

    if group.status == FoodMatchGroup.Status.COMPLETED:
        return _error("completed", "That FoodMatch has already finished.", status.HTTP_409_CONFLICT)

    # Rejoining from the same device returns the existing identity rather than
    # creating a duplicate participant.
    token = request.headers.get("X-FoodMatch-Participant", "").strip()
    if token:
        existing = Participant.objects.filter(token=token, group=group).first()
        if existing:
            return Response({"group": _group_payload(group, existing), "participantToken": existing.token})

    if group.is_full:
        return _error("full", f"That FoodMatch is full ({MAX_PARTICIPANTS} people).", status.HTTP_409_CONFLICT)

    requested = validate_display_name(request.data.get("displayName") if isinstance(request.data, dict) else None)
    display_name = _unique_display_name(group, requested)

    try:
        participant = Participant.objects.create(group=group, display_name=display_name)
    except IntegrityError:
        return _error("name_taken", "Someone in the group already uses that name.", status.HTTP_409_CONFLICT)

    return Response(
        {"group": _group_payload(group, participant), "participantToken": participant.token},
        status=status.HTTP_201_CREATED,
    )


def _unique_display_name(group, requested: str) -> str:
    """Two people called Rahul become Rahul and Rahul (2)."""
    taken = set(group.participants.values_list("display_name", flat=True))
    if requested not in taken:
        return requested
    for suffix in range(2, MAX_PARTICIPANTS + 2):
        candidate = f"{requested} ({suffix})"[:24]
        if candidate not in taken:
            return candidate
    return requested


@api_view(["GET"])
@throttle_classes([GroupReadThrottle])
def group_status(request, code):
    """Current group state. This is what the lobby polls."""
    code = validate_group_code(code)
    group = (
        FoodMatchGroup.objects.filter(code=code)
        .prefetch_related(Prefetch("participants", queryset=Participant.objects.all()))
        .first()
    )
    problem = _gone_or_missing(group)
    if problem:
        return problem

    try:
        me = _require_participant(request, group)
    except NotAParticipant:
        me = None

    return Response(_group_payload(group, me))


@api_view(["POST"])
@throttle_classes([GroupWriteThrottle])
def start_group(request, code):
    """Host starts the round. Builds and freezes the shared deck."""
    code = validate_group_code(code)
    group = _group_or_none(code)
    problem = _gone_or_missing(group)
    if problem:
        return problem

    try:
        me = _require_participant(request, group)
    except NotAParticipant:
        return _error("not_a_participant", "Join the FoodMatch first.", status.HTTP_403_FORBIDDEN)

    if not me.is_host:
        return _error("not_host", "Only the host can start this FoodMatch.", status.HTTP_403_FORBIDDEN)
    if group.status == FoodMatchGroup.Status.COMPLETED:
        return _error("completed", "That FoodMatch has already finished.", status.HTTP_409_CONFLICT)

    # Idempotent: starting twice does not rebuild the deck or reset anyone.
    if group.status == FoodMatchGroup.Status.LOBBY:
        with transaction.atomic():
            _build_deck(group)
            group.status = FoodMatchGroup.Status.SWIPING
            group.started_at = timezone.now()
            group.save(update_fields=["status", "started_at"])
            group.participants.update(state=Participant.State.SWIPING)
        group.refresh_from_db()

    return Response(_group_payload(group, me))


@api_view(["GET"])
@throttle_classes([GroupReadThrottle])
def group_deck(request, code):
    """The frozen candidate set: identical for every participant."""
    code = validate_group_code(code)
    group = _group_or_none(code)
    problem = _gone_or_missing(group)
    if problem:
        return problem

    try:
        me = _require_participant(request, group)
    except NotAParticipant:
        return _error("not_a_participant", "Join the FoodMatch first.", status.HTTP_403_FORBIDDEN)

    if group.status == FoodMatchGroup.Status.LOBBY:
        return _error("not_started", "This FoodMatch hasn't started yet.", status.HTTP_409_CONFLICT)

    cards = [row.payload for row in group.deck.all()]
    my_votes = {v.card_id: v.direction for v in me.votes.all()}
    return Response({"mode": group.mode, "cards": cards, "yourVotes": my_votes})


@api_view(["POST"])
@throttle_classes([VoteThrottle])
def submit_vote(request, code):
    """Record one like or pass. Duplicate votes are refused by the database."""
    code = validate_group_code(code)
    group = _group_or_none(code)
    problem = _gone_or_missing(group)
    if problem:
        return problem

    try:
        me = _require_participant(request, group)
    except NotAParticipant:
        return _error("not_a_participant", "Join the FoodMatch first.", status.HTTP_403_FORBIDDEN)

    if group.status == FoodMatchGroup.Status.LOBBY:
        return _error("not_started", "This FoodMatch hasn't started yet.", status.HTTP_409_CONFLICT)

    data = request.data if isinstance(request.data, dict) else {}
    card_id = str(data.get("cardId") or "").strip()
    direction = validate_vote_direction(data.get("direction"))

    # A vote must be for a card that is actually in this group's deck.
    if not group.deck.filter(card_id=card_id).exists():
        return _error("unknown_card", "That card is not in this FoodMatch.", status.HTTP_400_BAD_REQUEST)

    _, created = Vote.objects.get_or_create(
        participant=me, card_id=card_id, defaults={"direction": direction}
    )

    voted = me.votes.count()
    deck_size = group.deck.count()
    if me.state == Participant.State.JOINED:
        me.state = Participant.State.SWIPING
        me.save(update_fields=["state"])

    return Response(
        {"recorded": created, "voted": voted, "deckSize": deck_size},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["POST"])
@throttle_classes([GroupWriteThrottle])
def finish_participant(request, code):
    """Mark this participant done. Completes the group when everyone is."""
    code = validate_group_code(code)
    group = _group_or_none(code)
    problem = _gone_or_missing(group)
    if problem:
        return problem

    try:
        me = _require_participant(request, group)
    except NotAParticipant:
        return _error("not_a_participant", "Join the FoodMatch first.", status.HTTP_403_FORBIDDEN)

    if me.state != Participant.State.FINISHED:
        me.state = Participant.State.FINISHED
        me.finished_at = timezone.now()
        me.save(update_fields=["state", "finished_at"])

    group.refresh_from_db()
    if group.everyone_finished() and group.status != FoodMatchGroup.Status.COMPLETED:
        group.status = FoodMatchGroup.Status.COMPLETED
        group.completed_at = timezone.now()
        group.save(update_fields=["status", "completed_at"])

    return Response(_group_payload(group, me))


@api_view(["GET"])
@throttle_classes([GroupReadThrottle])
def group_results(request, code):
    """Server-computed ranking. The client never calculates this."""
    code = validate_group_code(code)
    group = _group_or_none(code)
    problem = _gone_or_missing(group)
    if problem:
        return problem

    try:
        me = _require_participant(request, group)
    except NotAParticipant:
        return _error("not_a_participant", "Join the FoodMatch first.", status.HTTP_403_FORBIDDEN)

    if group.status == FoodMatchGroup.Status.LOBBY:
        return _error("not_started", "This FoodMatch hasn't started yet.", status.HTTP_409_CONFLICT)

    participants = list(group.participants.all())
    cards = [row.payload for row in group.deck.all()]
    votes = [
        {"participantId": v.participant_id, "cardId": v.card_id, "direction": v.direction}
        for v in Vote.objects.filter(participant__group=group)
    ]

    computed = group_matching.compute_results(
        cards=cards,
        votes=votes,
        participants=[{"id": p.id, "displayName": p.display_name} for p in participants],
    )

    winner = computed["winner"]
    return Response(
        {
            "code": group.code,
            "name": group.name,
            "mode": group.mode,
            "status": group.status,
            "everyoneFinished": group.everyone_finished(),
            "totalParticipants": computed["totalParticipants"],
            "headline": group_matching.headline_for(winner),
            "verdict": group_matching.verdict_for(winner, computed["totalParticipants"]),
            "winner": _public_result(winner),
            "runnersUp": [_public_result(r) for r in computed["runnersUp"]],
            "results": [_public_result(r) for r in computed["results"]],
            "you": _participant_payload(me, me.votes.count(), group.deck.count()),
        }
    )


def _public_result(result):
    """Strip internal ids; keep the names the reveal screen shows."""
    if not result:
        return None
    return {
        "cardId": result["cardId"],
        "card": result["card"],
        "likes": result["likes"],
        "passes": result["passes"],
        "votedBy": result["votedBy"],
        "totalParticipants": result["totalParticipants"],
        "percent": result["percent"],
        "likedByNames": result["likedByNames"],
        "rank": result.get("rank"),
    }

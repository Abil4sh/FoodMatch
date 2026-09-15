"""Group session models.

These replace the simulated friends entirely. A FoodMatch is a real row, its
participants are real rows, and every vote is persisted server-side — the
backend is authoritative for membership, voting and results.

Identity without accounts: each participant gets an opaque token on join. It is
the bearer credential for that participant for the life of the session and is
never shown to other participants. No email, no password, no personal data
beyond a display name the person types.
"""

from __future__ import annotations

import secrets
import uuid

from django.db import models
from django.utils import timezone

# No I/O/0/1: a code gets read aloud and typed on a phone.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
MAX_PARTICIPANTS = 12
GROUP_TTL_HOURS = 12


def generate_code() -> str:
    """A collision-resistant code. 32^6 ≈ 1.07 billion combinations."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


class FoodMatchGroup(models.Model):
    class Status(models.TextChoices):
        LOBBY = "lobby", "Lobby"
        SWIPING = "swiping", "Swiping"
        COMPLETED = "completed", "Completed"

    class Mode(models.TextChoices):
        RESTAURANTS = "restaurants", "Restaurants"
        DISHES = "dishes", "Dishes"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Indexed and unique: the code is how everyone finds the group.
    code = models.CharField(max_length=CODE_LENGTH, unique=True, db_index=True)
    name = models.CharField(max_length=60)
    mode = models.CharField(max_length=16, choices=Mode.choices, default=Mode.RESTAURANTS)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.LOBBY, db_index=True)

    area_name = models.CharField(max_length=120, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @classmethod
    def create_with_code(cls, **fields) -> "FoodMatchGroup":
        """Mint a unique code, retrying on the vanishingly rare collision."""
        for _ in range(10):
            code = generate_code()
            if not cls.objects.filter(code=code).exists():
                return cls.objects.create(code=code, **fields)
        raise RuntimeError("could not allocate a unique group code")

    @property
    def is_expired(self) -> bool:
        return timezone.now() - self.created_at > timezone.timedelta(hours=GROUP_TTL_HOURS)

    @property
    def is_full(self) -> bool:
        return self.participants.count() >= MAX_PARTICIPANTS

    def everyone_finished(self) -> bool:
        participants = list(self.participants.all())
        return bool(participants) and all(p.state == Participant.State.FINISHED for p in participants)


class Participant(models.Model):
    """One person in one group. Anonymous, identified by a bearer token."""

    class State(models.TextChoices):
        JOINED = "joined", "Joined"
        SWIPING = "swiping", "Swiping"
        FINISHED = "finished", "Finished"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(FoodMatchGroup, related_name="participants", on_delete=models.CASCADE)
    # Secret. Returned once to its owner and never included in a group payload.
    token = models.CharField(max_length=64, unique=True, db_index=True, default=secrets.token_urlsafe)
    display_name = models.CharField(max_length=24)
    is_host = models.BooleanField(default=False)
    state = models.CharField(max_length=16, choices=State.choices, default=State.JOINED)

    joined_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["joined_at"]
        constraints = [
            # Two people called "Rahul" in one group would be unreadable in the
            # lobby; the join endpoint disambiguates before it gets here.
            models.UniqueConstraint(fields=["group", "display_name"], name="unique_display_name_per_group")
        ]

    def __str__(self):
        return f"{self.display_name} in {self.group.code}"

    @property
    def initials(self) -> str:
        return (self.display_name or "?")[:1].upper()


class DeckCard(models.Model):
    """A snapshot of one candidate, frozen when the group starts.

    Snapshotting matters: without it each participant could be served a
    different live Geoapify result and they would be voting on different
    things. The deck is resolved once, stored, and served identically to
    everyone in the group.
    """

    group = models.ForeignKey(FoodMatchGroup, related_name="deck", on_delete=models.CASCADE)
    card_id = models.CharField(max_length=128)
    position = models.PositiveIntegerField()
    payload = models.JSONField()

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["group", "card_id"], name="unique_card_per_group"),
        ]
        indexes = [models.Index(fields=["group", "position"])]

    def __str__(self):
        return f"{self.card_id} @{self.position}"


class Vote(models.Model):
    class Direction(models.TextChoices):
        LIKE = "like", "Like"
        PASS = "pass", "Pass"

    participant = models.ForeignKey(Participant, related_name="votes", on_delete=models.CASCADE)
    card_id = models.CharField(max_length=128, db_index=True)
    direction = models.CharField(max_length=8, choices=Direction.choices)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            # The database refuses a second vote on the same card by the same
            # participant. A double-tap or a retried request cannot skew a result.
            models.UniqueConstraint(fields=["participant", "card_id"], name="unique_vote_per_card"),
        ]
        indexes = [models.Index(fields=["participant", "card_id"])]

    def __str__(self):
        return f"{self.participant.display_name} {self.direction} {self.card_id}"

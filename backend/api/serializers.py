"""Response shaping.

The catalog JSON already matches what the React app expects, so these
serializers pass fields through by an explicit allowlist rather than dumping
whatever happens to be in the source record.

That allowlist is the important part. When a Google-backed source replaces the
local one, only fields named here can ever reach a client, so an upstream
response cannot leak extra data by accident.
"""

from __future__ import annotations

RESTAURANT_FIELDS = (
    "id",
    "type",
    "name",
    "cuisines",
    "area",
    "distanceKm",
    "etaMin",
    "rating",
    "reviews",
    "priceForTwo",
    "priceTier",
    "photoLabel",
    "groupMatchPct",
    "tags",
    "hours",
    "address",
    # Provider-sourced records carry coordinates and a source marker; local
    # catalog records simply omit them, since _pick only copies present keys.
    "lat",
    "lon",
    "source",
    # Curated pricing. Always paired with pricingIsApproximate so the UI can
    # label it rather than presenting it as a verified figure.
    "typicalSpendMin",
    "typicalSpendMax",
    "pricingIsApproximate",
)

DISH_FIELDS = (
    "id",
    "type",
    "name",
    "restaurantId",
    "restaurantName",
    "area",
    "price",
    "rating",
    "distanceKm",
    "etaMin",
    "photoLabel",
    "cuisines",
    "veg",
    "isApproximate",
)

FRIEND_FIELDS = ("id", "name", "initials", "color", "area")
USER_FIELDS = ("id", "name", "fullName", "initials", "color", "area", "city", "foodDNA")
CRAVING_FIELDS = ("id", "label", "cuisine")


def _pick(record: dict, fields: tuple[str, ...]) -> dict:
    return {key: record[key] for key in fields if key in record}


def serialize_restaurant(record: dict) -> dict:
    return _pick(record, RESTAURANT_FIELDS)


def serialize_dish(record: dict) -> dict:
    return _pick(record, DISH_FIELDS)


def serialize_friend(record: dict) -> dict:
    return _pick(record, FRIEND_FIELDS)


def serialize_user(record: dict) -> dict:
    return _pick(record, USER_FIELDS)


def serialize_craving(record: dict) -> dict:
    return _pick(record, CRAVING_FIELDS)


def serialize_card(record: dict) -> dict:
    """Dispatch on the record's own type marker."""
    return serialize_dish(record) if record.get("type") == "dish" else serialize_restaurant(record)

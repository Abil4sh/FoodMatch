"""Catalog data access.

This module is the *only* place the API reads catalog data from. Views never
touch the filesystem or parse JSON themselves.

That matters for what comes next: when a live places provider is introduced,
a `geoapify_places.py` service sits alongside this one and `get_restaurants` /
`get_restaurant` change where they source data from. Nothing in the views,
serializers, or the React app has to change.

There is deliberately no network access in this file. At this stage FoodMatch
makes zero outbound requests of any kind.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Only these files may be loaded. A whitelist rather than a path parameter, so
# no request can ever influence which file is opened.
_DATASETS = {
    "restaurants": "restaurants.json",
    "dishes": "dishes.json",
    "friends": "friends.json",
    "user": "user.json",
    "cravings": "cravings.json",
    "active_match": "activeMatch.json",
    "areas": "areas.json",
}


class CatalogError(RuntimeError):
    """Raised when catalog data cannot be loaded. Never surfaced verbatim."""


@lru_cache(maxsize=None)
def _load(name: str):
    """Read one whitelisted dataset. Cached, so files are parsed once per process."""
    filename = _DATASETS.get(name)
    if filename is None:
        # Defensive: unreachable via HTTP because callers pass literals.
        raise CatalogError("unknown dataset")

    path = DATA_DIR / filename
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        # The original exception carries a filesystem path, so it is swallowed
        # here rather than allowed to reach an API response.
        raise CatalogError(f"could not load dataset '{name}'") from exc


def get_restaurants() -> list[dict]:
    return _load("restaurants")


def get_dishes() -> list[dict]:
    return _load("dishes")


def get_restaurant(restaurant_id: str) -> dict | None:
    return next((r for r in get_restaurants() if r.get("id") == restaurant_id), None)


def get_dish(dish_id: str) -> dict | None:
    return next((d for d in get_dishes() if d.get("id") == dish_id), None)


def find_card(card_id: str) -> dict | None:
    """Restaurants and dishes share one id space, matching the frontend catalog."""
    return get_restaurant(card_id) or get_dish(card_id)


def dishes_for_restaurant(restaurant_id: str) -> list[dict]:
    return [d for d in get_dishes() if d.get("restaurantId") == restaurant_id]


def get_friends() -> list[dict]:
    return _load("friends")


def get_user() -> dict:
    return _load("user")


def get_cravings() -> list[dict]:
    return _load("cravings")


def get_active_match() -> dict:
    return _load("active_match")


def get_areas() -> list[dict]:
    """Curated Bengaluru areas: the popular list, and the offline fallback for
    location search when no provider key is configured."""
    return _load("areas")


def get_feed() -> dict:
    """Everything the app needs on boot, in one round trip.

    One request on load is deliberate: it is what keeps the swipe deck, the
    detail screen and the profile from each fetching on their own later.
    """
    return {
        "restaurants": get_restaurants(),
        "dishes": get_dishes(),
        "cravings": get_cravings(),
        "activeMatch": get_active_match(),
    }

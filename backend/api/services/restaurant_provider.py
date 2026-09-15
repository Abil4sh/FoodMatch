"""Provider-neutral restaurant search.

Views call this module; they never import a provider directly. Swapping or
adding a provider means editing this file and the provider module, and nothing
else.

It also owns one decision that matters: Geoapify Places searches by *category
and geography*, not free text. The caller's `query` is therefore applied here,
locally, against results already returned — it is never sent upstream as a
search term Geoapify does not support.
"""

from __future__ import annotations

import logging
import os

from . import catalog
from . import geoapify_places

logger = logging.getLogger(__name__)

PROVIDER_NAME = "geoapify"

SOURCE_PROVIDER = "geoapify"
SOURCE_LOCAL = "local"

# Where to search when the client sends no coordinates. FoodMatch's mock user
# is in HSR Layout, Bengaluru, so that is the sensible default centre.
# Overridable per deployment; not a secret.
DEFAULT_LATITUDE = float(os.getenv("FOODMATCH_DEFAULT_LAT", "12.9121"))
DEFAULT_LONGITUDE = float(os.getenv("FOODMATCH_DEFAULT_LNG", "77.6446"))

# Used for the boot feed. A deck of 20 is plenty and matches the provider cap.
DEFAULT_RADIUS_M = int(os.getenv("FOODMATCH_DEFAULT_RADIUS_M", "3000"))
DEFAULT_FEED_LIMIT = 20


def provider_configured() -> bool:
    return geoapify_places.is_configured()


def popular_areas(limit: int = 8) -> list[dict]:
    """The curated shortcut list shown before the user types anything."""
    return [{**area, "source": "curated"} for area in catalog.get_areas()[:limit]]


def local_locations(text: str, limit: int) -> list[dict]:
    """Search the curated area list. Never makes an outbound request."""
    needle = (text or "").casefold()
    areas = catalog.get_areas()
    matches = [a for a in areas if needle in a["name"].casefold()] if needle else areas
    return [{**area, "source": "curated"} for area in matches[:limit]]


def search_locations(*, text: str, limit: int = 8) -> dict:
    """Resolve a typed area name. Never raises for provider problems.

    Falls back to the curated Bengaluru list when no key is configured or the
    provider fails, so the picker always has something to offer.
    """
    if not provider_configured():
        return {"source": SOURCE_LOCAL, "reason": "not_configured", "results": local_locations(text, limit)}

    try:
        results = geoapify_places.search_locations(text=text, limit=limit)
    except geoapify_places.ProviderError as exc:
        logger.warning("location search fell back to curated areas: %s", exc.code)
        return {"source": SOURCE_LOCAL, "reason": exc.code, "results": local_locations(text, limit)}

    if not results:
        return {"source": SOURCE_LOCAL, "reason": "empty_upstream", "results": local_locations(text, limit)}

    return {"source": SOURCE_PROVIDER, "reason": None, "results": results}


def _matches(record: dict, needle: str) -> bool:
    if not needle:
        return True
    needle = needle.casefold()
    return (
        needle in (record.get("name") or "").casefold()
        or needle in (record.get("area") or "").casefold()
        or any(needle in (c or "").casefold() for c in record.get("cuisines") or [])
    )


def local_restaurants(query: str, limit: int) -> list[dict]:
    """Search the bundled catalog. Never makes an outbound request."""
    records = catalog.get_restaurants()
    matches = [r for r in records if _matches(r, query)]
    # An empty match set would look broken, so fall back to the whole catalog.
    return list(matches or records)[:limit]


def search_restaurants(*, query: str = "", latitude=None, longitude=None, radius_m: int, limit: int) -> dict:
    """Return {source, results, reason}. Never raises for provider problems.

    Order of preference:
      1. Provider configured and reachable -> real restaurant data.
      2. No key                            -> bundled catalog, zero requests.
      3. Provider failed                   -> bundled catalog, one attempt only.
    """
    if not provider_configured():
        # No key means no outbound request of any kind. Not a fake key, not a
        # request that fails: no request.
        return {"source": SOURCE_LOCAL, "reason": "not_configured", "results": local_restaurants(query, limit)}

    lat = DEFAULT_LATITUDE if latitude is None else latitude
    lon = DEFAULT_LONGITUDE if longitude is None else longitude

    try:
        results = geoapify_places.search_restaurants(
            latitude=lat, longitude=lon, radius_m=radius_m, limit=limit
        )
    except geoapify_places.ProviderError as exc:
        # One failure, one fallback. No retry loop at this layer; the provider
        # has already made at most one retry of its own.
        logger.warning("restaurant provider fell back to local catalog: %s", exc.code)
        return {"source": SOURCE_LOCAL, "reason": exc.code, "results": local_restaurants(query, limit)}

    # The query Geoapify could not take is applied here instead.
    filtered = [r for r in results if _matches(r, query)]
    if query and not filtered:
        # Better to show the area's restaurants than an empty deck.
        filtered = results

    if not filtered:
        return {"source": SOURCE_LOCAL, "reason": "empty_upstream", "results": local_restaurants(query, limit)}

    return {"source": SOURCE_PROVIDER, "reason": None, "results": filtered[:limit]}

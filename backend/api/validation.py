"""Request validation.

The catalog is read-only, so validation here is narrow on purpose: identifiers
and a result limit. The point is that the shape exists and is enforced at the
boundary before anything expensive is ever added behind it.
"""

from __future__ import annotations

import re

# Ids in the FoodMatch catalog look like `r_ramen_house` / `d_shawarma`.
# Anchored, length-capped, and deliberately excludes `/`, `.` and `%` so an id
# can never be coerced into a path segment or a URL.
ID_PATTERN = re.compile(r"^[a-z0-9_]{2,64}$")

MAX_LIMIT = 50
DEFAULT_LIMIT = 50

# Caps for the search endpoint, which is the only one that can reach an
# upstream provider. Enforced here so an oversized request is rejected before
# any client is constructed.
MAX_QUERY_LENGTH = 100
MIN_QUERY_LENGTH = 2
MAX_SEARCH_RADIUS_M = 5000
DEFAULT_SEARCH_RADIUS_M = 2000
MAX_SEARCH_RESULTS = 20
DEFAULT_SEARCH_RESULTS = 10

# Google Place IDs are opaque and use a wider alphabet than our catalog ids.
PLACE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-]{10,255}$")


class ValidationError(ValueError):
    """Invalid client input. Mapped to a 400 with a safe message."""


def validate_id(raw: str) -> str:
    if not isinstance(raw, str) or not ID_PATTERN.match(raw):
        raise ValidationError("Invalid identifier.")
    return raw


def validate_limit(raw) -> int:
    """Cap result counts so no caller can request an unbounded page."""
    if raw in (None, ""):
        return DEFAULT_LIMIT
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValidationError("limit must be a whole number.") from None
    if value < 1:
        raise ValidationError("limit must be at least 1.")
    if value > MAX_LIMIT:
        raise ValidationError(f"limit must not exceed {MAX_LIMIT}.")
    return value


def validate_search_query(raw) -> str:
    if not isinstance(raw, str):
        raise ValidationError("q is required.")
    query = raw.strip()
    if len(query) < MIN_QUERY_LENGTH:
        raise ValidationError(f"q must be at least {MIN_QUERY_LENGTH} characters.")
    if len(query) > MAX_QUERY_LENGTH:
        raise ValidationError(f"q must not exceed {MAX_QUERY_LENGTH} characters.")
    return query


def validate_radius(raw) -> int:
    if raw in (None, ""):
        return DEFAULT_SEARCH_RADIUS_M
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValidationError("radius must be a whole number of metres.") from None
    if value < 1:
        raise ValidationError("radius must be positive.")
    if value > MAX_SEARCH_RADIUS_M:
        raise ValidationError(f"radius must not exceed {MAX_SEARCH_RADIUS_M} metres.")
    return value


def validate_search_limit(raw) -> int:
    if raw in (None, ""):
        return DEFAULT_SEARCH_RESULTS
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValidationError("limit must be a whole number.") from None
    if value < 1:
        raise ValidationError("limit must be at least 1.")
    if value > MAX_SEARCH_RESULTS:
        raise ValidationError(f"limit must not exceed {MAX_SEARCH_RESULTS}.")
    return value


def validate_coordinates(raw_lat, raw_lng):
    """Both or neither. Returns (lat, lng) or (None, None)."""
    if raw_lat in (None, "") and raw_lng in (None, ""):
        return None, None
    if raw_lat in (None, "") or raw_lng in (None, ""):
        raise ValidationError("lat and lng must be provided together.")
    try:
        lat = float(raw_lat)
        lng = float(raw_lng)
    except (TypeError, ValueError):
        raise ValidationError("lat and lng must be numbers.") from None
    if not -90 <= lat <= 90:
        raise ValidationError("lat must be between -90 and 90.")
    if not -180 <= lng <= 180:
        raise ValidationError("lng must be between -180 and 180.")
    return lat, lng


def validate_place_id(raw: str) -> str:
    if not isinstance(raw, str) or not PLACE_ID_PATTERN.match(raw):
        raise ValidationError("Invalid place id.")
    return raw

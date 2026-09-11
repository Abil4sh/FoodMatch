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

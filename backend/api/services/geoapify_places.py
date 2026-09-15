"""Geoapify Places provider.

The only module in FoodMatch that performs an outbound request to Geoapify.
Nothing else may build a Geoapify URL or read the API key.

Geoapify Places is a *category and geography* search, not a free-text one. It
takes `categories`, a spatial `filter`, an optional `bias` and a `limit`. There
is no `textQuery` equivalent, so the caller's search text is deliberately never
forwarded upstream — see `restaurant_provider.py`, which applies that text as a
local filter over the returned results instead.

Endpoint: https://api.geoapify.com/v2/places
Docs:     https://apidocs.geoapify.com/docs/places/

What Geoapify returns is OpenStreetMap-derived: name, address parts, latitude,
longitude and categories. It does **not** return ratings, review counts or
prices. Those fields are therefore left absent rather than filled with a zero
that the UI would render as a real "0.0 stars" or "₹0 for two".
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)

PLACES_URL = "https://api.geoapify.com/v2/places"
AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete"

# Allowlist. A caller cannot supply an arbitrary category, let alone a URL.
ALLOWED_CATEGORIES = frozenset({"catering.restaurant"})

# Bengaluru, used to bias location search so "Indiranagar" resolves locally
# rather than to a same-named place elsewhere.
CITY_BIAS_LAT = 12.9716
CITY_BIAS_LON = 77.5946
MAX_LOCATION_RESULTS = 8
DEFAULT_CATEGORY = "catering.restaurant"

# Hard caps, applied again here even though the view validates first: this
# module must be safe to call from anywhere.
MAX_RADIUS_M = 5000
MAX_RESULTS = 20
TIMEOUT_SECONDS = 6
MAX_ATTEMPTS = 2  # one initial call plus at most one retry

# Short-lived, in-process only. Never written to disk.
CACHE_TTL_SECONDS = int(os.getenv("GEOAPIFY_CACHE_TTL", "600"))

_cache: dict[str, tuple[float, object]] = {}


class ProviderError(RuntimeError):
    """Controlled application error. Never carries the key or a stack trace."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class NotConfigured(ProviderError):
    def __init__(self):
        super().__init__("not_configured", "The places provider is not configured.")


def is_configured() -> bool:
    """True only if a non-empty key is present. Never reveals the value."""
    return bool((os.getenv("GEOAPIFY_API_KEY") or "").strip())


def _api_key() -> str:
    key = (os.getenv("GEOAPIFY_API_KEY") or "").strip()
    if not key:
        # The only path to the network is gated on this.
        raise NotConfigured()
    return key


# --- cache ------------------------------------------------------------------


def _cache_get(key: str):
    hit = _cache.get(key)
    if not hit:
        return None
    stored_at, value = hit
    if time.time() - stored_at > CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return value


def _cache_put(key: str, value) -> None:
    _cache[key] = (time.time(), value)


def clear_cache() -> None:
    _cache.clear()


# --- geometry ---------------------------------------------------------------


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance. Pure, so distance can be derived locally.

    Geoapify does not return a distance from the search centre, so rather than
    leave the card blank we compute it from coordinates we already have.
    """
    radius_km = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * radius_km * math.asin(math.sqrt(a)), 2)


# --- transport --------------------------------------------------------------


def _get_json(url: str) -> dict:
    """One GET, with at most one retry for a transient failure.

    A 401, 403 or 429 is never retried: those mean stop, and retrying them
    turns an auth or rate-limit problem into a bigger one.
    """
    last_error = ProviderError("upstream_error", "The places provider is unavailable.")

    for attempt in range(MAX_ATTEMPTS):
        request = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))

        except urllib.error.HTTPError as exc:
            status = exc.code
            # Status only. The URL carries the key, so it is never logged.
            logger.warning("geoapify places: http %s", status)
            if status in (401, 403):
                raise ProviderError("not_authorized", "The places provider rejected the request.") from None
            if status == 429:
                raise ProviderError("rate_limited", "The places provider rate limit was reached.") from None
            if 400 <= status < 500:
                raise ProviderError("invalid_upstream_request", "The places provider rejected the request.") from None
            last_error = ProviderError("upstream_error", "The places provider is unavailable.")

        except urllib.error.URLError:
            logger.warning("geoapify places: unreachable")
            last_error = ProviderError("upstream_unreachable", "The places provider is unreachable.")
        except (TimeoutError, OSError):
            logger.warning("geoapify places: timeout")
            last_error = ProviderError("timeout", "The places provider timed out.")
        except json.JSONDecodeError:
            raise ProviderError("bad_payload", "The places provider returned an unreadable response.") from None

    raise last_error


# --- normalization ----------------------------------------------------------


def _cuisine_from_categories(categories) -> list[str]:
    """Derive a cuisine label from OSM category keys.

    "catering.restaurant.italian" -> "Italian". Only the third segment is used;
    nothing is invented when it is absent.
    """
    labels = []
    for category in categories or []:
        if not isinstance(category, str):
            continue
        parts = category.split(".")
        if len(parts) >= 3 and parts[0] == "catering" and parts[1] == "restaurant":
            labels.append(parts[2].replace("_", " ").title())
    return labels or ["Restaurant"]


def _area_for(props: dict) -> str:
    """The most specific locality Geoapify gave us, in preference order."""
    for key in ("suburb", "neighbourhood", "district", "city", "county", "state"):
        value = props.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def to_restaurant(feature: dict, *, origin: tuple[float, float] | None = None) -> dict | None:
    """Map one Geoapify feature onto the FoodMatch restaurant shape.

    Fields Geoapify does not supply (rating, reviews, priceForTwo, priceTier,
    etaMin) are set to None, not 0. The UI omits them; a zero would read as a
    real rating of zero stars.
    """
    props = (feature or {}).get("properties") or {}
    place_id = props.get("place_id")
    name = props.get("name")
    if not place_id or not name:
        # Unnamed OSM nodes are common and useless as a swipe card.
        return None

    lat, lon = props.get("lat"), props.get("lon")
    distance_km = None
    if origin and isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        distance_km = haversine_km(origin[0], origin[1], lat, lon)

    return {
        "id": "geo_" + str(place_id),
        "type": "restaurant",
        "name": name,
        "cuisines": _cuisine_from_categories(props.get("categories")),
        "area": _area_for(props),
        "address": props.get("formatted") or props.get("address_line2") or "",
        "lat": lat,
        "lon": lon,
        "distanceKm": distance_km,
        # Not available from Geoapify. Absent on purpose.
        "rating": None,
        "reviews": None,
        "priceForTwo": None,
        "priceTier": None,
        "etaMin": None,
        "photoLabel": "",
        "tags": [],
        "hours": "",
        "source": "geoapify",
    }


# --- public operation -------------------------------------------------------


def search_restaurants(*, latitude: float, longitude: float, radius_m: int, limit: int, category: str = DEFAULT_CATEGORY):
    """One Places call. Returns normalized FoodMatch restaurant records."""
    if category not in ALLOWED_CATEGORIES:
        raise ProviderError("category_not_allowed", "Unsupported category.")
    if not is_configured():
        raise NotConfigured()

    radius_m = max(1, min(int(radius_m), MAX_RADIUS_M))
    limit = max(1, min(int(limit), MAX_RESULTS))

    cache_key = f"places:{category}:{latitude:.4f}:{longitude:.4f}:{radius_m}:{limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    # Geoapify orders coordinates lon,lat in both filter and bias.
    params = {
        "categories": category,
        "filter": f"circle:{longitude},{latitude},{radius_m}",
        "bias": f"proximity:{longitude},{latitude}",
        "limit": str(limit),
        "apiKey": _api_key(),
    }
    url = PLACES_URL + "?" + urllib.parse.urlencode(params)

    body = _get_json(url)
    features = body.get("features") if isinstance(body, dict) else None
    results = [r for r in (to_restaurant(f, origin=(latitude, longitude)) for f in (features or [])) if r][:limit]

    _cache_put(cache_key, results)
    return results


# --- location search --------------------------------------------------------


def to_location(result: dict) -> dict | None:
    """Map one Geoapify geocoding result onto a FoodMatch location.

    The Address Autocomplete API returns flat objects when `format=json`, each
    with lat/lon and address components. We keep the smallest representation
    the app needs: a label, coordinates and a stable id.
    """
    if not isinstance(result, dict):
        return None
    lat, lon = result.get("lat"), result.get("lon")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return None

    # Prefer the most specific locality name Geoapify resolved.
    name = (
        result.get("suburb")
        or result.get("district")
        or result.get("neighbourhood")
        or result.get("city")
        or result.get("name")
        or result.get("address_line1")
    )
    if not name:
        return None

    context = [part for part in (result.get("city"), result.get("state")) if part and part != name]

    return {
        "id": str(result.get("place_id") or f"{lat:.5f},{lon:.5f}"),
        "name": name,
        "context": ", ".join(context),
        "latitude": round(float(lat), 6),
        "longitude": round(float(lon), 6),
        "source": "geoapify",
    }


def search_locations(*, text: str, limit: int = MAX_LOCATION_RESULTS) -> list[dict]:
    """One Address Autocomplete call, biased to Bengaluru and filtered to India."""
    if not is_configured():
        raise NotConfigured()

    limit = max(1, min(int(limit), MAX_LOCATION_RESULTS))
    cache_key = f"locations:{text.casefold()}:{limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    params = {
        "text": text,
        "format": "json",
        "limit": str(limit),
        "filter": "countrycode:in",
        "bias": f"proximity:{CITY_BIAS_LON},{CITY_BIAS_LAT}",
        "apiKey": _api_key(),
    }
    url = AUTOCOMPLETE_URL + "?" + urllib.parse.urlencode(params)

    body = _get_json(url)
    raw = body.get("results") if isinstance(body, dict) else None
    results = [loc for loc in (to_location(r) for r in (raw or [])) if loc]

    # Geoapify can return several nodes for one locality; keep the first of each.
    seen = set()
    unique = []
    for location in results:
        key = location["name"].casefold()
        if key in seen:
            continue
        seen.add(key)
        unique.append(location)

    _cache_put(cache_key, unique[:limit])
    return unique[:limit]

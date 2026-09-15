"""Read-only catalog endpoints.

Every view is a fixed operation over local data. None of them accepts a URL, a
hostname, or an upstream service name, so this API cannot be turned into a
generic proxy.

Throttling is applied per view via ScopedRateThrottle. Google is not connected
yet, so this is not a billing control today. It is here now so that the control
point already exists when something costly sits behind these handlers.
"""

from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import exception_handler

from .serializers import (
    serialize_craving,
    serialize_dish,
    serialize_friend,
    serialize_restaurant,
    serialize_user,
)
from .services import catalog
from .services import restaurant_provider
from .services.geoapify_places import ProviderError
logger = logging.getLogger(__name__)

from .validation import (
    ValidationError,
    validate_coordinates,
    validate_id,
    validate_limit,
    validate_radius,
    validate_search_limit,
    validate_search_query,
    validate_location_limit,
    validate_location_text,
)


def safe_exception_handler(exc, context):
    """Return clean JSON errors, never a traceback or a filesystem path."""
    if isinstance(exc, ValidationError):
        return Response({"error": "invalid_request", "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if isinstance(exc, ProviderError):
        # Controlled, code-only. The upstream body and the URL (which carries
        # the key as a query parameter) are never forwarded to a client.
        status_map = {
            "not_configured": status.HTTP_503_SERVICE_UNAVAILABLE,
            "rate_limited": status.HTTP_429_TOO_MANY_REQUESTS,
            "category_not_allowed": status.HTTP_400_BAD_REQUEST,
        }
        return Response(
            {"error": exc.code, "detail": "Restaurant search is unavailable right now."},
            status=status_map.get(exc.code, status.HTTP_502_BAD_GATEWAY),
        )

    if isinstance(exc, catalog.CatalogError):
        # The underlying exception mentions a path on disk; it is not forwarded.
        return Response(
            {"error": "catalog_unavailable", "detail": "Catalog data is temporarily unavailable."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    response = exception_handler(exc, context)
    if response is not None:
        return response

    # Anything unhandled becomes a generic 500 with no internal detail.
    return Response(
        {"error": "server_error", "detail": "Something went wrong."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


# NOTE: these subclass AnonRateThrottle, not ScopedRateThrottle. A
# ScopedRateThrottle resolves its scope from a `throttle_scope` attribute on
# the *view* and returns True (allow) when the view has none — so a class-level
# `scope` here would have been silently inert and nothing would have been
# throttled at all. Caught by a test that asserted a 429 and never got one.
class CatalogThrottle(AnonRateThrottle):
    scope = "catalog"


class DetailThrottle(AnonRateThrottle):
    scope = "detail"


class SearchThrottle(AnonRateThrottle):
    """Applied to the only endpoint that can reach a paid upstream API."""

    scope = "search"


def _limited(records, request, serializer):
    limit = validate_limit(request.query_params.get("limit"))
    return [serializer(record) for record in records[:limit]]


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def health(request):
    """Liveness probe. Reports no configuration values."""
    # Reports only whether a provider key is present, never any part of it.
    return Response(
        {
            "status": "ok",
            "service": "foodmatch-api",
            "provider": restaurant_provider.PROVIDER_NAME,
            "providerConfigured": restaurant_provider.provider_configured(),
        }
    )


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def feed(request):
    """Everything the app needs on boot, in a single request.

    Restaurants come from the places provider when one is configured, and from
    the bundled catalog otherwise. Dishes, cravings and the demo match stay
    local: Geoapify returns no menu data, and inventing dishes would be
    fabrication.

    This is the frontend's only catalog request. Keeping it to one call on boot
    is what stops the swipe deck, the detail screen and the profile from each
    fetching on their own.
    """
    data = catalog.get_feed()

    # Optional coordinates let the feed follow the user's selected area rather
    # than being pinned to one neighbourhood.
    latitude, longitude = validate_coordinates(
        request.query_params.get("lat"), request.query_params.get("lng")
    )
    radius_m = validate_radius(request.query_params.get("radius")) if request.query_params.get("radius") else restaurant_provider.DEFAULT_RADIUS_M

    outcome = restaurant_provider.search_restaurants(
        query="",
        latitude=latitude,
        longitude=longitude,
        radius_m=radius_m,
        limit=restaurant_provider.DEFAULT_FEED_LIMIT,
    )

    return Response(
        {
            "restaurants": [serialize_restaurant(r) for r in outcome["results"]],
            "restaurantSource": outcome["source"],
            "dishes": [serialize_dish(d) for d in data["dishes"]],
            "cravings": [serialize_craving(c) for c in data["cravings"]],
            "activeMatch": data["activeMatch"],
        }
    )


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def me(request):
    return Response(serialize_user(catalog.get_user()))


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def friends(request):
    return Response([serialize_friend(f) for f in catalog.get_friends()])


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def cravings(request):
    return Response([serialize_craving(c) for c in catalog.get_cravings()])


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def restaurant_list(request):
    return Response(_limited(catalog.get_restaurants(), request, serialize_restaurant))


@api_view(["GET"])
@throttle_classes([DetailThrottle])
def restaurant_detail(request, restaurant_id):
    """Single restaurant, plus the dishes it serves.

    This is the shape a Place Details call would eventually fill. It is a
    detail endpoint on purpose: it is reached only when a user opens one
    restaurant, never once per row of a list.
    """
    record = catalog.get_restaurant(validate_id(restaurant_id))
    if record is None:
        return Response({"error": "not_found", "detail": "Restaurant not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(
        {
            **serialize_restaurant(record),
            # 3-4 representative dishes, not a full menu.
            "dishes": [serialize_dish(d) for d in catalog.dishes_for_restaurant(record["id"])],
        }
    )


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def dish_list(request):
    return Response(_limited(catalog.get_dishes(), request, serialize_dish))


@api_view(["GET"])
@throttle_classes([DetailThrottle])
def dish_detail(request, dish_id):
    record = catalog.get_dish(validate_id(dish_id))
    if record is None:
        return Response({"error": "not_found", "detail": "Dish not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(serialize_dish(record))


@api_view(["GET"])
@throttle_classes([SearchThrottle])
def restaurant_search(request):
    """Search restaurants.

    Uses the configured places provider when a key is present, and the bundled
    catalog when it is not. Every parameter is validated and capped before the
    provider is called, so a rejected request costs nothing upstream.

    `source` in the response says which path served it.
    """
    query = validate_search_query(request.query_params.get("q"))
    limit = validate_search_limit(request.query_params.get("limit"))
    radius_m = validate_radius(request.query_params.get("radius"))
    latitude, longitude = validate_coordinates(
        request.query_params.get("lat"), request.query_params.get("lng")
    )

    outcome = restaurant_provider.search_restaurants(
        query=query, latitude=latitude, longitude=longitude, radius_m=radius_m, limit=limit
    )

    payload = {
        "source": outcome["source"],
        "results": [serialize_restaurant(r) for r in outcome["results"]],
    }
    if outcome.get("reason"):
        payload["reason"] = outcome["reason"]
    return Response(payload)


@api_view(["GET"])
@throttle_classes([SearchThrottle])
def location_search(request):
    """Resolve a typed area name into coordinates.

    Shares the search throttle with restaurant search, because both reach the
    same upstream provider and should be rationed together. Returns the curated
    Bengaluru list when no provider is configured.
    """
    text = validate_location_text(request.query_params.get("q"))
    limit = validate_location_limit(request.query_params.get("limit"))

    outcome = restaurant_provider.search_locations(text=text, limit=limit)
    payload = {"source": outcome["source"], "results": outcome["results"]}
    if outcome.get("reason"):
        payload["reason"] = outcome["reason"]
    return Response(payload)


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def popular_areas(request):
    """The curated shortcut list. Entirely local; makes no outbound request."""
    return Response({"results": restaurant_provider.popular_areas()})

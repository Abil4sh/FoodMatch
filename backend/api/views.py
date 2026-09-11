"""Read-only catalog endpoints.

Every view is a fixed operation over local data. None of them accepts a URL, a
hostname, or an upstream service name, so this API cannot be turned into a
generic proxy.

Throttling is applied per view via ScopedRateThrottle. Google is not connected
yet, so this is not a billing control today. It is here now so that the control
point already exists when something costly sits behind these handlers.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import exception_handler

from .serializers import (
    serialize_craving,
    serialize_dish,
    serialize_friend,
    serialize_restaurant,
    serialize_user,
)
from .services import catalog
from .validation import ValidationError, validate_id, validate_limit


def safe_exception_handler(exc, context):
    """Return clean JSON errors, never a traceback or a filesystem path."""
    if isinstance(exc, ValidationError):
        return Response({"error": "invalid_request", "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

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


class CatalogThrottle(ScopedRateThrottle):
    scope = "catalog"


class DetailThrottle(ScopedRateThrottle):
    scope = "detail"


def _limited(records, request, serializer):
    limit = validate_limit(request.query_params.get("limit"))
    return [serializer(record) for record in records[:limit]]


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def health(request):
    """Liveness probe. Reports no configuration values."""
    return Response({"status": "ok", "service": "foodmatch-api", "googleEnabled": False})


@api_view(["GET"])
@throttle_classes([CatalogThrottle])
def feed(request):
    """Everything the app needs on boot, in a single request."""
    data = catalog.get_feed()
    return Response(
        {
            "restaurants": [serialize_restaurant(r) for r in data["restaurants"]],
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

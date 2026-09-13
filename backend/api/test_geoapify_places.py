"""Geoapify provider tests.

Every test runs with a counting stub in place of `urllib.request.urlopen`, so
each one can assert exactly how many outbound calls happened — usually zero.
The real Geoapify API is never contacted and no real credential is used.
"""

from __future__ import annotations

import io
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from django.test import SimpleTestCase, override_settings

from api.services import geoapify_places, restaurant_provider

TEST_HOSTS = ["testserver", "localhost", "127.0.0.1"]
FAKE_KEY = "test-key-not-a-real-credential"

# Shaped like a real Geoapify Places response: a GeoJSON FeatureCollection
# whose properties carry place_id, name, address parts, lat/lon and categories.
SAMPLE_FEATURE = {
    "type": "Feature",
    "properties": {
        "place_id": "51abc123def456",
        "name": "Ramen House",
        "country": "India",
        "city": "Bengaluru",
        "suburb": "Koramangala",
        "street": "12th Main",
        "postcode": "560095",
        "lat": 12.9345,
        "lon": 77.6265,
        "formatted": "Ramen House, 12th Main, Koramangala, Bengaluru 560095, India",
        "address_line2": "12th Main, Koramangala, Bengaluru 560095, India",
        "categories": ["catering", "catering.restaurant", "catering.restaurant.japanese"],
    },
    "geometry": {"type": "Point", "coordinates": [77.6265, 12.9345]},
}


class _CM(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class GeoapifyStubbed(SimpleTestCase):
    """Base class: counts outbound calls and never lets one escape."""

    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.addCleanup(cache.clear)

        self.calls = []
        self.responses = [{"type": "FeatureCollection", "features": [SAMPLE_FEATURE]}]
        self._real_urlopen = urllib.request.urlopen
        geoapify_places.clear_cache()
        self.addCleanup(geoapify_places.clear_cache)

        def stub(request, timeout=None):  # noqa: ANN001
            self.calls.append({"url": request.full_url, "timeout": timeout, "method": request.get_method()})
            payload = self.responses.pop(0) if self.responses else {"features": []}
            if isinstance(payload, Exception):
                raise payload
            return _CM(json.dumps(payload).encode())

        urllib.request.urlopen = stub

    def tearDown(self):
        urllib.request.urlopen = self._real_urlopen

    def use_key(self):
        os.environ["GEOAPIFY_API_KEY"] = FAKE_KEY
        self.addCleanup(os.environ.pop, "GEOAPIFY_API_KEY", None)

    @property
    def call_count(self):
        return len(self.calls)


# --- 1. missing key ---------------------------------------------------------


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class MissingKeyTests(GeoapifyStubbed):
    def test_not_configured_without_key(self):
        self.assertFalse(geoapify_places.is_configured())

    def test_search_endpoint_makes_zero_calls_without_key(self):
        response = self.client.get("/api/restaurants/search/?q=ramen")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "local")
        self.assertEqual(self.call_count, 0, "an outbound call was made without a key")

    def test_local_fallback_still_returns_results(self):
        body = self.client.get("/api/restaurants/search/?q=ramen").json()
        self.assertGreater(len(body["results"]), 0)
        self.assertEqual(self.call_count, 0)

    def test_service_raises_rather_than_calling(self):
        with self.assertRaises(geoapify_places.NotConfigured):
            geoapify_places.search_restaurants(latitude=12.9, longitude=77.6, radius_m=1000, limit=5)
        self.assertEqual(self.call_count, 0)

    def test_no_fake_key_is_substituted(self):
        with self.assertRaises(geoapify_places.NotConfigured):
            geoapify_places._api_key()
        self.assertEqual(self.call_count, 0)

    def test_health_reports_provider_unconfigured(self):
        body = self.client.get("/api/health/").json()
        self.assertEqual(body["provider"], "geoapify")
        self.assertFalse(body["providerConfigured"])


# --- 2. successful request shape and normalization --------------------------


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class SuccessfulSearchTests(GeoapifyStubbed):
    def setUp(self):
        super().setUp()
        self.use_key()

    def test_search_makes_exactly_one_call(self):
        response = self.client.get("/api/restaurants/search/?q=ramen&lat=12.91&lng=77.64")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "geoapify")
        self.assertEqual(self.call_count, 1)

    def test_uses_the_documented_endpoint(self):
        self.client.get("/api/restaurants/search/?q=ramen&lat=12.91&lng=77.64")
        self.assertTrue(self.calls[0]["url"].startswith("https://api.geoapify.com/v2/places?"), self.calls[0]["url"])

    def test_sends_allowlisted_category_filter_bias_and_limit(self):
        self.client.get("/api/restaurants/search/?q=ramen&lat=12.91&lng=77.64&radius=1500&limit=10")
        url = self.calls[0]["url"]
        self.assertIn("categories=catering.restaurant", urllib.parse.unquote(url))
        # Geoapify orders coordinates lon,lat.
        self.assertIn("filter=circle:77.64,12.91,1500", urllib.parse.unquote(url))
        self.assertIn("bias=proximity:77.64,12.91", urllib.parse.unquote(url))
        self.assertIn("limit=10", url)

    def test_search_text_is_never_sent_upstream(self):
        """Geoapify Places has no free-text parameter; the query stays local."""
        self.client.get("/api/restaurants/search/?q=biryani&lat=12.91&lng=77.64")
        self.assertNotIn("biryani", urllib.parse.unquote(self.calls[0]["url"]).casefold())

    def test_request_has_a_bounded_timeout(self):
        self.client.get("/api/restaurants/search/?q=ramen")
        self.assertEqual(self.calls[0]["timeout"], geoapify_places.TIMEOUT_SECONDS)

    def test_normalizes_into_the_foodmatch_shape(self):
        record = self.client.get("/api/restaurants/search/?q=ramen&lat=12.91&lng=77.64").json()["results"][0]
        self.assertEqual(record["name"], "Ramen House")
        self.assertEqual(record["type"], "restaurant")
        self.assertEqual(record["cuisines"], ["Japanese"])
        self.assertEqual(record["area"], "Koramangala")
        self.assertTrue(record["id"].startswith("geo_"))
        self.assertIn("Koramangala", record["address"])

    def test_unknown_fields_are_null_not_zero(self):
        """A 0 rating would render as a real zero-star review."""
        record = self.client.get("/api/restaurants/search/?q=ramen&lat=12.91&lng=77.64").json()["results"][0]
        for field in ("rating", "reviews", "priceForTwo", "priceTier", "etaMin"):
            self.assertIsNone(record[field], f"{field} should be null, not a fabricated value")

    def test_distance_is_computed_locally_from_the_search_centre(self):
        record = self.client.get("/api/restaurants/search/?q=ramen&lat=12.91&lng=77.64").json()["results"][0]
        self.assertIsNotNone(record["distanceKm"])
        self.assertGreater(record["distanceKm"], 0)
        self.assertLess(record["distanceKm"], 20)

    def test_haversine_is_pure_and_correct(self):
        self.assertEqual(geoapify_places.haversine_km(12.91, 77.64, 12.91, 77.64), 0.0)
        # ~1 degree of latitude is ~111 km.
        self.assertAlmostEqual(geoapify_places.haversine_km(12.0, 77.0, 13.0, 77.0), 111.2, delta=1.0)

    def test_unnamed_features_are_dropped(self):
        self.assertIsNone(geoapify_places.to_restaurant({"properties": {"place_id": "x"}}))
        self.assertIsNone(geoapify_places.to_restaurant({"properties": {"name": "No id"}}))
        self.assertIsNone(geoapify_places.to_restaurant({}))

    def test_cuisine_falls_back_without_inventing(self):
        record = geoapify_places.to_restaurant(
            {"properties": {"place_id": "p", "name": "Somewhere", "categories": ["catering", "catering.restaurant"]}}
        )
        self.assertEqual(record["cuisines"], ["Restaurant"])

    def test_repeat_search_is_served_from_cache(self):
        for _ in range(3):
            self.client.get("/api/restaurants/search/?q=ramen&lat=12.91&lng=77.64")
        self.assertEqual(self.call_count, 1, "repeat searches should not re-call the provider")


# --- 3-6. rejected input -> zero outbound calls ------------------------------


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class RejectedInputTests(GeoapifyStubbed):
    def setUp(self):
        super().setUp()
        self.use_key()

    def test_invalid_latitude_rejected_before_any_call(self):
        for lat in ("91", "-91", "999", "abc"):
            response = self.client.get(f"/api/restaurants/search/?q=ramen&lat={lat}&lng=77.6")
            self.assertEqual(response.status_code, 400, f"lat={lat}")
        self.assertEqual(self.call_count, 0)

    def test_invalid_longitude_rejected_before_any_call(self):
        for lng in ("181", "-181", "abc"):
            response = self.client.get(f"/api/restaurants/search/?q=ramen&lat=12.9&lng={lng}")
            self.assertEqual(response.status_code, 400, f"lng={lng}")
        self.assertEqual(self.call_count, 0)

    def test_half_supplied_coordinates_rejected(self):
        self.assertEqual(self.client.get("/api/restaurants/search/?q=ramen&lat=12.9").status_code, 400)
        self.assertEqual(self.call_count, 0)

    def test_radius_above_cap_rejected_before_any_call(self):
        response = self.client.get("/api/restaurants/search/?q=ramen&radius=500000")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.call_count, 0)

    def test_limit_above_cap_rejected_before_any_call(self):
        response = self.client.get("/api/restaurants/search/?q=ramen&limit=500")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.call_count, 0)

    def test_missing_or_short_query_rejected_before_any_call(self):
        self.assertEqual(self.client.get("/api/restaurants/search/").status_code, 400)
        self.assertEqual(self.client.get("/api/restaurants/search/?q=a").status_code, 400)
        self.assertEqual(self.call_count, 0)

    def test_category_outside_the_allowlist_is_refused(self):
        with self.assertRaises(geoapify_places.ProviderError) as ctx:
            geoapify_places.search_restaurants(
                latitude=12.9, longitude=77.6, radius_m=1000, limit=5, category="commercial.supermarket"
            )
        self.assertEqual(ctx.exception.code, "category_not_allowed")
        self.assertEqual(self.call_count, 0)

    def test_service_caps_radius_and_limit_even_when_called_directly(self):
        geoapify_places.search_restaurants(latitude=12.9, longitude=77.6, radius_m=10_000_000, limit=9999)
        url = urllib.parse.unquote(self.calls[0]["url"])
        self.assertIn(f",{geoapify_places.MAX_RADIUS_M}", url)
        self.assertIn(f"limit={geoapify_places.MAX_RESULTS}", url)


# --- 7-10. upstream failures ------------------------------------------------


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class FailureTests(GeoapifyStubbed):
    def setUp(self):
        super().setUp()
        self.use_key()

    def _http_error(self, status_code):
        return urllib.error.HTTPError("u", status_code, "err", {}, None)

    def test_401_is_not_retried_and_falls_back(self):
        self.responses = [self._http_error(401)]
        response = self.client.get("/api/restaurants/search/?q=ramen")
        self.assertEqual(self.call_count, 1, "401 must not be retried")
        self.assertEqual(response.json()["source"], "local")

    def test_403_is_not_retried_and_falls_back(self):
        self.responses = [self._http_error(403)]
        response = self.client.get("/api/restaurants/search/?q=ramen")
        self.assertEqual(self.call_count, 1, "403 must not be retried")
        self.assertEqual(response.json()["source"], "local")

    def test_429_is_not_retried_and_falls_back(self):
        self.responses = [self._http_error(429)]
        response = self.client.get("/api/restaurants/search/?q=ramen")
        self.assertEqual(self.call_count, 1, "429 must not be retried")
        self.assertEqual(response.json()["source"], "local")
        self.assertEqual(response.status_code, 200)

    def test_5xx_retries_at_most_once(self):
        self.responses = [self._http_error(503), self._http_error(503)]
        response = self.client.get("/api/restaurants/search/?q=ramen")
        self.assertEqual(self.call_count, 2, "expected exactly one retry")
        self.assertEqual(response.json()["source"], "local")

    def test_5xx_then_success_recovers_without_a_third_call(self):
        self.responses = [self._http_error(503), {"features": [SAMPLE_FEATURE]}]
        response = self.client.get("/api/restaurants/search/?q=ramen&lat=12.91&lng=77.64")
        self.assertEqual(self.call_count, 2)
        self.assertEqual(response.json()["source"], "geoapify")

    def test_network_failure_falls_back_without_looping(self):
        self.responses = [urllib.error.URLError("down"), urllib.error.URLError("down")]
        response = self.client.get("/api/restaurants/search/?q=ramen")
        self.assertLessEqual(self.call_count, 2)
        self.assertEqual(response.json()["source"], "local")

    def test_malformed_payload_is_not_retried(self):
        self.responses = [json.JSONDecodeError("bad", "", 0)]
        response = self.client.get("/api/restaurants/search/?q=ramen")
        self.assertEqual(self.call_count, 1)
        self.assertEqual(response.json()["source"], "local")

    def test_empty_upstream_result_falls_back_to_local(self):
        self.responses = [{"type": "FeatureCollection", "features": []}]
        body = self.client.get("/api/restaurants/search/?q=ramen").json()
        self.assertEqual(body["source"], "local")
        self.assertGreater(len(body["results"]), 0)

    def test_fallback_reason_is_reported_for_debugging(self):
        self.responses = [self._http_error(429)]
        self.assertEqual(self.client.get("/api/restaurants/search/?q=ramen").json()["reason"], "rate_limited")


# --- 11. the key must not escape --------------------------------------------


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class KeyExposureTests(GeoapifyStubbed):
    def setUp(self):
        super().setUp()
        self.use_key()

    def test_key_never_appears_in_any_json_response(self):
        for url in ("/api/health/", "/api/restaurants/search/?q=ramen&lat=12.9&lng=77.6", "/api/feed/", "/api/restaurants/"):
            body = self.client.get(url).content.decode()
            self.assertNotIn(FAKE_KEY, body, f"key leaked in {url}")
            self.assertNotIn("GEOAPIFY_API_KEY", body)

    def test_key_never_appears_in_an_error_response(self):
        self.responses = [urllib.error.HTTPError("u", 500, "boom", {}, None)] * 2
        body = self.client.get("/api/restaurants/search/?q=ramen").content.decode()
        self.assertNotIn(FAKE_KEY, body)

    def test_key_never_appears_in_logs(self):
        """The key rides in the query string, so the URL must never be logged."""
        with self.assertLogs("api", level="DEBUG") as captured:
            logging.getLogger("api").warning("priming the log capture")
            self.responses = [urllib.error.HTTPError("u", 500, "boom", {}, None)] * 2
            self.client.get("/api/restaurants/search/?q=ramen")
        joined = "\n".join(captured.output)
        self.assertNotIn(FAKE_KEY, joined, "key leaked into logs")
        self.assertNotIn("api.geoapify.com", joined, "full URL logged; it contains the key")

    def test_exception_text_carries_no_key(self):
        exc = geoapify_places.ProviderError("upstream_error", "The places provider is unavailable.")
        self.assertNotIn(FAKE_KEY, str(exc))

    def test_only_geoapify_hosts_are_contacted(self):
        self.client.get("/api/restaurants/search/?q=ramen&lat=12.9&lng=77.6")
        for call in self.calls:
            self.assertTrue(call["url"].startswith("https://api.geoapify.com/"), call["url"])


# --- 13. dishes stay local ---------------------------------------------------


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class DishesRemainLocalTests(GeoapifyStubbed):
    def setUp(self):
        super().setUp()
        self.use_key()

    def test_dish_list_makes_zero_outbound_calls(self):
        response = self.client.get("/api/dishes/")
        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.json()), 0)
        self.assertEqual(self.call_count, 0, "dishes must come from local data")

    def test_dish_detail_makes_zero_outbound_calls(self):
        dish_id = self.client.get("/api/dishes/").json()[0]["id"]
        response = self.client.get(f"/api/dishes/{dish_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.call_count, 0)

    def test_feed_makes_exactly_one_outbound_call(self):
        """The boot feed is the frontend's only catalog request, and the single
        place restaurants are sourced. One call, not one per card."""
        body = self.client.get("/api/feed/").json()
        self.assertEqual(self.call_count, 1)
        self.assertEqual(body["restaurantSource"], "geoapify")

    def test_feed_dishes_stay_local_even_when_the_provider_is_live(self):
        body = self.client.get("/api/feed/").json()
        self.assertGreater(len(body["dishes"]), 0)
        for dish in body["dishes"]:
            self.assertNotEqual(dish.get("source"), "geoapify")
            self.assertIsNotNone(dish.get("price"), "dish prices must stay curated, never fabricated")

    def test_feed_falls_back_to_local_restaurants_on_provider_failure(self):
        self.responses = [urllib.error.HTTPError("u", 429, "rate", {}, None)]
        body = self.client.get("/api/feed/").json()
        self.assertEqual(body["restaurantSource"], "local")
        self.assertGreater(len(body["restaurants"]), 0)

    def test_dishes_keep_their_curated_values(self):
        dish = self.client.get("/api/dishes/").json()[0]
        self.assertIsNotNone(dish.get("price"))
        self.assertIsNotNone(dish.get("rating"))


# --- provider boundary ------------------------------------------------------


class ProviderBoundaryTests(SimpleTestCase):
    def test_local_search_matches_name_area_or_cuisine(self):
        self.assertTrue(any(r["name"] == "Ramen House" for r in restaurant_provider.local_restaurants("ramen", 20)))
        self.assertGreater(len(restaurant_provider.local_restaurants("koramangala", 20)), 0)

    def test_local_search_never_returns_empty(self):
        self.assertGreater(len(restaurant_provider.local_restaurants("zzzzz-nothing", 20)), 0)

    def test_local_search_respects_the_limit(self):
        self.assertLessEqual(len(restaurant_provider.local_restaurants("", 3)), 3)

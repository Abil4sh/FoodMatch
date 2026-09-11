"""API tests.

Two of these are worth calling out. `test_no_outbound_network_is_possible`
monkeypatches the socket layer so that any attempt to open a connection during
a request fails the test — that is what proves the backend is not quietly
talking to anything. And the secret-leak tests scan real response payloads
rather than trusting that nothing was added to a serializer.

Nothing here touches the internet.
"""

from __future__ import annotations

import json
import socket

from django.test import SimpleTestCase, override_settings

from api.services import catalog
from api.validation import ValidationError, validate_id, validate_limit

# The Django test client uses the host "testserver".
TEST_HOSTS = ["testserver", "localhost", "127.0.0.1"]


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class CatalogEndpointTests(SimpleTestCase):
    """Endpoints return the data the React app needs."""

    def test_health_reports_google_disabled(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()["googleEnabled"], False)

    def test_restaurant_list_succeeds(self):
        response = self.client.get("/api/restaurants/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreater(len(body), 0)
        self.assertIn("id", body[0])
        self.assertIn("name", body[0])

    def test_restaurant_by_valid_id_succeeds(self):
        listing = self.client.get("/api/restaurants/").json()
        target = listing[0]["id"]
        response = self.client.get(f"/api/restaurants/{target}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], target)

    def test_restaurant_detail_includes_its_dishes(self):
        response = self.client.get("/api/restaurants/r_ramen_house/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("dishes", response.json())

    def test_dish_endpoints_work(self):
        listing = self.client.get("/api/dishes/")
        self.assertEqual(listing.status_code, 200)
        self.assertGreater(len(listing.json()), 0)

        dish_id = listing.json()[0]["id"]
        detail = self.client.get(f"/api/dishes/{dish_id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["id"], dish_id)

    def test_feed_returns_the_whole_catalog_in_one_call(self):
        body = self.client.get("/api/feed/").json()
        for key in ("restaurants", "dishes", "cravings", "activeMatch"):
            self.assertIn(key, body)

    def test_me_and_friends_succeed(self):
        self.assertEqual(self.client.get("/api/me/").status_code, 200)
        self.assertEqual(self.client.get("/api/friends/").status_code, 200)


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class ErrorHandlingTests(SimpleTestCase):
    """Bad input produces clean JSON, never a traceback."""

    def test_unknown_restaurant_id_returns_clean_404(self):
        response = self.client.get("/api/restaurants/r_does_not_exist/")
        self.assertEqual(response.status_code, 404)
        body = response.json()
        self.assertEqual(body["error"], "not_found")
        self.assertNotIn("Traceback", json.dumps(body))

    def test_unknown_dish_id_returns_clean_404(self):
        response = self.client.get("/api/dishes/d_does_not_exist/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "not_found")

    def test_malformed_id_is_rejected(self):
        response = self.client.get("/api/restaurants/NOT-A-VALID-ID/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_request")

    def test_excessive_limit_is_rejected(self):
        response = self.client.get("/api/restaurants/?limit=100000")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_request")

    def test_negative_limit_is_rejected(self):
        self.assertEqual(self.client.get("/api/restaurants/?limit=-5").status_code, 400)

    def test_non_numeric_limit_is_rejected(self):
        self.assertEqual(self.client.get("/api/restaurants/?limit=abc").status_code, 400)

    def test_errors_never_expose_filesystem_paths(self):
        for url in ("/api/restaurants/BAD!/", "/api/restaurants/r_missing/", "/api/restaurants/?limit=99999"):
            body = self.client.get(url).content.decode()
            self.assertNotIn("/home/", body)
            self.assertNotIn("Traceback", body)
            self.assertNotIn(".json", body)

    def test_write_methods_are_not_allowed(self):
        self.assertEqual(self.client.post("/api/restaurants/").status_code, 405)
        self.assertEqual(self.client.delete("/api/restaurants/r_ramen_house/").status_code, 405)


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class SecretExposureTests(SimpleTestCase):
    """No response may contain a credential or configuration value."""

    FORBIDDEN = ("SECRET_KEY", "AIza", "GOOGLE_PLACES_API_KEY", "api_key", "password", "Bearer ")

    def test_responses_contain_no_secrets(self):
        for url in ("/api/health/", "/api/feed/", "/api/me/", "/api/friends/", "/api/restaurants/", "/api/dishes/"):
            body = self.client.get(url).content.decode()
            for needle in self.FORBIDDEN:
                self.assertNotIn(needle, body, f"{needle!r} leaked in {url}")

    def test_django_secret_key_never_appears_in_a_response(self):
        from django.conf import settings

        body = self.client.get("/api/feed/").content.decode()
        self.assertNotIn(settings.SECRET_KEY, body)


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class NoGoogleTests(SimpleTestCase):
    """This stage must have zero Google integration."""

    def test_no_google_settings_exist(self):
        from django.conf import settings

        for name in dir(settings):
            self.assertNotIn("GOOGLE", name.upper(), f"unexpected Google setting: {name}")

    def test_backend_modules_import_nothing_network_capable(self):
        """Parse the imports rather than grepping text, so prose in a comment
        cannot fail (or silently pass) this check."""
        import ast
        import pathlib

        banned = {"requests", "httpx", "urllib", "urllib3", "http", "socket", "aiohttp", "googlemaps", "google"}
        api_dir = pathlib.Path(catalog.__file__).resolve().parent.parent

        offenders = []
        for path in api_dir.rglob("*.py"):
            if path.name == "tests.py":
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    names = [node.module or ""]
                else:
                    continue
                for name in names:
                    if name.split(".")[0] in banned:
                        offenders.append(f"{path.name}: {name}")

        self.assertEqual(offenders, [], f"network-capable imports found: {offenders}")

    def test_no_outbound_network_is_possible(self):
        """Any socket connection during a request fails this test."""
        original = socket.socket.connect
        attempts = []

        def blocked(self, address):  # noqa: ANN001
            attempts.append(address)
            raise AssertionError(f"outbound network attempt to {address}")

        socket.socket.connect = blocked
        try:
            for url in ("/api/feed/", "/api/restaurants/", "/api/restaurants/r_ramen_house/", "/api/me/"):
                self.assertEqual(self.client.get(url).status_code, 200)
        finally:
            socket.socket.connect = original

        self.assertEqual(attempts, [], "backend attempted an outbound connection")


class ValidationUnitTests(SimpleTestCase):
    """The validators, exercised directly."""

    def test_valid_ids_pass(self):
        for value in ("r_ramen_house", "d_shawarma", "ab"):
            self.assertEqual(validate_id(value), value)

    def test_invalid_ids_rejected(self):
        for value in ("", "A", "r ramen", "../etc/passwd", "r-ramen", "x" * 65, "http://evil.test"):
            with self.assertRaises(ValidationError):
                validate_id(value)

    def test_limit_bounds(self):
        self.assertEqual(validate_limit(None), 50)
        self.assertEqual(validate_limit("10"), 10)
        for bad in ("0", "-1", "51", "abc", "1e9"):
            with self.assertRaises(ValidationError):
                validate_limit(bad)


class CatalogServiceTests(SimpleTestCase):
    """The service layer, independent of HTTP."""

    def test_lookup_by_id(self):
        self.assertIsNotNone(catalog.get_restaurant("r_ramen_house"))
        self.assertIsNone(catalog.get_restaurant("r_nope"))

    def test_find_card_covers_both_types(self):
        self.assertEqual(catalog.find_card("r_ramen_house")["type"], "restaurant")
        self.assertEqual(catalog.find_card("d_shawarma")["type"], "dish")

    def test_dishes_for_restaurant_are_filtered(self):
        dishes = catalog.dishes_for_restaurant("r_ramen_house")
        self.assertTrue(all(d["restaurantId"] == "r_ramen_house" for d in dishes))

    def test_unknown_dataset_is_refused(self):
        with self.assertRaises(catalog.CatalogError):
            catalog._load("../../etc/passwd")

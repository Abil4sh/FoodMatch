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

    def test_health_reports_the_provider_without_revealing_the_key(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["provider"], "geoapify")
        # A boolean only: presence of a key, never any part of its value.
        self.assertIsInstance(body["providerConfigured"], bool)

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

    FORBIDDEN = ("SECRET_KEY", "GEOAPIFY_API_KEY", "GOOGLE_PLACES_API_KEY", "AIza", "api_key", "password", "Bearer ")

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
class ProviderBoundaryTests(SimpleTestCase):
    """The outbound network boundary must stay exactly one file."""

    def test_only_the_places_provider_may_import_urllib(self):
        """The network boundary must stay a single file."""
        import ast
        import pathlib

        api_dir = pathlib.Path(catalog.__file__).resolve().parent.parent
        importers = []
        for path in api_dir.rglob("*.py"):
            if path.name.startswith("test"):
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                names = []
                if isinstance(node, ast.Import):
                    names = [a.name for a in node.names]
                elif isinstance(node, ast.ImportFrom):
                    names = [node.module or ""]
                if any(n.split(".")[0] == "urllib" for n in names):
                    importers.append(path.name)

        self.assertEqual(sorted(set(importers)), ["geoapify_places.py"], f"unexpected: {set(importers)}")

    def test_no_provider_key_is_stored_in_django_settings(self):
        """The key is read from the environment at call time and must never be
        copied into settings, where it could reach a debug page."""
        from django.conf import settings

        for name in dir(settings):
            if name.isupper() and ("GEOAPIFY" in name or "GOOGLE" in name):
                self.fail(f"provider value stored in settings: {name}")

    def test_no_google_integration_remains(self):
        """Google was removed entirely; this stops it creeping back."""
        import pathlib

        api_dir = pathlib.Path(catalog.__file__).resolve().parent.parent
        offenders = []
        for path in api_dir.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            for needle in ("googleapis.com", "GOOGLE_PLACES_API_KEY", "google_places"):
                if needle in text and path.name != "tests.py":
                    offenders.append(f"{path.name}: {needle}")
        self.assertEqual(offenders, [], f"Google integration found: {offenders}")

    def test_backend_modules_import_nothing_network_capable(self):
        """Parse the imports rather than grepping text, so prose in a comment
        cannot fail (or silently pass) this check."""
        import ast
        import pathlib

        banned = {"requests", "httpx", "urllib", "urllib3", "http", "socket", "aiohttp", "googlemaps", "google"}
        api_dir = pathlib.Path(catalog.__file__).resolve().parent.parent

        # geoapify_places.py is the single sanctioned network boundary and is
        # allowed urllib. Everything else in the api package must stay offline,
        # which is what keeps that module the only way out to the internet.
        exempt = {"geoapify_places.py"}

        offenders = []
        for path in api_dir.rglob("*.py"):
            if path.name.startswith("test") or path.name in exempt:
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

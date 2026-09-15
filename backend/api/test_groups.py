"""Group session tests.

Covers the whole real-group capability: creation, joining, the shared deck,
voting, duplicate protection, completion, server-computed results, and the
session boundaries that stop one participant acting as another.

No external calls: the restaurant provider has no key in tests, so the deck is
built from the bundled catalog.
"""

from __future__ import annotations

from django.test import TestCase, override_settings
from django.utils import timezone

from api.models import MAX_PARTICIPANTS, DeckCard, FoodMatchGroup, Participant, Vote, generate_code
from api.services import group_matching

TEST_HOSTS = ["testserver", "localhost", "127.0.0.1"]
HEADER = "X-FoodMatch-Participant"


@override_settings(ALLOWED_HOSTS=TEST_HOSTS)
class GroupApiTestCase(TestCase):
    """Shared helpers for driving the group API."""

    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.addCleanup(cache.clear)

    def create_group(self, name="Friday Dinner", display="Abilash", mode="restaurants"):
        response = self.client.post(
            "/api/groups/",
            data={
                "name": name,
                "displayName": display,
                "mode": mode,
                "latitude": 12.9121,
                "longitude": 77.6446,
                "areaName": "HSR Layout",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        return body["group"]["code"], body["participantToken"]

    def join(self, code, display, token=None):
        headers = {HEADER: token} if token else {}
        return self.client.post(
            f"/api/groups/{code}/join/",
            data={"displayName": display},
            content_type="application/json",
            headers=headers,
        )

    def start(self, code, token):
        return self.client.post(f"/api/groups/{code}/start/", headers={HEADER: token})

    def deck(self, code, token):
        return self.client.get(f"/api/groups/{code}/deck/", headers={HEADER: token})

    def vote(self, code, token, card_id, direction):
        return self.client.post(
            f"/api/groups/{code}/votes/",
            data={"cardId": card_id, "direction": direction},
            content_type="application/json",
            headers={HEADER: token},
        )

    def finish(self, code, token):
        return self.client.post(f"/api/groups/{code}/finish/", headers={HEADER: token})

    def results(self, code, token):
        return self.client.get(f"/api/groups/{code}/results/", headers={HEADER: token})


# --- models -----------------------------------------------------------------


class ModelTests(TestCase):
    def test_codes_use_an_unambiguous_alphabet(self):
        for _ in range(200):
            code = generate_code()
            self.assertEqual(len(code), 6)
            self.assertFalse(set(code) & set("IO01"), f"ambiguous character in {code}")

    def test_codes_are_effectively_unique(self):
        codes = {generate_code() for _ in range(2000)}
        self.assertGreater(len(codes), 1990, "code generator is not spreading well")

    def test_create_with_code_allocates_a_unique_code(self):
        first = FoodMatchGroup.create_with_code(name="A")
        second = FoodMatchGroup.create_with_code(name="B")
        self.assertNotEqual(first.code, second.code)

    def test_participant_tokens_are_unique_and_long(self):
        group = FoodMatchGroup.create_with_code(name="A")
        a = Participant.objects.create(group=group, display_name="One")
        b = Participant.objects.create(group=group, display_name="Two")
        self.assertNotEqual(a.token, b.token)
        self.assertGreaterEqual(len(a.token), 32, "token is too short to be unguessable")

    def test_duplicate_display_name_in_one_group_is_refused_by_the_database(self):
        from django.db import IntegrityError

        group = FoodMatchGroup.create_with_code(name="A")
        Participant.objects.create(group=group, display_name="Rahul")
        with self.assertRaises(IntegrityError):
            Participant.objects.create(group=group, display_name="Rahul")

    def test_duplicate_vote_is_refused_by_the_database(self):
        from django.db import IntegrityError

        group = FoodMatchGroup.create_with_code(name="A")
        person = Participant.objects.create(group=group, display_name="Rahul")
        Vote.objects.create(participant=person, card_id="r_1", direction="like")
        with self.assertRaises(IntegrityError):
            Vote.objects.create(participant=person, card_id="r_1", direction="pass")

    def test_same_card_can_be_voted_by_different_participants(self):
        group = FoodMatchGroup.create_with_code(name="A")
        a = Participant.objects.create(group=group, display_name="A")
        b = Participant.objects.create(group=group, display_name="B")
        Vote.objects.create(participant=a, card_id="r_1", direction="like")
        Vote.objects.create(participant=b, card_id="r_1", direction="pass")
        self.assertEqual(Vote.objects.count(), 2)

    def test_expiry_is_time_based(self):
        group = FoodMatchGroup.create_with_code(name="A")
        self.assertFalse(group.is_expired)
        group.created_at = timezone.now() - timezone.timedelta(hours=13)
        self.assertTrue(group.is_expired)

    def test_everyone_finished_requires_participants(self):
        group = FoodMatchGroup.create_with_code(name="A")
        self.assertFalse(group.everyone_finished(), "an empty group is not finished")


# --- creation and joining ---------------------------------------------------


class CreateAndJoinTests(GroupApiTestCase):
    def test_create_returns_a_code_and_a_token(self):
        code, token = self.create_group()
        self.assertEqual(len(code), 6)
        self.assertTrue(token)

    def test_creator_is_the_host(self):
        code, token = self.create_group()
        body = self.client.get(f"/api/groups/{code}/", headers={HEADER: token}).json()
        self.assertTrue(body["you"]["isHost"])

    def test_group_payload_never_leaks_participant_tokens(self):
        code, token = self.create_group()
        self.join(code, "Rahul")
        raw = self.client.get(f"/api/groups/{code}/", headers={HEADER: token}).content.decode()
        for participant in Participant.objects.all():
            self.assertNotIn(participant.token, raw, "a participant token leaked in the group payload")

    def test_join_with_a_code_needs_no_account(self):
        code, _ = self.create_group()
        response = self.join(code, "Rahul")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["participantToken"])

    def test_invalid_code_is_rejected(self):
        self.assertEqual(self.client.get("/api/groups/abc/").status_code, 400)
        self.assertEqual(self.client.get("/api/groups/AAAAAAAA/").status_code, 400)

    def test_unknown_code_is_a_clean_404(self):
        response = self.client.get("/api/groups/ZZZZZZ/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "not_found")

    def test_missing_display_name_is_rejected(self):
        code, _ = self.create_group()
        response = self.client.post(
            f"/api/groups/{code}/join/", data={}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_display_name_is_disambiguated_not_refused(self):
        code, _ = self.create_group(display="Abilash")
        self.join(code, "Rahul")
        second = self.join(code, "Rahul")
        self.assertEqual(second.status_code, 201)
        names = [p["displayName"] for p in second.json()["group"]["participants"]]
        self.assertIn("Rahul (2)", names, names)

    def test_rejoining_with_the_same_token_returns_the_same_identity(self):
        code, _ = self.create_group()
        first = self.join(code, "Rahul").json()
        again = self.join(code, "Rahul", token=first["participantToken"])
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["participantToken"], first["participantToken"])
        self.assertEqual(Participant.objects.filter(display_name="Rahul").count(), 1)

    def test_group_fills_up(self):
        code, _ = self.create_group()
        for i in range(MAX_PARTICIPANTS - 1):
            self.assertEqual(self.join(code, f"Person{i}").status_code, 201)
        overflow = self.join(code, "OneTooMany")
        self.assertEqual(overflow.status_code, 409)
        self.assertEqual(overflow.json()["error"], "full")

    def test_cannot_join_a_completed_group(self):
        code, token = self.create_group()
        group = FoodMatchGroup.objects.get(code=code)
        group.status = FoodMatchGroup.Status.COMPLETED
        group.save(update_fields=["status"])
        self.assertEqual(self.join(code, "Late").status_code, 409)

    def test_cannot_join_an_expired_group(self):
        code, _ = self.create_group()
        group = FoodMatchGroup.objects.get(code=code)
        group.created_at = timezone.now() - timezone.timedelta(hours=13)
        group.save(update_fields=["created_at"])
        response = self.join(code, "Late")
        self.assertEqual(response.status_code, 410)

    def test_display_name_rejects_control_characters(self):
        code, _ = self.create_group()
        self.assertEqual(self.join(code, "<script>alert(1)</script>").status_code, 400)

    def test_group_name_is_length_capped(self):
        response = self.client.post(
            "/api/groups/",
            data={"name": "x" * 200, "displayName": "A"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_invalid_coordinates_are_rejected(self):
        response = self.client.post(
            "/api/groups/",
            data={"name": "A", "displayName": "A", "latitude": 999, "longitude": 77},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


# --- starting and the shared deck -------------------------------------------


class StartAndDeckTests(GroupApiTestCase):
    def test_only_the_host_can_start(self):
        code, host = self.create_group()
        guest = self.join(code, "Rahul").json()["participantToken"]
        self.assertEqual(self.start(code, guest).status_code, 403)
        self.assertEqual(self.start(code, host).status_code, 200)

    def test_a_stranger_cannot_start(self):
        code, _ = self.create_group()
        self.assertEqual(self.start(code, "not-a-real-token").status_code, 403)

    def test_starting_builds_a_deck_and_moves_to_swiping(self):
        code, host = self.create_group()
        body = self.start(code, host).json()
        self.assertEqual(body["status"], "swiping")
        self.assertGreater(body["deckSize"], 0)

    def test_starting_twice_does_not_rebuild_the_deck(self):
        code, host = self.create_group()
        first = self.start(code, host).json()["deckSize"]
        ids_before = list(DeckCard.objects.filter(group__code=code).values_list("card_id", flat=True))
        second = self.start(code, host).json()["deckSize"]
        ids_after = list(DeckCard.objects.filter(group__code=code).values_list("card_id", flat=True))
        self.assertEqual(first, second)
        self.assertEqual(ids_before, ids_after)

    def test_every_participant_receives_the_identical_deck(self):
        code, host = self.create_group()
        a = self.join(code, "Rahul").json()["participantToken"]
        b = self.join(code, "Ananya").json()["participantToken"]
        self.start(code, host)

        decks = [
            [c["id"] for c in self.deck(code, token).json()["cards"]] for token in (host, a, b)
        ]
        self.assertEqual(decks[0], decks[1])
        self.assertEqual(decks[1], decks[2])
        self.assertGreater(len(decks[0]), 0)

    def test_deck_is_unavailable_before_the_group_starts(self):
        code, host = self.create_group()
        response = self.deck(code, host)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "not_started")

    def test_non_participants_cannot_read_the_deck(self):
        code, host = self.create_group()
        self.start(code, host)
        self.assertEqual(self.deck(code, "someone-elses-token").status_code, 403)

    def test_dish_mode_deck_is_made_of_dishes(self):
        code, host = self.create_group(mode="dishes")
        self.start(code, host)
        cards = self.deck(code, host).json()["cards"]
        self.assertTrue(cards)
        self.assertTrue(all(c["type"] == "dish" for c in cards))
        self.assertTrue(all(c.get("restaurantId") for c in cards), "a dish must know its restaurant")

    def test_restaurant_mode_deck_is_made_of_restaurants(self):
        code, host = self.create_group(mode="restaurants")
        self.start(code, host)
        cards = self.deck(code, host).json()["cards"]
        self.assertTrue(all(c["type"] == "restaurant" for c in cards))


# --- voting -----------------------------------------------------------------


class VotingTests(GroupApiTestCase):
    def setUp(self):
        super().setUp()
        self.code, self.host = self.create_group()
        self.guest = self.join(self.code, "Rahul").json()["participantToken"]
        self.start(self.code, self.host)
        self.cards = [c["id"] for c in self.deck(self.code, self.host).json()["cards"]]

    def test_a_vote_is_recorded(self):
        response = self.vote(self.code, self.host, self.cards[0], "like")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["recorded"])
        self.assertEqual(Vote.objects.count(), 1)

    def test_duplicate_vote_is_ignored_not_doubled(self):
        self.vote(self.code, self.host, self.cards[0], "like")
        again = self.vote(self.code, self.host, self.cards[0], "pass")
        self.assertEqual(again.status_code, 200)
        self.assertFalse(again.json()["recorded"])
        self.assertEqual(Vote.objects.count(), 1, "a duplicate vote created a second row")
        self.assertEqual(Vote.objects.first().direction, "like", "the first vote must stand")

    def test_invalid_direction_is_rejected(self):
        self.assertEqual(self.vote(self.code, self.host, self.cards[0], "maybe").status_code, 400)
        self.assertEqual(Vote.objects.count(), 0)

    def test_card_outside_the_deck_is_rejected(self):
        response = self.vote(self.code, self.host, "not_in_this_deck", "like")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "unknown_card")
        self.assertEqual(Vote.objects.count(), 0)

    def test_a_stranger_cannot_vote(self):
        self.assertEqual(self.vote(self.code, "bogus-token", self.cards[0], "like").status_code, 403)
        self.assertEqual(Vote.objects.count(), 0)

    def test_a_participant_cannot_vote_in_another_group(self):
        other_code, other_host = self.create_group(name="Other", display="Someone")
        self.start(other_code, other_host)
        # Using this group's token against the other group's code.
        response = self.vote(other_code, self.host, self.cards[0], "like")
        self.assertEqual(response.status_code, 403)

    def test_voting_moves_a_participant_into_swiping(self):
        self.vote(self.code, self.guest, self.cards[0], "like")
        self.assertEqual(Participant.objects.get(token=self.guest).state, "swiping")

    def test_vote_count_is_reported_back(self):
        for card in self.cards[:3]:
            body = self.vote(self.code, self.host, card, "like").json()
        self.assertEqual(body["voted"], 3)
        self.assertEqual(body["deckSize"], len(self.cards))


# --- completion and results -------------------------------------------------


class ResultsTests(GroupApiTestCase):
    def setUp(self):
        super().setUp()
        self.code, self.host = self.create_group()
        self.b = self.join(self.code, "Rahul").json()["participantToken"]
        self.c = self.join(self.code, "Ananya").json()["participantToken"]
        self.d = self.join(self.code, "Rohan").json()["participantToken"]
        self.start(self.code, self.host)
        self.cards = [c["id"] for c in self.deck(self.code, self.host).json()["cards"]]

    def _vote_all(self, token, directions):
        for card, direction in zip(self.cards, directions):
            self.vote(self.code, token, card, direction)

    def test_group_completes_only_when_everyone_finishes(self):
        self.finish(self.code, self.host)
        self.assertEqual(FoodMatchGroup.objects.get(code=self.code).status, "swiping")
        for token in (self.b, self.c, self.d):
            body = self.finish(self.code, token).json()
        self.assertEqual(body["status"], "completed")
        self.assertTrue(body["everyoneFinished"])

    def test_three_of_four_likes_is_seventy_five_percent(self):
        target = self.cards[0]
        for token in (self.host, self.b, self.c):
            self.vote(self.code, token, target, "like")
        self.vote(self.code, self.d, target, "pass")
        for token in (self.host, self.b, self.c, self.d):
            self.finish(self.code, token)

        body = self.results(self.code, self.host).json()
        winner = body["winner"]
        self.assertEqual(winner["cardId"], target)
        self.assertEqual(winner["percent"], 75)
        self.assertEqual(winner["likes"], 3)
        self.assertEqual(winner["votedBy"], 4)
        self.assertEqual(body["headline"], "3 of 4 people matched")

    def test_unanimous_is_one_hundred_percent(self):
        target = self.cards[0]
        for token in (self.host, self.b, self.c, self.d):
            self.vote(self.code, token, target, "like")
            self.finish(self.code, token)
        winner = self.results(self.code, self.host).json()["winner"]
        self.assertEqual(winner["percent"], 100)

    def test_nobody_liking_anything_yields_no_winner(self):
        for token in (self.host, self.b, self.c, self.d):
            self._vote_all(token, ["pass"] * len(self.cards))
            self.finish(self.code, token)
        body = self.results(self.code, self.host).json()
        self.assertIsNone(body["winner"])
        self.assertIn("Nobody found a perfect match", body["verdict"])

    def test_results_name_the_people_who_liked_the_winner(self):
        target = self.cards[0]
        self.vote(self.code, self.host, target, "like")
        self.vote(self.code, self.b, target, "like")
        self.vote(self.code, self.c, target, "pass")
        for token in (self.host, self.b, self.c, self.d):
            self.finish(self.code, token)
        winner = self.results(self.code, self.host).json()["winner"]
        self.assertEqual(sorted(winner["likedByNames"]), ["Abilash", "Rahul"])

    def test_denominator_is_people_who_voted_on_that_card(self):
        """A card only two people reached is scored against those two."""
        target = self.cards[0]
        self.vote(self.code, self.host, target, "like")
        self.vote(self.code, self.b, target, "like")
        for token in (self.host, self.b, self.c, self.d):
            self.finish(self.code, token)
        winner = self.results(self.code, self.host).json()["winner"]
        self.assertEqual(winner["votedBy"], 2)
        self.assertEqual(winner["percent"], 100)
        self.assertEqual(winner["totalParticipants"], 4)

    def test_results_are_unavailable_before_the_group_starts(self):
        code, host = self.create_group(name="Fresh", display="Someone")
        self.assertEqual(self.results(code, host).status_code, 409)

    def test_a_stranger_cannot_read_results(self):
        self.assertEqual(self.results(self.code, "bogus").status_code, 403)

    def test_results_are_stable_across_repeated_requests(self):
        target = self.cards[0]
        for token in (self.host, self.b):
            self.vote(self.code, token, target, "like")
            self.finish(self.code, token)
        first = self.results(self.code, self.host).json()
        second = self.results(self.code, self.host).json()
        self.assertEqual(first["winner"]["cardId"], second["winner"]["cardId"])
        self.assertEqual(first["results"], second["results"])


# --- the pure engine --------------------------------------------------------


class MatchEngineTests(TestCase):
    def setUp(self):
        self.people = [
            {"id": "a", "displayName": "Abilash"},
            {"id": "b", "displayName": "Rahul"},
            {"id": "c", "displayName": "Ananya"},
            {"id": "d", "displayName": "Rohan"},
        ]

    def card(self, cid, rating=4.5, distance=2.0):
        return {"id": cid, "name": cid, "rating": rating, "distanceKm": distance}

    def test_percentages(self):
        cards = [self.card("x")]
        for likes, expected in ((4, 100), (3, 75), (2, 50), (1, 25)):
            votes = [
                {"participantId": p["id"], "cardId": "x", "direction": "like" if i < likes else "pass"}
                for i, p in enumerate(self.people)
            ]
            out = group_matching.compute_results(cards=cards, votes=votes, participants=self.people)
            self.assertEqual(out["results"][0]["percent"], expected, f"{likes} likes")

    def test_zero_likes_has_no_winner(self):
        votes = [{"participantId": p["id"], "cardId": "x", "direction": "pass"} for p in self.people]
        out = group_matching.compute_results(cards=[self.card("x")], votes=votes, participants=self.people)
        self.assertIsNone(out["winner"])
        self.assertFalse(out["likedAnything"])

    def test_tie_broken_by_likes_then_voters_then_rating_then_distance(self):
        # equal score, more likes wins
        cards = [self.card("few"), self.card("many")]
        votes = [{"participantId": "a", "cardId": "few", "direction": "like"}]
        votes += [{"participantId": p["id"], "cardId": "many", "direction": "like"} for p in self.people]
        out = group_matching.compute_results(cards=cards, votes=votes, participants=self.people)
        self.assertEqual(out["winner"]["cardId"], "many")

        # equal score and likes, better rating wins
        cards = [self.card("low", rating=4.0), self.card("high", rating=4.9)]
        votes = [
            {"participantId": "a", "cardId": "low", "direction": "like"},
            {"participantId": "a", "cardId": "high", "direction": "like"},
        ]
        out = group_matching.compute_results(cards=cards, votes=votes, participants=self.people)
        self.assertEqual(out["winner"]["cardId"], "high")

        # equal on all of the above, nearer wins
        cards = [self.card("far", distance=9), self.card("near", distance=1)]
        votes = [
            {"participantId": "a", "cardId": "far", "direction": "like"},
            {"participantId": "a", "cardId": "near", "direction": "like"},
        ]
        out = group_matching.compute_results(cards=cards, votes=votes, participants=self.people)
        self.assertEqual(out["winner"]["cardId"], "near")

    def test_identical_input_gives_identical_output(self):
        cards = [self.card("x"), self.card("y")]
        votes = [{"participantId": "a", "cardId": "x", "direction": "like"}]
        first = group_matching.compute_results(cards=cards, votes=votes, participants=self.people)
        second = group_matching.compute_results(cards=cards, votes=votes, participants=self.people)
        self.assertEqual(first, second)

    def test_votes_from_departed_participants_are_ignored(self):
        votes = [
            {"participantId": "a", "cardId": "x", "direction": "like"},
            {"participantId": "ghost", "cardId": "x", "direction": "like"},
        ]
        out = group_matching.compute_results(cards=[self.card("x")], votes=votes, participants=self.people)
        self.assertEqual(out["results"][0]["likes"], 1)
        self.assertEqual(out["results"][0]["votedBy"], 1)

    def test_empty_inputs_do_not_crash(self):
        self.assertEqual(group_matching.compute_results(cards=[], votes=[], participants=[])["results"], [])
        out = group_matching.compute_results(cards=[self.card("x")], votes=[], participants=self.people)
        self.assertEqual(out["results"][0]["percent"], 0)
        self.assertIsNone(out["winner"])

    def test_single_participant_group(self):
        one = [{"id": "a", "displayName": "Solo"}]
        votes = [{"participantId": "a", "cardId": "x", "direction": "like"}]
        out = group_matching.compute_results(cards=[self.card("x")], votes=votes, participants=one)
        self.assertEqual(out["winner"]["percent"], 100)
        self.assertEqual(group_matching.verdict_for(out["winner"], 1), "Your pick for tonight.")

    def test_cards_without_ids_are_skipped(self):
        out = group_matching.compute_results(
            cards=[{"name": "no id"}, self.card("x")], votes=[], participants=self.people
        )
        self.assertEqual(len(out["results"]), 1)

    def test_percent_always_matches_likes_over_voters(self):
        cards = [self.card(f"c{i}") for i in range(5)]
        votes = []
        for i, card in enumerate(cards):
            for j, person in enumerate(self.people[: (i % 4) + 1]):
                votes.append(
                    {"participantId": person["id"], "cardId": card["id"], "direction": "like" if j % 2 == 0 else "pass"}
                )
        out = group_matching.compute_results(cards=cards, votes=votes, participants=self.people)
        for result in out["results"]:
            if result["votedBy"]:
                self.assertEqual(result["percent"], round(result["likes"] / result["votedBy"] * 100))

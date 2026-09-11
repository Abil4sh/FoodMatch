# FoodMatch

Swipe on food with friends and let the group decide where to eat.

## What is FoodMatch?

Picking a restaurant with a group is a coordination problem disguised as a
casual question. Somebody suggests a place, somebody else has been there twice
this week, a third person is vegetarian, and twenty minutes later the group
chat has produced nothing but a link to the same biryani place as always.

FoodMatch replaces that negotiation with a swipe. Everyone in the group swipes
independently through the same deck of restaurants or dishes, nobody sees
anybody else's votes while they choose, and when everyone is done the app
scores each option by how much of the group agreed on it. The result is a
ranked answer with a percentage attached, so the decision comes from what the
group actually wanted rather than from whoever argued hardest.

The mock data is set in Bengaluru.

## Core flow

```
SWIPE  →  MATCH  →  EAT
```

In full:

```
Discover → Create FoodMatch → Invite Friends → Lobby → Swipe
        → Match Reveal → Restaurant/Dish Detail
```

## Features

- **Group food matching** — create a match, set cuisines, budget and distance, invite friends
- **Restaurant and dish swiping** — draggable card deck with like/pass, separate decks for restaurants and dishes
- **Group consensus scoring** — a transparent, explainable percentage per option
- **Match reveal** — the winning place with who liked it, plus runners-up
- **Restaurant and dish details** — rating, price, distance, address, related dishes
- **Food DNA** — a taste profile derived from what you have actually liked
- **Match history** — past matches with their winners, stored locally
- **Responsive UI** — mobile-first, with a phone-frame presentation on desktop
- **Accessibility** — keyboard focus states, labelled controls, WCAG AA text contrast, reduced-motion support

## Tech stack

**Frontend**

- React 18, Vite 5
- JavaScript (JSX) — no TypeScript
- React Router 6
- CSS Modules with a shared design-token layer
- React Context + `useReducer` for state
- Framer Motion for the swipe gestures and reveal animation

**Backend**

- Python 3.12, Django 6, Django REST Framework
- django-cors-headers, python-dotenv

The catalog is served by the Django API from local JSON. There is no database
and no third-party API: **no Google Maps or Places integration exists at this
stage**, by design. The only external request the app makes is a Google Fonts
stylesheet, which carries no key and no billing.

## Architecture

**State.** One `MatchContext` built on `useReducer` holds the active group:
members, their statuses, preferences, votes, completion and the computed
result. Actions are explicit (`CREATE_GROUP`, `INVITE`, `MEMBER_READY`, `VOTE`,
`MEMBER_FINISHED`, `COMPUTE_RESULT`, `START`, `RESET`). A separate
`SessionContext` supplies the mock user and friends.

**Swipe deck.** `useSwipeDeck` owns deck state and nothing else — no DOM, no
motion values. The current index is *derived* from the votes already in
context rather than stored separately, so a refresh or a switch between the
restaurant and dish decks resumes exactly where you left off. The pointer
position lives inside `SwipeCard` as a Framer motion value so dragging never
re-renders the deck. Gestures and the on-screen buttons commit through the
same `swipe(dir)` function.

**Matching engine.** `services/matchEngine.js` is a pure function of
`(cards, members, votes)`. No React, no clock, no randomness — the same input
always produces the same output, which is what makes it testable now and
replaceable with a server implementation later.

**Services.** Data access is kept out of the UI. `catalog.js` resolves card
ids, `deck.js` builds and orders a deck, `profile.js` derives Food DNA and
stats, `simulateVotes.js` stands in for other members, `history.js` persists
completed matches.

**Backend.** A read-only Django REST API serves the catalog. `api/services/catalog.py`
is the single data-access seam — views never read files themselves — so a future
`google_places.py` can replace the source without touching views, serializers or
React. Requests are validated at the boundary (id format, result limits), errors
are returned as clean JSON with no tracebacks or filesystem paths, CORS is
restricted to explicit origins, and DRF throttling is configured per endpoint.
There are no routes that accept a URL or an upstream service name, so the API
cannot be used as a proxy.

**Request discipline.** The frontend performs exactly one `fetch`, in
`services/api.js`, and boots with three calls. The catalog is then held in
memory by `services/catalogStore.js`, so rendering cards, swiping, opening a
detail screen and navigating between loaded screens all make **zero** further
requests. This is enforced by a test, not just by convention.

**Persistence.** `localStorage` under two keys: `foodmatch.match.v1` for the
active group and `foodmatch.history.v1` for past matches. State rehydrates
synchronously on load, so a refresh mid-flow does not flash an empty screen.

## Matching algorithm

```
Group Match % = (members who liked it / total members in the group) × 100
```

The denominator is the size of the whole group, never the number of members
who happen to have voted. A card that two people never reached has not earned
their agreement, so a group that has not finished cannot produce a misleading
100%.

Worked example, four members:

| Member | Vote |
| --- | --- |
| You | like |
| Rahul | like |
| Ananya | like |
| Rohan | pass |

3 likes ÷ 4 members = **75% group match**.

Ties break in this order:

1. **Group score** — the consensus percentage
2. **Number of likes** — raw agreement, which separates equal scores in unequal groups
3. **Rating** — the better-reviewed option
4. **Distance** — the nearer option

Original deck order is the final fallback, so the sort is fully deterministic.

This is deliberately arithmetic, not machine learning. Anyone should be able to
read the number off the page and check it by hand.

**Honest caveat:** restaurants, dishes, friends and every vote except your own
are mock data held in local JSON. The engine is real; the inputs are not.

## Project structure

```
src/
  components/
    cards/         MemberRow, RestaurantRow
    layout/        PhoneShell, ScreenHeader, TabBar
    match/         WinnerCard, ResultRow
    primitives/    Button, Chip, Avatar, MatchMeter, EmptyState, …
    profile/       FoodDNA
    swipe/         SwipeCard, FoodPhoto
  data/            restaurants, dishes, friends, user, cravings, matchOptions
  hooks/           useSwipeDeck, useMatchResult, useSimulatedFriends,
                   useSimulatedProgress
  screens/         Discover, Create, Invite, Lobby, Swipe, Match, Detail,
                   Profile, History, Groups, NotFound
  services/        matchEngine, catalog, deck, profile, simulateVotes,
                   history, api
  store/           MatchContext, SessionContext
  styles/          tokens.css, base.css
tests/             engine and profile unit tests, browser suites
backend/
  manage.py
  requirements.txt
  .env.example     template only; never contains a real value
  config/          settings, urls, wsgi
  api/
    urls.py        fixed routes; no URL or service name is ever a parameter
    views.py       read-only endpoints, throttled, safe error handler
    serializers.py explicit field allowlists
    validation.py  id format and result-count limits
    services/
      catalog.py   the single data-access seam
    data/          restaurants, dishes, friends, user, cravings
    tests.py
```

## Running locally

FoodMatch now needs **two** processes: the Django API and the Vite dev server.

**1. Backend** (first terminal), from the project root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver
```

Leave it running. It serves http://localhost:8000. No migrations are needed —
there is no database.

**2. Frontend** (second terminal), from the project root:

```bash
npm install
npm run dev
```

Open http://localhost:5173. If the API is not running, the app shows a clear
"Can't reach the FoodMatch API" screen with a retry button rather than failing
silently.

The API base URL is configurable and is **not** a secret:

```bash
cp .env.example .env        # optional; defaults to http://localhost:8000
```

To build and preview a production frontend bundle:

```bash
npm run build
npm run preview
```

## Testing

**Backend** (with the virtualenv active, from `backend/`):

```bash
python manage.py test api
```

27 tests covering the endpoints, validation, clean 404/400 handling, that no
response contains a secret, that no backend module imports anything
network-capable, and that no outbound socket connection is attempted during a
request.

**Frontend unit tests** are plain Node with no test framework and no
dependencies:

```bash
npm test
```

This runs the matching-engine tests (scoring at 100/75/50/25/0%, every
tie-breaker, single-member groups, empty decks, and the rule that members
without votes stay in the denominator) and the Food DNA tests.

There are also browser suites that drive a real Chrome with real mouse and
touch events. They need `puppeteer-core` and a Chrome binary you already have:

```bash
npm i -D puppeteer-core
npm run dev   # in another terminal

CHROME=/path/to/chrome node tests/browser.product.mjs   # whole product walkthrough
CHROME=/path/to/chrome node tests/browser.suite.mjs     # swipe gestures
CHROME=/path/to/chrome node tests/browser.match.mjs     # match reveal
CHROME=/path/to/chrome node tests/browser.flow.mjs      # create → lobby flow
CHROME=/path/to/chrome node tests/audit.mjs             # accessibility/layout audit
CHROME=/path/to/chrome node tests/browser.network.mjs  # request-volume verification
```

`browser.network.mjs` is the one to run before adding any paid API. It counts
every request the browser makes and asserts that booting costs three calls,
swiping a full deck costs zero, navigating between loaded screens costs zero,
and no Google Maps/Places request is made at all.

Pass `VW=1366 VH=640` to any of them to run at a laptop viewport. See
`tests/README.md` for details.

## Current limitations

- **Mock restaurant data.** Twelve restaurants and twelve dishes in local JSON.
  Real names, invented ratings and prices.
- **No database and no authentication.** The Django API is read-only and
  unauthenticated; the catalog is JSON on disk.
- **No Google integration.** Real restaurant data is not connected. That work
  is gated behind a separate security and billing review.
- **Simulated friend votes.** Other members' votes are generated from a seeded
  hash of group, member and card. They are deterministic — the same group
  always produces the same result, so a refresh never reshuffles a winner you
  have already seen — but they are not real people.
- **No real-time multiplayer.** Friends joining, becoming ready and swiping are
  local timers, not network events.
- **Local persistence only.** State lives in `localStorage`, so it does not
  follow you between browsers or devices.
- **Placeholder food imagery.** No photography is bundled. `FoodPhoto` draws an
  illustrated motif chosen from each card's cuisine, with a per-item backdrop
  so cards do not repeat. It is a single swap point for real images later.
- **Directions is a stub.** The button explains that maps are not connected yet.
- **Small groups produce coarse scores.** With four members there are only five
  possible percentages, so runners-up often tie and are separated by rating or
  distance.

## Future improvements

None of the following is implemented — this is the roadmap, not the changelog.

- PostgreSQL for groups, votes and match history
- Authentication and real user accounts
- Real restaurant data from Google Places, behind the existing backend service
  seam, with server-side credentials, strict quotas and rate limiting
- Real-time group sessions over WebSockets, replacing the simulated timers
- Real food photography behind the existing `FoodPhoto` component
- Smarter ranking — dietary constraints, budget fit and past behaviour as
  weighted signals rather than a flat like ratio
- Match history as a full screen with filtering and re-matching

## License

Portfolio project, not currently licensed for reuse.

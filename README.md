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

- **Real group sessions** — create a FoodMatch, share a six-character code, friends
  join anonymously with no account, everyone swipes independently and the server
  computes the overlap
- **Solo browsing** — no group required: pick an area and swipe through
  restaurants or dishes on your own
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

**State.** `GroupContext` holds the live session: it stores the participant
token, mirrors what the server reports, and sends intent. It never computes a
result. `SessionContext` owns the catalog and the selected area.

**The backend is authoritative.** Group membership, the deck, every vote and the
final ranking live in the database. The client cannot assert who is in a group
or what won.

```
React (Vercel)
   │  HTTPS, participant token in X-FoodMatch-Participant
   ▼
Django REST API  ──▶  PostgreSQL   (groups, participants, deck, votes)
   │
   └─▶ Geoapify   (restaurant discovery, location search; key server-side)
           ↘ local JSON catalog fallback
```

**Swipe deck.** `useSwipeDeck` owns deck state and nothing else — no DOM, no
motion values. The current index is *derived* from the votes already in
context rather than stored separately, so a refresh or a switch between the
restaurant and dish decks resumes exactly where you left off. The pointer
position lives inside `SwipeCard` as a Framer motion value so dragging never
re-renders the deck. Gestures and the on-screen buttons commit through the
same `swipe(dir)` function.

**Matching engine.** `backend/api/services/group_matching.py` is a pure function
of `(cards, votes, participants)`. No ORM objects, no clock, no randomness, so
the same input always produces the same ranking — and a result can be explained
and reproduced.

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

**Persistence.** Group state is in the database. The browser keeps only small
personal items in `localStorage`: `foodmatch.session.v1` (which group this
browser belongs to, and its participant token), `foodmatch.location.v1` (the
selected area), `foodmatch.likes.v1` (the Food DNA trail) and
`foodmatch.history.v1` (past results).

**Polling, not WebSockets.** The lobby refreshes every 3s and the swipe screen
every 5s. Polling stops when the group completes and pauses when the tab is
hidden. A socket layer would add deployment complexity for very little here.

## Matching algorithm

```
Group Match % = (participants who liked it / participants who voted on it) × 100
```

The denominator is the people who actually voted on *that card*. A card the
last two people never reached is not punished for their absence; what matters
is agreement among those who expressed an opinion. Every result also carries
`votedBy` and `totalParticipants`, so the UI can be honest about sample size —
"3 of 4 people matched" is shown alongside the percentage.

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
2. **Number of likes** — a 3/3 beats a 1/1
3. **How many voted** — a wider sample is a stronger signal
4. **Rating** — the better-reviewed option
5. **Distance** — the nearer option

Original deck order is the final fallback, so the sort is total and deterministic.

This is deliberately arithmetic, not machine learning. Anyone should be able to
read the number off the page and check it by hand.

**Every vote is real.** There is no simulated friend voting anywhere in the
group flow. Restaurants come from Geoapify (or the bundled catalog when no key
is set); dishes and prices are curated and labelled approximate.

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
    models.py      FoodMatchGroup, Participant, DeckCard, Vote
    views.py       catalog + location endpoints, throttled, safe error handler
    group_views.py group sessions: create, join, start, deck, vote, finish, results
    serializers.py explicit field allowlists
    validation.py  id format and result-count limits
    services/
      catalog.py         the single local data-access seam
      geoapify_places.py the only module that talks to Geoapify
      restaurant_provider.py  provider-neutral boundary + local fallback
      group_matching.py  pure, deterministic ranking
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

```bash
python manage.py migrate      # creates db.sqlite3 locally
python manage.py runserver
```

Leave it running; it serves http://127.0.0.1:8000. SQLite needs no setup.

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

## Deployment

**Frontend (Vercel).** Import the repo, framework preset Vite, build `npm run build`,
output `dist`. Set `VITE_API_BASE_URL` to the deployed Django origin. `vercel.json`
rewrites all paths to `index.html` so React Router deep links work.

**Backend (any Python host).** `backend/Procfile` declares the release and web
commands:

```
release: python manage.py migrate --noinput
web: gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3
```

Required environment variables:

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Required. Startup is refused with `DEBUG=false` and the dev key. |
| `DJANGO_DEBUG` | `false` in production. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames. |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Your Vercel origin. Never `*`. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Same. |
| `DATABASE_URL` | `postgres://…` in production; empty for local SQLite. |
| `GEOAPIFY_API_KEY` | Server-side only. Empty = bundled catalog, zero outbound calls. |

Never set a Geoapify key in a `VITE_*` variable — Vite publishes those to the browser.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health/` | Liveness; reports whether a provider key is present |
| GET | `/api/feed/?lat&lng` | Boot catalog for the selected area |
| GET | `/api/restaurants/`, `/api/restaurants/<id>/`, `/api/dishes/`, `/api/dishes/<id>/` | Catalog |
| GET | `/api/restaurants/search/` | Restaurant search |
| GET | `/api/locations/search/`, `/api/locations/popular/` | Area lookup |
| POST | `/api/groups/` | Create a FoodMatch; returns code + participant token |
| POST | `/api/groups/<code>/join/` | Join anonymously |
| GET | `/api/groups/<code>/` | Group status and participants (polled) |
| POST | `/api/groups/<code>/start/` | Host starts; freezes the shared deck |
| GET | `/api/groups/<code>/deck/` | The frozen deck, identical for everyone |
| POST | `/api/groups/<code>/votes/` | One like or pass; duplicates refused |
| POST | `/api/groups/<code>/finish/` | Mark this participant done |
| GET | `/api/groups/<code>/results/` | Server-computed ranking |

## Security notes

Secrets are server-side only and read from the environment at call time, never
copied into Django settings. Group codes use a 32-character ambiguity-free
alphabet (≈1.07 billion combinations) and are validated against an anchored
pattern. The participant token is an opaque bearer credential returned once and
never included in any group payload, so knowing a code does not let you act as
someone else. Duplicate votes are refused by a database constraint, not by
client discipline. All group endpoints are throttled. CORS lists explicit
origins. No endpoint accepts a URL or an upstream service name, so the API
cannot be used as a proxy. This is a portfolio project, not an audited system.

## Current limitations

- **Mock restaurant data.** Twelve restaurants and twelve dishes in local JSON.
  Real names, invented ratings and prices.
- **No database and no authentication.** The Django API is read-only and
  unauthenticated; the catalog is JSON on disk.
- **Restaurant data comes from Geoapify** when a server-side key is present,
  and from the bundled catalog otherwise. Geoapify is OpenStreetMap-derived: it
  has no ratings, review counts or prices, so those are omitted rather than
  invented. Dishes stay curated local data, since no places API supplies menus.
- **Polling, not push.** Lobby and swipe updates arrive every few seconds
  rather than instantly.
- **Sessions expire after 12 hours** and there is no way to rejoin a completed
  group or remove a participant.
- **Anonymous identity is per-browser.** Clearing site data loses your place in
  a group; there are no accounts by design.
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
- Richer restaurant metadata: Geoapify (OpenStreetMap) supplies names,
  addresses and categories but no ratings, review counts or prices
- Real-time group sessions over WebSockets, replacing the simulated timers
- Real food photography behind the existing `FoodPhoto` component
- Smarter ranking — dietary constraints, budget fit and past behaviour as
  weighted signals rather than a flat like ratio
- Match history as a full screen with filtering and re-matching

## License

Portfolio project, not currently licensed for reuse.

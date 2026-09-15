# FoodMatch test harnesses

## Backend (Django)

    cd backend && source .venv/bin/activate
    python manage.py test api

157 tests: catalog endpoints, validation, Geoapify provider (fully mocked —
never calls the real API), group models and constraints, join/vote/finish/
results, session boundaries, and the pure matching engine.

## Frontend unit tests (plain Node, no framework)

    npm test                          # api + profile
    node tests/location.test.mjs      # location persistence, menu data
    node tests/maps.test.mjs          # Directions URL construction

## Browser suites

Need `puppeteer-core` and a Chrome binary, plus both servers running:

    cd backend && source .venv/bin/activate && python manage.py runserver
    npm run dev

    CHROME=/path/to/chrome node tests/browser.group.mjs      # two real participants
    CHROME=/path/to/chrome node tests/browser.solo.mjs       # solo, no group
    CHROME=/path/to/chrome node tests/browser.location.mjs   # area picker + menus
    CHROME=/path/to/chrome node tests/browser.directions.mjs # keyless maps URL
    CHROME=/path/to/chrome node tests/browser.product.mjs    # whole product walkthrough
    CHROME=/path/to/chrome node tests/browser.suite.mjs      # swipe gestures (mouse + touch)
    CHROME=/path/to/chrome node tests/browser.network.mjs    # request-volume discipline
    CHROME=/path/to/chrome node tests/audit.mjs              # accessibility + layout, 4 viewports

`browser.group.mjs` drives two separate browser contexts — genuinely two
participants — through create, join, identical decks, independent voting,
completion gating, the server-computed reveal, restaurant detail and Directions.

Pass `VW=1366 VH=640` to any browser suite to run at a laptop viewport.

## Running without the API

Stop Django and run `browser.solo.mjs`: the bundled catalog keeps solo browsing,
the area picker and Directions working. Group mode needs the backend by design.

# FoodMatch test harnesses

Both are optional and need one-off dev deps; neither is part of the app bundle.

## Flow suite (jsdom) — routing, state, votes, persistence

    npm i -D jsdom
    node tests/run.mjs

## Browser suite — real mouse + touch dragging

Needs a Chrome/Chromium binary you already have.

    npm i -D puppeteer-core
    npm run dev                       # in another terminal, port 5174
    CHROME=/path/to/chrome node tests/browser.suite.mjs            # mobile viewport
    CHROME=/path/to/chrome VW=1280 VH=900 node tests/browser.suite.mjs   # desktop

macOS Chrome path:
  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

It drags card 1 right, card 2 left, checks a short drag snaps back, does a
real touch drag, then the buttons, and asserts votes landed in MatchContext.

## Milestone 2 flow in a real browser (viewport / CTA regression)

    npm run dev
    CHROME=/path/to/chrome node tests/browser.flow.mjs                   # 1366x640
    CHROME=/path/to/chrome VW=390 VH=844 node tests/browser.flow.mjs     # phone

Walks Discover -> Create -> Invite -> Lobby -> Swipe and asserts every primary
CTA is inside the viewport and hit-testable without manual page scrolling.

    CHROME=/path/to/chrome node tests/viewport.probe.mjs

Reports where the Create CTA lands across six common viewport sizes.

## Match engine (Milestone 4)

Pure unit tests, no dependencies at all:

    node tests/matchEngine.test.mjs

Covers 75% / 100% / 25% scoring, every tie-breaker, no-likes, solo member,
unfinished groups, empty decks and deterministic simulated votes.

## Match reveal in a browser

    npm run dev
    CHROME=/path/to/chrome node tests/browser.match.mjs

Swipes a full deck, waits for the simulated group, checks the engine output
against the rendered reveal, and re-checks it survives a refresh.

## Denominator verification (Milestone 4 fix pass)

    CHROME=/path/to/chrome node tests/verify.mjs            # invites everyone
    CHROME=/path/to/chrome INVITE=1 node tests/verify.mjs   # invites one friend

Walks the real UI and prints group membership at every stage, then the engine
output and the rendered reveal, so the group size can be traced end to end.

## Milestone 5: profile + whole-product walkthrough

    node tests/profile.test.mjs                                # pure, no deps

    npm run dev
    CHROME=/path/to/chrome node tests/browser.product.mjs                 # mobile
    CHROME=/path/to/chrome VW=1366 VH=640 node tests/browser.product.mjs  # laptop

The product suite checks every empty/error state first, then walks Discover →
Create → Invite → Lobby → Swipe → Reveal → Detail → Profile → History →
Groups, verifying the detail screen's group match matches the engine.

## Accessibility / layout audit

    npm run dev
    CHROME=/path/to/chrome node tests/audit.mjs

Loads every route at four viewports (360, 390, 1366, 1920 wide) and reports
horizontal overflow, elements pushed off-screen, controls without an
accessible name, touch targets under 28px, broken heading hierarchy, images
without alt text, and console errors. Should report zero findings.

## Request-volume verification (Prompt 1.5)

    cd backend && source .venv/bin/activate && python manage.py runserver
    npm run dev
    CHROME=/path/to/chrome node tests/browser.network.mjs

Counts every request the browser makes and asserts:
boot = 3 API calls, sitting still = 0, swiping a 12-card deck = 0,
navigating between loaded screens = 0, opening a detail screen = 0,
Google Maps/Places requests = 0.

Run this before any paid API is connected, and again after.

## Backend tests

    cd backend && source .venv/bin/activate && python manage.py test api

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadCatalog, SOURCE, referenceRestaurants } from '../services/catalogSource';
import { setCatalog } from '../services/catalogStore';
import { readLocation, writeLocation, toStoredLocation } from '../services/location';

const SessionContext = createContext(null);

/*
 * Boots the app once.
 *
 * The catalog comes from Django when it is running and from the bundled JSON
 * when it is not; `loadCatalog` decides and never rejects, so there is no
 * error path that leaves the app empty. `dataSource` records which one was
 * used, so the UI (and the tests) can tell them apart.
 *
 * `reload` is wired only to a manual control. Nothing retries on a timer.
 */
export function SessionProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    dataSource: null,
    sourceError: null,
    user: null,
    friends: [],
    restaurants: [],
    dishes: [],
    cravings: [],
    activeMatch: null
  });

  // Read synchronously so the header never flashes the wrong area.
  const [location, setLocationState] = useState(readLocation);
  const [attempt, setAttempt] = useState(0);

  // React StrictMode invokes mount effects twice in development. Caching the
  // in-flight promise per attempt keeps that from doubling the boot requests.
  const inflight = useRef({ key: null, promise: null });

  useEffect(() => {
    let cancelled = false;

    // Keyed on the area too: choosing a new one refetches the feed exactly
    // once. Nothing else in the app triggers a catalog request.
    const key = attempt + '|' + location.latitude + ',' + location.longitude;
    if (inflight.current.key !== key) {
      setState((s) => ({ ...s, loading: true }));
      inflight.current = { key, promise: loadCatalog(location) };
    }

    inflight.current.promise.then(({ source, user, feed, friends, error }) => {
      if (cancelled) return;
      // Park the catalog so synchronous lookups elsewhere need no request.
      // `reference` keeps the curated restaurants resolvable by id even when
      // the deck is live provider data, so a dish can find its parent.
      setCatalog({
        restaurants: feed.restaurants,
        dishes: feed.dishes,
        reference: referenceRestaurants()
      });
      // Debug handle: the source name only, never any payload.
      if (typeof window !== 'undefined') window.__FOODMATCH_DATA_SOURCE__ = source;
      setState({
        loading: false,
        dataSource: source,
        sourceError: error,
        user,
        friends,
        ...feed
      });
    });

    return () => {
      cancelled = true;
    };
  }, [attempt, location]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** Changing the area persists it and refetches the feed once. */
  const setLocation = useCallback((next) => {
    const stored = toStoredLocation(next);
    if (!stored) return false;
    writeLocation(stored);
    setLocationState(stored);
    return true;
  }, []);

  const value = useMemo(() => {
    const people = state.user ? [state.user, ...state.friends] : state.friends;
    return {
      ...state,
      people,
      location,
      setLocation,
      reload,
      isLocalData: state.dataSource === SOURCE.LOCAL,
      getPerson: (id) => people.find((p) => p.id === id) || null
    };
  }, [state, location, setLocation, reload]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

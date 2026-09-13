import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadCatalog, SOURCE } from '../services/catalogSource';
import { setCatalog } from '../services/catalogStore';

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

  const [attempt, setAttempt] = useState(0);

  // React StrictMode invokes mount effects twice in development. Caching the
  // in-flight promise per attempt keeps that from doubling the boot requests.
  const inflight = useRef({ key: null, promise: null });

  useEffect(() => {
    let cancelled = false;

    if (inflight.current.key !== attempt) {
      setState((s) => ({ ...s, loading: true }));
      inflight.current = { key: attempt, promise: loadCatalog() };
    }

    inflight.current.promise.then(({ source, user, feed, friends, error }) => {
      if (cancelled) return;
      // Park the catalog so synchronous lookups elsewhere need no request.
      setCatalog({ restaurants: feed.restaurants, dishes: feed.dishes });
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
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(() => {
    const people = state.user ? [state.user, ...state.friends] : state.friends;
    return {
      ...state,
      people,
      reload,
      isLocalData: state.dataSource === SOURCE.LOCAL,
      getPerson: (id) => people.find((p) => p.id === id) || null
    };
  }, [state, reload]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

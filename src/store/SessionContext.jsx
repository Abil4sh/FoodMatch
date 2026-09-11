import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { setCatalog } from '../services/catalogStore';

const SessionContext = createContext(null);

/*
 * Boots the app from the Django API.
 *
 * Exactly three requests are made, once, on mount: the current user, the
 * catalog feed and the friends list. Nothing re-fetches on navigation, on
 * render, or on a swipe. `reload` exists only so the error state can offer a
 * manual retry — it is never called automatically, so a failing API cannot
 * turn into a retry loop.
 */
export function SessionProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    user: null,
    friends: [],
    restaurants: [],
    dishes: [],
    cravings: [],
    activeMatch: null
  });

  const [attempt, setAttempt] = useState(0);

  // React StrictMode invokes mount effects twice in development. Without this
  // guard the boot fetch fired six times instead of three. The in-flight
  // promise is cached per attempt so the second invocation reuses it rather
  // than issuing a fresh set of requests — the doubling would be trivial here
  // but unacceptable once a metered API sits behind this call.
  const inflight = useRef({ key: null, promise: null });

  useEffect(() => {
    let cancelled = false;

    if (inflight.current.key !== attempt) {
      setState((s) => ({ ...s, loading: true, error: null }));
      inflight.current = {
        key: attempt,
        promise: Promise.all([api.getMe(), api.getFeed(), api.getFriends()])
      };
    }

    inflight.current.promise
      .then(([user, feed, friends]) => {
        if (cancelled) return;
        // Park the catalog so synchronous lookups elsewhere need no request.
        setCatalog({ restaurants: feed.restaurants, dishes: feed.dishes });
        setState({ loading: false, error: null, user, friends, ...feed });
      })
      .catch((err) => {
        if (cancelled) return;
        // One failure, one error state. No automatic retry, ever.
        setState((s) => ({ ...s, loading: false, error: err?.message || 'Could not load FoodMatch.' }));
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

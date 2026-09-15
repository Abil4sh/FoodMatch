import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';

/*
 * The real group session.
 *
 * Everything here is server state. The backend owns membership, the deck, the
 * votes and the result; this store holds the participant token, mirrors what
 * the server reports, and sends intent. It never computes a match.
 *
 * There is no friend simulation in this file. The lobby and the waiting screen
 * reflect other people actually joining and swiping.
 *
 * Polling rather than WebSockets: a lobby refresh every few seconds is far
 * simpler to run and deploy than a socket layer, and the data is small. Polling
 * stops as soon as it has nothing left to learn — see `shouldPoll`.
 */

const STORAGE_KEY = 'foodmatch.session.v1';
const LOBBY_POLL_MS = 3000;
const SWIPE_POLL_MS = 5000;

const GroupContext = createContext(null);

export const GROUP_STATUS = { LOBBY: 'lobby', SWIPING: 'swiping', COMPLETED: 'completed' };
export const MEMBER_STATE = { JOINED: 'joined', SWIPING: 'swiping', FINISHED: 'finished' };

/** { code, token } for the group this browser belongs to. */
function readSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.code && parsed?.token ? { code: parsed.code, token: parsed.token } : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the session simply won't survive a refresh */
  }
}

export function GroupProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Refs so the polling effect doesn't restart on every state change.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const persist = useCallback((next) => {
    writeSession(next);
    setSession(next);
  }, []);

  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    try {
      const body = await api.getGroup(current.code, current.token);
      setGroup(body);
      setError(null);
      return body;
    } catch (err) {
      // A 404/410 means the group is gone; anything else is likely transient,
      // so the session is kept and the next poll can recover.
      if (err?.status === 404 || err?.status === 410) {
        persist(null);
        setGroup(null);
      }
      setError(err?.message || 'Could not reach the FoodMatch API.');
      return null;
    }
  }, [persist]);

  // Rehydrate on load so a refresh mid-session lands back in the right place.
  useEffect(() => {
    if (session) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Poll only while there is something to learn:
   *   - in the lobby, waiting for people to join and for the host to start
   *   - while swiping, waiting for everyone else to finish
   * Once the group is completed, polling stops entirely.
   */
  const shouldPoll = Boolean(session) && group?.status !== GROUP_STATUS.COMPLETED;
  const interval = group?.status === GROUP_STATUS.SWIPING ? SWIPE_POLL_MS : LOBBY_POLL_MS;

  useEffect(() => {
    if (!shouldPoll) return undefined;
    // Pause when the tab is hidden; a backgrounded lobby needs no updates.
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    };
    const timer = setInterval(tick, interval);
    return () => clearInterval(timer);
  }, [shouldPoll, interval, refresh]);

  const createGroup = useCallback(
    async ({ name, displayName, mode, location }) => {
      setBusy(true);
      setError(null);
      try {
        const body = await api.createGroup({
          name,
          displayName,
          mode,
          latitude: location?.latitude,
          longitude: location?.longitude,
          areaName: location?.name
        });
        persist({ code: body.group.code, token: body.participantToken });
        setGroup(body.group);
        return body.group;
      } catch (err) {
        setError(err?.message || 'Could not create the FoodMatch.');
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [persist]
  );

  const joinGroup = useCallback(
    async (code, displayName) => {
      setBusy(true);
      setError(null);
      const normalised = String(code || '').trim().toUpperCase();
      try {
        // Pass any existing token so rejoining from this device returns the
        // same identity rather than creating a duplicate participant.
        const existing = sessionRef.current;
        const body = await api.joinGroup(
          normalised,
          displayName,
          existing?.code === normalised ? existing.token : undefined
        );
        persist({ code: body.group.code, token: body.participantToken });
        setGroup(body.group);
        return body.group;
      } catch (err) {
        setError(err?.message || 'Could not join that FoodMatch.');
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [persist]
  );

  const startGroup = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    setBusy(true);
    try {
      const body = await api.startGroup(current.code, current.token);
      setGroup(body);
      return body;
    } catch (err) {
      setError(err?.message || 'Could not start the FoodMatch.');
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const loadDeck = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    return api.getGroupDeck(current.code, current.token);
  }, []);

  const vote = useCallback(async (cardId, direction) => {
    const current = sessionRef.current;
    if (!current) return null;
    return api.submitVote(current.code, current.token, cardId, direction);
  }, []);

  const finishSwiping = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    const body = await api.finishSwiping(current.code, current.token);
    setGroup(body);
    return body;
  }, []);

  const loadResults = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    return api.getGroupResults(current.code, current.token);
  }, []);

  const leaveGroup = useCallback(() => {
    persist(null);
    setGroup(null);
    setError(null);
  }, [persist]);

  const value = useMemo(() => {
    const participants = group?.participants || [];
    const you = group?.you || null;
    return {
      session,
      group,
      code: group?.code || session?.code || null,
      status: group?.status || null,
      participants,
      you,
      isHost: Boolean(you?.isHost),
      error,
      busy,
      everyoneFinished: Boolean(group?.everyoneFinished),
      readyToStart: participants.length >= 2,
      createGroup,
      joinGroup,
      startGroup,
      loadDeck,
      vote,
      finishSwiping,
      loadResults,
      leaveGroup,
      refresh
    };
  }, [
    session, group, error, busy,
    createGroup, joinGroup, startGroup, loadDeck, vote, finishSwiping, loadResults, leaveGroup, refresh
  ]);

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup must be used inside <GroupProvider>');
  return ctx;
}

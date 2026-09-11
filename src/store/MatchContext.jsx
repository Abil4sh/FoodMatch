import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

/*
 * The one source of truth for the group a user is currently assembling.
 * Everything is local for milestone 2 — no server, no sockets. The shape below
 * is deliberately close to what the Django API will hand back later, so
 * milestone 7 can swap the reducer's inputs without touching the screens.
 */

const STORAGE_KEY = 'foodmatch.match.v1';

export const PHASE = {
  IDLE: 'idle',
  INVITING: 'inviting',
  LOBBY: 'lobby',
  SWIPING: 'swiping',
  MATCHED: 'matched'
};

export const MEMBER = {
  HOST: 'host',
  INVITED: 'invited',
  JOINED: 'joined',
  READY: 'ready'
};

const MatchContext = createContext(null);

const initialState = { group: null };

/* ---------- id + code helpers ---------- */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

function randomCode(length = 4) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'match'
  );
}

/**
 * Minted before dispatch so the screen that creates a group already knows the
 * URL it is about to navigate to. CREATE_GROUP will mint its own if omitted.
 */
export function newGroupIdentity(name) {
  return {
    groupId: 'g_' + slugify(name) + '_' + randomCode(3).toLowerCase(),
    code: 'FM-' + randomCode(4)
  };
}

/* ---------- persistence ---------- */

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.groupId) return initialState;
    return { group: parsed };
  } catch {
    return initialState;
  }
}

function writeStored(group) {
  try {
    if (group) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(group));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota — the prototype still works, it just forgets on refresh */
  }
}

/* ---------- reducer ---------- */

function setStatus(members, id, status) {
  return members.map((m) => (m.id === id ? { ...m, status } : m));
}

export function matchReducer(state, action) {
  switch (action.type) {
    case 'CREATE_GROUP': {
      const { name, creator, preferences = [], budget, distance, area, groupId, code } = action.payload;
      const groupName = name.trim();
      const identity = groupId && code ? { groupId, code } : newGroupIdentity(groupName);
      return {
        group: {
          groupId: identity.groupId,
          groupName,
          code: identity.code,
          creator,
          members: [{ id: creator, status: MEMBER.HOST, joinedAt: Date.now() }],
          preferences,
          budget,
          distance,
          area,
          votes: {},
          finished: [],
          result: null,
          phase: PHASE.INVITING,
          createdAt: Date.now()
        }
      };
    }

    case 'INVITE': {
      if (!state.group) return state;
      const ids = action.payload.ids || [];
      const existing = state.group.members;
      const host = existing.filter((m) => m.status === MEMBER.HOST);
      // Keep the status of anyone already on the roster, drop anyone unticked,
      // add newly ticked friends as invited.
      const kept = ids.map((id) => {
        const prev = existing.find((m) => m.id === id);
        return prev || { id, status: MEMBER.INVITED, joinedAt: null };
      });
      return { group: { ...state.group, members: [...host, ...kept] } };
    }

    case 'MEMBER_JOINED': {
      if (!state.group) return state;
      const target = state.group.members.find((m) => m.id === action.payload.id);
      if (!target || target.status !== MEMBER.INVITED) return state;
      return {
        group: {
          ...state.group,
          members: state.group.members.map((m) =>
            m.id === action.payload.id ? { ...m, status: MEMBER.JOINED, joinedAt: Date.now() } : m
          )
        }
      };
    }

    case 'MEMBER_READY': {
      if (!state.group) return state;
      return { group: { ...state.group, members: setStatus(state.group.members, action.payload.id, MEMBER.READY) } };
    }

    case 'ENTER_LOBBY': {
      if (!state.group) return state;
      return { group: { ...state.group, phase: PHASE.LOBBY } };
    }

    case 'VOTE': {
      if (!state.group) return state;
      const { userId, cardId, dir } = action.payload;
      const votes = state.group.votes || {};
      return {
        group: {
          ...state.group,
          votes: { ...votes, [userId]: { ...(votes[userId] || {}), [cardId]: dir } }
        }
      };
    }

    case 'RESET_VOTES': {
      if (!state.group) return state;
      const votes = { ...(state.group.votes || {}) };
      delete votes[action.payload.userId];
      return { group: { ...state.group, votes } };
    }

    case 'MEMBER_FINISHED': {
      if (!state.group) return state;
      const finished = state.group.finished || [];
      if (finished.includes(action.payload.id)) return state;
      return { group: { ...state.group, finished: [...finished, action.payload.id] } };
    }

    case 'MERGE_VOTES': {
      if (!state.group) return state;
      const base = state.group.votes || {};
      const incoming = action.payload.votes || {};
      const merged = { ...base };
      Object.entries(incoming).forEach(([memberId, cardVotes]) => {
        merged[memberId] = { ...(merged[memberId] || {}), ...cardVotes };
      });
      return { group: { ...state.group, votes: merged } };
    }

    case 'COMPUTE_RESULT': {
      if (!state.group) return state;
      return {
        group: { ...state.group, result: action.payload.result, phase: PHASE.MATCHED }
      };
    }

    case 'START': {
      if (!state.group) return state;
      return { group: { ...state.group, phase: PHASE.SWIPING, startedAt: Date.now() } };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

/* ---------- provider ---------- */

export function MatchProvider({ children }) {
  const [state, dispatch] = useReducer(matchReducer, initialState, readStored);

  useEffect(() => {
    writeStored(state.group);
  }, [state.group]);

  const value = useMemo(() => {
    const group = state.group;
    const members = group?.members || [];
    const readyCount = members.filter((m) => m.status === MEMBER.READY || m.status === MEMBER.HOST).length;
    const pending = members.filter((m) => m.status === MEMBER.INVITED);

    return {
      group,
      members,
      readyCount,
      memberCount: members.length,
      everyoneReady: members.length > 1 && readyCount === members.length,
      pendingCount: pending.length,
      readyPct: members.length ? Math.round((readyCount / members.length) * 100) : 0,
      votes: group?.votes || {},
      votesOf: (userId) => (group?.votes || {})[userId] || {},
      finished: group?.finished || [],
      hasFinished: (id) => (group?.finished || []).includes(id),
      result: group?.result || null,
      hasMember: (id) => members.some((m) => m.id === id),
      statusOf: (id) => members.find((m) => m.id === id)?.status || null,
      dispatch,
      // thin action creators so screens never hand-write action objects
      createGroup: (payload) => dispatch({ type: 'CREATE_GROUP', payload }),
      invite: (ids) => dispatch({ type: 'INVITE', payload: { ids } }),
      memberJoined: (id) => dispatch({ type: 'MEMBER_JOINED', payload: { id } }),
      memberReady: (id) => dispatch({ type: 'MEMBER_READY', payload: { id } }),
      enterLobby: () => dispatch({ type: 'ENTER_LOBBY' }),
      vote: (userId, cardId, dir) => dispatch({ type: 'VOTE', payload: { userId, cardId, dir } }),
      resetVotes: (userId) => dispatch({ type: 'RESET_VOTES', payload: { userId } }),
      memberFinished: (id) => dispatch({ type: 'MEMBER_FINISHED', payload: { id } }),
      mergeVotes: (votesByMember) => dispatch({ type: 'MERGE_VOTES', payload: { votes: votesByMember } }),
      computeResult: (result) => dispatch({ type: 'COMPUTE_RESULT', payload: { result } }),
      start: () => dispatch({ type: 'START' }),
      reset: () => dispatch({ type: 'RESET' })
    };
  }, [state]);

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch() {
  const ctx = useContext(MatchContext);
  if (!ctx) throw new Error('useMatch must be used inside <MatchProvider>');
  return ctx;
}

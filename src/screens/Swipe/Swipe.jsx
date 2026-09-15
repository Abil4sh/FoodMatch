import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { SwipeCard } from '../../components/swipe/SwipeCard';
import { useSwipeDeck, LIKE } from '../../hooks/useSwipeDeck';
import { useGroup, GROUP_STATUS, MEMBER_STATE } from '../../store/GroupContext';
import { recordLike } from '../../services/likes';
import { DeckComplete } from './DeckComplete';
import s from './Swipe.module.css';

/*
 * Swiping against a real group session.
 *
 * The deck comes from the server and is identical for everyone in the group.
 * Each swipe is posted as a vote and the server is the record of truth; local
 * state only drives the animation. There is no friend simulation here.
 */
export default function Swipe() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const { group, code, status, participants, you, vote, loadDeck, finishSwiping, error } = useGroup();

  const [cards, setCards] = useState([]);
  const [serverVotes, setServerVotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [deckError, setDeckError] = useState(null);
  const finishedRef = useRef(false);

  // One fetch when the round starts. Nothing re-fetches on render or on swipe.
  useEffect(() => {
    if (!code || status === GROUP_STATUS.LOBBY) return;
    let alive = true;
    setLoading(true);
    loadDeck()
      .then((body) => {
        if (!alive || !body) return;
        setCards(body.cards || []);
        setServerVotes(body.yourVotes || {});
        setDeckError(null);
      })
      .catch((err) => alive && setDeckError(err?.message || 'Could not load the deck.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code, status, loadDeck]);

  // Votes already recorded server-side seed the deck position, so a refresh
  // resumes exactly where this participant left off.
  const [localVotes, setLocalVotes] = useState({});
  const votes = useMemo(() => ({ ...serverVotes, ...localVotes }), [serverVotes, localVotes]);

  const onVote = useCallback(
    (card, direction) => {
      setLocalVotes((prev) => ({ ...prev, [card.id]: direction }));
      // Personal trail for Food DNA; the authoritative vote is the server's.
      if (direction === LIKE) recordLike(card.id);
      // Fire and forget: the optimistic update keeps the gesture smooth, and a
      // failed vote is recoverable because the server rejects duplicates.
      vote(card.id, direction).catch(() => {});
    },
    [vote]
  );

  const { visibleCards, index, total, exhausted, lastDirection, swipe, swipeLeft, swipeRight } = useSwipeDeck({
    cards,
    votes,
    onVote
  });

  // Tell the server once, when this participant runs out of cards.
  useEffect(() => {
    if (!exhausted || finishedRef.current || !cards.length) return;
    finishedRef.current = true;
    finishSwiping().catch(() => {});
  }, [exhausted, cards.length, finishSwiping]);

  if (!code) return <Navigate to="/create" replace />;
  if (routeCode !== code) return <Navigate to={'/swipe/' + code} replace />;
  if (status === GROUP_STATUS.LOBBY) return <Navigate to={'/lobby/' + code} replace />;

  const likes = cards.filter((c) => votes[c.id] === LIKE).length;
  const others = participants.filter((p) => p.id !== you?.id);
  const everyoneFinished = Boolean(group?.everyoneFinished);

  if (loading) {
    return (
      <PhoneShell tabs={false}>
        <div className={s.screen}>
          <p className={s.loading}>Loading the deck…</p>
        </div>
      </PhoneShell>
    );
  }

  if (deckError || !cards.length) {
    return (
      <PhoneShell tabs={false}>
        <div className={s.screen}>
          <h1 className={s.loadingTitle}>No cards to swipe</h1>
          <p className={s.loading}>{deckError || 'This FoodMatch has an empty deck.'}</p>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell tabs={false}>
      <div className={s.screen}>
        <h1 className="srOnly">Swiping for {group?.name}</h1>
        <header className={s.head}>
          <button type="button" className={s.back} onClick={() => navigate('/lobby/' + code)} aria-label="Back to lobby">
            &lsaquo;
          </button>
          <span className={s.groupName}>{group?.name}</span>
          <span className={s.count} aria-live="polite" aria-label={index + ' of ' + total + ' swiped'}>
            {index}
            <span className={s.countTotal}> / {total}</span>
          </span>
        </header>

        {exhausted ? (
          <DeckComplete
            group={{ groupName: group?.name, groupId: code }}
            likes={likes}
            total={total}
            participants={others}
            everyoneFinished={everyoneFinished}
            onSeeMatch={() => navigate('/match/' + code)}
          />
        ) : (
          <>
            <div className={s.deck}>
              <AnimatePresence initial={false}>
                {visibleCards
                  .map((card, i) => (
                    <SwipeCard
                      key={card.id}
                      item={card}
                      depth={i}
                      interactive={i === 0}
                      exitDirection={lastDirection}
                      onSwipe={swipe}
                    />
                  ))
                  .reverse()}
              </AnimatePresence>
            </div>

            <div className={s.actions}>
              <button type="button" className={`${s.action} ${s.pass}`} onClick={swipeLeft} aria-label="Pass on this">
                <span className={s.glyphPass} aria-hidden="true" />
              </button>
              <button type="button" className={`${s.action} ${s.like}`} onClick={swipeRight} aria-label="Like this">
                <span className={s.glyphLike} aria-hidden="true" />
              </button>
            </div>

            <div className={s.groupStrip}>
              <div className={s.stripHead}>
                <span className={s.stripTitle}>Everyone is swiping</span>
                {error && <span className={s.stripNote}>Offline</span>}
              </div>
              <div className={s.you}>
                <span className={s.youLabel}>You</span>
                <div className={s.youBar}>
                  <MatchMeter value={total ? Math.round((index / total) * 100) : 0} label="Your progress" />
                </div>
                <span className={s.youCount}>
                  {index}/{total}
                </span>
              </div>
              <div className={s.others}>
                {others.map((p) => (
                  <span key={p.id} className={s.other}>
                    <span className={s.otherAvatar} aria-hidden="true">
                      {p.initials}
                    </span>
                    <span className={s.otherCount}>
                      {p.state === MEMBER_STATE.FINISHED ? 'done' : `${p.voted}/${p.deckSize || total}`}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PhoneShell>
  );
}

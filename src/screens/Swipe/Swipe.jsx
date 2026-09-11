import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { Segmented } from '../../components/primitives/Segmented';
import { Avatar } from '../../components/primitives/Avatar';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { SwipeCard } from '../../components/swipe/SwipeCard';
import { useSession } from '../../store/SessionContext';
import { useMatch } from '../../store/MatchContext';
import { useSwipeDeck, LIKE } from '../../hooks/useSwipeDeck';
import { useSimulatedProgress } from '../../hooks/useSimulatedProgress';
import { useMatchResult } from '../../hooks/useMatchResult';
import { buildDeck, DECK_MODES } from '../../services/deck';
import { DeckComplete } from './DeckComplete';
import s from './Swipe.module.css';

export default function Swipe() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user, getPerson } = useSession();
  const { group, members, votesOf, vote, memberFinished, result } = useMatch();
  const [mode, setMode] = useState('restaurants');

  const cards = useMemo(() => buildDeck(mode, group), [mode, group]);
  const myVotes = votesOf(user?.id);

  const { visibleCards, index, total, exhausted, lastDirection, swipe, swipeLeft, swipeRight } = useSwipeDeck({
    cards,
    votes: myVotes,
    onVote: (card, dir) => user && vote(user.id, card.id, dir)
  });

  const friends = members.map((m) => getPerson(m.id)).filter((p) => p && p.id !== user?.id);
  const { finalize } = useMatchResult({ cards, mode });
  const finalizedFor = useRef(null);

  const { progress, allFinished } = useSimulatedProgress({
    memberIds: friends.map((f) => f.id),
    total,
    rush: exhausted
  });

  // Record that this user is done, then close the round out once the rest of
  // the group has finished too.
  useEffect(() => {
    if (exhausted && user) memberFinished(user.id);
  }, [exhausted, user, memberFinished]);

  useEffect(() => {
    if (!exhausted || !allFinished) return;
    const key = (group?.groupId || '') + ':' + mode;
    if (finalizedFor.current === key) return;
    finalizedFor.current = key;
    finalize();
  }, [exhausted, allFinished, finalize, group, mode]);

  if (!group) return <Navigate to="/create" replace />;
  if (group.groupId !== groupId) return <Navigate to={'/swipe/' + group.groupId} replace />;

  const likes = cards.filter((c) => myVotes[c.id] === LIKE).length;
  const otherMode = DECK_MODES.find((m) => m.value !== mode);

  return (
    <PhoneShell tabs={false}>
      <div className={s.screen}>
        <h1 className="srOnly">Swiping for {group.groupName}</h1>
        <header className={s.head}>
          <button type="button" className={s.back} onClick={() => navigate('/lobby/' + group.groupId)} aria-label="Back to lobby">
            &lsaquo;
          </button>
          <span className={s.groupName}>{group.groupName}</span>
          <span className={s.count} aria-live="polite" aria-label={index + ' of ' + total + ' swiped'}>
            {index}
            <span className={s.countTotal}> / {total}</span>
          </span>
        </header>

        <div className={s.toggle}>
          <Segmented label="Swipe deck" options={DECK_MODES} value={mode} onChange={setMode} />
        </div>

        {exhausted ? (
          <DeckComplete
            group={group}
            likes={likes}
            total={total}
            friends={friends}
            progress={progress}
            allFinished={allFinished}
            onSwitchDeck={() => setMode(otherMode.value)}
            otherDeckLabel={otherMode.label}
            result={result}
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
                <span className={s.stripNote}>Friends simulated</span>
              </div>
              <div className={s.you}>
                <Avatar person={user} size={26} />
                <span className={s.youLabel}>You</span>
                <div className={s.youBar}>
                  <MatchMeter value={total ? Math.round((index / total) * 100) : 0} label="Your progress" />
                </div>
                <span className={s.youCount}>
                  {index}/{total}
                </span>
              </div>
              <div className={s.others}>
                {friends.map((f) => (
                  <span key={f.id} className={s.other}>
                    <Avatar person={f} size={22} />
                    <span className={s.otherCount}>
                      {progress[f.id] || 0}/{total}
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

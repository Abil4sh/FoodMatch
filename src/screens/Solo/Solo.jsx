import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { Button } from '../../components/primitives/Button';
import { Segmented } from '../../components/primitives/Segmented';
import { EmptyState } from '../../components/primitives/EmptyState';
import { SwipeCard } from '../../components/swipe/SwipeCard';
import { useSwipeDeck, LIKE } from '../../hooks/useSwipeDeck';
import { useSession } from '../../store/SessionContext';
import { allRestaurants, allDishes } from '../../services/catalog';
import { recordLike } from '../../services/likes';
import s from './Solo.module.css';

/*
 * Solo browsing.
 *
 * Deliberately group-free: no code, no participants, no backend session. It
 * exists so one person can open FoodMatch, pick an area and look through
 * restaurants or dishes without anyone else involved.
 *
 * Votes here are local only. Nothing is posted, because there is no group for
 * a vote to mean anything to — the payoff is the shortlist at the end.
 */
const MODES = [
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'dishes', label: 'Dishes' }
];

export default function Solo() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { location } = useSession();

  const mode = params.get('mode') === 'dishes' ? 'dishes' : 'restaurants';
  const [votes, setVotes] = useState({});

  const cards = useMemo(() => (mode === 'dishes' ? allDishes() : allRestaurants()), [mode]);

  const onVote = useCallback((card, direction) => {
    setVotes((prev) => ({ ...prev, [card.id]: direction }));
    if (direction === LIKE) recordLike(card.id);
  }, []);

  const { visibleCards, index, total, exhausted, lastDirection, swipe, swipeLeft, swipeRight } = useSwipeDeck({
    cards,
    votes,
    onVote
  });

  const liked = cards.filter((c) => votes[c.id] === LIKE);

  function setMode(next) {
    setParams(next === 'restaurants' ? {} : { mode: next }, { replace: true });
  }

  return (
    <PhoneShell tabs={false}>
      <div className={s.screen}>
        <h1 className="srOnly">Browsing {mode}</h1>
        <header className={s.head}>
          <button type="button" className={s.back} onClick={() => navigate('/')} aria-label="Back to discover">
            &lsaquo;
          </button>
          <span className={s.area}>{location?.name || 'Bengaluru'}</span>
          <span className={s.count} aria-live="polite">
            {index}
            <span className={s.countTotal}> / {total}</span>
          </span>
        </header>

        <div className={s.toggle}>
          <Segmented label="Browse" options={MODES} value={mode} onChange={setMode} />
        </div>

        {exhausted ? (
          <div className={s.done}>
            {liked.length > 0 ? (
              <>
                <h2 className={s.doneTitle}>Your shortlist</h2>
                <p className={s.doneBody}>
                  {liked.length} of {total} caught your eye. Open one, or start a FoodMatch to see what your friends
                  think.
                </p>
                <ul className={s.shortlist}>
                  {liked.slice(0, 6).map((card) => (
                    <li key={card.id}>
                      <button
                        type="button"
                        className={s.shortlistRow}
                        onClick={() => navigate('/restaurant/' + card.id)}
                      >
                        <span className={s.shortlistName}>{card.name}</span>
                        <span className={s.shortlistMeta}>
                          {card.type === 'dish' ? card.restaurantName : card.cuisines?.[0]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                mark="plate"
                title="Nothing caught your eye."
                body="Try the other mode, or a different area from Discover."
              />
            )}
            <div className={s.doneActions}>
              <Button onClick={() => navigate('/create')}>Start a FoodMatch with friends</Button>
              <Button variant="quiet" onClick={() => setVotes({})}>
                Swipe again
              </Button>
            </div>
          </div>
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

            <p className={s.soloNote}>Just browsing — nobody else sees these.</p>
          </>
        )}
      </div>
    </PhoneShell>
  );
}

import { motion, useReducedMotion } from 'framer-motion';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { Button } from '../../components/primitives/Button';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { WinnerCard } from '../../components/match/WinnerCard';
import { ResultRow } from '../../components/match/ResultRow';
import { useSession } from '../../store/SessionContext';
import { useMatch } from '../../store/MatchContext';
import { verdictFor } from '../../services/matchEngine';
import s from './Match.module.css';

/* Restrained celebration: a handful of shapes easing outward once, then gone. */
function Burst() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const shards = [
    [-120, -40, -18],
    [-70, -90, 12],
    [0, -110, -8],
    [72, -88, 16],
    [122, -36, -14],
    [-40, -104, 6],
    [46, -104, -10]
  ];
  return (
    <div className={s.burst} aria-hidden="true">
      {shards.map(([x, y, r], i) => (
        <motion.span
          key={i}
          className={s.shard}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
          animate={{ opacity: [0, 1, 0], x, y, scale: 1, rotate: r * 3 }}
          transition={{ delay: 0.18 + i * 0.035, duration: 1.1, ease: [0.16, 0.8, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

export default function Match() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { getPerson } = useSession();
  const { group, result, reset } = useMatch();
  // CSS reduced-motion only stops CSS transitions, not Framer's JS animations,
  // so the reveal has to opt out explicitly too.
  const reduced = useReducedMotion();

  if (!group) return <Navigate to="/create" replace />;
  if (group.groupId !== groupId) return <Navigate to={'/match/' + group.groupId} replace />;
  // Landed here before the round was closed out — send them back to finish.
  if (!result) return <Navigate to={'/swipe/' + group.groupId} replace />;

  const totalMembers = result.totalMembers;
  const winner = result.winner;
  const likedBy = (winner?.likedBy || []).map(getPerson).filter(Boolean);

  return (
    <PhoneShell tabs={false}>
      <div className={s.wrap}>
        <header className={s.head}>
          <button type="button" className={s.back} onClick={() => navigate('/')} aria-label="Back to discover">
            &lsaquo;
          </button>
          <span className={s.groupName}>{group.groupName}</span>
          <span className={s.spacer} />
        </header>

        {winner ? (
          <>
            <div className={s.hero}>
              <Burst />
              <motion.p
                className={s.eyebrow}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                You have a match
              </motion.p>
              <motion.h1
                className={s.verdict}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.07, duration: 0.45 }}
              >
                {verdictFor(winner, totalMembers)}
              </motion.h1>
            </div>

            <WinnerCard result={winner} people={likedBy} delay={0.14} onOpen={() => navigate('/restaurant/' + winner.cardId + '?from=match')} />

            {result.runnersUp?.length > 0 && (
              <section className={s.runners}>
                <SectionLabel>Also in the running</SectionLabel>
                <ul className={s.list}>
                  {result.runnersUp.map((r, i) => (
                    <ResultRow key={r.cardId} result={r} delay={0.45 + i * 0.07} onOpen={() => navigate('/restaurant/' + r.cardId + '?from=match')} />
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <div className={s.empty}>
            <span className={s.emptyMark} aria-hidden="true" />
            <h1 className={s.emptyTitle}>Nobody found a perfect match this time.</h1>
            <p className={s.emptyBody}>
              Everyone passed on {result.results?.length === 1 ? 'the only option' : 'all ' + (result.results?.length || 0) + ' options'}. Widen
              the budget or the distance and give it another go.
            </p>
          </div>
        )}

        <div className={s.actions}>
          <Button
            onClick={() => {
              reset();
              navigate('/create');
            }}
          >
            Start a new FoodMatch
          </Button>
          <Button variant="quiet" onClick={() => navigate('/swipe/' + group.groupId)}>
            Back to the deck
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { Button } from '../../components/primitives/Button';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { WinnerCard } from '../../components/match/WinnerCard';
import { ResultRow } from '../../components/match/ResultRow';
import { EmptyState } from '../../components/primitives/EmptyState';
import { useGroup } from '../../store/GroupContext';
import { saveHistoryEntry } from '../../services/history';
import s from './Match.module.css';

/* Restrained celebration: a handful of shapes easing outward once, then gone. */
function Burst() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const shards = [
    [-120, -40, -18], [-70, -90, 12], [0, -110, -8], [72, -88, 16],
    [122, -36, -14], [-40, -104, 6], [46, -104, -10]
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

/*
 * The reveal.
 *
 * Everything shown here was computed by the backend from stored votes. The
 * client does no scoring — it renders the server's ranking and its explanation.
 */
export default function Match() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { code, loadResults, leaveGroup } = useGroup();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!code) return undefined;
    let alive = true;
    setLoading(true);
    loadResults()
      .then((body) => {
        if (!alive) return;
        setResult(body);
        setError(null);
        // Record the outcome locally so Match history survives the session.
        saveHistoryEntry({
          groupId: body.code,
          groupName: body.name,
          mode: body.mode,
          at: Date.now(),
          totalMembers: body.totalParticipants,
          winner: body.winner
            ? {
                cardId: body.winner.cardId,
                name: body.winner.card?.name,
                percent: body.winner.percent,
                likes: body.winner.likes,
                likedBy: body.winner.likedByNames || []
              }
            : null
        });
      })
      .catch((err) => alive && setError(err?.message || 'Could not load the result.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code, loadResults]);

  if (!code) return <Navigate to="/create" replace />;
  if (routeCode !== code) return <Navigate to={'/match/' + code} replace />;

  if (loading) {
    return (
      <PhoneShell tabs={false}>
        <div className={s.wrap}>
          <p className={s.loading}>Working out the result…</p>
        </div>
      </PhoneShell>
    );
  }

  if (error) {
    return (
      <PhoneShell tabs={false}>
        <div className={s.wrap}>
          <EmptyState
            mark="missing"
            title="Couldn't load the result."
            body={error}
            action={<Button onClick={() => navigate('/')}>Back to Discover</Button>}
          />
        </div>
      </PhoneShell>
    );
  }

  const winner = result?.winner;
  const likedBy = (winner?.likedByNames || []).map((name, i) => ({
    id: `${name}-${i}`,
    name,
    initials: (name || '?').slice(0, 1).toUpperCase(),
    color: 'var(--av-' + ((i % 4) + 1) + ')'
  }));

  return (
    <PhoneShell tabs={false}>
      <div className={s.wrap}>
        <header className={s.head}>
          <button type="button" className={s.back} onClick={() => navigate('/')} aria-label="Back to discover">
            &lsaquo;
          </button>
          <span className={s.groupName}>{result?.name}</span>
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
                {result.headline}
              </motion.p>
              <motion.h1
                className={s.verdict}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.07, duration: 0.45 }}
              >
                {result.verdict}
              </motion.h1>
            </div>

            <WinnerCard
              result={{ ...winner, totalMembers: winner.votedBy }}
              people={likedBy}
              delay={0.14}
              onOpen={() => navigate('/restaurant/' + winner.cardId + '?from=match')}
            />

            {/* Names, not just avatars: the result should explain itself. */}
            {winner.likedByNames?.length > 0 && (
              <p className={s.likedBy}>
                Liked by {winner.likedByNames.join(', ')} &middot; {winner.likes} of {winner.votedBy} who voted
                {winner.votedBy < winner.totalParticipants
                  ? ` (${winner.totalParticipants} in the group)`
                  : ''}
              </p>
            )}

            {result.runnersUp?.length > 0 && (
              <section className={s.runners}>
                <SectionLabel>Also in the running</SectionLabel>
                <ul className={s.list}>
                  {result.runnersUp.map((r, i) => (
                    <ResultRow
                      key={r.cardId}
                      result={{ ...r, totalMembers: r.votedBy }}
                      delay={0.45 + i * 0.07}
                      onOpen={() => navigate('/restaurant/' + r.cardId + '?from=match')}
                    />
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
              Everyone passed on {result?.results?.length === 1 ? 'the only option' : `all ${result?.results?.length || 0} options`}.
              Try a different area, or switch between restaurants and dishes.
            </p>
          </div>
        )}

        <div className={s.actions}>
          <Button
            onClick={() => {
              leaveGroup();
              navigate('/create');
            }}
          >
            Start a new FoodMatch
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}

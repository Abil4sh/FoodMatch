import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Avatar } from '../../components/primitives/Avatar';
import { Button } from '../../components/primitives/Button';
import { Chip } from '../../components/primitives/Chip';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { EmptyState } from '../../components/primitives/EmptyState';
import { FoodDNA } from '../../components/profile/FoodDNA';
import { useSession } from '../../store/SessionContext';
import { useMatch } from '../../store/MatchContext';
import { readHistory } from '../../services/history';
import { likedCardIdsFor, computeFoodDNA, computeStats, summarise } from '../../services/profile';
import { findCardById } from '../../services/catalog';
import s from './Profile.module.css';

export default function Profile() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { group } = useMatch();

  const history = useMemo(() => readHistory(), []);
  const liked = useMemo(
    () => (user ? likedCardIdsFor(user.id, { group, history }).map(findCardById).filter(Boolean) : []),
    [user, group, history]
  );
  const dna = useMemo(() => computeFoodDNA(user?.foodDNA, liked), [user, liked]);
  const stats = useMemo(() => computeStats({ history, liked }), [history, liked]);

  if (loading || !user) {
    return (
      <PhoneShell header={<ScreenHeader eyebrow="You" title="Profile" />}>
        <div className={s.wrap} />
      </PhoneShell>
    );
  }

  const hasSignal = liked.length > 0;

  return (
    <PhoneShell header={<ScreenHeader eyebrow="You" title="Profile" />}>
      <div className={s.wrap}>
        <section className={s.identity}>
          <Avatar person={user} size={64} />
          <div className={s.who}>
            <h2 className={s.name}>{user.fullName || user.name}</h2>
            <p className={s.where}>
              {user.area} &middot; {user.city}
            </p>
          </div>
        </section>

        <p className={s.summary}>{summarise(stats, dna)}</p>

        <section className={s.stats}>
          <Stat label="Matches played" value={stats.matchesPlayed} />
          <Stat label="Matches found" value={stats.matchesFound} />
          <Stat label="Places liked" value={stats.placesLiked} />
        </section>

        <section className={s.block}>
          <div className={s.blockHead}>
            <SectionLabel>Food DNA</SectionLabel>
            <span className={s.note}>{hasSignal ? 'From what you swipe' : 'Starting profile'}</span>
          </div>
          {hasSignal ? (
            <FoodDNA dimensions={dna} />
          ) : (
            <EmptyState
              mark="spark"
              title="Your Food DNA is still blank."
              body="Finish one FoodMatch and this fills in from the places you liked."
              action={<Button onClick={() => navigate('/create')}>Start a FoodMatch</Button>}
            />
          )}
        </section>

        {user.foodDNA?.topCuisines?.length > 0 && (
          <section className={s.block}>
            <SectionLabel>Go-to cuisines</SectionLabel>
            <div className={s.chips}>
              {user.foodDNA.topCuisines.map((c) => (
                <Chip key={c} variant="ghost">
                  {c}
                </Chip>
              ))}
              {stats.favouriteCuisine && !user.foodDNA.topCuisines.includes(stats.favouriteCuisine) && (
                <Chip on>{stats.favouriteCuisine}</Chip>
              )}
            </div>
          </section>
        )}

        <div className={s.actions}>
          <Button variant="outline" onClick={() => navigate('/matches')}>
            Match history
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}

function Stat({ label, value }) {
  return (
    <div className={s.stat}>
      <span className={s.statValue}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  );
}

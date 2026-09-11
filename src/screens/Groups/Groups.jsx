import { useNavigate } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { AvatarStack } from '../../components/primitives/AvatarStack';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { EmptyState } from '../../components/primitives/EmptyState';
import { useSession } from '../../store/SessionContext';
import { useMatch, PHASE } from '../../store/MatchContext';
import s from './Groups.module.css';

const STAGE = {
  [PHASE.INVITING]: { label: 'Waiting on invites', cta: 'Invite friends', to: (g) => '/invite/' + g.groupId },
  [PHASE.LOBBY]: { label: 'In the lobby', cta: 'Back to the lobby', to: (g) => '/lobby/' + g.groupId },
  [PHASE.SWIPING]: { label: 'Swiping', cta: 'Continue swiping', to: (g) => '/swipe/' + g.groupId },
  [PHASE.MATCHED]: { label: 'Matched', cta: 'See your match', to: (g) => '/match/' + g.groupId }
};

export default function Groups() {
  const navigate = useNavigate();
  const { getPerson } = useSession();
  const { group, members, readyCount, readyPct } = useMatch();

  const stage = group ? STAGE[group.phase] || STAGE[PHASE.INVITING] : null;
  const people = members.map((m) => getPerson(m.id)).filter(Boolean);

  return (
    <PhoneShell header={<ScreenHeader eyebrow="Groups" title="Your FoodMatch" />}>
      <div className={s.wrap}>
        {group && stage ? (
          <>
            <div className={s.card}>
              <div className={s.top}>
                <div>
                  <SectionLabel tone="onInk">{stage.label}</SectionLabel>
                  <h2 className={s.name}>{group.groupName}</h2>
                  <p className={s.meta}>
                    {members.length} {members.length === 1 ? 'person' : 'people'} &middot; code {group.code}
                  </p>
                </div>
                <AvatarStack people={people} max={3} ring="ink" />
              </div>
              <MatchMeter value={readyPct} tone="ink" label="Group readiness" />
              <p className={s.metaSmall}>
                {readyCount} of {members.length} ready &middot; {group.area}
              </p>
            </div>

            <div className={s.actions}>
              <Button onClick={() => navigate(stage.to(group))}>{stage.cta}</Button>
              <Button variant="quiet" onClick={() => navigate('/create')}>
                Start a new FoodMatch
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            mark="plate"
            title="No group running."
            body="Start a FoodMatch, invite a few friends, and it will show up here until you have eaten."
            action={<Button onClick={() => navigate('/create')}>Start a FoodMatch</Button>}
            secondary={
              <Button variant="quiet" onClick={() => navigate('/matches')}>
                See past matches
              </Button>
            }
          />
        )}
      </div>
    </PhoneShell>
  );
}

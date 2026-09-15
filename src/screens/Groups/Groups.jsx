import { useNavigate } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { EmptyState } from '../../components/primitives/EmptyState';
import { useGroup, GROUP_STATUS } from '../../store/GroupContext';
import s from './Groups.module.css';

const STAGE = {
  [GROUP_STATUS.LOBBY]: { label: 'Waiting on invites', cta: 'Invite friends', to: (c) => '/invite/' + c },
  [GROUP_STATUS.SWIPING]: { label: 'Swiping', cta: 'Continue swiping', to: (c) => '/swipe/' + c },
  [GROUP_STATUS.COMPLETED]: { label: 'Matched', cta: 'See your match', to: (c) => '/match/' + c }
};

export default function Groups() {
  const navigate = useNavigate();
  const { group, code, participants, status } = useGroup();

  const stage = group ? STAGE[status] || STAGE[GROUP_STATUS.LOBBY] : null;
  const finished = participants.filter((p) => p.state === 'finished').length;
  const readyPct = participants.length ? Math.round((finished / participants.length) * 100) : 0;

  return (
    <PhoneShell header={<ScreenHeader eyebrow="Groups" title="Your FoodMatch" />}>
      <div className={s.wrap}>
        {group && stage ? (
          <>
            <div className={s.card}>
              <div className={s.top}>
                <div>
                  <SectionLabel tone="onInk">{stage.label}</SectionLabel>
                  <h2 className={s.name}>{group.name}</h2>
                  <p className={s.meta}>
                    {participants.length} {participants.length === 1 ? 'person' : 'people'} &middot; code {group.code}
                  </p>
                </div>

              </div>
              <MatchMeter value={readyPct} tone="ink" label="Group readiness" />
              <p className={s.metaSmall}>
                {finished} of {participants.length} finished &middot; {group.area?.name || ''}
              </p>
            </div>

            <div className={s.actions}>
              <Button onClick={() => navigate(stage.to(code))}>{stage.cta}</Button>
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

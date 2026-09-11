import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { Chip } from '../../components/primitives/Chip';
import { AvatarStack } from '../../components/primitives/AvatarStack';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { LivePulse } from '../../components/primitives/LivePulse';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { MemberRow } from '../../components/cards/MemberRow';
import { useSession } from '../../store/SessionContext';
import { useMatch, MEMBER } from '../../store/MatchContext';
import { useSimulatedFriends } from '../../hooks/useSimulatedFriends';
import options from '../../data/matchOptions.json';
import s from './Lobby.module.css';

export default function Lobby() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { getPerson } = useSession();
  const { group, members, readyCount, readyPct, everyoneReady, memberJoined, memberReady, start } = useMatch();

  // Anyone still on an unopened invite keeps drifting in, then settles to ready.
  useSimulatedFriends({ members, from: MEMBER.INVITED, advance: memberJoined, baseDelay: 1500, stagger: 1200 });
  useSimulatedFriends({ members, from: MEMBER.JOINED, advance: memberReady, baseDelay: 2400, stagger: 1400 });

  if (!group) return <Navigate to="/create" replace />;
  if (group.groupId !== groupId) return <Navigate to={'/lobby/' + group.groupId} replace />;

  const people = members.map((m) => ({ ...m, person: getPerson(m.id) })).filter((m) => m.person);
  const waitingOn = people.filter((m) => m.status !== MEMBER.READY && m.status !== MEMBER.HOST);
  const budgetLabel = options.budgets.find((b) => b.value === group.budget)?.label || '\u20B9' + group.budget;
  const preferenceLabels = group.preferences
    .map((id) => options.cuisines.find((c) => c.id === id)?.label)
    .filter(Boolean);

  function handleStart() {
    start();
    navigate('/swipe/' + group.groupId);
  }

  return (
    <PhoneShell
      header={<ScreenHeader eyebrow="Step 3 of 3" title="Lobby" />}
      footer={
        <div className={s.footer}>
          <Button onClick={handleStart} disabled={!everyoneReady}>
            {everyoneReady ? 'Start swiping' : 'Waiting for ' + (waitingOn[0]?.person.name || 'friends') + '\u2026'}
          </Button>
          {!everyoneReady && readyCount >= 2 && (
            <button type="button" className={s.skip} onClick={handleStart}>
              Start without everyone
            </button>
          )}
        </div>
      }
    >
      <div className={s.wrap}>
        <div className={s.hero}>
          <div className={s.heroTop}>
            <div>
              <div className={s.tag}>
                <LivePulse />
                <span className={s.tagText}>{everyoneReady ? "Everyone's ready" : 'Waiting room'}</span>
              </div>
              <h1 className={s.name}>{group.groupName}</h1>
              <p className={s.sub}>
                {readyCount} of {members.length} ready &middot; {group.area}
              </p>
            </div>
            <AvatarStack people={people.map((m) => m.person)} max={3} ring="ink" />
          </div>
          <MatchMeter value={readyPct} tone="ink" label="Group readiness" />
        </div>

        <section className={s.block}>
          <SectionLabel>In this match</SectionLabel>
          <ul className={s.list}>
            {people.map((m) => (
              <li key={m.id}>
                <MemberRow
                  person={m.person}
                  status={m.status}
                  hint={m.id === group.creator ? 'Started this match' : m.person.area}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className={s.block}>
          <SectionLabel>Group settings</SectionLabel>
          <div className={s.settings}>
            <div className={s.chips}>
              {preferenceLabels.map((label) => (
                <Chip key={label} variant="ghost">
                  {label}
                </Chip>
              ))}
            </div>
            <div className={s.facts}>
              <div className={s.fact}>
                <span className={s.factLabel}>Budget</span>
                <span className={s.factValue}>{budgetLabel} per head</span>
              </div>
              <div className={s.fact}>
                <span className={s.factLabel}>Distance</span>
                <span className={s.factValue}>Within {group.distance} km</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PhoneShell>
  );
}

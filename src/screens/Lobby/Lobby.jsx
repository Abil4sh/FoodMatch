import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { LivePulse } from '../../components/primitives/LivePulse';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { useGroup, GROUP_STATUS, MEMBER_STATE } from '../../store/GroupContext';
import s from './Lobby.module.css';

const STATE_COPY = {
  [MEMBER_STATE.JOINED]: 'Joined',
  [MEMBER_STATE.SWIPING]: 'Swiping',
  [MEMBER_STATE.FINISHED]: 'Finished'
};

export default function Lobby() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const { group, code, participants, isHost, status, startGroup, busy, error } = useGroup();

  if (!code) return <Navigate to="/create" replace />;
  if (routeCode !== code) return <Navigate to={'/lobby/' + code} replace />;

  const started = status === GROUP_STATUS.SWIPING || status === GROUP_STATUS.COMPLETED;
  const enoughPeople = participants.length >= 2;
  const finished = participants.filter((p) => p.state === MEMBER_STATE.FINISHED).length;
  const progressPct = participants.length ? Math.round((finished / participants.length) * 100) : 0;

  async function start() {
    try {
      await startGroup();
      navigate('/swipe/' + code);
    } catch {
      /* surfaced below */
    }
  }

  return (
    <PhoneShell
      header={<ScreenHeader eyebrow="Step 3 of 3" title="Lobby" />}
      footer={
        <div className={s.footer}>
          {error && (
            <p className={s.errorNote} role="alert">
              {error}
            </p>
          )}
          {started ? (
            <Button onClick={() => navigate('/swipe/' + code)}>Start swiping</Button>
          ) : isHost ? (
            <Button onClick={start} disabled={!enoughPeople || busy}>
              {busy ? 'Starting\u2026' : enoughPeople ? 'Start swiping' : 'Waiting for someone to join'}
            </Button>
          ) : (
            <Button disabled>Waiting for the host to start</Button>
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
                <span className={s.tagText}>{started ? 'Swiping' : 'Waiting room'}</span>
              </div>
              <h1 className={s.name}>{group?.name}</h1>
              <p className={s.sub}>
                {participants.length} {participants.length === 1 ? 'person' : 'people'} &middot; code {code}
              </p>
            </div>
          </div>
          <MatchMeter value={progressPct} tone="ink" label="Group progress" />
        </div>

        <section className={s.block}>
          <SectionLabel>In this match</SectionLabel>
          {/* Live states straight from the backend: nobody here is simulated. */}
          <ul className={s.list}>
            {participants.map((person) => (
              <li key={person.id} className={s.person}>
                <span className={s.avatar} aria-hidden="true">
                  {person.initials}
                </span>
                <span className={s.personText}>
                  <span className={s.personName}>{person.displayName}</span>
                  <span className={s.personMeta}>
                    {person.isHost ? 'Host' : 'Guest'}
                    {person.deckSize ? ` \u00B7 ${person.voted}/${person.deckSize} swiped` : ''}
                  </span>
                </span>
                <span className={s.statePill}>{STATE_COPY[person.state] || person.state}</span>
              </li>
            ))}
          </ul>
        </section>

        {group?.area?.name && (
          <section className={s.block}>
            <SectionLabel>Where</SectionLabel>
            <p className={s.where}>{group.area.name}</p>
          </section>
        )}
      </div>
    </PhoneShell>
  );
}

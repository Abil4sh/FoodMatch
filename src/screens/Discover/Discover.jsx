import { useNavigate } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { Button } from '../../components/primitives/Button';
import { AvatarStack } from '../../components/primitives/AvatarStack';
import { Avatar } from '../../components/primitives/Avatar';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { FoodPhoto } from '../../components/swipe/FoodPhoto';
import { LivePulse } from '../../components/primitives/LivePulse';
import { SectionLabel, SectionHead } from '../../components/primitives/SectionLabel';
import { RestaurantRow } from '../../components/cards/RestaurantRow';
import { useSession } from '../../store/SessionContext';
import { useMatch, PHASE } from '../../store/MatchContext';
import s from './Discover.module.css';

export default function Discover() {
  const navigate = useNavigate();
  const { loading, user, activeMatch, restaurants, cravings, getPerson, isLocalData } = useSession();
  const { group, members: groupMembers, readyCount, readyPct } = useMatch();

  // A group the user built in this session outranks the seeded demo match.
  const groupPeople = groupMembers.map((m) => getPerson(m.id)).filter(Boolean);
  const resume =
    group?.phase === PHASE.MATCHED
      ? { label: 'See your match', to: '/match/' + group.groupId }
      : group?.phase === PHASE.SWIPING
      ? { label: 'Continue swiping', to: '/swipe/' + group.groupId }
      : group?.phase === PHASE.LOBBY
        ? { label: 'Back to the lobby', to: '/lobby/' + group.groupId }
        : { label: 'Invite friends', to: '/invite/' + (group?.groupId || '') };

  const members = (activeMatch?.memberIds || []).map(getPerson).filter(Boolean);
  const others = members.filter((m) => m.id !== user?.id);
  const progress = activeMatch ? Math.round((activeMatch.swipedCount / activeMatch.memberIds.length) * 100) : 0;
  const nearby = restaurants.slice(0, 4);

  return (
    <PhoneShell>
      <h1 className="srOnly">Discover</h1>
      {isLocalData && (
        <p className={s.offlineNote} role="status">
          Showing bundled sample data &mdash; the FoodMatch API isn&rsquo;t running.
        </p>
      )}
      <div className={s.wrap}>
        <div className={s.top}>
          <div className={s.place}>
            <span className={s.placeLabel}>Delivering to</span>
            <span className={s.placeName}>{user?.area || 'Bengaluru'} &#9662;</span>
          </div>
          <button type="button" onClick={() => navigate('/profile')} aria-label="Your profile">
            <Avatar person={user} size={42} />
          </button>
        </div>

        <div className={s.section}>
          {loading && <div className={s.skeleton} />}

          {!loading && group && (
            <div className={s.live}>
              <div className={s.liveTop}>
                <div>
                  <div className={s.liveTag}>
                    <LivePulse />
                    <span className={s.liveTagText}>Your match</span>
                  </div>
                  <div className={s.liveName}>{group.groupName}</div>
                  <div className={s.liveSub}>
                    {readyCount} of {groupMembers.length} ready &middot; code {group.code}
                  </div>
                </div>
                <AvatarStack people={groupPeople} max={3} ring="ink" />
              </div>
              <MatchMeter value={readyPct} tone="ink" label="Group readiness" />
              <Button onClick={() => navigate(resume.to)}>{resume.label}</Button>
            </div>
          )}

          {!loading && !group && activeMatch && (
            <div className={s.live}>
              <div className={s.liveTop}>
                <div>
                  <div className={s.liveTag}>
                    <LivePulse />
                    <span className={s.liveTagText}>Live now</span>
                  </div>
                  <div className={s.liveName}>{activeMatch.name}</div>
                  <div className={s.liveSub}>
                    {activeMatch.swipedCount} of {activeMatch.memberIds.length} friends have swiped
                  </div>
                </div>
                <AvatarStack people={others} max={3} ring="ink" />
              </div>
              <MatchMeter value={progress} tone="ink" label="Group swipe progress" />
              <Button onClick={() => navigate('/swipe/' + activeMatch.id)}>
                Continue swiping &middot; {activeMatch.deckRemaining} left
              </Button>
            </div>
          )}

          {!loading && !group && !activeMatch && (
            <div className={s.empty}>
              <SectionLabel>No group running</SectionLabel>
              <p className={s.emptyTitle}>Start a FoodMatch</p>
              <Button onClick={() => navigate('/create')}>Create a FoodMatch</Button>
            </div>
          )}

          {!loading && (group || activeMatch) && (
            <Button variant="quiet" onClick={() => navigate('/create')}>
              Start a new FoodMatch
            </Button>
          )}
        </div>

        <div className={s.section}>
          <SectionHead title="Craving something?" />
          <SectionLabel style={{ marginTop: -6 }}>Tap to start a group</SectionLabel>
          <div className={s.cravings}>
            {cravings.map((c) => (
              <button
                key={c.id}
                type="button"
                className={s.craving}
                onClick={() => navigate('/create?craving=' + encodeURIComponent(c.cuisine))}
              >
                <FoodPhoto item={{ id: c.id, cuisines: [c.cuisine], photoLabel: c.label }} className={s.cravingPhoto} />
                <span className={s.cravingName}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={s.section + ' ' + s.last}>
          <SectionHead title="Matched near you" action="See all" onAction={() => navigate('/matches')} />
          <div className={s.list}>
            {loading && [0, 1, 2].map((k) => <div key={k} className={s.skeleton} />)}
            {nearby.map((r) => (
              <RestaurantRow key={r.id} restaurant={r} onClick={() => navigate('/restaurant/' + r.id)} />
            ))}
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

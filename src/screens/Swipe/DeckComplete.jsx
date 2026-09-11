import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/primitives/Button';
import { LivePulse } from '../../components/primitives/LivePulse';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { Avatar } from '../../components/primitives/Avatar';
import s from './DeckComplete.module.css';

export function DeckComplete({ group, likes, total, friends, progress, allFinished, onSwitchDeck, otherDeckLabel, result }) {
  const navigate = useNavigate();

  return (
    <div className={s.wrap}>
      <div className={s.badge} aria-hidden="true">
        <span className={s.badgeInner}>{likes}</span>
      </div>

      <h1 className={s.title}>That&rsquo;s your lot</h1>
      <p className={s.body}>
        You liked {likes} of {total} for {group.groupName}.{' '}
        {allFinished ? 'Everyone has finished swiping.' : 'Hang tight while the others finish.'}
      </p>

      <div className={s.friends}>
        <div className={s.friendsHead}>
          <LivePulse />
          <span className={s.friendsLabel}>{allFinished ? 'Group is done' : 'Still swiping'}</span>
          <span className={s.friendsNote}>Friends simulated</span>
        </div>
        {friends.map((f) => {
          const done = progress[f.id] || 0;
          return (
            <div key={f.id} className={s.friend}>
              <Avatar person={f} size={30} />
              <div className={s.friendBar}>
                <MatchMeter value={Math.round((done / total) * 100)} label={f.name + ' progress'} />
              </div>
              <span className={s.friendCount}>
                {done}/{total}
              </span>
            </div>
          );
        })}
      </div>

      <div className={s.actions}>
        <Button onClick={() => navigate('/match/' + group.groupId)} disabled={!allFinished || !result}>
          {allFinished && result ? 'See what you matched on' : 'Waiting for the group\u2026'}
        </Button>
        <Button variant="quiet" onClick={onSwitchDeck}>
          Swipe {otherDeckLabel.toLowerCase()} while you wait
        </Button>
      </div>
    </div>
  );
}

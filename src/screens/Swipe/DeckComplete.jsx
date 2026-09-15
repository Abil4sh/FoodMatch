import { Button } from '../../components/primitives/Button';
import { LivePulse } from '../../components/primitives/LivePulse';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { MEMBER_STATE } from '../../store/GroupContext';
import s from './DeckComplete.module.css';

/**
 * Shown when this participant runs out of cards.
 *
 * The waiting state reflects real people: the reveal unlocks only once the
 * server reports that everyone has finished.
 */
export function DeckComplete({ group, likes, total, participants = [], everyoneFinished, onSeeMatch }) {
  return (
    <div className={s.wrap}>
      <div className={s.badge} aria-hidden="true">
        <span className={s.badgeInner}>{likes}</span>
      </div>

      <h1 className={s.title}>That&rsquo;s your lot</h1>
      <p className={s.body}>
        You liked {likes} of {total} for {group.groupName}.{' '}
        {everyoneFinished ? 'Everyone has finished swiping.' : 'Hang tight while the others finish.'}
      </p>

      {participants.length > 0 && (
        <div className={s.friends}>
          <div className={s.friendsHead}>
            <LivePulse />
            <span className={s.friendsLabel}>{everyoneFinished ? 'Group is done' : 'Still swiping'}</span>
          </div>
          {participants.map((person) => {
            const done = person.state === MEMBER_STATE.FINISHED;
            const deckSize = person.deckSize || total || 1;
            return (
              <div key={person.id} className={s.friend}>
                <span className={s.friendAvatar} aria-hidden="true">
                  {person.initials}
                </span>
                <div className={s.friendBar}>
                  <MatchMeter
                    value={done ? 100 : Math.round((person.voted / deckSize) * 100)}
                    label={person.displayName + ' progress'}
                  />
                </div>
                <span className={s.friendCount}>{done ? 'done' : `${person.voted}/${deckSize}`}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className={s.actions}>
        <Button onClick={onSeeMatch} disabled={!everyoneFinished}>
          {everyoneFinished ? 'See what you matched on' : 'Waiting for the group\u2026'}
        </Button>
      </div>
    </div>
  );
}

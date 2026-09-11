import { Avatar } from '../primitives/Avatar';
import { cx } from '../primitives/cx';
import { MEMBER } from '../../store/MatchContext';
import s from './MemberRow.module.css';

const COPY = {
  [MEMBER.HOST]: 'Host',
  [MEMBER.INVITED]: 'Invited',
  [MEMBER.JOINED]: 'Joined',
  [MEMBER.READY]: 'Ready'
};

export function StatusPill({ status, tone }) {
  if (!status) return null;
  return (
    <span className={cx(s.pill, s[status], tone === 'ink' && s.pillOnInk)}>
      {status === MEMBER.READY && <span className={s.tick} aria-hidden="true" />}
      {COPY[status]}
    </span>
  );
}

/**
 * One person in a group list. Renders as a button when onClick is given
 * (invite screen), and as a plain row otherwise (lobby).
 */
export function MemberRow({ person, status, tone = 'light', selected, onClick, hint, trailing }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={cx(s.row, tone === 'ink' && s.ink, onClick && s.tappable, selected && s.selected)}
      onClick={onClick}
      aria-pressed={onClick ? Boolean(selected) : undefined}
    >
      <Avatar person={person} size={40} />
      <span className={s.text}>
        <span className={s.name}>{person?.name}</span>
        <span className={s.sub}>{hint || person?.area}</span>
      </span>
      <span className={s.trail}>{trailing || <StatusPill status={status} tone={tone} />}</span>
    </Tag>
  );
}

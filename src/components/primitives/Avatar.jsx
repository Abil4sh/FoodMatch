import { cx } from './cx';
import s from './Avatar.module.css';

export function Avatar({ person, size = 42, ring, style, className, ...rest }) {
  const initials = person?.initials || person?.name?.slice(0, 1) || '?';
  // "var(--av-1)" -> "var(--av-1-fg)", so each avatar carries a readable
  // initial without hardcoding white on every background.
  const fg = person?.color?.startsWith('var(') ? person.color.replace(/\)$/, '-fg)') : null;
  return (
    <span
      className={cx(s.avatar, ring === 'cream' && s.ring, ring === 'ink' && s.ringInk, className)}
      style={{
        width: size,
        height: size,
        background: person?.color || 'var(--cream-2)',
        color: fg || undefined,
        fontSize: Math.round(size * 0.36),
        ...style
      }}
      title={person?.fullName || person?.name}
      {...rest}
    >
      {initials}
    </span>
  );
}

import { Avatar } from './Avatar';
import { cx } from './cx';
import s from './AvatarStack.module.css';

export function AvatarStack({ people = [], max = 4, size = 34, ring = 'cream', className }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const border = ring === 'ink' ? '2px solid var(--ink)' : '2px solid var(--cream)';
  return (
    <div className={cx(s.stack, className)}>
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size={size} ring={ring} />
      ))}
      {rest > 0 && (
        <span
          className={s.more}
          style={{
            width: size,
            height: size,
            marginLeft: -10,
            background: ring === 'ink' ? 'var(--ink-2)' : 'var(--cream-2)',
            color: ring === 'ink' ? 'var(--on-ink-2)' : 'var(--muted)',
            border,
            fontSize: Math.round(size * 0.32)
          }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

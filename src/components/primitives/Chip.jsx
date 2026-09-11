import { cx } from './cx';
import s from './Chip.module.css';

export function Chip({ on = false, variant, as, children, ...rest }) {
  const Tag = as || (rest.onClick ? 'button' : 'span');
  return (
    <Tag
      className={cx(s.chip, on && s.on, variant === 'ghost' && s.ghost, rest.onClick && s.selectable)}
      aria-pressed={rest.onClick ? on : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

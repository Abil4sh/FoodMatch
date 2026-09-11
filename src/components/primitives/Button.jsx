import { cx } from './cx';
import s from './Button.module.css';

export function Button({ variant = 'primary', size, full = true, as = 'button', className, ...rest }) {
  const Tag = as;
  return (
    <Tag
      className={cx(s.btn, s[variant], size === 'sm' && s.sm, !full && s.auto, className)}
      {...rest}
    />
  );
}

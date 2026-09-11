import { cx } from './cx';
import s from './SectionLabel.module.css';

export function SectionLabel({ tone, children, className, ...rest }) {
  return (
    <span className={cx(s.label, tone && s[tone], className)} {...rest}>
      {children}
    </span>
  );
}

export function SectionHead({ title, action, onAction }) {
  return (
    <div className={s.row}>
      <h2 className={s.headTitle}>{title}</h2>
      {action && (
        <button type="button" className={cx(s.label, s.accent)} onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

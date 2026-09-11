import { cx } from './cx';
import s from './MatchMeter.module.css';

export function MatchMeter({ value = 0, tone, label, className }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cx(s.track, tone === 'ink' && s.onInk, className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || 'Group match'}
    >
      <div className={s.fill} style={{ width: pct + '%' }} />
    </div>
  );
}

import { cx } from './cx';
import s from './StatusBar.module.css';

export function StatusBar({ tone = 'light' }) {
  return (
    <div className={cx(s.bar, tone === 'dark' && s.dark)} aria-hidden="true">
      <span>9:41</span>
      <span className={s.icons}>
        <span className={s.batt} />
        <span className={s.tip} />
      </span>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { cx } from '../primitives/cx';
import s from './ScreenHeader.module.css';

export function ScreenHeader({ eyebrow, title, back = true, tone = 'light', right }) {
  const navigate = useNavigate();
  return (
    <div className={cx(s.head, tone === 'ink' && s.ink)}>
      {back && (
        <button type="button" className={s.back} onClick={() => navigate(-1)} aria-label="Go back">
          &lsaquo;
        </button>
      )}
      <div className={s.text}>
        {eyebrow && <span className={s.eyebrow}>{eyebrow}</span>}
        <h1 className={s.title}>{title}</h1>
      </div>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}

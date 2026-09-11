import s from './LivePulse.module.css';

export function LivePulse({ size = 8 }) {
  return (
    <span className={s.wrap} style={{ width: size, height: size }} aria-hidden="true">
      <span className={s.dot} />
      <span className={s.ping} />
    </span>
  );
}

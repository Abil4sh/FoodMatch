import { cx } from './cx';
import s from './Segmented.module.css';

export function Segmented({ options = [], value, onChange, className, label }) {
  return (
    <div className={cx(s.wrap, className)} role="tablist" aria-label={label}>
      {options.map((opt) => {
        const key = opt.value ?? opt;
        const text = opt.label ?? opt;
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            className={cx(s.seg, on && s.on)}
            onClick={() => onChange && onChange(key)}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

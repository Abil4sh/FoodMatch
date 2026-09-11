import { MatchMeter } from '../primitives/MatchMeter';
import s from './FoodDNA.module.css';

/**
 * Deliberately a set of labelled bars rather than a radar chart: every value is
 * a counted rule, and the display should look as legible as the rule is.
 */
export function FoodDNA({ dimensions = [] }) {
  const sorted = [...dimensions].sort((a, b) => b.value - a.value);
  return (
    <ul className={s.list}>
      {sorted.map((d) => (
        <li key={d.id} className={s.row}>
          <span className={s.label}>{d.label}</span>
          <span className={s.bar}>
            <MatchMeter value={d.value} label={d.label + ' preference'} />
          </span>
          <span className={s.value}>{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

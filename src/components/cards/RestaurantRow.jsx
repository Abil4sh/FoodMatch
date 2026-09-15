import { FoodPhoto } from '../swipe/FoodPhoto';
import { formatINR } from '../../services/api';
import { has, factList } from '../../services/fields';
import { menuFor } from '../../services/catalog';
import s from './RestaurantRow.module.css';

export function RestaurantRow({ restaurant, onClick }) {
  const r = restaurant;
  // A live provider supplies no rating or price, so each fact is rendered only
  // when it exists rather than showing a fabricated zero.
  const subParts = factList(r.cuisines?.[0], r.area, has(r.distanceKm) ? r.distanceKm + ' km' : null);
  // Two representative dishes, enough to make the row feel like food rather
  // than a directory entry. Empty when we hold no curated menu.
  const dishes = menuFor(r.id).slice(0, 2);
  const spend = has(r.typicalSpendMin)
    ? `\u20B9${r.typicalSpendMin}\u2013\u20B9${r.typicalSpendMax} pp`
    : null;
  return (
    <button type="button" className={s.row} onClick={onClick}>
      <FoodPhoto item={r} className={s.photo} />
      <span className={s.meta}>
        <span className={s.name}>{r.name}</span>
        <span className={s.sub}>{subParts.join(' \u00B7 ')}</span>
        {(has(r.rating) || spend || has(r.priceForTwo)) && (
          <span className={s.facts}>
            {has(r.rating) && <span className={s.rating}>{r.rating}</span>}
            {spend ? (
              <span className={s.price}>{spend}</span>
            ) : (
              has(r.priceForTwo) && <span className={s.price}>{formatINR(r.priceForTwo)} FOR TWO</span>
            )}
          </span>
        )}
        {dishes.length > 0 && (
          <span className={s.dishes}>
            {dishes.map((d) => `${d.name} \u20B9${d.price}`).join('  \u00B7  ')}
          </span>
        )}
      </span>
      {has(r.groupMatchPct) && <span className={s.pct}>{r.groupMatchPct}%</span>}
    </button>
  );
}

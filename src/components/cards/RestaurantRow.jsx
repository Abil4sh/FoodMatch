import { FoodPhoto } from '../swipe/FoodPhoto';
import { formatINR } from '../../services/api';
import s from './RestaurantRow.module.css';

export function RestaurantRow({ restaurant, onClick }) {
  const r = restaurant;
  return (
    <button type="button" className={s.row} onClick={onClick}>
      <FoodPhoto item={r} className={s.photo} />
      <span className={s.meta}>
        <span className={s.name}>{r.name}</span>
        <span className={s.sub}>
          {r.cuisines[0]} &middot; {r.area} &middot; {r.distanceKm} km
        </span>
        <span className={s.facts}>
          <span className={s.rating}>{r.rating}</span>
          <span className={s.price}>{formatINR(r.priceForTwo)} FOR TWO</span>
        </span>
      </span>
      <span className={s.pct}>{r.groupMatchPct}%</span>
    </button>
  );
}

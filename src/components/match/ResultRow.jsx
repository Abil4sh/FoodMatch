import { motion, useReducedMotion } from 'framer-motion';
import { FoodPhoto } from '../swipe/FoodPhoto';
import { MatchMeter } from '../primitives/MatchMeter';
import s from './ResultRow.module.css';

export function ResultRow({ result, delay = 0, onOpen }) {
  const totalMembers = result.totalMembers;
  const reduced = useReducedMotion();
  const card = result.card;
  const isDish = card.type === 'dish';

  return (
    <motion.li
      className={s.row}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => onOpen && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.36, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <FoodPhoto item={card} className={s.thumb} />
      <div className={s.text}>
        <span className={s.name}>{card.name}</span>
        <span className={s.sub}>
          {isDish ? card.restaurantName : card.cuisines?.[0]} &middot; {card.distanceKm} km
        </span>
        <MatchMeter value={result.percent} label={card.name + ' group match'} />
      </div>
      <div className={s.score}>
        <span className={s.pct}>{result.percent}%</span>
        <span className={s.likes}>
          {result.likes}/{totalMembers}
        </span>
      </div>
    </motion.li>
  );
}

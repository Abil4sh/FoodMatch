import { motion, useReducedMotion } from 'framer-motion';
import { FoodPhoto } from '../swipe/FoodPhoto';
import { Avatar } from '../primitives/Avatar';
import { factList, ratingText, distanceText, priceForTwoText, priceText } from '../../services/fields';
import s from './WinnerCard.module.css';

export function WinnerCard({ result, people = [], delay = 0, onOpen }) {
  const totalMembers = result.totalMembers;
  const reduced = useReducedMotion();
  const card = result.card;
  const isDish = card.type === 'dish';

  return (
    <motion.article
      className={s.card}
      initial={reduced ? false : { opacity: 0, y: 22, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <button type="button" className={s.open} onClick={onOpen} aria-label={'See more about ' + card.name} />
      <div className={s.photoWrap}>
        <FoodPhoto item={card} className={s.photo} />
        <motion.span
          className={s.badge}
          initial={reduced ? false : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: delay + 0.22, type: 'spring', stiffness: 340, damping: 18 }}
        >
          <span className={s.badgePct}>{result.percent}%</span>
          <span className={s.badgeLabel}>Group match</span>
        </motion.span>
      </div>

      <div className={s.info}>
        <h2 className={s.name}>{card.name}</h2>
        <p className={s.sub}>
          {isDish ? card.restaurantName : card.cuisines?.[0]} &middot; {card.area}
        </p>
        {(() => {
          const facts = factList(
            ratingText(card.rating),
            distanceText(card.distanceKm),
            isDish ? priceText(card.price) : priceForTwoText(card.priceForTwo)
          );
          if (facts.length === 0) return null;
          return (
            <div className={s.facts}>
              {facts.map((text, i) => (
                <span key={text} className={s.factItem}>
                  {i > 0 && <span className={s.dot} />}
                  <span className={String(text).startsWith('\u2605') ? s.rating : undefined}>{text}</span>
                </span>
              ))}
            </div>
          );
        })()}

        <div className={s.liked}>
          <div className={s.avatars}>
            {people.map((p, i) => (
              <motion.span
                key={p.id}
                className={s.avatarSlot}
                initial={reduced ? false : { opacity: 0, scale: 0.5, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: delay + 0.34 + i * 0.09, type: 'spring', stiffness: 420, damping: 20 }}
              >
                <Avatar person={p} size={30} />
                <span className={s.tick} aria-hidden="true" />
              </motion.span>
            ))}
          </div>
          <span className={s.likedText}>
            {result.likes} of {totalMembers} liked this
          </span>
        </div>
      </div>
    </motion.article>
  );
}

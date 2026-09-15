import { Fragment } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';
import { FoodPhoto } from './FoodPhoto';
import { cx } from '../primitives/cx';
import { LIKE, PASS, decideSwipe } from '../../hooks/useSwipeDeck';
import { factList, ratingText, distanceText, priceForTwoText, priceText } from '../../services/fields';
import s from './SwipeCard.module.css';

/** Renders only the facts that exist, with separators between them. */
function Facts({ items }) {
  if (items.length === 0) return null;
  return (
    <div className={s.facts}>
      {items.map((text, i) => (
        <Fragment key={text}>
          {i > 0 && <span className={s.dot} />}
          <span className={String(text).startsWith('\u2605') ? s.rating : undefined}>{text}</span>
        </Fragment>
      ))}
    </div>
  );
}

function Meta({ item }) {
  if (item.type === 'dish') {
    return (
      <>
        <div className={s.titleRow}>
          <h2 className={s.title}>{item.name}</h2>
          <span className={cx(s.diet, item.veg ? s.veg : s.nonVeg)} aria-label={item.veg ? 'Vegetarian' : 'Non-vegetarian'} />
        </div>
        <p className={s.sub}>
          {item.restaurantName} &middot; {item.cuisines[0]}
        </p>
        <Facts
          items={factList(priceText(item.price), ratingText(item.rating), distanceText(item.distanceKm))}
        />
      </>
    );
  }

  return (
    <>
      <h2 className={s.title}>{item.name}</h2>
      <p className={s.sub} title={item.cuisines.join(' \u00B7 ') + ' \u00B7 ' + item.area}>
        {item.cuisines[0]} &middot; {item.area}
      </p>
      {/* Typical spend per person is more useful than price-for-two, so it
          wins when we have it. The hero card stays to three facts either way. */}
      <Facts
        items={factList(
          ratingText(item.rating),
          distanceText(item.distanceKm),
          item.typicalSpendMin
            ? `\u20B9${item.typicalSpendMin}\u2013\u20B9${item.typicalSpendMax} pp`
            : priceForTwoText(item.priceForTwo)
        )}
      />
    </>
  );
}

export function SwipeCard({ item, depth = 0, interactive = false, exitDirection, onSwipe }) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);

  const rotate = useTransform(x, [-260, 0, 260], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [24, 132], [0, 1]);
  const passOpacity = useTransform(x, [-132, -24], [1, 0]);
  const likeScale = useTransform(x, [24, 150], [0.86, 1.04]);
  const passScale = useTransform(x, [-150, -24], [1.04, 0.86]);

  function handleDragEnd(_event, info) {
    // Below threshold this returns null and dragSnapToOrigin springs it home.
    const dir = decideSwipe(info.offset.x, info.velocity.x);
    if (dir) onSwipe?.(dir);
  }

  const exitX = exitDirection === LIKE ? 620 : exitDirection === PASS ? -620 : 0;

  return (
    <motion.article
      className={cx(s.card, !interactive && s.behind)}
      style={{
        x: interactive ? x : 0,
        rotate: interactive ? rotate : 0,
        zIndex: 10 - depth
      }}
      initial={false}
      animate={{
        scale: 1 - depth * 0.05,
        y: depth * 14,
        opacity: depth > 1 ? 0.6 : 1
      }}
      exit={{
        x: exitX,
        y: 40,
        rotate: exitDirection === LIKE ? 18 : -18,
        opacity: 0,
        transition: { duration: reduced ? 0.001 : 0.32, ease: [0.2, 0.7, 0.3, 1] }
      }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      draggable={false}
      onDragStart={(e) => e.preventDefault?.()}
      drag={interactive ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.6}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      whileDrag={{ cursor: 'grabbing' }}
    >
      <FoodPhoto item={item} className={s.photo} />

      {interactive && (
        <>
          <motion.span className={cx(s.stamp, s.like)} style={{ opacity: likeOpacity, scale: likeScale, rotate: -11 }} aria-hidden="true">
            Like
          </motion.span>
          <motion.span className={cx(s.stamp, s.pass)} style={{ opacity: passOpacity, scale: passScale, rotate: 11 }} aria-hidden="true">
            Pass
          </motion.span>
        </>
      )}

      <div className={s.info}>
        <Meta item={item} />
      </div>
    </motion.article>
  );
}

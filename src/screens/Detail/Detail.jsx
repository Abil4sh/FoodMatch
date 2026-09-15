import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { Button } from '../../components/primitives/Button';
import { Chip } from '../../components/primitives/Chip';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { EmptyState } from '../../components/primitives/EmptyState';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { FoodPhoto } from '../../components/swipe/FoodPhoto';
import { useEffect, useState } from 'react';
import { useGroup } from '../../store/GroupContext';
import { findCardById, dishesForRestaurant, venueFor, describe } from '../../services/catalog';
import { has } from '../../services/fields';
import { openDirections, directionsUrl } from '../../services/maps';
import s from './Detail.module.css';

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { group, loadResults } = useGroup();

  // Only when the user came from a reveal: one call, on an explicit path.
  const [result, setResult] = useState(null);
  const cameFromMatch = params.get('from') === 'match';
  useEffect(() => {
    if (!cameFromMatch) return undefined;
    let alive = true;
    loadResults()
      .then((body) => alive && setResult(body))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cameFromMatch, loadResults]);

  const card = findCardById(id);

  if (!card) {
    return (
      <PhoneShell tabs={false}>
        <div className={s.wrap}>
          <Header onBack={() => navigate(-1)} label="Not found" />
          <EmptyState
            mark="missing"
            title="We can't find that place."
            body="It may have been removed from the deck, or the link is wrong."
            action={<Button onClick={() => navigate('/')}>Back to Discover</Button>}
          />
        </div>
      </PhoneShell>
    );
  }

  const isDish = card.type === 'dish';
  const venue = venueFor(card);
  const menu = isDish ? dishesForRestaurant(card.restaurantId).filter((d) => d.id !== card.id) : dishesForRestaurant(card.id);

  // Only claim a group match when we arrived from one and it is for this card.
  const scored = cameFromMatch ? result?.results?.find((r) => r.cardId === card.id) : null;

  return (
    <PhoneShell tabs={false}>
      <div className={s.wrap}>
        <Header onBack={() => navigate(-1)} label={isDish ? 'Dish' : 'Restaurant'} />

        <div className={s.hero}>
          <FoodPhoto item={card} className={s.photo} />
          <div className={s.heroText}>
            <h1 className={s.name}>{card.name}</h1>
            <p className={s.sub}>
              {isDish ? card.restaurantName : card.cuisines?.[0]} &middot; {card.area}
            </p>
          </div>
        </div>

{(() => {
          // Only render facts the record actually has.
          // Typical spend per person is the more useful figure, so it replaces
          // price-for-two rather than sitting beside it. Three facts, one row.
          const price = isDish ? card.price : card.priceForTwo;
          const spend = has(venue?.typicalSpendMin)
            ? { label: 'Typical spend', value: '\u20B9' + venue.typicalSpendMin + '\u2013\u20B9' + venue.typicalSpendMax }
            : has(price)
              ? { label: isDish ? 'Price' : 'For two', value: '\u20B9' + price }
              : null;
          const facts = [
            has(card.rating) && { label: 'Rating', value: '\u2605 ' + card.rating },
            has(card.distanceKm) && { label: 'Distance', value: card.distanceKm + ' km' },
            spend
          ].filter(Boolean);
          if (facts.length === 0) return null;
          return (
            <div className={s.facts}>
              {facts.map((f) => (
                <Fact key={f.label} label={f.label} value={f.value} />
              ))}
            </div>
          );
        })()}

        {scored && (
          <section className={s.matchBox}>
            <div className={s.matchTop}>
              <SectionLabel>Group match</SectionLabel>
              <span className={s.matchPct}>{scored.percent}%</span>
            </div>
            <MatchMeter value={scored.percent} label="Group match" />
            <p className={s.matchNote}>
              {scored.likes} of {scored.votedBy} in {group?.name || 'your group'} liked this.
            </p>
          </section>
        )}

        <section className={s.block}>
          <SectionLabel>About</SectionLabel>
          <p className={s.body}>{describe(card)}</p>
          <div className={s.chips}>
            {(card.cuisines || []).map((c) => (
              <Chip key={c} variant="ghost">
                {c}
              </Chip>
            ))}
            {isDish && <Chip variant="ghost">{card.veg ? 'Vegetarian' : 'Non-veg'}</Chip>}
          </div>
        </section>

        {venue && (
          <section className={s.block}>
            <SectionLabel>Where</SectionLabel>
            <p className={s.body}>{venue.address || venue.area}</p>
            {venue.hours && <p className={s.meta}>{venue.hours}</p>}
          </section>
        )}

        {menu.length === 0 && !isDish && (
          <section className={s.block}>
            <SectionLabel>Popular dishes</SectionLabel>
            {/* No curated menu for this place. Nothing is invented to fill it. */}
            <p className={s.unavailable}>
              Menu information unavailable for {card.name} yet.
            </p>
          </section>
        )}

        {menu.length > 0 && (
          <section className={s.block}>
            <SectionLabel>{isDish ? 'Also from here' : 'Popular dishes'}</SectionLabel>
            <ul className={s.menu}>
              {menu.map((d) => (
                <li key={d.id}>
                  <button type="button" className={s.menuRow} onClick={() => navigate('/restaurant/' + d.id)}>
                    <FoodPhoto item={d} className={s.thumb} />
                    <span className={s.menuText}>
                      <span className={s.menuName}>{d.name}</span>
                      <span className={s.menuMeta}>
                        {has(d.rating) ? '\u2605 ' + d.rating + ' \u00B7 ' : ''}
                        {d.veg ? 'Veg' : 'Non-veg'}
                      </span>
                    </span>
                    <span className={s.menuPrice}>&#8377;{d.price}</span>
                  </button>
                </li>
              ))}
            </ul>
            {has(venue?.typicalSpendMin) && (
              <p className={s.spendNote}>
                Approx. &#8377;{venue.typicalSpendMin}&ndash;&#8377;{venue.typicalSpendMax} per person.
                Prices are indicative and may have changed.
              </p>
            )}
          </section>
        )}

        <div className={s.actions}>
          {/* For a dish, route to the restaurant that serves it. Hidden when a
              record has no location at all, rather than opening a blank map. */}
          {directionsUrl(venue || card) && (
            <Button variant="outline" onClick={() => openDirections(venue || card)}>
              Directions
            </Button>
          )}
          <Button onClick={() => navigate('/create')}>Start another FoodMatch</Button>
        </div>
      </div>
    </PhoneShell>
  );
}

function Header({ onBack, label }) {
  return (
    <header className={s.head}>
      <button type="button" className={s.back} onClick={onBack} aria-label="Go back">
        &lsaquo;
      </button>
      <span className={s.headLabel}>{label}</span>
      <span className={s.spacer} />
    </header>
  );
}

function Fact({ label, value }) {
  return (
    <div className={s.fact}>
      <span className={s.factLabel}>{label}</span>
      <span className={s.factValue}>{value}</span>
    </div>
  );
}

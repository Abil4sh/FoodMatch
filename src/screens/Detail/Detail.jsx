import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { Button } from '../../components/primitives/Button';
import { Chip } from '../../components/primitives/Chip';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { EmptyState } from '../../components/primitives/EmptyState';
import { MatchMeter } from '../../components/primitives/MatchMeter';
import { FoodPhoto } from '../../components/swipe/FoodPhoto';
import { useMatch } from '../../store/MatchContext';
import { findCardById, dishesForRestaurant, venueFor, describe } from '../../services/catalog';
import s from './Detail.module.css';

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { group, result } = useMatch();

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
  const fromMatch = params.get('from') === 'match';
  const scored = fromMatch ? result?.results?.find((r) => r.cardId === card.id) : null;

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

        <div className={s.facts}>
          <Fact label="Rating" value={'\u2605 ' + card.rating} />
          <Fact label="Distance" value={card.distanceKm + ' km'} />
          <Fact label={isDish ? 'Price' : 'For two'} value={'\u20B9' + (isDish ? card.price : card.priceForTwo)} />
        </div>

        {scored && (
          <section className={s.matchBox}>
            <div className={s.matchTop}>
              <SectionLabel>Group match</SectionLabel>
              <span className={s.matchPct}>{scored.percent}%</span>
            </div>
            <MatchMeter value={scored.percent} label="Group match" />
            <p className={s.matchNote}>
              {scored.likes} of {scored.totalMembers} in {group?.groupName || 'your group'} liked this.
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

        {menu.length > 0 && (
          <section className={s.block}>
            <SectionLabel>{isDish ? 'Also from here' : 'What to order'}</SectionLabel>
            <ul className={s.menu}>
              {menu.map((d) => (
                <li key={d.id}>
                  <button type="button" className={s.menuRow} onClick={() => navigate('/restaurant/' + d.id)}>
                    <FoodPhoto item={d} className={s.thumb} />
                    <span className={s.menuText}>
                      <span className={s.menuName}>{d.name}</span>
                      <span className={s.menuMeta}>
                        &#9733; {d.rating} &middot; {d.veg ? 'Veg' : 'Non-veg'}
                      </span>
                    </span>
                    <span className={s.menuPrice}>&#8377;{d.price}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className={s.actions}>
          {/* Placeholder until a maps provider is wired up in a later milestone. */}
          <Button
            variant="outline"
            onClick={() => window.alert('Directions open in a maps app once FoodMatch is connected to one.')}
          >
            Directions
          </Button>
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

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { Chip } from '../../components/primitives/Chip';
import { Segmented } from '../../components/primitives/Segmented';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { useSession } from '../../store/SessionContext';
import { useMatch, newGroupIdentity } from '../../store/MatchContext';
import options from '../../data/matchOptions.json';
import s from './Create.module.css';

// Discover's craving tiles deep-link in with ?craving=Ramen — translate that
// into one of the preference buckets so the screen opens half-filled.
const CRAVING_TO_PREFERENCE = {
  Biryani: 'p_biryani',
  Ramen: 'p_asian',
  'South Indian': 'p_south_indian',
  Pizza: 'p_fast_food',
  Kebab: 'p_north_indian',
  Cafe: 'p_cafe'
};

export default function Create() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useSession();
  const { createGroup } = useMatch();

  const craving = params.get('craving');
  const seeded = CRAVING_TO_PREFERENCE[craving];

  const [name, setName] = useState('');
  const [preferences, setPreferences] = useState(seeded ? [seeded] : []);
  const [budget, setBudget] = useState(500);
  const [distance, setDistance] = useState(5);

  const togglePreference = (id) =>
    setPreferences((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const trimmed = name.trim();
  const ready = trimmed.length > 1 && preferences.length > 0;

  const budgetNote = options.budgets.find((b) => b.value === budget)?.note;
  const distanceNote = options.distances.find((d) => d.value === distance)?.note;

  function handleContinue() {
    if (!ready || !user) return;
    const identity = newGroupIdentity(trimmed);
    createGroup({
      ...identity,
      name: trimmed,
      creator: user.id,
      preferences,
      budget,
      distance,
      area: user.area
    });
    navigate('/invite/' + identity.groupId);
  }

  return (
    <PhoneShell
      header={<ScreenHeader eyebrow="Step 1 of 3" title="Create FoodMatch" />}
      footer={
        <div className={s.footer}>
          <Button onClick={handleContinue} disabled={!ready}>
            Continue to invites
          </Button>
        </div>
      }
    >
      <div className={s.wrap}>
        <section className={s.block}>
          <label className={s.question} htmlFor="matchName">
            What are we eating for?
          </label>
          <input
            id="matchName"
            className={s.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Friday Dinner"
            maxLength={40}
            autoComplete="off"
          />
          <div className={s.suggestions}>
            {options.nameSuggestions.map((suggestion) => (
              <Chip key={suggestion} variant="ghost" onClick={() => setName(suggestion)}>
                {suggestion}
              </Chip>
            ))}
          </div>
        </section>

        <section className={s.block}>
          <div className={s.questionRow}>
            <span className={s.question}>What is the group in the mood for?</span>
            <SectionLabel>{preferences.length ? preferences.length + ' picked' : 'Pick one'}</SectionLabel>
          </div>
          <div className={s.chips}>
            {options.cuisines.map((c) => (
              <Chip key={c.id} on={preferences.includes(c.id)} onClick={() => togglePreference(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className={s.block}>
          <span className={s.question}>Budget per head</span>
          <Segmented
            label="Budget per head"
            options={options.budgets.map((b) => ({ value: b.value, label: b.label }))}
            value={budget}
            onChange={setBudget}
          />
          <p className={s.note}>{budgetNote}</p>
        </section>

        <section className={s.block}>
          <span className={s.question}>How far will you travel?</span>
          <Segmented
            label="Distance from you"
            options={options.distances.map((d) => ({ value: d.value, label: d.label }))}
            value={distance}
            onChange={setDistance}
          />
          <p className={s.note}>
            {distanceNote} &middot; from {user?.area || 'your area'}
          </p>
        </section>
      </div>
    </PhoneShell>
  );
}

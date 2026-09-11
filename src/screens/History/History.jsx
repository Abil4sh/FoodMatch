import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { EmptyState } from '../../components/primitives/EmptyState';
import { FoodPhoto } from '../../components/swipe/FoodPhoto';
import { readHistory } from '../../services/history';
import { findCardById } from '../../services/catalog';
import s from './History.module.css';

function when(ts) {
  if (!ts) return '';
  const then = new Date(ts);
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function History() {
  const navigate = useNavigate();
  const entries = useMemo(() => readHistory(), []);

  return (
    <PhoneShell header={<ScreenHeader eyebrow="Matches" title="Match history" />}>
      <div className={s.wrap}>
        {entries.length === 0 ? (
          <EmptyState
            mark="plate"
            title="No matches yet."
            body="Once a group finishes swiping, the place you landed on shows up here."
            action={<Button onClick={() => navigate('/create')}>Start a FoodMatch</Button>}
          />
        ) : (
          <ul className={s.list}>
            {entries.map((entry) => {
              const card = entry.winner ? findCardById(entry.winner.cardId) : null;
              return (
                <li key={entry.groupId + ':' + entry.mode}>
                  <button
                    type="button"
                    className={s.row}
                    onClick={() => card && navigate('/restaurant/' + card.id)}
                    disabled={!card}
                  >
                    {card ? (
                      <FoodPhoto item={card} className={s.thumb} />
                    ) : (
                      <span className={`${s.thumb} ${s.thumbEmpty}`} aria-hidden="true" />
                    )}
                    <span className={s.text}>
                      <span className={s.group}>{entry.groupName}</span>
                      <span className={s.winner}>{entry.winner ? entry.winner.name : 'No match found'}</span>
                      <span className={s.meta}>
                        {when(entry.at)}
                        {entry.winner ? ` \u00B7 ${entry.winner.likes} of ${entry.totalMembers} liked it` : ''}
                      </span>
                    </span>
                    {entry.winner && <span className={s.pct}>{entry.winner.percent}%</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PhoneShell>
  );
}

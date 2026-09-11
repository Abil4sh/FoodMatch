import { PhoneShell } from './PhoneShell';
import { Button } from '../primitives/Button';
import { EmptyState } from '../primitives/EmptyState';
import { useSession } from '../../store/SessionContext';
import s from './BootGate.module.css';

/**
 * Holds the app back until the catalog has arrived from the API.
 *
 * Without this, a deep link to /restaurant/:id could render before the catalog
 * existed and report a real restaurant as missing. Screens below this point can
 * assume the catalog is populated.
 *
 * The failure path offers a manual retry and nothing else — no timer, no
 * automatic retry, no polling.
 */
export function BootGate({ children }) {
  const { loading, error, reload } = useSession();

  if (loading) {
    return (
      <PhoneShell tabs={false}>
        <div className={s.wrap}>
          <span className={s.pulse} aria-hidden="true" />
          <p className={s.text}>Loading FoodMatch…</p>
        </div>
      </PhoneShell>
    );
  }

  if (error) {
    return (
      <PhoneShell tabs={false}>
        <div className={s.errorWrap}>
          <EmptyState
            mark="missing"
            title="Can't reach the FoodMatch API."
            body="The Django backend doesn't seem to be running. Start it with `python manage.py runserver` in the backend folder, then try again."
            action={<Button onClick={reload}>Try again</Button>}
          />
        </div>
      </PhoneShell>
    );
  }

  return children;
}

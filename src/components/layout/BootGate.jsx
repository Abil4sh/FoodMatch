import { PhoneShell } from './PhoneShell';
import { useSession } from '../../store/SessionContext';
import s from './BootGate.module.css';

/**
 * Holds the app back until the catalog is in memory.
 *
 * Without this, a deep link to /restaurant/:id could render before the catalog
 * existed and report a real restaurant as missing. Screens below this point can
 * assume the catalog is populated.
 *
 * There is no error branch: `loadCatalog` falls back to the bundled catalog
 * rather than failing, so the app always has data to show.
 */
export function BootGate({ children }) {
  const { loading } = useSession();

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

  return children;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadPopularAreas, searchAreas } from '../../services/areas';
import { toStoredLocation } from '../../services/location';
import { Button } from '../primitives/Button';
import { SectionLabel } from '../primitives/SectionLabel';
import s from './LocationSheet.module.css';

/*
 * Bottom sheet for choosing the area to browse.
 *
 * Request discipline, which is the point of the debounce: typing does not
 * search. A request goes out 400ms after the last keystroke, and only for two
 * or more characters, so a typed area name costs one call rather than one per
 * letter. The popular list is served locally and costs nothing.
 */

const DEBOUNCE_MS = 400;
const MIN_QUERY = 2;

export function LocationSheet({ open, current, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [popular, setPopular] = useState([]);
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [geoStatus, setGeoStatus] = useState(null);

  const inputRef = useRef(null);
  const sheetRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Popular areas are local, so this is cheap and only runs when opened.
  useEffect(() => {
    if (!open || popular.length) return;
    let alive = true;
    // Never rejects: falls back to the bundled Bengaluru list when the API
    // is unavailable, so the picker is usable offline.
    loadPopularAreas().then((body) => alive && setPopular(body.results));
    return () => {
      alive = false;
    };
  }, [open, popular.length]);

  // Focus management: move focus in on open, restore it on close.
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      clearTimeout(timer);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Debounced search. One request per pause, never one per keystroke.
  useEffect(() => {
    const text = query.trim();
    if (!open) return undefined;
    if (text.length < MIN_QUERY) {
      setResults(null);
      setStatus('idle');
      return undefined;
    }

    let alive = true;
    setStatus('loading');
    const timer = setTimeout(() => {
      searchAreas(text).then((body) => {
        if (!alive) return;
        setResults(body.results);
        setStatus('idle');
      });
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  const choose = useCallback(
    (location) => {
      const stored = toStoredLocation(location);
      if (!stored) return;
      onSelect(stored);
      setQuery('');
      setResults(null);
      onClose();
    },
    [onSelect, onClose]
  );

  // Never requested on load; only when the person asks for it.
  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus('Your browser can\u2019t share a location.');
      return;
    }
    setGeoStatus('Finding you\u2026');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        choose({
          id: 'current',
          name: 'Current location',
          context: 'Where you are now',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'device'
        });
        setGeoStatus(null);
      },
      () => setGeoStatus('Couldn\u2019t get your location. Pick an area instead.'),
      { timeout: 8000, maximumAge: 60000 }
    );
  }, [choose]);

  const shown = useMemo(() => (results === null ? popular : results), [results, popular]);
  const searching = results !== null;

  if (!open) return null;

  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={s.sheet}
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose an area"
      >
        <div className={s.grabber} aria-hidden="true" />
        <h2 className={s.title}>Where are you eating?</h2>

        <input
          ref={inputRef}
          className={s.input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Bengaluru area…"
          aria-label="Search for an area"
          autoComplete="off"
        />

        <button type="button" className={s.geo} onClick={useMyLocation}>
          <span className={s.geoDot} aria-hidden="true" />
          Use my location
        </button>
        {geoStatus && (
          <p className={s.note} role="status">
            {geoStatus}
          </p>
        )}

        <div className={s.listHead}>
          <SectionLabel>{searching ? 'Results' : 'Popular areas'}</SectionLabel>
          {status === 'loading' && <span className={s.note}>Searching…</span>}
        </div>

        {shown.length === 0 ? (
          <p className={s.empty}>
            {searching ? 'No areas matched that search.' : 'No areas available right now.'}
          </p>
        ) : (
          <ul className={s.list}>
            {shown.map((area) => {
              const selected = current?.name === area.name;
              return (
                <li key={area.id}>
                  <button
                    type="button"
                    className={s.item}
                    onClick={() => choose(area)}
                    aria-current={selected ? 'true' : undefined}
                  >
                    <span className={s.itemText}>
                      <span className={s.itemName}>{area.name}</span>
                      {area.context && <span className={s.itemContext}>{area.context}</span>}
                    </span>
                    {selected && <span className={s.tick} aria-label="Currently selected" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className={s.footer}>
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

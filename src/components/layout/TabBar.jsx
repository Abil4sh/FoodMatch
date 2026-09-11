import { NavLink } from 'react-router-dom';
import { cx } from '../primitives/cx';
import s from './TabBar.module.css';

const TABS = [
  { to: '/', label: 'Discover', shape: 'sq' },
  { to: '/groups', label: 'Groups', shape: 'ci' },
  { to: '/matches', label: 'Matches', shape: 'sq' },
  { to: '/profile', label: 'You', shape: 'ci' }
];

export function TabBar({ variant = 'bar', tone = 'light' }) {
  return (
    <nav
      className={cx(variant === 'rail' ? s.rail : s.bar, variant === 'bar' && tone === 'ink' && s.barInk)}
      aria-label="Main"
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) => cx(s.tab, isActive && s.on)}
        >
          <span className={cx(s.glyph, s[t.shape])} aria-hidden="true" />
          <span className={s.label}>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

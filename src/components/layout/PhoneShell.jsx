import { cx } from '../primitives/cx';
import { StatusBar } from '../primitives/StatusBar';
import { TabBar } from './TabBar';
import s from './PhoneShell.module.css';

export function PhoneShell({ tone = 'light', tabs = true, header, footer, children }) {
  return (
    <div className={s.stage}>
      <aside className={s.rail}>
        <div className={s.wordmark}>
          <span className={s.logo}>F</span>
          <span className={s.name}>FOODMATCH</span>
        </div>
        <div>
          <p className={s.pitch}>Everyone swipes. FoodMatch picks the place.</p>
          <p className={s.sub} style={{ marginTop: 12 }}>
            Swipe &rarr; match &rarr; eat. Built for groups in Bengaluru.
          </p>
        </div>
        {tabs && <TabBar variant="rail" />}
      </aside>

      <div className={s.frame}>
        <div className={cx(s.screen, tone === 'ink' && s.screenInk)}>
          <StatusBar tone={tone === 'ink' ? 'dark' : 'light'} />
          {header}
          <div className={s.body}>{children}</div>
          {footer}
          {tabs && <TabBar variant="bar" tone={tone} />}
        </div>
      </div>
    </div>
  );
}

import s from './EmptyState.module.css';

/**
 * One component behind every "nothing here yet" and "that does not exist"
 * screen, so no route can render blank.
 */
export function EmptyState({ mark = 'plate', title, body, action, secondary }) {
  return (
    <div className={s.wrap}>
      <span className={`${s.mark} ${s[mark]}`} aria-hidden="true" />
      <h1 className={s.title}>{title}</h1>
      {body && <p className={s.body}>{body}</p>}
      {(action || secondary) && (
        <div className={s.actions}>
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { useGroup, MEMBER_STATE } from '../../store/GroupContext';
import s from './Invite.module.css';

const STATE_COPY = {
  [MEMBER_STATE.JOINED]: 'Joined',
  [MEMBER_STATE.SWIPING]: 'Swiping',
  [MEMBER_STATE.FINISHED]: 'Finished'
};

export default function Invite() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const { group, code, participants, isHost, startGroup, busy, error } = useGroup();

  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!code) return <Navigate to="/create" replace />;
  if (routeCode !== code) return <Navigate to={'/invite/' + code} replace />;

  const joinUrl = `${window.location.origin}/join/${code}`;

  function flash(setter, value, reset) {
    setter(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setter(reset), 1800);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    flash(setCopied, true, false);
  }

  async function share() {
    const text = `Join my FoodMatch "${group?.name || ''}" \u2014 code ${code}\n${joinUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'FoodMatch', text, url: joinUrl });
        return;
      } catch {
        /* the person dismissed the share sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      flash(setShareNote, 'Invite copied \u2014 paste it in WhatsApp', '');
    } catch {
      flash(setShareNote, 'Read out the code: ' + code, '');
    }
  }

  async function start() {
    try {
      await startGroup();
      navigate('/lobby/' + code);
    } catch {
      /* surfaced by `error` below */
    }
  }

  const enoughPeople = participants.length >= 2;

  return (
    <PhoneShell
      header={<ScreenHeader eyebrow="Step 2 of 3" title="Invite friends" />}
      footer={
        <div className={s.footer}>
          {shareNote && <p className={s.footerNote}>{shareNote}</p>}
          {error && (
            <p className={s.footerNote} role="alert">
              {error}
            </p>
          )}
          {isHost ? (
            <Button onClick={start} disabled={!enoughPeople || busy}>
              {busy ? 'Starting\u2026' : enoughPeople ? 'Start match' : 'Waiting for someone to join'}
            </Button>
          ) : (
            <Button onClick={() => navigate('/lobby/' + code)}>Go to the lobby</Button>
          )}
        </div>
      }
    >
      <div className={s.wrap}>
        <div className={s.card}>
          <div className={s.cardTop}>
            <SectionLabel tone="onInk">Invite code</SectionLabel>
            <span className={s.matchName}>{group?.name}</span>
          </div>

          <button type="button" className={s.code} onClick={copyCode} aria-label={'Copy invite code ' + code}>
            <span className={s.codeText}>{code}</span>
            <span className={s.copy}>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <Button variant="onInk" onClick={share}>
            Share invite
          </Button>
        </div>

        <div className={s.listHead}>
          <h2 className={s.listTitle}>In this FoodMatch</h2>
          {/* Real people, refreshed by polling. Nothing here is simulated. */}
          <SectionLabel>{participants.length} joined</SectionLabel>
        </div>

        <ul className={s.list}>
          {participants.map((person) => (
            <li key={person.id} className={s.person}>
              <span className={s.avatar} aria-hidden="true">
                {person.initials}
              </span>
              <span className={s.personText}>
                <span className={s.personName}>{person.displayName}</span>
                <span className={s.personMeta}>{person.isHost ? 'Host' : 'Guest'}</span>
              </span>
              <span className={s.statePill}>{STATE_COPY[person.state] || person.state}</span>
            </li>
          ))}
        </ul>

        <p className={s.hint}>
          Friends open FoodMatch, tap <strong>Join a FoodMatch</strong> and enter this code. No account needed.
        </p>
      </div>
    </PhoneShell>
  );
}

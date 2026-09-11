import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { SectionLabel } from '../../components/primitives/SectionLabel';
import { MemberRow } from '../../components/cards/MemberRow';
import { useSession } from '../../store/SessionContext';
import { useMatch, MEMBER } from '../../store/MatchContext';
import { useSimulatedFriends } from '../../hooks/useSimulatedFriends';
import s from './Invite.module.css';

export default function Invite() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { friends, getPerson } = useSession();
  const { group, members, invite, memberJoined, enterLobby, statusOf } = useMatch();

  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const copyTimer = useRef(null);

  // Invited friends drift into "Joined" on their own — stands in for the
  // websocket that milestone 6 will bring.
  useSimulatedFriends({
    members,
    from: MEMBER.INVITED,
    advance: memberJoined,
    baseDelay: 2200,
    stagger: 1600
  });

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  // Refreshing on a stale URL should not strand the user on an empty screen.
  if (!group) return <Navigate to="/create" replace />;
  if (group.groupId !== groupId) return <Navigate to={'/invite/' + group.groupId} replace />;

  const invitedIds = members.filter((m) => m.status !== MEMBER.HOST).map((m) => m.id);
  const joinedCount = members.filter((m) => m.status === MEMBER.JOINED || m.status === MEMBER.READY).length;

  function toggleFriend(id) {
    const next = invitedIds.includes(id) ? invitedIds.filter((x) => x !== id) : [...invitedIds, id];
    invite(next);
  }

  function flash(setter, message) {
    setter(message);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setter(''), 1800);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.code);
    } catch {
      const el = document.createElement('textarea');
      el.value = group.code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1800);
  }

  async function share() {
    const text = `Join my FoodMatch "${group.groupName}" — code ${group.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'FoodMatch', text });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      flash(setShareNote, 'Invite copied — paste it in WhatsApp');
    } catch {
      flash(setShareNote, 'Read out the code: ' + group.code);
    }
  }

  function startMatch() {
    enterLobby();
    navigate('/lobby/' + group.groupId);
  }

  return (
    <PhoneShell
      header={<ScreenHeader eyebrow="Step 2 of 3" title="Invite friends" />}
      footer={
        <div className={s.footer}>
          {shareNote && <p className={s.footerNote}>{shareNote}</p>}
          <Button onClick={startMatch} disabled={members.length < 2}>
            {members.length < 2 ? 'Pick someone to eat with' : 'Start match'}
          </Button>
        </div>
      }
    >
      <div className={s.wrap}>
        <div className={s.card}>
          <div className={s.cardTop}>
            <SectionLabel tone="onInk">Invite code</SectionLabel>
            <span className={s.matchName}>{group.groupName}</span>
          </div>

          <button type="button" className={s.code} onClick={copyCode} aria-label={'Copy invite code ' + group.code}>
            <span className={s.codeText}>{group.code}</span>
            <span className={s.copy}>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <Button variant="onInk" onClick={share}>
            Share invite
          </Button>
        </div>

        <div className={s.listHead}>
          <h2 className={s.listTitle}>Your people</h2>
          <SectionLabel>
            {joinedCount} of {members.length - 1 || 0} joined
          </SectionLabel>
        </div>

        <ul className={s.list}>
          {friends.map((f) => {
            const status = statusOf(f.id);
            return (
              <li key={f.id}>
                <MemberRow
                  person={f}
                  status={status}
                  selected={Boolean(status)}
                  onClick={() => toggleFriend(f.id)}
                  hint={status === MEMBER.JOINED ? 'In the group' : f.area}
                  trailing={status ? undefined : <span className={s.add}>Invite</span>}
                />
              </li>
            );
          })}
        </ul>

        <p className={s.hint}>
          Tap a friend to invite or remove them. {getPerson(group.creator)?.name || 'You'} is the host.
        </p>
      </div>
    </PhoneShell>
  );
}

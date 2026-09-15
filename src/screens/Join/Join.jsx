import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { useGroup } from '../../store/GroupContext';
import { useSession } from '../../store/SessionContext';
import s from './Join.module.css';

const CODE_LENGTH = 6;
/** Matches the server's alphabet: no I, O, 0 or 1. */
const CODE_CHARS = /[^A-HJ-NP-Z2-9]/g;

export default function Join() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const { joinGroup, busy, error } = useGroup();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState(null);

  // A shared link (/join/ABC123) pre-fills the code.
  useEffect(() => {
    if (routeCode) setCode(String(routeCode).toUpperCase().replace(CODE_CHARS, '').slice(0, CODE_LENGTH));
  }, [routeCode]);

  useEffect(() => {
    if (user?.name && !name) setName(user.name);
  }, [user, name]);

  const codeReady = code.length === CODE_LENGTH;
  const nameReady = name.trim().length >= 1;

  async function submit() {
    setLocalError(null);
    if (!codeReady) {
      setLocalError('A FoodMatch code is 6 characters.');
      return;
    }
    if (!nameReady) {
      setLocalError('Add a name so your group knows who you are.');
      return;
    }
    try {
      const group = await joinGroup(code, name.trim());
      navigate(group.status === 'lobby' ? '/invite/' + group.code : '/lobby/' + group.code);
    } catch {
      /* `error` from the store is shown below */
    }
  }

  return (
    <PhoneShell
      header={<ScreenHeader eyebrow="Join" title="Join a FoodMatch" />}
      footer={
        <div className={s.footer}>
          {(localError || error) && (
            <p className={s.error} role="alert">
              {localError || error}
            </p>
          )}
          <Button onClick={submit} disabled={busy || !codeReady || !nameReady}>
            {busy ? 'Joining\u2026' : 'Join'}
          </Button>
        </div>
      }
    >
      <div className={s.wrap}>
        <label className={s.label} htmlFor="joinCode">
          FoodMatch code
        </label>
        <input
          id="joinCode"
          className={s.codeInput}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(CODE_CHARS, '').slice(0, CODE_LENGTH))}
          placeholder="ABC123"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck="false"
          maxLength={CODE_LENGTH}
          aria-describedby="joinCodeHint"
        />
        <p id="joinCodeHint" className={s.hint}>
          Six characters, from whoever created the FoodMatch.
        </p>

        <label className={s.label} htmlFor="joinName">
          Your name
        </label>
        <input
          id="joinName"
          className={s.nameInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rahul"
          maxLength={24}
          autoComplete="given-name"
        />
        <p className={s.hint}>
          Shown to your group so they know who has swiped. No account, no password.
        </p>
      </div>
    </PhoneShell>
  );
}

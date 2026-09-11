import { useNavigate } from 'react-router-dom';
import { PhoneShell } from '../../components/layout/PhoneShell';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { Button } from '../../components/primitives/Button';
import { EmptyState } from '../../components/primitives/EmptyState';
import s from './NotFound.module.css';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <PhoneShell header={<ScreenHeader eyebrow="Lost" title="Nothing here" />}>
      <div className={s.wrap}>
        <EmptyState
          mark="missing"
          title="That page doesn't exist."
          body="The link may be out of date. Everything still works from Discover."
          action={<Button onClick={() => navigate('/')}>Back to Discover</Button>}
        />
      </div>
    </PhoneShell>
  );
}

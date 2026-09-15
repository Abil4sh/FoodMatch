import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './store/SessionContext';
import { GroupProvider } from './store/GroupContext';
import { BootGate } from './components/layout/BootGate';
import { AppRoutes } from './router';

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <GroupProvider>
            {/* Screens below here can assume the catalog has loaded. */}
            <BootGate>
              <AppRoutes />
            </BootGate>
        </GroupProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}

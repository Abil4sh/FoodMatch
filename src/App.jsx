import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './store/SessionContext';
import { MatchProvider } from './store/MatchContext';
import { BootGate } from './components/layout/BootGate';
import { AppRoutes } from './router';

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <MatchProvider>
          {/* Screens below here can assume the catalog has loaded. */}
          <BootGate>
            <AppRoutes />
          </BootGate>
        </MatchProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}

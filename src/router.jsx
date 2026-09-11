import { Routes, Route } from 'react-router-dom';
import Discover from './screens/Discover/Discover';
import Create from './screens/Create/Create';
import Invite from './screens/Invite/Invite';
import Lobby from './screens/Lobby/Lobby';
import Swipe from './screens/Swipe/Swipe';
import Match from './screens/Match/Match';
import Detail from './screens/Detail/Detail';
import Profile from './screens/Profile/Profile';
import History from './screens/History/History';
import Groups from './screens/Groups/Groups';
import NotFound from './screens/NotFound/NotFound';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Discover />} />
      <Route path="/create" element={<Create />} />
      <Route path="/invite/:groupId" element={<Invite />} />
      <Route path="/lobby/:groupId" element={<Lobby />} />
      <Route path="/swipe/:groupId" element={<Swipe />} />
      <Route path="/match/:groupId" element={<Match />} />
      <Route path="/restaurant/:id" element={<Detail />} />
      <Route path="/groups" element={<Groups />} />
      <Route path="/matches" element={<History />} />
      <Route path="/profile" element={<Profile />} />
      {/* A polished dead end beats a silent redirect that hides broken links. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

import { Routes, Route } from 'react-router-dom';
import Discover from './screens/Discover/Discover';
import Create from './screens/Create/Create';
import Invite from './screens/Invite/Invite';
import Lobby from './screens/Lobby/Lobby';
import Swipe from './screens/Swipe/Swipe';
import Join from './screens/Join/Join';
import Solo from './screens/Solo/Solo';
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
      {/* Join by code, or straight from a shared link. */}
      <Route path="/join" element={<Join />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/invite/:code" element={<Invite />} />
      <Route path="/lobby/:code" element={<Lobby />} />
      {/* Solo browsing needs no group; group swiping is code-scoped. */}
      <Route path="/browse" element={<Solo />} />
      <Route path="/swipe/:code" element={<Swipe />} />
      <Route path="/match/:code" element={<Match />} />
      <Route path="/restaurant/:id" element={<Detail />} />
      <Route path="/groups" element={<Groups />} />
      <Route path="/matches" element={<History />} />
      <Route path="/profile" element={<Profile />} />
      {/* A polished dead end beats a silent redirect that hides broken links. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

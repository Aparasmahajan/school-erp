import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Page } from './components/ui';
import { RequireAuth } from './lib/session';
import { AcceptInvite, Login } from './pages/Auth';
import { ConsoleLog, Team } from './pages/Team';
import { Overview } from './pages/Overview';
import { SchoolDetail } from './pages/SchoolDetail';
import { Schools } from './pages/Schools';
import { Trail } from './pages/Trail';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route element={<RequireAuth><Shell /></RequireAuth>}>
          <Route index element={<Overview />} />
          <Route path="schools" element={<Schools />} />
          <Route path="schools/:id" element={<SchoolDetail />} />
          <Route path="trail" element={<Trail />} />
          <Route path="team" element={<Team />} />
          <Route path="console-log" element={<ConsoleLog />} />
          <Route path="*" element={<Page title="Not found"><p>That page doesn't exist. <Link to="/">Back to the overview</Link>.</p></Page>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

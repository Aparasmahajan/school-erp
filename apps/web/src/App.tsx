import { BrowserRouter, HashRouter, Link, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Page } from './components/ui';
import { IS_DESKTOP } from './lib/api';
import { RequireAuth } from './lib/session';
import { AcceptInvite } from './pages/AcceptInvite';
import { Attendance } from './pages/Attendance';
import { CheckIn } from './pages/CheckIn';
import { Classes } from './pages/Classes';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Roles } from './pages/Roles';
import { Settings } from './pages/Settings';
import { Staff } from './pages/Staff';
import { StaffAttendance } from './pages/StaffAttendance';
import { Students } from './pages/Students';
import { Zones } from './pages/Zones';

// The Windows app serves files from disk, where only index.html exists, so it uses
// #/ URLs. The browser build uses normal paths.
const Router = IS_DESKTOP ? HashRouter : BrowserRouter;

export function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="classes" element={<Classes />} />
          <Route path="check-in" element={<CheckIn />} />
          <Route path="staff-attendance" element={<StaffAttendance />} />
          <Route path="staff" element={<Staff />} />
          <Route path="zones" element={<Zones />} />
          <Route path="roles" element={<Roles />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="*"
            element={
              <Page title="Page not found">
                <p>
                  That page doesn't exist. <Link to="/">Go to the dashboard</Link>.
                </p>
              </Page>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}

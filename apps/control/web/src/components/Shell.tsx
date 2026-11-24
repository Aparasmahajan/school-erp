import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useIsOwner, useMe, useSignOut } from '../lib/session';
import { Icon, type IconName } from './Icon';

const MAIN: { to: string; label: string; icon: IconName; ownerOnly?: boolean }[] = [
  { to: '/', label: 'Overview', icon: 'overview' },
  { to: '/schools', label: 'Schools', icon: 'schools' },
  { to: '/trail', label: 'Audit trail', icon: 'trail' },
];
const CONSOLE: { to: string; label: string; icon: IconName }[] = [
  { to: '/team', label: 'Console team', icon: 'team' },
  { to: '/console-log', label: 'Console log', icon: 'log' },
];

export function Shell() {
  const { data: me } = useMe();
  const owner = useIsOwner();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  if (!me) return null;

  return (
    <div className="app">
      <aside className={`side${open ? ' open' : ''}`}>
        <div className="mark">
          <div className="mark-tile" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFCF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10 12 4l9 6" />
              <path d="M5 9.5V20h14V9.5" />
              <path d="M10 20v-5h4v5" />
            </svg>
          </div>
          <div>
            <p className="mark-name">Control room</p>
            <p className="mark-sub">All schools</p>
          </div>
          <button type="button" className="btn btn-icon menu-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'close' : 'menu'} label={open ? 'Close menu' : 'Open menu'} />
          </button>
        </div>

        <nav className="nav" aria-label="Main">
          {MAIN.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => setOpen(false)}>
              <Icon name={i.icon} />
              {i.label}
            </NavLink>
          ))}
          {owner && (
            <>
              <p className="nav-title">Console</p>
              {CONSOLE.map((i) => (
                <NavLink key={i.to} to={i.to} onClick={() => setOpen(false)}>
                  <Icon name={i.icon} />
                  {i.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="side-foot">
          <div className="who">
            <p className="small strong">{me.admin.name}</p>
            <p>{me.admin.role === 'OWNER' ? 'Owner' : 'Viewer (read only)'}</p>
          </div>
          <button type="button" className="btn btn-icon" onClick={signOut}>
            <Icon name="logout" label="Sign out" />
          </button>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { roleLabel } from '@school/core/browser';
import { useAccent, useAccess, useMe, useSignOut } from '../lib/session';
import { Icon, type IconName } from './Icon';
import { Avatar } from './ui';

interface Item {
  to: string;
  label: string;
  icon: IconName;
  show: (a: ReturnType<typeof useAccess>) => boolean;
}

/** Menu entries appear only for people who can use them. */
const GROUPS: { title?: string; items: Item[] }[] = [
  { items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', show: () => true }] },
  {
    title: 'Academics',
    items: [
      { to: '/students', label: 'Students', icon: 'students', show: (a) => a.can('students.view') },
      { to: '/attendance', label: 'Attendance', icon: 'attendance', show: (a) => a.can('attendance.view') || a.can('attendance.mark') },
      { to: '/classes', label: 'Classes & sections', icon: 'classes', show: (a) => a.can('classes.manage') },
    ],
  },
  {
    title: 'Staff',
    items: [
      { to: '/check-in', label: 'My check-in', icon: 'pin', show: (a) => a.can('staff_attendance.mark') },
      { to: '/staff-attendance', label: 'Staff attendance', icon: 'clock', show: (a) => a.schoolWide('staff_attendance.view') },
      { to: '/staff', label: 'Staff', icon: 'staff', show: (a) => a.schoolWide('staff.view') },
      { to: '/zones', label: 'Attendance zones', icon: 'zone', show: (a) => a.can('geofences.manage') },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/roles', label: 'Roles & access', icon: 'roles', show: (a) => a.can('roles.manage') },
      { to: '/settings', label: 'School settings', icon: 'settings', show: (a) => a.can('settings.manage') },
    ],
  },
];

const STORAGE_LABEL = {
  sheets: 'Saved to Google Sheets',
  file: 'Saved on this computer',
  memory: 'Test mode: nothing is saved',
} as const;

export function Shell() {
  const { data: me } = useMe();
  const access = useAccess();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  useAccent(me?.school.accentColor);
  if (!me) return null;

  const school = me.school.schoolName;
  const crest = school
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  return (
    <div className="app">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <div className="crest" aria-hidden="true">
            {crest || 'S'}
          </div>
          <p className="brand-name">{school}</p>
          <button
            type="button"
            className="btn btn-ghost btn-icon menu-toggle"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'close' : 'menu'} label={open ? 'Close menu' : 'Open menu'} />
          </button>
        </div>

        <nav id="main-nav" className="nav" aria-label="Main">
          {GROUPS.map((group, gi) => {
            const items = group.items.filter((i) => i.show(access));
            if (items.length === 0) return null;
            return (
              <div key={gi} className="nav">
                {group.title && <p className="nav-group">{group.title}</p>}
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setOpen(false)}>
                    <Icon name={item.icon} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div className="sync">
          <span className={`dot${me.storage === 'memory' ? ' warn' : ''}`} aria-hidden="true" />
          <div>
            <p className="small strong">{STORAGE_LABEL[me.storage]}</p>
            <p className="tiny muted">Changes save as you make them</p>
          </div>
        </div>

        <div className="me">
          <Avatar name={me.user.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="small strong">{me.user.name}</p>
            <p className="tiny muted">{me.roles.map(roleLabel).join(', ') || 'No role yet'}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={signOut}>
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

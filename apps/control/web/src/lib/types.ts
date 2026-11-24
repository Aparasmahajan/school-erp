export type Health = 'live' | 'stale' | 'offline' | 'never' | 'paused';
export type SchoolStatus = 'ONBOARDING' | 'LIVE' | 'SUSPENDED' | 'OFFBOARDED';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'VIEWER';
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  lastLoginAt: string;
  createdAt: string;
}

export interface Me {
  admin: Admin;
  displayTimezone: string;
  storage: 'sheets' | 'file' | 'memory';
}

export interface Snapshot {
  at?: string;
  appVersion?: string;
  storage?: string;
  schoolName?: string;
  timezone?: string;
  students?: number;
  staff?: number;
  sections?: number;
  sectionsMarked?: number;
  presentPct?: number | null;
  staffCheckedIn?: number;
  errors?: number;
  queued?: number;
  dropped?: number;
  uptimeS?: number;
}

export interface School {
  id: string;
  code: string;
  name: string;
  city: string;
  board: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  appUrl: string;
  plan: string;
  status: SchoolStatus;
  keyPrefix: string;
  keyRotatedAt: string;
  onboardedAt: string;
  notes: string;
  createdAt: string;
  lastSeenAt: string;
  appVersion: string;
  schemaVersion: number | null;
  snapshot: Snapshot | null;
  health: Health;
  issues: string[];
}

export interface OverviewSchool {
  id: string;
  code: string;
  name: string;
  city: string;
  board: string;
  status: SchoolStatus;
  health: Health;
  issues: string[];
  lastSeenAt: string;
  appVersion: string;
  students: number | null;
  staff: number | null;
  sections: number | null;
  sectionsMarked: number | null;
  presentPct: number | null;
  staffCheckedIn: number | null;
  events24h: number;
  errors24h: number;
  activity: number[];
}

export interface Overview {
  now: string;
  today: string;
  days: string[];
  latestVersion: string;
  schools: OverviewSchool[];
  totals: {
    schools: number;
    live: number;
    stale: number;
    offline: number;
    never: number;
    paused: number;
    students: number;
    staff: number;
    events24h: number;
    errors24h: number;
  };
}

export interface TrailEvent {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  at: string;
  receivedAt: string;
  kind: 'audit' | 'error';
  action: string;
  entity: string;
  entityId: string;
  actorId: string;
  actorRoles: string[] | null;
  detail: { before?: Record<string, unknown>; after?: Record<string, unknown>; message?: string } | null;
}

export interface HeartbeatPoint {
  id: string;
  at: string;
  presentPct: number | null;
  staffCheckedIn: number | null;
  students: number | null;
  errors: number | null;
}

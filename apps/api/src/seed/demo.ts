import {
  addDays,
  countMarks,
  newId,
  todayIn,
  weekday,
  type AttendanceRow,
  type GuardianRow,
  type MarkStatus,
  type RoleKey,
  type SectionRow,
  type StaffAttendanceRow,
  type StudentRow,
  type UserRoleRow,
  type UserRow,
} from '@school/core';
import { hashPassword } from '../auth/passwords';
import type { Store } from '../store';
import { seedBase } from './base';

/**
 * A believable demo school for development and screenshots. Refused in production by the
 * config, and never loaded on top of a store that already has students.
 *
 * Every demo login shares DEMO_PASSWORD, which is printed on start-up and in the README.
 */
export const DEMO_PASSWORD = 'Demo@12345';

export const DEMO_LOGINS = [
  { email: 'principal@demo.school', label: 'Principal (everything)' },
  { email: 'office@demo.school', label: 'Office admin (students, staff, zones)' },
  { email: 'accounts@demo.school', label: 'Accountant' },
  { email: 'teacher@demo.school', label: 'Class teacher of 7-B (Meera Iyer)' },
];

/** Centre of the demo attendance zone. Change it on the Attendance zones screen. */
export const DEMO_ZONE = { name: 'Main campus', lat: 26.9124, lng: 75.7873, radiusM: 200 };

const BOYS = ['Aarav', 'Arjun', 'Kabir', 'Vivaan', 'Reyansh', 'Ishaan', 'Rohan', 'Farhan', 'Nikhil', 'Dev', 'Aditya', 'Om', 'Kunal', 'Yash', 'Rahul', 'Imran'];
const GIRLS = ['Ananya', 'Diya', 'Ishita', 'Meher', 'Saanvi', 'Pooja', 'Aadhya', 'Kavya', 'Riya', 'Sara', 'Harshita', 'Esha', 'Bhavya', 'Nisha', 'Zoya', 'Tanvi'];
const SURNAMES = ['Sharma', 'Gupta', 'Mehta', 'Patel', 'Khan', 'Rao', 'Singh', 'Kaur', 'Verma', 'Nair', 'Das', 'Reddy', 'Joshi', 'Iyer', 'Malhotra', 'Bansal', 'Pillai', 'Saini', 'Yadav', 'Ali'];
const ADULT_M = ['Rakesh', 'Vikram', 'Manish', 'Sunil', 'Ajay', 'Harpreet', 'Salim', 'Prakash'];
const ADULT_F = ['Neha', 'Hetal', 'Salma', 'Jasleen', 'Lakshmi', 'Kavita', 'Anjali', 'Rekha'];

/** Small deterministic generator, so the demo looks the same on every machine. */
function generator(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return { next, pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)], digits: (n: number) => Array.from({ length: n }, () => Math.floor(next() * 10)).join('') };
}

export async function seedDemo(store: Store): Promise<void> {
  await seedBase(store, { schoolName: 'Sunrise Public School (demo)' });
  if ((await store.all('students')).length > 0) return;

  const rand = generator(20261124);
  const now = new Date().toISOString();
  const timezone = (await store.all('settings')).find((r) => r.id === 'timezone')?.value || 'Asia/Kolkata';
  const today = todayIn(timezone);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ── staff ──
  const staffSpec: [string, string, RoleKey[]][] = [
    ['Anita Kapoor', 'principal@demo.school', ['PRINCIPAL']],
    ['Sunita Rao', 'office@demo.school', ['OFFICE_ADMIN']],
    ['Rohit Joshi', 'accounts@demo.school', ['ACCOUNTANT']],
    ['Meera Iyer', 'teacher@demo.school', ['CLASS_TEACHER', 'SUBJECT_TEACHER']],
    ['Arun Thomas', 'arun@demo.school', ['CLASS_TEACHER', 'SUBJECT_TEACHER']],
    ['Kavita Fernandes', 'kavita@demo.school', ['CLASS_TEACHER', 'SUBJECT_TEACHER']],
    ['Imran Sheikh', 'imran@demo.school', ['CLASS_TEACHER', 'SUBJECT_TEACHER']],
    ['Neha Bhatt', 'neha@demo.school', ['CLASS_TEACHER', 'SUBJECT_TEACHER']],
    ['Pradeep Nair', 'pradeep@demo.school', ['SUBJECT_TEACHER']],
  ];
  const users: UserRow[] = staffSpec.map(([name, email]) => ({
    id: newId('usr'), email, name, phone: `+91 98${rand.digits(8)}`, passwordHash, status: 'ACTIVE',
    createdAt: now, createdBy: 'demo', lastLoginAt: '',
  }));
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const userRoles: UserRoleRow[] = staffSpec.flatMap(([, email, roles]) =>
    roles.map((role) => ({ id: newId('ur'), userId: byEmail.get(email)!.id, role, validFrom: now, validTo: '', assignedBy: 'demo', assignedAt: now }))
  );
  await store.insert('users', users);
  await store.insert('user_roles', userRoles);

  // ── classes 6–10, sections A–C ──
  const classes = [6, 7, 8, 9, 10].map((n) => ({ id: newId('cls'), name: `Class ${n}`, sortOrder: n }));
  await store.insert('classes', classes);
  const teacherFor: Record<string, string> = {
    '6-A': 'arun@demo.school',
    '7-B': 'teacher@demo.school',
    '8-A': 'imran@demo.school',
    '9-C': 'kavita@demo.school',
    '10-A': 'neha@demo.school',
  };
  const sections: (SectionRow & { label: string; grade: number })[] = classes.flatMap((cls) =>
    ['A', 'B', 'C'].map((name) => {
      const label = `${cls.sortOrder}-${name}`;
      return {
        id: newId('sec'), classId: cls.id, name, room: `${cls.sortOrder}${name}`,
        classTeacherId: teacherFor[label] ? byEmail.get(teacherFor[label])!.id : '',
        label, grade: cls.sortOrder,
      };
    })
  );
  await store.insert('sections', sections.map(({ label: _l, grade: _g, ...s }) => s));
  const secByLabel = new Map(sections.map((s) => [s.label, s]));
  await store.insert('teaching', [
    { id: newId('tch'), userId: byEmail.get('teacher@demo.school')!.id, sectionId: secByLabel.get('8-A')!.id, subject: 'Science' },
    { id: newId('tch'), userId: byEmail.get('teacher@demo.school')!.id, sectionId: secByLabel.get('8-C')!.id, subject: 'Science' },
    { id: newId('tch'), userId: byEmail.get('pradeep@demo.school')!.id, sectionId: secByLabel.get('7-B')!.id, subject: 'Mathematics' },
    { id: newId('tch'), userId: byEmail.get('pradeep@demo.school')!.id, sectionId: secByLabel.get('9-C')!.id, subject: 'Mathematics' },
  ]);

  // ── 12 students per section, with a guardian each ──
  const students: StudentRow[] = [];
  const guardians: GuardianRow[] = [];
  let admission = 300;
  for (const section of sections) {
    const kids = Array.from({ length: 12 }, (_, i) => {
      const girl = i % 2 === 1;
      return { first: rand.pick(girl ? GIRLS : BOYS), last: rand.pick(SURNAMES), girl };
    }).sort((a, b) => a.first.localeCompare(b.first));
    kids.forEach((kid, i) => {
      admission += 1;
      const born = 2026 - section.grade - 6;
      const student: StudentRow = {
        id: newId('stu'),
        admissionNo: `${2018 + Math.floor(rand.next() * 5)}/${String(admission).padStart(4, '0')}`,
        firstName: kid.first, lastName: kid.last, gender: kid.girl ? 'F' : 'M',
        dob: `${born}-${String(1 + Math.floor(rand.next() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand.next() * 28)).padStart(2, '0')}`,
        sectionId: section.id, rollNo: i + 1, status: 'ACTIVE', joinedOn: '2026-04-01', createdAt: now, createdBy: 'demo',
      };
      students.push(student);
      const mother = i % 3 === 0;
      guardians.push({
        id: newId('grd'), studentId: student.id,
        name: `${rand.pick(mother ? ADULT_F : ADULT_M)} ${kid.last}`, relation: mother ? 'Mother' : 'Father',
        phone: `+91 9${rand.digits(4)} ${rand.digits(5)}`, email: '', isPrimary: true, userId: '',
      });
    });
  }
  await store.insert('students', students);
  await store.insert('guardians', guardians);

  // ── the last 8 school days for sections with a class teacher (today left unmarked) ──
  const days: string[] = [];
  for (let d = addDays(today, -1); days.length < 8; d = addDays(d, -1)) if (weekday(d) !== 0) days.push(d);
  const records: AttendanceRow[] = [];
  const streakKid = students.find((s) => s.sectionId === secByLabel.get('8-A')!.id && s.rollNo === 3)!;
  for (const section of sections.filter((s) => s.classTeacherId)) {
    const roster = students.filter((s) => s.sectionId === section.id);
    days.forEach((date, dayIndex) => {
      const marks: Record<string, MarkStatus> = {};
      for (const s of roster) {
        const r = rand.next();
        marks[s.id] = r < 0.92 ? 'P' : r < 0.96 ? 'A' : r < 0.985 ? 'L' : 'LV';
        if (s.id === streakKid.id && dayIndex < 3) marks[s.id] = 'A';
      }
      records.push({
        id: newId('att'), sectionId: section.id, date, marks, ...countMarks(marks),
        markedBy: section.classTeacherId, markedAt: `${date}T03:45:00.000Z`, updatedBy: '', updatedAt: '',
      });
    });
  }
  await store.insert('attendance', records);

  // ── attendance zone and two staff check-ins today ──
  await store.insert('geofences', [{ id: newId('zon'), ...DEMO_ZONE, active: true, updatedBy: 'demo', updatedAt: now }]);
  const checkIn = (email: string, minutesAgo: number, metres: number): StaffAttendanceRow => ({
    id: newId('sat'), userId: byEmail.get(email)!.id, date: today,
    checkInAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    checkInLat: DEMO_ZONE.lat + metres / 111_195, checkInLng: DEMO_ZONE.lng, checkInAccuracyM: 18, checkInDistanceM: metres,
    checkInZoneId: '', checkOutAt: '', checkOutLat: null, checkOutLng: null, checkOutAccuracyM: null, checkOutDistanceM: null, checkOutZoneId: '',
  });
  const zoneId = (await store.all('geofences'))[0].id;
  await store.insert('staff_attendance', [
    { ...checkIn('principal@demo.school', 95, 40), checkInZoneId: zoneId },
    { ...checkIn('office@demo.school', 70, 85), checkInZoneId: zoneId },
  ]);
}

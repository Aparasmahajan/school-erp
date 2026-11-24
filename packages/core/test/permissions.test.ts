import { describe, expect, it } from 'vitest';
import { can, covers, defaultGrants, hasCapability, type Actor } from '../src';

const grants = defaultGrants();

const teacher7B: Actor = {
  userId: 'usr_meera',
  roles: ['CLASS_TEACHER', 'SUBJECT_TEACHER'],
  classTeacherOf: ['sec_7b'],
  teaches: ['sec_8a'],
  children: [],
};

const parent: Actor = { userId: 'usr_parent', roles: ['PARENT'], classTeacherOf: [], teaches: [], children: ['stu_diya'] };
const principal: Actor = { userId: 'usr_anita', roles: ['PRINCIPAL'], classTeacherOf: [], teaches: [], children: [] };

describe('reach is checked against the target, not just the role', () => {
  it('a class teacher reaches students in their own section only', () => {
    expect(can(teacher7B, 'students.view', { kind: 'student', studentId: 's1', sectionId: 'sec_7b' }, grants)).toBe(true);
    expect(can(teacher7B, 'students.view', { kind: 'student', studentId: 's2', sectionId: 'sec_9c' }, grants)).toBe(false);
  });

  it('teaching a section lets you view it but not mark its daily attendance', () => {
    const sec8a = { kind: 'section', sectionId: 'sec_8a' } as const;
    expect(can(teacher7B, 'attendance.view', sec8a, grants)).toBe(true);
    expect(can(teacher7B, 'attendance.mark', sec8a, grants)).toBe(false);
    expect(can(teacher7B, 'attendance.mark', { kind: 'section', sectionId: 'sec_7b' }, grants)).toBe(true);
  });

  it('a parent reaches only their own child', () => {
    expect(can(parent, 'students.view', { kind: 'student', studentId: 'stu_diya', sectionId: 'sec_7c' }, grants)).toBe(true);
    expect(can(parent, 'students.view', { kind: 'student', studentId: 'stu_other', sectionId: 'sec_7c' }, grants)).toBe(false);
    expect(can(parent, 'attendance.view', { kind: 'section', sectionId: 'sec_7c' }, grants)).toBe(false);
  });

  it('SELF covers only your own user record', () => {
    expect(can(teacher7B, 'staff_attendance.mark', { kind: 'user', userId: 'usr_meera' }, grants)).toBe(true);
    expect(can(teacher7B, 'staff_attendance.mark', { kind: 'user', userId: 'usr_anita' }, grants)).toBe(false);
  });

  it('school-wide targets need SCHOOL reach', () => {
    expect(can(principal, 'roles.manage', { kind: 'school' }, grants)).toBe(true);
    expect(can(teacher7B, 'roles.manage', { kind: 'school' }, grants)).toBe(false);
    expect(covers(teacher7B, 'OWN_CLASS', { kind: 'school' })).toBe(false);
  });

  it('NONE never grants, and an actor with no roles can do nothing', () => {
    const nobody: Actor = { ...teacher7B, roles: [] };
    expect(can(nobody, 'students.view', { kind: 'student', studentId: 's1', sectionId: 'sec_7b' }, grants)).toBe(false);
    expect(can(teacher7B, 'students.view', { kind: 'student', studentId: 's1', sectionId: 'sec_7b' }, [
      { role: 'CLASS_TEACHER', capability: 'students.view', reach: 'NONE' },
    ])).toBe(false);
  });

  it('hasCapability is for menus only and reports any reach', () => {
    expect(hasCapability(teacher7B, 'attendance.mark', grants)).toBe(true);
    expect(hasCapability(parent, 'attendance.mark', grants)).toBe(false);
  });
});

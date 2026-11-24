import { describe, expect, it } from 'vitest';
import { TABLE_NAMES, TABLES, decodeRow, encodeRow, newId, type AttendanceRow, type StudentRow } from '../src';

describe('codec', () => {
  it('every table has id as its first column', () => {
    for (const t of TABLE_NAMES) expect(Object.keys(TABLES[t])[0]).toBe('id');
  });

  it('round-trips a student unchanged, keeping admission numbers and phones as text', () => {
    const s: StudentRow = {
      id: 'stu_1', admissionNo: '2019/0412', firstName: 'Diya', lastName: 'Patel', gender: 'F',
      dob: '2014-03-14', sectionId: 'sec_7c', rollNo: 4, status: 'ACTIVE', joinedOn: '2019-04-02',
      createdAt: '2026-11-24T04:00:00.000Z', createdBy: 'usr_1',
    };
    const cells = encodeRow('students', s);
    expect(cells.every((c) => typeof c === 'string')).toBe(true);
    expect(decodeRow('students', cells)).toEqual(s);
  });

  it('round-trips JSON marks and empty numbers', () => {
    const a: AttendanceRow = {
      id: 'att_1', sectionId: 'sec_7b', date: '2026-11-24', marks: { stu_1: 'P', stu_2: 'A' },
      present: 1, absent: 1, late: 0, leave: null, markedBy: 'usr_1', markedAt: 'x', updatedBy: '', updatedAt: '',
    };
    expect(decodeRow('attendance', encodeRow('attendance', a))).toEqual(a);
  });

  it('accepts typed values the Sheets API returns for hand-edited cells', () => {
    const row = decodeRow('geofences', ['z1', 'Campus', 26.9, 75.7, 150, true, 'u', 't']);
    expect(row).toMatchObject({ lat: 26.9, lng: 75.7, radiusM: 150, active: true });
  });

  it('newId is short, prefixed and unique', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId('stu')));
    expect(ids.size).toBe(5000);
    expect([...ids][0]).toMatch(/^stu_[0-9a-z]{10}$/);
  });
});

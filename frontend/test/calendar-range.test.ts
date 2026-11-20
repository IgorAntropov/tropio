import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  calendarDate,
  dateKey,
  localToday,
  monthWeeks,
  readDate,
  shiftMonth,
} from '../src/shared/ui/date-range/calendar';

describe('calendar days', () => {
  it('round trips ISO days without normalizing invalid dates', () => {
    for (const value of ['0001-01-01', '0099-07-19', '2000-02-29', '2027-01-01', '9999-12-31']) {
      expect(dateKey(readDate(value)!)).toBe(value);
    }
    for (const value of ['', '31.12.2026', '0000-02-01', '1900-02-29', '2026-11-31', '2026-13-01']) {
      expect(readDate(value)).toBeUndefined();
    }
  });

  it('uses local calendar fields for today', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
      expect(dateKey(localToday())).toBe('2026-12-31');
    }
    finally {
      vi.useRealTimers();
    }
  });

  it('crosses the new year in both directions and clamps shorter months', () => {
    expect(dateKey(shiftMonth(calendarDate(2026, 11, 31), 1))).toBe('2027-01-31');
    expect(dateKey(shiftMonth(calendarDate(2027, 0, 1), -1))).toBe('2026-12-01');
    expect(dateKey(shiftMonth(calendarDate(2024, 0, 31), 1))).toBe('2024-02-29');
    expect(dateKey(shiftMonth(calendarDate(2024, 1, 29), 12))).toBe('2025-02-28');
  });

  it('aligns days to Monday and spans as many weeks as the month needs', () => {
    const december = monthWeeks(calendarDate(2026, 11, 31));
    expect(december).toHaveLength(5);
    expect(december[0]?.[0]).toBeNull();
    expect(december[0]?.[1]?.getUTCDate()).toBe(1);
    expect(december[4]?.[3]?.getUTCDate()).toBe(31);
    expect(december[4]?.[4]).toBeNull();
    expect(monthWeeks(calendarDate(2026, 10, 1))).toHaveLength(6);
    expect(monthWeeks(calendarDate(2021, 1, 1))).toHaveLength(4);
  });
});

export function calendarDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function readDate(value: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) {
    return;
  }
  const date = new Date(value + 'T00:00:00Z');
  if (date.getUTCFullYear() >= 1 && dateKey(date) === value) {
    return date;
  }
}

export function localToday() {
  const now = new Date();
  return calendarDate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function shiftMonth(date: Date, offset: number) {
  const last = calendarDate(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0);
  last.setUTCDate(Math.min(last.getUTCDate(), date.getUTCDate()));
  return last;
}

export function mondayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

export function monthWeeks(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const days = calendarDate(year, month + 1, 0).getUTCDate();
  const offset = mondayIndex(calendarDate(year, month, 1));
  return Array.from({ length: Math.ceil((offset + days) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - offset + 1;
      return day >= 1 && day <= days ? calendarDate(year, month, day) : null;
    }),
  );
}

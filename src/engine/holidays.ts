// Holiday dates for "coming up" (rules defined in lib/engine/holidays.dart).
import { HolidayGroup } from './library';

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** ISO weekday 1 = Monday … 7 = Sunday. */
const isoDay = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/** The holiday's date in `year`, or null if the rule doesn't cover it. */
export function holidayDate(rule: string, year: number): Date | null {
  const [kind, arg] = rule.split(/:(.*)/s);
  switch (kind) {
    case 'fixed': {
      const [m, d] = arg.split('-').map(Number);
      return new Date(year, m - 1, d);
    }
    case 'easter': {
      const e = easter(year);
      return new Date(year, e.getMonth(), e.getDate() + Number(arg));
    }
    case 'nth': {
      const [m, w, n] = arg.split(':').map(Number);
      const first = new Date(year, m - 1, 1);
      const offset = (w - isoDay(first) + 7) % 7;
      return new Date(year, m - 1, 1 + offset + (n - 1) * 7);
    }
    case 'last': {
      const [m, w] = arg.split(':').map(Number);
      const last = new Date(year, m, 0);
      return new Date(year, m - 1, last.getDate() - ((isoDay(last) - w + 7) % 7));
    }
    case 'dates': {
      const hit = arg.split(',').find((s) => s.startsWith(`${year}-`));
      if (!hit) return null;
      const [y, m, d] = hit.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
  }
  return null;
}

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Days from `today` until the holiday's next occurrence (0 = today). */
export function daysUntil(h: HolidayGroup, today = new Date()): number | null {
  const t = startOfDay(today);
  for (const year of [t.getFullYear(), t.getFullYear() + 1]) {
    const d = holidayDate(h.rule, year);
    if (d && d >= t) return Math.round((d.getTime() - t.getTime()) / DAY);
  }
  return null;
}

/** Holidays sorted by how soon they come next (unknown dates last). */
export function byUpcoming(groups: HolidayGroup[], today = new Date()): { group: HolidayGroup; days: number | null }[] {
  return groups
    .map((group) => ({ group, days: daysUntil(group, today) }))
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
}

export function describeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  return `in ${Math.round(days / 7)} weeks`;
}

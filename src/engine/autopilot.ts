// Seasonal autopilot: which look the schedule turns on with, by date. The
// controller does the switching itself with date-ranged WLED timers, so the
// periods here are month/day ranges with no year (see docs/how-it-works.md).
import { holidayDate } from './holidays';
import { HolidayGroup } from './library';
import { Look } from './model';

export interface Season {
  holidayId: string;
  /** Looks shown in turn, one per day of the week (up to 7). */
  lookIds: string[];
  daysBefore: number;
  daysAfter: number;
  enabled: boolean;
}

export interface Autopilot {
  enabled: boolean;
  seasons: Season[];
  /** The look for days outside every season. */
  everydayLookId: string;
  /** datesFingerprint of the periods last written to the controller. */
  syncedDates?: string;
}

export interface MonthDay {
  mon: number;
  day: number;
}

export interface Period {
  /** Holiday id, or EVERYDAY. */
  key: string;
  label: string;
  emoji: string;
  lookIds: string[];
  start: MonthDay;
  end: MonthDay;
}

export const EVERYDAY = 'everyday';
export const EVERYDAY_LOOK = 'builtin.warm_white';
export const MAX_ROTATION = 7;

const DEFAULTS: [string, number, number][] = [
  ['valentines', 7, 0],
  ['st_patricks', 7, 0],
  ['easter', 7, 0],
  ['july_4th', 7, 1],
  ['halloween', 30, 0],
  ['thanksgiving', 7, 0],
  ['christmas', 30, 7],
];

/** Default seasons, each rotating through its holiday's first few looks. */
export function defaultAutopilot(holidays: HolidayGroup[], looks: Look[]): Autopilot {
  return {
    enabled: false,
    everydayLookId: EVERYDAY_LOOK,
    seasons: DEFAULTS.filter(([id]) => holidays.some((h) => h.id === id)).map(([holidayId, daysBefore, daysAfter]) => ({
      holidayId,
      lookIds: rotationFor(holidayId, looks),
      daysBefore,
      daysAfter,
      enabled: true,
    })),
  };
}

function rotationFor(holidayId: string, looks: Look[]): string[] {
  const ids = looks.filter((l) => l.group === holidayId).map((l) => l.id);
  // Holidays with many looks (Christmas, Halloween) mix the classics with the newer ones.
  const step = Math.max(1, Math.floor(ids.length / MAX_ROTATION));
  const out = ids.filter((_, i) => i % step === 0).slice(0, MAX_ROTATION);
  return out.length ? out : [EVERYDAY_LOOK];
}

/**
 * Which weekdays (WLED dow mask, bit 0 = Monday) show each look of a
 * rotation: day d shows look d mod n, so neighbouring days differ.
 */
export function rotationDays(count: number): number[] {
  const masks = Array.from({ length: Math.min(count, MAX_ROTATION) }, () => 0);
  for (let d = 0; d < 7; d++) masks[d % masks.length] |= 1 << d;
  return masks;
}

const DAY = 86400000;
const dayIndex = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
const fromIndex = (i: number): MonthDay => {
  const d = new Date(i * DAY);
  return { mon: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

/** The season's next run of days (ending today or later), as day indexes. */
function nextRange(s: Season, h: HolidayGroup, today: number): [number, number] | null {
  const year = new Date(today * DAY).getUTCFullYear();
  for (const y of [year - 1, year, year + 1]) {
    const d = holidayDate(h.rule, y);
    if (!d) continue;
    const at = dayIndex(d);
    if (at + s.daysAfter >= today) return [at - s.daysBefore, at + s.daysAfter];
  }
  return null;
}

export interface SeasonPlan {
  periods: Period[];
  /** Seasons whose holiday has no known date in the coming year. */
  skipped: string[];
}

/**
 * Splits the next 365 days into periods. On days where seasons overlap the
 * shorter one wins (Thanksgiving week over the start of Christmas).
 */
export function seasonPeriods(autopilot: Autopilot, holidays: HolidayGroup[], today = new Date()): SeasonPlan {
  const t = dayIndex(today);
  const skipped: string[] = [];
  const ranges: { season: Season; group: HolidayGroup; from: number; to: number }[] = [];
  for (const season of autopilot.seasons) {
    const group = holidays.find((h) => h.id === season.holidayId);
    if (!season.enabled || !group) continue;
    const r = nextRange(season, group, t);
    if (!r) skipped.push(group.name);
    else ranges.push({ season, group, from: r[0], to: r[1] });
  }
  ranges.sort((a, b) => a.to - a.from - (b.to - b.from));

  type Info = Omit<Period, 'start' | 'end'>;
  const everyday: Info = { key: EVERYDAY, label: 'Everyday', emoji: '🏡', lookIds: [autopilot.everydayLookId] };
  const days: Info[] = [];
  for (let i = t; i < t + 365; i++) {
    const r = ranges.find((x) => i >= x.from && i <= x.to) ?? ranges.find((x) => i - 365 >= x.from && i - 365 <= x.to);
    days.push(r ? { key: r.group.id, label: r.group.name, emoji: r.group.emoji, lookIds: r.season.lookIds.length ? r.season.lookIds.slice(0, MAX_ROTATION) : [autopilot.everydayLookId] } : everyday);
  }

  const runs: { info: Info; from: number; to: number }[] = [];
  days.forEach((info, k) => {
    const last = runs.at(-1);
    if (last && last.info.key === info.key) last.to = t + k;
    else runs.push({ info, from: t + k, to: t + k });
  });
  // The year is a circle: the run before today continues the last one.
  if (runs.length > 1 && runs[0].info.key === runs.at(-1)!.info.key) {
    runs.at(-1)!.to = runs[0].to + 365;
    runs.shift();
  }
  if (runs.length === 1) return { periods: [{ ...runs[0].info, start: { mon: 1, day: 1 }, end: { mon: 12, day: 31 } }], skipped };
  return { periods: runs.map((r) => ({ ...r.info, start: fromIndex(r.from), end: fromIndex(r.to) })), skipped };
}

const inRange = (p: Period, mon: number, day: number) => {
  const v = mon * 100 + day;
  const a = p.start.mon * 100 + p.start.day;
  const b = p.end.mon * 100 + p.end.day;
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
};

/** The period covering `today`, with the date it ends. */
export function currentPeriod(periods: Period[], today = new Date()): Period | undefined {
  return periods.find((p) => inRange(p, today.getMonth() + 1, today.getDate()));
}

export const datesFingerprint = (periods: Period[]) =>
  periods.map((p) => `${p.key}:${p.lookIds.join('+')}:${p.start.mon}-${p.start.day}:${p.end.mon}-${p.end.day}`).join(',');

export const describeMonthDay = (d: MonthDay) => new Date(2001, d.mon - 1, d.day).toLocaleDateString([], { month: 'short', day: 'numeric' });

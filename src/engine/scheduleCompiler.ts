// Turns a Schedule into WLED timers (port of lib/engine/schedule_compiler.dart).
import { Schedule, ScheduleTime, Weekdays, isSun, timeEquals, usesSun } from './model';
import { SunTimes, sunTimes } from './sunTimes';

export interface TimerCapabilities {
  /** WLED 0.15: 8 clock slots + sunrise + sunset by position. 16+: a list. */
  legacy: boolean;
  maxTimers: number;
}

export const WLED16: TimerCapabilities = { legacy: false, maxTimers: 64 };
export const WLED015: TimerCapabilities = { legacy: true, maxTimers: 10 };

export function capabilitiesFor(version: string, arch: string): TimerCapabilities {
  const major = parseInt(version.split('.')[0], 10) || 0;
  if (major < 16) return WLED015;
  return { legacy: false, maxTimers: arch.toLowerCase().includes('8266') ? 16 : 64 };
}

const maxSunOffset = (c: TimerCapabilities) => (c.legacy ? 59 : 120);

export type WledTimer = {
  en: number;
  hour: number;
  min: number;
  macro: number;
  dow: number;
  start: { mon: number; day: number };
  end: { mon: number; day: number };
};

export interface CompiledSchedule {
  timers: WledTimer[];
  errors: string[];
  warnings: string[];
}

type MonthDay = { mon: number; day: number };

/** A preset the "on" times call between two dates (seasonal autopilot). */
export interface DatedPreset {
  preset: number;
  start: MonthDay;
  end: MonthDay;
  /** Only on these weekdays (a daily look rotation). */
  dow?: number;
}

/** Seasonal "on" presets for the first time window; the others turn on
 * with `plain` (keeping the day's look), which saves WLED timers. */
export interface SeasonalOn {
  dated: DatedPreset[];
  plain: number;
}

interface Event {
  time: ScheduleTime;
  days: number;
  preset: number;
  range?: DatedPreset;
}

const YEAR = { start: { mon: 1, day: 1 }, end: { mon: 12, day: 31 } };

const timer = (en: boolean, hour: number, min: number, macro: number, dow = Weekdays.all, range = YEAR): WledTimer => ({
  en: en ? 1 : 0,
  hour,
  min,
  macro,
  dow,
  start: { ...range.start },
  end: { ...range.end },
});

export function compileSchedule(
  schedule: Schedule,
  onPreset: number | SeasonalOn,
  offPreset: number,
  caps: TimerCapabilities,
  today = new Date(),
): CompiledSchedule {
  const errors: string[] = [];
  const warnings: string[] = [];
  const events: Event[] = [];
  const sun = schedule.location ? sunTimes(today, schedule.location.lat, schedule.location.lon) : null;

  if (schedule.enabled) {
    const active = schedule.windows.filter((w) => w.enabled);
    if (active.length === 0) warnings.push("No time windows are turned on, so the lights won't switch automatically.");
    if (usesSun(schedule) && !schedule.location) errors.push('Set your zip code or location to use sunrise and sunset.');
    active.forEach((w, i) => {
      const name = `Time ${i + 1}`;
      if (w.days === 0) return void errors.push(`${name} has no days selected.`);
      if (timeEquals(w.on, w.off)) return void errors.push(`${name} turns on and off at the same time.`);
      const on = clampOffset(w.on, caps, warnings, name);
      const off = clampOffset(w.off, caps, warnings, name);
      // A window like 7 PM - 2 AM turns off the next morning.
      const offDays = approxMinutes(off, sun) <= approxMinutes(on, sun) ? Weekdays.nextDay(w.days) : w.days;
      if (typeof onPreset === 'number') events.push({ time: on, days: w.days, preset: onPreset });
      else if (i > 0) events.push({ time: on, days: w.days, preset: onPreset.plain });
      else {
        for (const range of onPreset.dated) {
          const days = w.days & (range.dow ?? Weekdays.all);
          if (days) events.push({ time: on, days, preset: range.preset, range });
        }
      }
      events.push({ time: off, days: offDays, preset: offPreset });
    });
  }

  const timers = caps.legacy ? legacyTimers(events, errors) : timers16(events);
  if (!caps.legacy && timers.length > caps.maxTimers) {
    errors.push(
      typeof onPreset === 'number'
        ? `Your controller allows ${caps.maxTimers / 2} time windows at most.`
        : `Seasons and times need ${timers.length} WLED timers but your controller allows ${caps.maxTimers}. Turn off some seasons or times.`,
    );
  }
  return { timers, errors, warnings };
}

function clampOffset(t: ScheduleTime, caps: TimerCapabilities, warnings: string[], name: string): ScheduleTime {
  if (t.kind === 'clock' || Math.abs(t.offset) <= maxSunOffset(caps)) return t;
  const max = maxSunOffset(caps);
  warnings.push(`${name}: your controller allows up to ${max} minutes before or after ${t.kind}, so the offset was shortened.`);
  return { kind: t.kind, offset: Math.max(-max, Math.min(max, t.offset)) };
}

function approxMinutes(t: ScheduleTime, sun: SunTimes | null): number {
  if (t.kind === 'clock') return t.hour * 60 + t.minute;
  const at = t.kind === 'sunrise' ? sun?.sunrise : sun?.sunset;
  const base = at ? at.getHours() * 60 + at.getMinutes() : t.kind === 'sunrise' ? 390 : 1110;
  return base + t.offset;
}

const timers16 = (events: Event[]): WledTimer[] =>
  events.map((e) =>
    e.time.kind === 'clock'
      ? timer(true, e.time.hour, e.time.minute, e.preset, e.days, e.range)
      : timer(true, e.time.kind === 'sunrise' ? 255 : 254, e.time.offset, e.preset, e.days, e.range),
  );

/** WLED 0.15 reads timers by position: 8 clock, then sunrise, then sunset
 * (hour 255). Only the clock slots have date ranges. */
function legacyTimers(events: Event[], errors: string[]): WledTimer[] {
  const clock = events.filter((e) => !isSun(e.time));
  const sunrise = events.filter((e) => e.time.kind === 'sunrise');
  const sunset = events.filter((e) => e.time.kind === 'sunset');
  if (clock.length > 8) errors.push('Your controller (WLED 0.15) allows 8 clock times at most. Update WLED to 16 for more.');
  if (sunrise.length > 1 || sunset.length > 1) {
    if ([...sunrise, ...sunset].some((e) => e.range)) {
      errors.push('On WLED 0.15, seasons need a clock time for "on", not sunrise or sunset. Update WLED to 16 to use both.');
    } else {
      errors.push('Your controller (WLED 0.15) allows one sunrise and one sunset time. Update WLED to 16 for more.');
    }
  }
  const sunSlot = (list: Event[]) => {
    const e = list[0];
    return e && e.time.kind !== 'clock' ? timer(true, 255, e.time.offset, e.preset, e.days) : timer(false, 255, 0, 0);
  };
  const out: WledTimer[] = [];
  for (let i = 0; i < 8; i++) {
    const e = clock[i];
    out.push(e && e.time.kind === 'clock' ? timer(true, e.time.hour, e.time.minute, e.preset, e.days, e.range) : timer(false, 0, 0, 0));
  }
  out.push(sunSlot(sunrise), sunSlot(sunset));
  return out;
}

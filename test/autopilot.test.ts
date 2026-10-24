import { Autopilot, currentPeriod, datesFingerprint, defaultAutopilot, rotationDays, seasonPeriods } from '../src/engine/autopilot';
import { builtinLooks, holidayGroups } from '../src/engine/library';
import { ScheduleWindow, Weekdays } from '../src/engine/model';
import { WLED015, WLED16, compileSchedule } from '../src/engine/scheduleCompiler';
import { datedPresets } from '../src/engine/scheduleService';

const oct24 = new Date(2026, 9, 24);
const md = (mon: number, day: number) => ({ mon, day });
const auto = (): Autopilot => ({ ...defaultAutopilot(holidayGroups, builtinLooks), enabled: true });
const find = (a: Autopilot, key: string, today = oct24) => seasonPeriods(a, holidayGroups, today).periods.find((p) => p.key === key);
const win = (on: any, off: any): ScheduleWindow => ({ id: 'w', enabled: true, on, off, days: Weekdays.all });
const clock = (hour: number) => ({ kind: 'clock' as const, hour, minute: 0 });

describe('seasonal autopilot', () => {
  it('Halloween is Oct 1-31 and Christmas wraps to Jan 1', () => {
    const a = auto();
    expect(find(a, 'halloween')).toMatchObject({ start: md(10, 1), end: md(10, 31) });
    // Thanksgiving 2026 is Nov 26: its week beats the start of Christmas (Nov 25).
    expect(find(a, 'thanksgiving')).toMatchObject({ start: md(11, 19), end: md(11, 26) });
    expect(find(a, 'christmas')).toMatchObject({ start: md(11, 27), end: md(1, 1) });
  });

  it('gaps go to the everyday look and the periods cover the whole year', () => {
    const { periods } = seasonPeriods(auto(), holidayGroups, oct24);
    expect(periods.find((p) => p.start.mon === 11 && p.start.day === 1)).toMatchObject({ key: 'everyday', lookIds: ['builtin.warm_white'] });
    let days = 0;
    for (let d = new Date(2027, 0, 1); d.getFullYear() === 2027; d.setDate(d.getDate() + 1)) {
      if (currentPeriod(periods, d)) days++;
    }
    expect(days).toBe(365);
  });

  it('a turned-off season gives its days to everyday', () => {
    const a = auto();
    a.seasons = a.seasons.map((s) => (s.holidayId === 'halloween' ? { ...s, enabled: false } : s));
    expect(find(a, 'halloween')).toBeUndefined();
    expect(currentPeriod(seasonPeriods(a, holidayGroups, oct24).periods, oct24)?.key).toBe('everyday');
    expect(datesFingerprint(seasonPeriods(a, holidayGroups, oct24).periods)).not.toBe(datesFingerprint(seasonPeriods(auto(), holidayGroups, oct24).periods));
  });

  it('leap years: every day is covered and seasons keep their dates', () => {
    for (const today of [new Date(2028, 0, 1), new Date(2027, 2, 1), new Date(2028, 1, 29)]) {
      const { periods } = seasonPeriods(auto(), holidayGroups, today);
      for (let d = new Date(2028, 0, 1); d.getFullYear() === 2028; d.setDate(d.getDate() + 1)) {
        expect(currentPeriod(periods, d), `${today.toDateString()} → ${d.toDateString()}`).toBeDefined();
      }
    }
    // Thanksgiving 2028 is Nov 23, so Christmas gets its full 30 days before Dec 25.
    expect(find(auto(), 'christmas', new Date(2028, 0, 1))).toMatchObject({ start: md(11, 25), end: md(1, 1) });
  });

  it('rotations change look every day and cover every weekday', () => {
    expect(rotationDays(1)).toEqual([0x7f]);
    const three = rotationDays(3);
    expect(three.reduce((a, b) => a | b)).toBe(0x7f);
    expect(three[0] & three[1]).toBe(0);
    expect(rotationDays(7)).toEqual([1, 2, 4, 8, 16, 32, 64]);
    // Sunday (bit 6) and Monday (bit 0) differ for 3+ looks.
    for (const n of [3, 4, 5, 6]) {
      const masks = rotationDays(n);
      expect(masks.every((m) => m > 0), `n=${n}`).toBe(true);
      expect(masks.some((m) => m & 1 && m & 64), `n=${n}`).toBe(false);
    }
    expect(find(auto(), 'halloween')!.lookIds.length).toBeGreaterThan(1);
  });

  it('each look gets an "on" timer for its dates and weekdays; "off" stays all year', () => {
    const { periods } = seasonPeriods(auto(), holidayGroups, oct24);
    const ids = new Map<string, number>();
    const presetFor = (id: string) => ids.get(id) ?? (ids.set(id, ids.size + 1), ids.size);
    const dated = datedPresets(periods, presetFor);
    const c = compileSchedule({ enabled: true, windows: [win(clock(19), clock(22)), win(clock(4), clock(6))] }, { dated, plain: 99 }, 200, WLED16, oct24);
    expect(c.errors).toEqual([]);
    const off = c.timers.filter((t) => t.macro === 200);
    expect(off).toHaveLength(2);
    // The second window just turns on with the day's look.
    expect(c.timers.filter((t) => t.macro === 99)).toMatchObject([{ hour: 4, dow: 0x7f }]);
    expect(c.timers.length).toBeLessThanOrEqual(64);
    expect(off[0]).toMatchObject({ start: md(1, 1), end: md(12, 31), dow: 0x7f });
    const halloween = c.timers.filter((t) => t.start.mon === 10 && t.start.day === 1);
    expect(halloween.length).toBe(find(auto(), 'halloween')!.lookIds.length);
    expect(halloween.reduce((m, t) => m | t.dow, 0)).toBe(0x7f);
    expect(new Set(halloween.map((t) => t.macro)).size).toBe(halloween.length);
  });

  it('autopilot off compiles exactly as before; too many timers is an error', () => {
    const s = { enabled: true, windows: [win(clock(19), clock(22))] };
    expect(compileSchedule(s, 5, 6, WLED16, oct24).timers.map((t) => t.macro)).toEqual([5, 6]);
    const dated = datedPresets(seasonPeriods(auto(), holidayGroups, oct24).periods, () => 1);
    const small = compileSchedule(s, { dated, plain: 1 }, 2, { legacy: false, maxTimers: 16 }, oct24);
    expect(small.errors.join()).toMatch(/Turn off some seasons/);
  });

  it('WLED 0.15 needs clock "on" times for seasons', () => {
    const dated = [
      { preset: 1, start: md(10, 1), end: md(10, 31) },
      { preset: 2, start: md(11, 1), end: md(9, 30) },
    ];
    const c = compileSchedule({ enabled: true, windows: [win({ kind: 'sunset', offset: 0 }, clock(22))], location: { lat: 40, lon: -105, label: '' } }, { dated, plain: 4 }, 3, WLED015, oct24);
    expect(c.errors.join()).toMatch(/seasons need a clock time/);
    const ok = compileSchedule({ enabled: true, windows: [win(clock(19), clock(22))] }, { dated, plain: 4 }, 3, WLED015, oct24);
    expect(ok.errors).toEqual([]);
    expect(ok.timers[0]).toMatchObject({ macro: 1, start: md(10, 1), end: md(10, 31) });
  });
});

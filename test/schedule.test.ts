import { Schedule, ScheduleWindow, Weekdays } from '../src/engine/model';
import { WLED015, WLED16, capabilitiesFor, compileSchedule } from '../src/engine/scheduleCompiler';
import { OFF_PRESET, ON_PRESET, TIMERS_BACKUP, applySchedule, restoreOriginalTimers, findSchedulePresets, freePresetIds, preservedConfig } from '../src/engine/scheduleService';
import { sunTimes } from '../src/engine/sunTimes';
import { timezoneFor } from '../src/engine/timezones';
import { WledClient } from '../src/engine/wledClient';

const clock = (hour: number, minute = 0) => ({ kind: 'clock' as const, hour, minute });
const win = (on: any, off: any, days = Weekdays.all): ScheduleWindow => ({ id: Math.random() + '', enabled: true, on, off, days });
const denver = { lat: 39.74, lon: -104.99, label: 'Denver' };
const compile = (windows: ScheduleWindow[], caps = WLED16, location: any = denver, enabled = true) =>
  compileSchedule({ enabled, windows, location: location ?? undefined }, 250, 249, caps, new Date(2026, 5, 21));

describe('schedule compiler', () => {
  it('two windows: 04:00-06:00 and 19:00-22:00', () => {
    const c = compile([win(clock(4), clock(6)), win(clock(19), clock(22))]);
    expect(c.timers.map((t) => [t.hour, t.min, t.macro])).toEqual([[4, 0, 250], [6, 0, 249], [19, 0, 250], [22, 0, 249]]);
  });

  it('sunrise 255 / sunset 254 with offsets; past midnight turns off the next day', () => {
    const c = compile([win({ kind: 'sunset', offset: 15 }, clock(23, 30)), win(clock(5), { kind: 'sunrise', offset: -20 })]);
    expect(c.timers.map((t) => [t.hour, t.min])).toEqual([[254, 15], [23, 30], [5, 0], [255, -20]]);
    const fri = 1 << 4;
    expect(compile([win(clock(22), clock(2), fri)]).timers[1].dow).toBe(1 << 5);
  });

  it('off clears all timers; 0.15 uses 10 positional slots', () => {
    expect(compile([win(clock(19), clock(22))], WLED16, denver, false).timers).toEqual([]);
    const c = compile([win({ kind: 'sunset', offset: 10 }, clock(22)), win(clock(5), { kind: 'sunrise', offset: 0 })], WLED015);
    expect(c.timers).toHaveLength(10);
    expect([c.timers[8].hour, c.timers[8].macro, c.timers[9].hour, c.timers[9].min]).toEqual([255, 249, 255, 10]);
    expect(compile([], WLED015, denver, false).timers.every((t) => t.en === 0)).toBe(true);
  });

  it('validation and limits', () => {
    expect(compile([win({ kind: 'sunset', offset: 0 }, clock(22))], WLED16, null).errors[0]).toContain('zip code');
    expect(compile([win(clock(8), clock(8))]).errors[0]).toContain('same time');
    expect(compile([win(clock(8), clock(9), 0)]).errors[0]).toContain('no days');
    expect(capabilitiesFor('16.0.1', 'esp8266').maxTimers).toBe(16);
    expect(capabilitiesFor('0.15.0', 'esp32').legacy).toBe(true);
  });
});

describe('sun and time zones', () => {
  const utcMin = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
  it('matches published sunrise/sunset', () => {
    const den = sunTimes(new Date(2026, 5, 21), 39.74, -104.99);
    expect(Math.abs(utcMin(den.sunrise!) - (11 * 60 + 32))).toBeLessThanOrEqual(4);
    expect(Math.abs(utcMin(den.sunset!) - (2 * 60 + 31))).toBeLessThanOrEqual(4);
    expect(sunTimes(new Date(2026, 5, 21), 78.2, 15.6).sunset).toBeNull();
  });
  it('maps browser time zones', () => {
    expect(timezoneFor('America/Chicago', -300)).toEqual({ index: 5, offsetSeconds: 0, exact: true });
    expect(timezoneFor('Australia/Brisbane', 600)).toEqual({ index: 0, offsetSeconds: 36000, exact: false });
  });
});

/** A pretend WLED controller behind `fetch`. */
function fakeWled(opts: { on?: boolean; presets?: Record<string, any>; version?: string; failOn?: string; timers?: any[] } = {}) {
  const files: Record<string, string> = {};
  let on = opts.on ?? true;
  const presets: Record<string, any> = opts.presets ?? {};
  const posts: { path: string; body: any }[] = [];
  const cfg: any = { hw: { led: { total: 300, rgbwm: 3, fps: 60, ins: [] } }, light: { gc: { bri: 2.2, col: 2.2, val: 2.2 } }, ...(opts.timers ? { timers: { ins: opts.timers } } : {}) };
  const fetchImpl = async (url: any, init?: RequestInit) => {
    const path = String(url);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (init?.method === 'POST') posts.push({ path, body });
    const json = (v: any) => new Response(JSON.stringify(v), { status: 200 });
    if (path === '/json') return json({ state: { on, bri: 128, seg: [] }, info: { ver: opts.version ?? '16.0.1', arch: 'esp32', leds: { count: 300, maxseg: 32 } }, effects: [], palettes: [] });
    if (path === '/json/cfg') {
      if (init?.method === 'POST' && body.timers) cfg.timers = body.timers;
      return init?.method === 'POST' ? json({ success: true }) : json(cfg);
    }
    if (path === '/upload') {
      const f = (init!.body as FormData).get('data') as File;
      files[f.name] = await f.text();
      return json({});
    }
    if (files[path] !== undefined) return new Response(files[path], { status: 200 });
    if (path === '/presets.json') return json(presets);
    if (path === '/json/state') {
      if (opts.failOn && body?.psave && body.n === opts.failOn) return new Response('', { status: 500 });
      if (body && 'on' in body) on = body.on;
      if (body && 'psave' in body) presets[String(body.psave)] = { n: body.n, on: body.on };
      if (body && 'pdel' in body) delete presets[String(body.pdel)];
      return json({ on, bri: 128, seg: [] });
    }
    return new Response('', { status: 404 });
  };
  return { client: new WledClient('', fetchImpl as typeof fetch), posts, presets, files, cfg, isOn: () => on };
}

const evening: Schedule = { enabled: true, windows: [win(clock(19), clock(22))] };
const at = new Date(Date.UTC(2026, 9, 23, 18));

describe('schedule service', () => {
  it('replaces timers, keeps rgbwm/fps/gamma, creates presets and restores the lights', async () => {
    const w = fakeWled({ on: true, presets: { '0': {}, '250': { n: 'Mine' } } });
    const r = await applySchedule(w.client, evening, 'America/Chicago', -300, at);
    expect(r.errors).toEqual([]);
    const saves = w.posts.filter((p) => p.path === '/json/state' && 'psave' in p.body).map((p) => [p.body.psave, p.body.n]);
    expect(saves).toEqual([[248, OFF_PRESET], [249, ON_PRESET]]);
    expect(w.isOn()).toBe(true);
    const cfg = w.posts.find((p) => p.path === '/json/cfg')!.body;
    expect(cfg.timers.ins.map((t: any) => [t.hour, t.macro])).toEqual([[19, 249], [22, 248]]);
    expect(cfg.if.ntp).toEqual({ en: true, tz: 5, offset: 0 });
    expect(cfg.hw).toEqual({ led: { rgbwm: 3, fps: 60 } });
    expect(cfg.light).toEqual({ gc: { bri: 2.2, col: 2.2, val: 2.2 } });
    expect(w.presets['250']).toEqual({ n: 'Mine' });
  });

  it('reuses presets (including ones from the old app name) without touching the lights', async () => {
    const w = fakeWled({ presets: { '7': { n: 'Looks: Lights On', on: true }, '8': { n: 'Looks: Lights Off', on: false } } });
    await applySchedule(w.client, evening, 'America/Chicago', -300, at);
    expect(w.posts.filter((p) => p.path === '/json/state')).toEqual([]);
  });

  it('sun schedules send the location and nudge the clock', async () => {
    const w = fakeWled();
    await applySchedule(w.client, { enabled: true, location: denver, windows: [win({ kind: 'sunset', offset: 0 }, clock(23))] }, 'America/Denver', -360, at);
    const cfg = w.posts.find((p) => p.path === '/json/cfg')!.body;
    expect([cfg.if.ntp.lt, cfg.if.ntp.ln]).toEqual([39.74, -104.99]);
    const now = at.getTime() / 1000;
    expect(w.posts.filter((p) => 'time' in (p.body ?? {})).map((p) => p.body.time)).toEqual([now - 61, now]);
  });

  it('invalid schedules change nothing', async () => {
    const w = fakeWled();
    const r = await applySchedule(w.client, { enabled: true, windows: [win({ kind: 'sunset', offset: 0 }, clock(23))] }, 'UTC', 0, at);
    expect(r.errors.length).toBe(1);
    expect(w.posts).toEqual([]);
  });

  it('helpers', () => {
    expect(freePresetIds({ '250': {}, '248': {} }, 2)).toEqual([249, 247]);
    expect(findSchedulePresets({ '3': { n: ON_PRESET, on: true } })).toEqual({ on: 3, off: undefined });
    expect(preservedConfig({})).toEqual({});
  });
});

describe('season presets', () => {
  const md = (mon: number, day: number) => ({ mon, day });
  const periods = [
    { key: 'halloween', label: 'Halloween', emoji: '🎃', lookIds: ['a', 'b', 'c'], start: md(10, 1), end: md(10, 31) },
    { key: 'everyday', label: 'Everyday', emoji: '🏡', lookIds: ['w'], start: md(11, 1), end: md(9, 30) },
  ];
  const names: Record<string, string> = { a: 'Pumpkins', b: 'Pumpkins', c: 'Bats', w: 'Warm White' };
  const seasons = (resave = true) => ({ periods, resave, stateFor: async (id: string) => ({ seg: [{ id: 0, fx: id.charCodeAt(0) }] }), nameOf: (id: string) => names[id] });

  it('one preset per look (same names kept apart); every rotation timer calls a real preset', async () => {
    const w = fakeWled({ on: false, presets: { 0: {}, 7: { n: 'Eaveglow season: Old Look' } } });
    const r = await applySchedule(w.client, evening, 'UTC', 0, at, seasons());
    expect(r.errors).toEqual([]);
    const names = Object.values(w.presets).map((p: any) => p.n).filter((n) => n?.startsWith('Eaveglow season: ')).sort();
    expect(names).toEqual(['Eaveglow season: Bats', 'Eaveglow season: Pumpkins', 'Eaveglow season: Pumpkins (2)', 'Eaveglow season: Warm White']);
    const timers = w.posts.find((p) => p.path === '/json/cfg')!.body.timers.ins;
    expect(timers.every((t: any) => t.macro > 0 && w.presets[t.macro])).toBe(true);
    expect(w.isOn()).toBe(false); // put back after saving
  });

  it('puts the lights back even when saving a preset fails', async () => {
    const w = fakeWled({ on: false, failOn: 'Eaveglow season: Bats' });
    await expect(applySchedule(w.client, evening, 'UTC', 0, at, seasons())).rejects.toThrow();
    expect(w.isOn()).toBe(false);
  });

  it('turning autopilot off deletes the season presets', async () => {
    const w = fakeWled();
    await applySchedule(w.client, evening, 'UTC', 0, at, seasons());
    await applySchedule(w.client, evening, 'UTC', 0, at);
    expect(Object.values(w.presets).some((p: any) => p.n?.startsWith('Eaveglow season: '))).toBe(false);
  });
});

describe('timer backup', () => {
  const morning = { en: 1, hour: 7, min: 0, macro: 3, dow: 127, start: { mon: 1, day: 1 }, end: { mon: 12, day: 31 } };

  it('keeps the timers someone set up in WLED, once, and can put them back', async () => {
    const w = fakeWled({ presets: { 3: { n: 'Morning' } }, timers: [morning] });
    await applySchedule(w.client, evening, 'UTC', 0, at);
    expect(JSON.parse(w.files[TIMERS_BACKUP]).timers).toEqual([morning]);
    expect(w.cfg.timers.ins[0].macro).not.toBe(3);
    await applySchedule(w.client, evening, 'UTC', 0, at); // doesn't overwrite the backup with Eaveglow's timers
    expect(JSON.parse(w.files[TIMERS_BACKUP]).timers).toEqual([morning]);
    expect(await restoreOriginalTimers(w.client)).toBe(true);
    expect(w.cfg.timers.ins).toEqual([morning]);
    expect(w.posts.at(-1)!.body.hw.led.rgbwm).toBe(3);
  });

  it('no backup when the only timers are Eaveglow\'s own', async () => {
    const w = fakeWled({ presets: { 9: { n: ON_PRESET, on: true } }, timers: [{ ...morning, macro: 9 }] });
    await applySchedule(w.client, evening, 'UTC', 0, at);
    expect(w.files[TIMERS_BACKUP]).toBeUndefined();
  });
});

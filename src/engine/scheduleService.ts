// Writes a Schedule to the controller, replacing all of its timers (port of
// lib/app/schedule_service.dart; see docs/architecture.md → Scheduling).
import { Period, rotationDays } from './autopilot';
import { Schedule } from './model';
import { DatedPreset, SeasonalOn, capabilitiesFor, compileSchedule } from './scheduleCompiler';
import { timezoneFor } from './timezones';
import { WledClient, WledError } from './wledClient';

export const ON_PRESET = 'Eaveglow: Lights On';
export const OFF_PRESET = 'Eaveglow: Lights Off';
export const SEASON_PREFIX = 'Eaveglow season: ';
const LEGACY_ON = ['Looks: Lights On'];
const LEGACY_OFF = ['Looks: Lights Off'];

export function findSchedulePresets(presets: Record<string, any>): { on?: number; off?: number } {
  const find = (names: string[], on: boolean) => {
    for (const [id, p] of Object.entries(presets)) if (p && names.includes(p.n) && p.on === on) return Number(id);
    return undefined;
  };
  return { on: find([ON_PRESET, ...LEGACY_ON], true), off: find([OFF_PRESET, ...LEGACY_OFF], false) };
}

/** Free preset ids, highest first (WLED allows 1-250). */
export function freePresetIds(presets: Record<string, any>, count: number): number[] {
  const used = new Set(Object.keys(presets).map(Number));
  const out: number[] = [];
  for (let id = 250; id >= 1 && out.length < count; id--) if (!used.has(id)) out.push(id);
  return out;
}

/** Settings WLED resets on any partial /json/cfg post unless they're sent. */
export function preservedConfig(cfg: any): object {
  const led = cfg?.hw?.led;
  const gc = cfg?.light?.gc;
  const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
  return {
    ...(led ? { hw: { led: pick(led, ['rgbwm', 'fps']) } } : {}),
    ...(gc ? { light: { gc: pick(gc, ['bri', 'col', 'val']) } } : {}),
  };
}

export interface ScheduleResult {
  errors: string[];
  warnings: string[];
}

export interface SeasonInput {
  periods: Period[];
  /** The WLED state (seg, on) that shows a look, and its name. */
  stateFor: (lookId: string) => Promise<object>;
  nameOf: (lookId: string) => string;
  /** Re-save presets that already exist (their look may have changed). */
  resave: boolean;
}

export async function applySchedule(
  client: WledClient,
  schedule: Schedule,
  timezone: string,
  utcOffsetMinutes: number,
  now = new Date(),
  seasons?: SeasonInput,
): Promise<ScheduleResult> {
  const snap = await client.fetchSnapshot();
  const caps = capabilitiesFor(snap.info.ver, snap.info.arch);
  const placeholder = (presetFor: (lookId: string) => number, plain: number): SeasonalOn | number =>
    seasons ? { dated: datedPresets(seasons.periods, presetFor), plain } : plain;
  const check = compileSchedule(schedule, placeholder(() => 1, 1), 1, caps, now);
  if (check.errors.length) return check;

  let presets: { on?: number; off?: number } = {};
  let presetFor = (_lookId: string) => 0;
  if (check.timers.some((t) => t.en === 1)) {
    presets = await ensurePresets(client, snap.state.on);
    if (seasons) {
      const ids = await ensureSeasonPresets(client, seasons, snap.info.maxSegments);
      presetFor = (id) => ids.get(id) ?? 0;
    }
  }
  const compiled = compileSchedule(schedule, placeholder(presetFor, presets.on ?? 0), presets.off ?? 0, caps, now);

  const warnings = [...compiled.warnings];
  const tz = timezoneFor(timezone, utcOffsetMinutes);
  if (!tz.exact) {
    warnings.push(`WLED doesn't know your time zone (${timezone}), so it uses a fixed UTC offset. Save the schedule again after daylight saving time changes.`);
  }
  const cfg = await client.fetchConfig();
  const loc = schedule.location;
  await client.setConfig({
    ...preservedConfig(cfg),
    if: { ntp: { en: true, tz: tz.index, offset: tz.offsetSeconds, ...(loc ? { lt: loc.lat, ln: loc.lon } : {}) } },
    timers: { ins: compiled.timers },
  });
  // WLED recalculates sunrise/sunset when its clock jumps ≥60 s: nudge it.
  if (loc) {
    await client.setTime(new Date(now.getTime() - 61000));
    await client.setTime(now);
  }
  return { errors: [], warnings };
}

/** Creates the On/Off presets if missing, ending in the lights' original state. */
async function ensurePresets(client: WledClient, wasOn: boolean): Promise<{ on: number; off: number }> {
  const presets = await client.fetchPresets();
  const found = findSchedulePresets(presets);
  if (found.on !== undefined && found.off !== undefined) return { on: found.on, off: found.off };
  const free = freePresetIds(presets, 2);
  let next = 0;
  const on = found.on ?? free[next++];
  const off = found.off ?? free[next++];
  if (on === undefined || off === undefined) {
    throw new WledError('Your controller has no free preset slots for the schedule. Delete a preset in WLED and try again.');
  }
  const saveOn = () => client.setState({ psave: on, n: ON_PRESET, o: true, on: true });
  const saveOff = () => client.setState({ psave: off, n: OFF_PRESET, o: true, on: false });
  const needOn = found.on === undefined;
  const needOff = found.off === undefined;
  if (wasOn) {
    if (needOff) await saveOff();
    if (needOn) await saveOn();
    else await client.setState({ on: true });
  } else {
    if (needOn) await saveOn();
    if (needOff) await saveOff();
    else await client.setState({ on: false });
  }
  return { on, off };
}

/** One dated "on" preset per look of each period, on its rotation days. */
export function datedPresets(periods: Period[], presetFor: (lookId: string) => number): DatedPreset[] {
  return periods.flatMap((p) => {
    const days = rotationDays(p.lookIds.length);
    return days.map((dow, i) => ({ preset: presetFor(p.lookIds[i]), start: p.start, end: p.end, dow }));
  });
}

/**
 * Saves one preset per autopilot look ("Eaveglow season: Pumpkin Patch")
 * and returns look id → preset id. Saving a preset also shows it, so the
 * lights are put back the way they were afterwards. Season presets no
 * longer used are deleted.
 */
async function ensureSeasonPresets(client: WledClient, seasons: SeasonInput, maxSegments: number): Promise<Map<string, number>> {
  const presets = await client.fetchPresets();
  const byName = new Map<string, number>();
  for (const [id, p] of Object.entries(presets)) if (p?.n?.startsWith(SEASON_PREFIX)) byName.set(p.n, Number(id));
  const wanted = new Map<string, string>(); // preset name → look id
  for (const p of seasons.periods) for (const id of p.lookIds) wanted.set(SEASON_PREFIX + seasons.nameOf(id), id);

  const missing = [...wanted.keys()].filter((n) => !byName.has(n));
  const free = freePresetIds(presets, missing.length);
  if (free.length < missing.length) {
    throw new WledError('Your controller has no free preset slots for the seasons. Delete a preset in WLED and try again.');
  }
  missing.forEach((n, i) => byName.set(n, free[i]));

  const toSave = seasons.resave ? [...wanted.keys()] : missing;
  if (toSave.length) {
    const before = await client.fetchState();
    for (const name of toSave) {
      const state: any = await seasons.stateFor(wanted.get(name)!);
      const seg = [...(state.seg ?? [])];
      for (let id = seg.length; id < maxSegments; id++) seg.push({ id, stop: 0 });
      await client.setState({ ...state, seg, on: true, psave: byName.get(name), n: name, o: true });
    }
    const seg: object[] = before.seg.map((s) => ({ ...s }));
    for (let id = seg.length; id < maxSegments; id++) seg.push({ id, stop: 0 });
    await client.setState({ on: before.on, bri: before.bri, seg });
  }

  for (const [name, id] of byName) if (!wanted.has(name)) await client.setState({ pdel: id });
  return new Map([...wanted].map(([name, lookId]) => [lookId, byName.get(name)!]));
}

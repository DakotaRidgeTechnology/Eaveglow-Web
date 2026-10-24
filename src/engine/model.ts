// Data model shared with the Flutter app (same JSON shapes), so settings
// and looks mean the same thing in both.

export type Rgb = [number, number, number];

export const BLACK: Rgb = [0, 0, 0];

export const rgbEquals = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// ── House layout ────────────────────────────────────────────────

export interface Zone {
  id: string;
  name: string;
  start: number;
  length: number;
  reversed?: boolean;
}

/** `lit` lights on, then `skip` off, repeating (WLED segment grp/spc). */
export interface LightSpacing {
  lit: number;
  skip: number;
}

export const SOLID_SPACING: LightSpacing = { lit: 1, skip: 0 };

export const SPACING_PRESETS: [string, LightSpacing][] = [
  ['Every light', { lit: 1, skip: 0 }],
  ['Every 2nd', { lit: 1, skip: 1 }],
  ['Every 3rd', { lit: 1, skip: 2 }],
  ['Every 4th', { lit: 1, skip: 3 }],
  ['Every 6th', { lit: 1, skip: 5 }],
  ['Every 8th', { lit: 1, skip: 7 }],
  ['Pairs', { lit: 2, skip: 2 }],
  ['Groups of 3', { lit: 3, skip: 3 }],
];

export const spacingEquals = (a: LightSpacing, b: LightSpacing) => a.lit === b.lit && a.skip === b.skip;

export function spacingLabel(s: LightSpacing): string {
  const preset = SPACING_PRESETS.find(([, p]) => spacingEquals(p, s));
  return preset ? preset[0] : `${s.lit} on, ${s.skip} off`;
}

/** Suggests a spacing so lit lights end up roughly a foot apart. */
export function suggestedSpacing(inchesBetweenLights: number): LightSpacing {
  if (inchesBetweenLights <= 0 || inchesBetweenLights >= 8) return SOLID_SPACING;
  const period = Math.min(12, Math.max(1, Math.round(12 / inchesBetweenLights)));
  return { lit: 1, skip: period - 1 };
}

export interface HouseLayout {
  totalPixels: number;
  zones: Zone[];
  spacing?: LightSpacing;
  inchesBetweenLights?: number;
}

/** Zones sorted along the strip, or one zone for the whole strip. */
export function effectiveZones(layout: HouseLayout): Zone[] {
  if (layout.zones.length === 0) return [{ id: 'all', name: 'Whole house', start: 0, length: layout.totalPixels }];
  return [...layout.zones].sort((a, b) => a.start - b.start);
}

/** Lays zones out one after another in the given order. */
export function sequential(zones: Zone[]): Zone[] {
  let cursor = 0;
  return zones.map((z) => {
    const placed = { ...z, start: cursor };
    cursor += z.length;
    return placed;
  });
}

export function validateLayout(layout: HouseLayout): string[] {
  const problems: string[] = [];
  if (layout.totalPixels <= 0) problems.push('The house needs at least one pixel.');
  const sorted = effectiveZones(layout);
  sorted.forEach((z, i) => {
    if (z.length <= 0) problems.push(`"${z.name}" needs at least one pixel.`);
    if (z.start + z.length > layout.totalPixels) problems.push(`"${z.name}" goes past the last pixel (${layout.totalPixels}).`);
    if (i > 0 && z.start < sorted[i - 1].start + sorted[i - 1].length) problems.push(`"${z.name}" overlaps "${sorted[i - 1].name}".`);
  });
  return problems;
}

let zoneCounter = 0;
export const newId = (prefix = 'z') => `${prefix}${Date.now()}_${zoneCounter++}`;

// ── Looks ───────────────────────────────────────────────────────

export type LayerTarget =
  | { kind: 'all' }
  | { kind: 'zones'; zoneIds: string[] }
  | { kind: 'alternateZones'; phase?: number };

export function targetMatches(t: LayerTarget, zone: Zone, index: number): boolean {
  switch (t.kind) {
    case 'all':
      return true;
    case 'zones':
      return t.zoneIds.includes(zone.id);
    case 'alternateZones':
      return index % 2 === (t.phase ?? 0);
  }
}

export interface LookLayer {
  target: LayerTarget;
  /** WLED effect names in order of preference. */
  effect: string[];
  /** WLED palette names in order of preference; empty = "Default" (uses colors). */
  palette: string[];
  colors: Rgb[];
  speed: number;
  intensity: number;
  /** Light spacing for this layer; undefined = the house setting. */
  spacing?: LightSpacing;
  reverse?: boolean;
}

export interface Look {
  id: string;
  name: string;
  emoji: string;
  layers: LookLayer[];
  category?: string;
  /** Holiday id within the Holidays category (e.g. 'halloween'). */
  group?: string;
}

export const CUSTOM_CATEGORY = 'My Looks';

export const isBuiltIn = (l: Look) => l.id.startsWith('builtin.');

// ── Schedule ────────────────────────────────────────────────────

export type ScheduleTime =
  | { kind: 'clock'; hour: number; minute: number }
  | { kind: 'sunrise'; offset: number }
  | { kind: 'sunset'; offset: number };

export const isSun = (t: ScheduleTime) => t.kind !== 'clock';

export const timeEquals = (a: ScheduleTime, b: ScheduleTime) => JSON.stringify(a) === JSON.stringify(b);

/** Days as a bitmask: bit 0 = Monday … bit 6 = Sunday (WLED timer "dow"). */
export const Weekdays = {
  all: 0x7f,
  weekdays: 0x1f,
  weekend: 0x60,
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  has: (mask: number, day: number) => ((mask >> day) & 1) === 1,
  toggle: (mask: number, day: number) => mask ^ (1 << day),
  /** Each day moves to the next (Sunday wraps to Monday). */
  nextDay: (mask: number) => ((mask << 1) | (mask >> 6)) & 0x7f,
  describe(mask: number): string {
    if (mask === 0x7f) return 'Every day';
    if (mask === 0x1f) return 'Weekdays';
    if (mask === 0x60) return 'Weekends';
    if (mask === 0) return 'Never';
    return this.labels.filter((_, d) => this.has(mask, d)).join(', ');
  },
};

export interface ScheduleWindow {
  id: string;
  enabled: boolean;
  on: ScheduleTime;
  off: ScheduleTime;
  days: number;
}

export interface GeoLocation {
  lat: number;
  lon: number;
  label: string;
}

export interface Schedule {
  enabled: boolean;
  windows: ScheduleWindow[];
  location?: GeoLocation;
}

export const initialSchedule = (): Schedule => ({
  enabled: false,
  windows: [
    { id: newId('w'), enabled: true, on: { kind: 'clock', hour: 19, minute: 0 }, off: { kind: 'clock', hour: 22, minute: 0 }, days: Weekdays.all },
  ],
});

export const usesSun = (s: Schedule) => s.windows.some((w) => w.enabled && (isSun(w.on) || isSun(w.off)));

// ── WLED ────────────────────────────────────────────────────────

export interface WledSegment {
  id: number;
  start: number;
  stop: number;
  grp?: number;
  spc?: number;
  on?: boolean;
  bri?: number;
  col?: Rgb[];
  fx?: number;
  sx?: number;
  ix?: number;
  pal?: number;
  rev?: boolean;
}

export interface WledInfo {
  name: string;
  ver: string;
  arch: string;
  ledCount: number;
  maxSegments: number;
}

export interface WledState {
  on: boolean;
  bri: number;
  seg: WledSegment[];
  /** WLED's nightlight, used as a sleep timer: seconds left, or −1. */
  nl?: { on: boolean; rem: number };
}

export interface WledSnapshot {
  info: WledInfo;
  state: WledState;
  effects: string[];
  palettes: string[];
}

export function parseSnapshot(json: any): WledSnapshot {
  const info = json.info ?? {};
  return {
    info: {
      name: info.name ?? 'WLED',
      ver: info.ver ?? '',
      arch: info.arch ?? '',
      ledCount: info.leds?.count ?? 0,
      maxSegments: info.leds?.maxseg ?? 16,
    },
    state: parseState(json.state ?? {}),
    effects: json.effects ?? [],
    palettes: json.palettes ?? [],
  };
}

export const parseState = (s: any): WledState => ({
  on: !!s.on,
  bri: s.bri ?? 128,
  seg: s.seg ?? [],
  ...(s.nl ? { nl: { on: !!s.nl.on, rem: s.nl.rem ?? -1 } } : {}),
});

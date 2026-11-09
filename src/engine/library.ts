// The look/effect/color library, exported from the Flutter app
// (tool/export_library.dart) so both apps offer exactly the same choices.
import data from './library.json';
import { BLACK, Look, Rgb, rgbEquals } from './model';

export interface StyleCategory {
  id: string;
  label: string;
  emoji: string;
}

export interface EffectStyle {
  id: string;
  label: string;
  emoji: string;
  category: string;
  wled: string[];
  noSpeed?: boolean;
  noAmount?: boolean;
}

export interface PalettePreset {
  label: string;
  emoji: string;
  wled: string;
  stops: Rgb[];
  /** Gradient positions 0-255 (repeat a position for a hard edge). */
  positions?: number[];
  /** Built-in palette used where a custom one can't be installed. */
  fallback?: string;
}

export interface HolidayGroup {
  id: string;
  name: string;
  emoji: string;
  rule: string;
}

/** Eaveglow's own palettes (★), installed on the controller when used. */
export const CUSTOM_PALETTE_PREFIX = '★ ';
export const isCustomPalette = (name: string) => name.startsWith(CUSTOM_PALETTE_PREFIX);
export const paletteCandidates = (p: PalettePreset) =>
  p.fallback ? [p.wled, p.fallback] : [p.wled];

export interface ColorGroup {
  name: string;
  colors: { name: string; rgb: Rgb }[];
}

export const lookCategories: string[] = data.lc;
export const builtinLooks = data.l.map((l) => ({
  id: l.i,
  name: l.n,
  emoji: l.e,
  category: l.c,
  h: l.h,
  l: l.l,
})) as unknown as Look[];
export const styleCategories: StyleCategory[] = data.sc.map((s: Record<string, unknown>) => ({
  id: s.i as string,
  label: s.l as string,
  emoji: s.e as string,
}));
export const effectStyles = data.s.map((s) => ({
  id: s.i,
  label: s.l,
  emoji: s.e,
  category: s.c,
  wled: s.w,
  noSpeed: s.ns,
  noAmount: s.na,
})) as EffectStyle[];
export const palettePresets = data.p.map((p) => ({
  label: p.l,
  emoji: p.e,
  wled: p.w,
  stops: p.s,
  positions: p.po,
  fallback: p.f,
})) as unknown as PalettePreset[];
export const colorGroups = data.cg.map((g) => ({
  name: g.n,
  colors: g.c.map((c) => ({ name: c.n, rgb: c.r })),
})) as unknown as ColorGroup[];
export const holidayGroups: HolidayGroup[] = data.h.map((h) => ({
  id: h.i,
  name: h.n,
  emoji: h.e,
  rule: h.r,
}));

export const styleById = (id: string) => effectStyles.find((s) => s.id === id);

/** The style a layer's effect list most likely came from. */
export function styleForEffects(effects: string[]): EffectStyle | undefined {
  if (effects.length === 0) return undefined;
  return (
    effectStyles.find((s) => s.wled[0] === effects[0]) ??
    effectStyles.find((s) => s.wled.includes(effects[0]))
  );
}

export const paletteByWledName = (name: string) =>
  palettePresets.find((p) => p.wled.toLowerCase() === name.toLowerCase());

const rainbowEffects = new Set([
  'rainbow',
  'colorloop',
  'rainbow runner',
  'theater rainbow',
  'strobe rainbow',
  'blink rainbow',
  'chase rainbow',
  'pride 2015',
  'ripple rainbow',
  'sinelon rainbow',
  'random colors',
]);

/** Approximate colors for previews (themes and rainbow effects included). */
export function previewColorsFor(colors: Rgb[], effectName?: string, paletteName?: string): Rgb[] {
  if (effectName && rainbowEffects.has(effectName.toLowerCase())) return palettePresets[0].stops;
  const preset = paletteName ? paletteByWledName(paletteName) : undefined;
  if (preset) return preset.stops;
  const visible = colors.filter((c) => !rgbEquals(c, BLACK));
  return visible.length ? visible : colors;
}

export const lookPreviewColors = (look: Look): Rgb[] =>
  look.l.flatMap((l) => previewColorsFor(l.c, l.e[0], l.p[0]));

export function newCustomLook(): Look {
  return {
    id: `custom.${Date.now()}`,
    name: 'My Look',
    emoji: '✨',
    category: 'My Looks',
    l: [{ t: { kind: 'all' }, e: ['Solid'], p: [], c: [[0, 0, 255]], s: 128, i: 128 }],
  };
}

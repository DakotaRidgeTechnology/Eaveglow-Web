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
}

export interface ColorGroup {
  name: string;
  colors: { name: string; rgb: Rgb }[];
}

export const lookCategories: string[] = data.lookCategories;
export const builtinLooks = data.looks as unknown as Look[];
export const styleCategories: StyleCategory[] = data.styleCategories;
export const effectStyles = data.styles as EffectStyle[];
export const palettePresets = data.palettes as unknown as PalettePreset[];
export const colorGroups = data.colorGroups as unknown as ColorGroup[];

export const styleById = (id: string) => effectStyles.find((s) => s.id === id);

/** The style a layer's effect list most likely came from. */
export function styleForEffects(effects: string[]): EffectStyle | undefined {
  if (effects.length === 0) return undefined;
  return effectStyles.find((s) => s.wled[0] === effects[0]) ?? effectStyles.find((s) => s.wled.includes(effects[0]));
}

export const paletteByWledName = (name: string) =>
  palettePresets.find((p) => p.wled.toLowerCase() === name.toLowerCase());

const rainbowEffects = new Set([
  'rainbow', 'colorloop', 'rainbow runner', 'theater rainbow', 'strobe rainbow', 'blink rainbow',
  'chase rainbow', 'pride 2015', 'ripple rainbow', 'sinelon rainbow', 'random colors',
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
  look.layers.flatMap((l) => previewColorsFor(l.colors, l.effect[0], l.palette[0]));

export function newCustomLook(): Look {
  return {
    id: `custom.${Date.now()}`,
    name: 'My Look',
    emoji: '✨',
    category: 'My Looks',
    layers: [{ target: { kind: 'all' }, effect: ['Solid'], palette: [], colors: [[0, 0, 255]], speed: 128, intensity: 128 }],
  };
}

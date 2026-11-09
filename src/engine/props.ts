// Light-show props (candy canes, path lights…), possibly on other WLED
// controllers. Each controller gets its own segments for the current look;
// see docs/how-it-works.md → Props and other controllers.
import { Look, Rgb, WledSegment } from './model';
import { EffectCatalog, compileLook } from './segmentCompiler';
import { PropModel } from './xmodel';

export const MAIN = 'main';

export interface Controller {
  id: string;
  name: string;
  /** IP address or host name, e.g. "10.0.70.12". */
  host: string;
}

export type PropKind = 'candyCanes' | 'pathLights';

export interface Prop {
  id: string;
  name: string;
  kind: PropKind;
  controllerId: string;
  /** First pixel (WLED's numbering on that controller). */
  start: number;
  /** How many canes, or how many path lights. */
  count: number;
  /** Candy canes: where each node sits, from the prop's xLights model. */
  model?: PropModel;
  /** Candy canes: stripe thickness in model grid units. */
  stripeWidth?: number;
  /** Candy canes: the two stripe colors. */
  colors?: [Rgb, Rgb];
}

export const CANE_COLORS: [Rgb, Rgb] = [
  [255, 0, 0],
  [220, 235, 255],
];
export const DEFAULT_STRIPE_WIDTH = 6;

/** Pixels a prop takes on its controller. */
export const propLength = (p: Prop) => (p.kind === 'candyCanes' ? p.count * (p.model?.nodes.length ?? 0) : p.count);

/** 0 or 1 for each node: diagonal bands across the model's grid. */
export const stripeBands = (model: PropModel, width = DEFAULT_STRIPE_WIDTH): number[] =>
  model.nodes.map(([col, row]) => Math.floor((row + col) / Math.max(1, width)) % 2);

export interface Ledmap {
  /** map[logical] = physical, for every pixel of the controller. */
  map: number[];
  /** For each cane prop: the logical ranges of its two stripes. */
  stripes: Map<string, [[number, number], [number, number]]>;
}

/**
 * Reorders each cane prop so every node of the first stripe comes first,
 * then every node of the second: two plain segments then draw diagonal
 * stripes, which survive power cycles, presets and timers. Everything else
 * maps to itself.
 */
export function buildLedmap(totalPixels: number, props: Prop[]): Ledmap {
  const map = Array.from({ length: totalPixels }, (_, i) => i);
  const stripes: Ledmap['stripes'] = new Map();
  for (const p of props) {
    if (p.kind !== 'candyCanes' || !p.model) continue;
    const n = p.model.nodes.length;
    const bands = stripeBands(p.model, p.stripeWidth);
    const a: number[] = [];
    const b: number[] = [];
    for (let cane = 0; cane < p.count; cane++) {
      bands.forEach((band, i) => (band === 0 ? a : b).push(p.start + cane * n + i));
    }
    const order = [...a, ...b].filter((px) => px < totalPixels);
    order.forEach((px, k) => (map[p.start + k] = px));
    const split = p.start + a.filter((px) => px < totalPixels).length;
    stripes.set(p.id, [
      [p.start, split],
      [split, p.start + order.length],
    ]);
  }
  return { map, stripes };
}

/** The ledmap.json Eaveglow writes ("n" marks it as Eaveglow's own). */
export const LEDMAP_NAME = 'Eaveglow';
export const ledmapFile = (m: Ledmap) => JSON.stringify({ n: LEDMAP_NAME, map: m.map });

/** True when the map only maps every pixel to itself (nothing to upload). */
export const isIdentity = (m: Ledmap) => m.map.every((p, i) => p === i);

/**
 * Segments for one controller's props in the current look: path lights
 * show the look itself, canes show their stripes. Pixels no prop covers are
 * turned off.
 */
export function compileController(
  props: Prop[],
  look: Look,
  catalog: EffectCatalog,
  totalPixels: number,
  maxSegments = 16,
): { segments: WledSegment[]; warnings: string[] } {
  const ledmap = buildLedmap(totalPixels, props);
  const warnings: string[] = [];
  const base: WledSegment[] = [];
  const solid = catalog.effectId(['Solid']) ?? 0;
  const off = (start: number, stop: number): WledSegment => ({ id: 0, start, stop, grp: 1, spc: 0, on: false, bri: 255, col: [], fx: solid, sx: 128, ix: 128, pal: 0, rev: false });
  let cursor = 0;
  for (const p of [...props].sort((x, y) => x.start - y.start)) {
    const start = Math.max(p.start, cursor);
    const stop = Math.min(p.start + propLength(p), totalPixels);
    if (stop <= start) continue;
    if (start > cursor) base.push(off(cursor, start));
    if (p.kind === 'pathLights') {
      const c = compileLook({ totalPixels: stop - start, zones: [] }, look, catalog, maxSegments);
      warnings.push(...c.warnings);
      for (const s of c.segments) base.push({ ...s, start: s.start + start, stop: s.stop + start });
    } else {
      const [a, b] = ledmap.stripes.get(p.id) ?? [[start, stop], [stop, stop]];
      const colors = p.colors ?? CANE_COLORS;
      for (const [[from, to], col] of [[a, colors[0]], [b, colors[1]]] as const) {
        if (to > from) base.push({ id: 0, start: from, stop: to, grp: 1, spc: 0, on: true, bri: 255, col: [col], fx: solid, sx: 128, ix: 128, pal: 0, rev: false });
      }
    }
    cursor = stop;
  }
  if (cursor < totalPixels) base.push(off(cursor, totalPixels));
  if (base.length > maxSegments) warnings.push(`Your props need ${base.length} segments but the controller allows ${maxSegments}.`);
  return { segments: base.slice(0, maxSegments).map((s, id) => ({ ...s, id })), warnings };
}

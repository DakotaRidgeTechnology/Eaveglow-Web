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
  /** 1-100 % of the overall brightness (WLED segment brightness); default 100. */
  brightness?: number;
}

/** A prop's brightness as WLED segment brightness (0-255). */
export const propBri = (p: Prop) => Math.round((Math.min(100, Math.max(1, p.brightness ?? 100)) / 100) * 255);

export const CANE_COLORS: [Rgb, Rgb] = [
  [255, 0, 0],
  [220, 235, 255],
];
export const DEFAULT_STRIPE_WIDTH = 6;

/** Pixels a prop takes on its controller. */
export const propLength = (p: Prop) => (p.kind === 'candyCanes' ? p.count * (p.model?.nodes.length ?? 0) : p.count);

/**
 * Where each node sits along the prop and across it. `along` is the
 * shortest distance from the bottom of the shaft through neighbouring nodes
 * (so it follows the hook's curve); `across` is the signed distance from the
 * centre line there.
 */
export function propCoordinates(model: PropModel): { along: number[]; across: number[] } {
  const cached = coordCache.get(model);
  if (cached) return cached;
  const p = model.nodes;
  const n = p.length;
  const dist = (a: number, b: number) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]);
  // Neighbours: within 1.5× the typical spacing between nodes.
  const nearest = p.map((_, i) => Math.min(...p.map((_, j) => (i === j ? Infinity : dist(i, j))))).sort((a, b) => a - b);
  const radius = (nearest[Math.floor(n / 2)] || 1) * 1.5;
  const along = p.map(() => Infinity);
  const bottom = Math.max(...p.map(([, row]) => row));
  const queue: number[] = [];
  p.forEach(([, row], i) => row === bottom && ((along[i] = 0), queue.push(i)));
  // Dijkstra over the node graph (n is ~100, so a simple scan is fine).
  const done = new Set<number>();
  while (queue.length) {
    queue.sort((a, b) => along[a] - along[b]);
    const i = queue.shift()!;
    if (done.has(i)) continue;
    done.add(i);
    for (let j = 0; j < n; j++) {
      const d = dist(i, j);
      if (j === i || d > radius || along[i] + d >= along[j]) continue;
      along[j] = along[i] + d;
      queue.push(j);
    }
  }
  const max = Math.max(...along.filter(Number.isFinite));
  along.forEach((v, i) => !Number.isFinite(v) && (along[i] = max));
  const centre = (s: number) => {
    const near = p.filter((_, i) => Math.abs(along[i] - s) <= 2.5);
    return [near.reduce((a, q) => a + q[0], 0) / near.length, near.reduce((a, q) => a + q[1], 0) / near.length];
  };
  const across = p.map(([x, y], i) => {
    const s = along[i];
    const [x0, y0] = centre(Math.max(0, s - 2));
    const [x1, y1] = centre(Math.min(max, s + 2));
    const [cx, cy] = centre(s);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    return ((x - cx) * (y1 - y0) - (y - cy) * (x1 - x0)) / len;
  });
  const result = { along, across };
  coordCache.set(model, result);
  return result;
}
const coordCache = new WeakMap<PropModel, { along: number[]; across: number[] }>();

/** 0 or 1 for each node: stripes slanted 45° to the prop, following its bends. */
export function stripeBands(model: PropModel, width = DEFAULT_STRIPE_WIDTH): number[] {
  const { along, across } = propCoordinates(model);
  return along.map((s, i) => ((Math.floor((s + across[i]) / Math.max(1, width)) % 2) + 2) % 2);
}

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
      for (const s of c.segments) base.push({ ...s, start: s.start + start, stop: s.stop + start, bri: propBri(p) });
    } else {
      const [a, b] = ledmap.stripes.get(p.id) ?? [[start, stop], [stop, stop]];
      const colors = p.colors ?? CANE_COLORS;
      for (const [[from, to], col] of [[a, colors[0]], [b, colors[1]]] as const) {
        if (to > from) base.push({ id: 0, start: from, stop: to, grp: 1, spc: 0, on: true, bri: propBri(p), col: [col], fx: solid, sx: 128, ix: 128, pal: 0, rev: false });
      }
    }
    cursor = stop;
  }
  if (cursor < totalPixels) base.push(off(cursor, totalPixels));
  if (base.length > maxSegments) warnings.push(`Your props need ${base.length} segments but the controller allows ${maxSegments}.`);
  return { segments: base.slice(0, maxSegments).map((s, id) => ({ ...s, id })), warnings };
}

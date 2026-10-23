// Turns a Look into WLED segments for a house layout (port of
// lib/engine/segment_compiler.dart).
import { previewColorsFor } from './library';
import { BLACK, HouseLayout, Look, Rgb, SOLID_SPACING, WledSegment, effectiveZones, targetMatches } from './model';

/** Resolves effect/palette names to a device's ids (they vary by build). */
export class EffectCatalog {
  private fx: string[];
  private pal: string[];

  constructor(effects: string[], palettes: string[]) {
    this.fx = effects.map(normalize);
    this.pal = palettes.map(normalize);
  }

  effectId = (candidates: string[]) => find(this.fx, candidates);
  paletteId = (candidates: string[]) => find(this.pal, candidates);
}

const normalize = (n: string) => n.split('@')[0].trim().toLowerCase();

function find(names: string[], candidates: string[]): number | undefined {
  for (const c of candidates) {
    const i = names.indexOf(normalize(c));
    if (i >= 0) return i;
  }
  return undefined;
}

export interface CompiledLook {
  segments: WledSegment[];
  warnings: string[];
  previewColors: Rgb[][];
}

/** Body for POST /json/state; deletes segments left from the previous look. */
export function toStateJson(c: CompiledLook, previousSegmentCount = 0, transition = 7) {
  const seg: object[] = c.segments.map((s) => ({ of: 0, sel: true, ...s }));
  for (let id = c.segments.length; id < previousSegmentCount; id++) seg.push({ id, stop: 0 });
  return { on: true, transition, mainseg: 0, seg };
}

interface Run {
  start: number;
  stop: number;
  layer: number | null;
  reverse: boolean;
}

const len = (r: Run) => r.stop - r.start;

export function compileLook(layout: HouseLayout, look: Look, catalog: EffectCatalog, maxSegments = 16): CompiledLook {
  const warnings: string[] = [];
  const runs = buildRuns(layout, look, warnings);
  mergeAdjacent(runs);
  if (runs.length > maxSegments) {
    warnings.push(`This look was simplified to fit the controller's limit of ${maxSegments} segments.`);
    reduceTo(runs, maxSegments);
  }

  const missingFx = new Set<string>();
  const missingPal = new Set<string>();
  const segments: WledSegment[] = [];
  const previews: Rgb[][] = [];
  runs.forEach((run, i) => {
    if (run.layer === null) {
      segments.push({ id: i, start: run.start, stop: run.stop, grp: 1, spc: 0, on: false, bri: 255, col: [], fx: 0, sx: 128, ix: 128, pal: 0, rev: false });
      previews.push([BLACK]);
      return;
    }
    const layer = look.layers[run.layer];
    const spacing = layer.spacing ?? layout.spacing ?? SOLID_SPACING;
    let fx = catalog.effectId(layer.effect);
    if (fx === undefined) {
      missingFx.add(layer.effect[0]);
      fx = 0;
    }
    let pal = 0;
    if (layer.palette.length) {
      const id = catalog.paletteId(layer.palette);
      if (id === undefined) missingPal.add(layer.palette[0]);
      pal = id ?? 0;
    }
    segments.push({
      id: i,
      start: run.start,
      stop: run.stop,
      grp: spacing.lit,
      spc: spacing.skip,
      on: true,
      bri: 255,
      col: layer.colors.slice(0, 3),
      fx,
      sx: layer.speed,
      ix: layer.intensity,
      pal,
      rev: run.reverse,
    });
    previews.push(previewColorsFor(layer.colors, fx === 0 ? 'Solid' : layer.effect[0], layer.palette[0]));
  });
  for (const name of missingFx) warnings.push(`Your controller doesn't have the "${name}" effect, so a solid color is shown instead.`);
  for (const name of missingPal) warnings.push(`Your controller doesn't have the "${name}" color theme, so your colors are used instead.`);
  return { segments, warnings, previewColors: previews };
}

function buildRuns(layout: HouseLayout, look: Look, warnings: string[]): Run[] {
  const runs: Run[] = [];
  const total = layout.totalPixels;
  let cursor = 0;
  effectiveZones(layout).forEach((zone, index) => {
    const end = zone.start + zone.length;
    const start = Math.max(zone.start, cursor);
    const stop = Math.min(end, total);
    if (zone.start < cursor) warnings.push(`"${zone.name}" overlaps another zone and was trimmed.`);
    if (end > total) warnings.push(`"${zone.name}" goes past the last pixel and was trimmed.`);
    if (stop <= start) return;
    if (start > cursor) runs.push({ start: cursor, stop: start, layer: null, reverse: false });
    let layer: number | null = null;
    look.layers.forEach((l, li) => {
      if (targetMatches(l.target, zone, index)) layer = li;
    });
    const layerReverse = layer !== null && !!look.layers[layer].reverse;
    runs.push({ start, stop, layer, reverse: layer === null ? false : !!zone.reversed !== layerReverse });
    cursor = stop;
  });
  if (cursor < total) runs.push({ start: cursor, stop: total, layer: null, reverse: false });
  return runs;
}

function mergeAdjacent(runs: Run[]) {
  let i = 0;
  while (i < runs.length - 1) {
    const a = runs[i];
    const b = runs[i + 1];
    if (a.stop === b.start && a.layer === b.layer && a.reverse === b.reverse) {
      a.stop = b.stop;
      runs.splice(i + 1, 1);
    } else i++;
  }
}

/** Folds the shortest run into a neighbour until `max` remain. */
function reduceTo(runs: Run[], max: number) {
  while (runs.length > max && runs.length > 1) {
    let shortest = 0;
    for (let i = 1; i < runs.length; i++) if (len(runs[i]) < len(runs[shortest])) shortest = i;
    const run = runs[shortest];
    const prev = shortest > 0 ? runs[shortest - 1] : undefined;
    const next = shortest < runs.length - 1 ? runs[shortest + 1] : undefined;
    let target: Run;
    if (!prev) target = next!;
    else if (!next) target = prev;
    else if (prev.layer === run.layer && next.layer !== run.layer) target = prev;
    else if (next.layer === run.layer && prev.layer !== run.layer) target = next;
    else target = len(prev) >= len(next) ? prev : next;
    if (target === prev) prev.stop = run.stop;
    else target.start = run.start;
    runs.splice(shortest, 1);
    mergeAdjacent(runs);
  }
}

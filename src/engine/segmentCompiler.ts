// Turns a Look into WLED segments for a house layout (port of
// lib/engine/segment_compiler.dart).
import { previewColorsFor } from './library';
import {
  BLACK,
  HouseLayout,
  Look,
  LookLayer,
  Rgb,
  SOLID_SPACING,
  WledSegment,
  effectiveZones,
  targetMatches,
} from './model';

/** Resolves effect/palette names to a device's ids (they vary by build). */
export class EffectCatalog {
  private fx: string[];
  private pal: string[];

  private extra: Map<string, number>;

  /** `extraPalettes`: installed custom palettes, name → WLED palette id. */
  constructor(effects: string[], palettes: string[], extraPalettes: Record<string, number> = {}) {
    this.fx = effects.map(normalize);
    this.pal = palettes.map(normalize);
    this.extra = new Map(Object.entries(extraPalettes).map(([k, v]) => [normalize(k), v]));
  }

  effectId = (candidates: string[]) => find(this.fx, candidates);

  paletteId(candidates: string[]): number | undefined {
    for (const c of candidates) {
      const extra = this.extra.get(normalize(c));
      if (extra !== undefined) return extra;
      const i = this.pal.indexOf(normalize(c));
      if (i >= 0) return i;
    }
    return undefined;
  }
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

export function compileLook(
  layout: HouseLayout,
  look: Look,
  catalog: EffectCatalog,
  maxSegments = 16
): CompiledLook {
  const warnings: string[] = [];
  const runs = buildRuns(layout, look, warnings);
  mergeAdjacent(runs);
  const overlays = look.l.filter((l) => l.o);
  const needed = () => runs.length + runs.filter((r) => r.layer !== null).length * overlays.length;
  if (needed() > maxSegments) {
    warnings.push(
      `This look was simplified to fit the controller's limit of ${maxSegments} segments.`
    );
    while (needed() > maxSegments && runs.length > 1) reduceTo(runs, runs.length - 1);
  }

  const missingFx = new Set<string>();
  const missingPal = new Set<string>();
  const resolveFx = (layer: LookLayer) => {
    const fx = catalog.effectId(layer.e);
    if (fx === undefined) missingFx.add(layer.e[0]);
    return fx ?? 0;
  };
  const resolvePal = (layer: LookLayer) => {
    if (!layer.p.length) return 0;
    const id = catalog.paletteId(layer.p);
    if (id === undefined) missingPal.add(layer.p[0]);
    return id ?? 0;
  };
  const segments: WledSegment[] = [];
  const previews: Rgb[][] = [];
  runs.forEach((run, i) => {
    if (run.layer === null) {
      segments.push({
        id: i,
        start: run.start,
        stop: run.stop,
        grp: 1,
        spc: 0,
        on: false,
        bri: 255,
        col: [],
        fx: 0,
        sx: 128,
        ix: 128,
        pal: 0,
        rev: false,
      });
      previews.push([BLACK]);
      return;
    }
    const layer = look.l[run.layer];
    const spacing = layer.sp ?? layout.spacing ?? SOLID_SPACING;
    const fx = resolveFx(layer);
    const pal = resolvePal(layer);
    segments.push({
      id: i,
      start: run.start,
      stop: run.stop,
      grp: spacing.lit,
      spc: spacing.skip,
      on: true,
      bri: 255,
      col: layer.c.slice(0, 3),
      fx,
      sx: layer.s,
      ix: layer.i,
      pal,
      rev: run.reverse,
    });
    previews.push(previewColorsFor(layer.c, fx === 0 ? 'Solid' : layer.e[0], layer.p[0]));
  });
  // Overlays come after every base segment: WLED draws segments in id order
  // and leaves a segment's spacing gaps alone, so the layer below shows there.
  for (const overlay of overlays) {
    runs.forEach((run) => {
      if (run.layer === null) return;
      const base = look.l[run.layer].sp ?? layout.spacing ?? SOLID_SPACING;
      const every = Math.max(1, Math.round(overlay.o!));
      const fx = resolveFx(overlay);
      segments.push({
        id: segments.length,
        start: run.start,
        stop: run.stop,
        grp: base.lit,
        spc: every * (base.lit + base.skip) - base.lit,
        on: true,
        bri: 255,
        col: overlay.c.slice(0, 3),
        fx,
        sx: overlay.s,
        ix: overlay.i,
        pal: resolvePal(overlay),
        rev: run.reverse,
      });
      previews.push(previewColorsFor(overlay.c, fx === 0 ? 'Solid' : overlay.e[0], overlay.p[0]));
    });
  }
  for (const name of missingFx)
    warnings.push(
      `Your controller doesn't have the "${name}" effect, so a solid color is shown instead.`
    );
  for (const name of missingPal)
    warnings.push(
      `Your controller doesn't have the "${name}" color theme, so your colors are used instead.`
    );
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
    look.l.forEach((l, li) => {
      if (!l.o && targetMatches(l.t, zone, index)) layer = li;
    });
    runs.push({ start, stop, layer, reverse: layer === null ? false : !!zone.reversed });
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

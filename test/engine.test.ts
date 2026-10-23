import { builtinLooks, effectStyles, lookCategories, palettePresets, colorGroups, styleById } from '../src/engine/library';
import { HouseLayout, Look, sequential, suggestedSpacing, spacingLabel } from '../src/engine/model';
import { EffectCatalog, compileLook, toStateJson } from '../src/engine/segmentCompiler';
import { wled015Effects, wled015Palettes } from './fixtures_wled015';
import { wled16Effects, wled16Palettes } from './fixtures_wled16';

const cat015 = new EffectCatalog(wled015Effects, wled015Palettes);
const cat16 = new EffectCatalog(wled16Effects, wled16Palettes);
const zone = (id: string, start: number, length: number, reversed = false) => ({ id, name: id, start, length, reversed });
const solid = (rgb: [number, number, number], target: any = { kind: 'all' }): Look => ({
  id: 't', name: 't', emoji: '',
  layers: [{ target, effect: ['Solid'], palette: [], colors: [rgb], speed: 128, intensity: 128 }],
});
const look = (id: string) => builtinLooks.find((l) => l.id === `builtin.${id}`)!;

describe('library (exported from the Flutter app)', () => {
  it('has the full catalogue', () => {
    expect(builtinLooks.length).toBe(80);
    expect(effectStyles.length).toBe(94);
    expect(palettePresets.length).toBe(43);
    expect(colorGroups.flatMap((g) => g.colors).length).toBe(66);
    for (const c of lookCategories) expect(builtinLooks.some((l) => l.category === c)).toBe(true);
  });

  it('every look compiles on WLED 0.15 and 16.0.1 without warnings', () => {
    const layout: HouseLayout = { totalPixels: 300, zones: sequential([zone('left', 0, 100), zone('peak', 0, 50, true), zone('right', 0, 150)]) };
    for (const [v, cat] of [['0.15', cat015], ['16', cat16]] as const) {
      for (const l of builtinLooks) {
        const r = compileLook(layout, l, cat, 32);
        expect(r.warnings, `${l.name} on ${v}`).toEqual([]);
        expect(r.previewColors.length).toBe(r.segments.length);
      }
    }
  });

  it('every effect style resolves on WLED 16; replaced effects fall back to particle versions', () => {
    for (const s of effectStyles) expect(cat16.effectId(s.wled), s.label).not.toBeUndefined();
    expect(wled16Effects[cat16.effectId(styleById('fire')!.wled)!]).toBe('PS Fire 1D');
    expect(wled16Effects[cat16.effectId(styleById('meteor')!.wled)!]).toBe('Meteor');
  });
});

describe('segment compiler', () => {
  it('whole strip with no zones', () => {
    const r = compileLook({ totalPixels: 120, zones: [] }, solid([255, 0, 0]), cat16);
    expect(r.segments).toHaveLength(1);
    expect([r.segments[0].start, r.segments[0].stop]).toEqual([0, 120]);
  });

  it('alternate zones and painter order (Christmas Classic)', () => {
    const r = compileLook({ totalPixels: 90, zones: [zone('a', 0, 30), zone('b', 30, 30), zone('c', 60, 30)] }, look('christmas_classic'), cat16);
    expect(r.segments.map((s) => [s.start, s.stop])).toEqual([[0, 30], [30, 60], [60, 90]]);
    expect(r.segments.map((s) => s.col![0])).toEqual([[255, 0, 0], [0, 255, 0], [255, 0, 0]]);
  });

  it('gaps become off segments; untargeted zones are off', () => {
    const r = compileLook({ totalPixels: 100, zones: [zone('a', 10, 20), zone('b', 50, 20)] }, solid([0, 0, 255], { kind: 'zones', zoneIds: ['b'] }), cat16);
    expect(r.segments.map((s) => [s.start, s.stop, s.on])).toEqual([[0, 50, false], [50, 70, true], [70, 100, false]]);
  });

  it('reversed zones', () => {
    const r = compileLook({ totalPixels: 60, zones: [zone('a', 0, 30), zone('b', 30, 30, true)] }, solid([255, 0, 0]), cat16);
    expect(r.segments.map((s) => s.rev)).toEqual([false, true]);
  });

  it('house spacing → grp/spc; a look can override it; bulbs give green off off off red', () => {
    const layout: HouseLayout = { totalPixels: 40, zones: [], spacing: { lit: 1, skip: 3 } };
    const bulbs = compileLook(layout, look('bulbs_red_green'), cat16).segments[0];
    expect(wled16Effects[bulbs.fx!]).toBe('Solid Pattern');
    expect([bulbs.sx, bulbs.ix, bulbs.grp, bulbs.spc]).toEqual([0, 0, 1, 3]);
    const override = solid([1, 2, 3]);
    override.layers[0].spacing = { lit: 1, skip: 0 };
    expect(compileLook(layout, override, cat16).segments[0].spc).toBe(0);
  });

  it('unknown effects fall back with a warning; too many segments are simplified', () => {
    const l = solid([1, 1, 1]);
    l.layers[0].effect = ['Nope'];
    expect(compileLook({ totalPixels: 10, zones: [] }, l, cat16).warnings[0]).toContain('Nope');
    const zones = Array.from({ length: 10 }, (_, i) => zone(`z${i}`, i * 10, i === 0 ? 2 : 10));
    const r = compileLook({ totalPixels: 92, zones }, look('christmas_classic'), cat16, 4);
    expect(r.segments.length).toBeLessThanOrEqual(4);
    let cursor = 0;
    for (const s of r.segments) {
      expect(s.start).toBe(cursor);
      cursor = s.stop;
    }
    expect(cursor).toBe(92);
  });

  it('state JSON deletes leftover segments', () => {
    const j = toStateJson(compileLook({ totalPixels: 10, zones: [] }, solid([1, 1, 1]), cat16), 3) as any;
    expect(j.seg.slice(1)).toEqual([{ id: 1, stop: 0 }, { id: 2, stop: 0 }]);
  });

  it('spacing helpers', () => {
    expect(suggestedSpacing(2)).toEqual({ lit: 1, skip: 5 });
    expect(suggestedSpacing(18)).toEqual({ lit: 1, skip: 0 });
    expect(spacingLabel({ lit: 1, skip: 3 })).toBe('Every 4th');
    expect(spacingLabel({ lit: 2, skip: 7 })).toBe('2 on, 7 off');
  });
});

import { builtinLooks } from '../src/engine/library';
import { CANE_COLORS, Prop, buildLedmap, compileController, isIdentity, ledmapFile, propCoordinates, stripeBands } from '../src/engine/props';
import { EffectCatalog } from '../src/engine/segmentCompiler';
import { parseXModel } from '../src/engine/xmodel';
import { wled16Effects, wled16Palettes } from './fixtures_wled16';

// A made-up 6-node "cane": two columns, wired up one side and down the other.
//   row 0:  4 3      (cols 0 and 2)
//   row 2:  5 2
//   row 4:  6 1
const XMODEL = `<?xml version="1.0" encoding="UTF-8"?>
<custommodel name="Test Cane" parm1="3" parm2="5" CustomModelCompressed="1,4,2;2,2,2;3,0,2;4,0,0;5,2,0;6,4,0" />`;
const GRID = `<custommodel name="Grid Cane" parm1="3" parm2="5" CustomModel="4,,3;,,;5,,2;,,;6,,1" />`;

const cat = new EffectCatalog(wled16Effects, wled16Palettes);
const look = (id: string) => builtinLooks.find((l) => l.id === `builtin.${id}`)!;
const canes = (over: Partial<Prop> = {}): Prop => ({
  id: 'canes', name: 'Candy canes', kind: 'candyCanes', controllerId: 'c2', start: 0, count: 2, model: parseXModel(XMODEL), stripeWidth: 2, ...over,
});
const path = (start: number, count: number): Prop => ({ id: 'path', name: 'Path lights', kind: 'pathLights', controllerId: 'c2', start, count });

describe('xLights models', () => {
  it('reads nodes in wiring order from either format', () => {
    const m = parseXModel(XMODEL);
    expect(m).toMatchObject({ name: 'Test Cane', width: 3, height: 5 });
    expect(m.nodes).toEqual([[2, 4], [2, 2], [2, 0], [0, 0], [0, 2], [0, 4]]);
    expect(parseXModel(GRID).nodes).toEqual(m.nodes);
  });

  it('explains bad files', () => {
    expect(() => parseXModel('{"not":"xml"}')).toThrow(/isn't an xLights custom model/);
    expect(() => parseXModel('<custommodel CustomModelCompressed="1,0,0;3,1,1" />')).toThrow(/skips light 2/);
  });
});

describe('props', () => {
  it('stripes alternate up a straight cane', () => {
    expect(stripeBands(parseXModel(XMODEL), 2)).toEqual([1, 0, 1, 0, 1, 0]);
  });

  it('stripes follow the prop around a bend', () => {
    // A two-wide tube: up a shaft (col 8-9, rows 9→0), then left along the top (row 0-1, cols 7→0).
    const nodes: [number, number][] = [];
    for (let row = 9; row >= 2; row--) nodes.push([8, row], [9, row]);
    for (let col = 9; col >= 0; col--) nodes.push([col, 0], [col, 1]);
    const model = { name: 'L', width: 10, height: 10, nodes };
    const { along, across } = propCoordinates(model);
    const at = (c: number, r: number) => nodes.findIndex(([x, y]) => x === c && y === r);
    // Distance keeps growing around the corner and out to the tip.
    expect(along[at(8, 9)]).toBe(0);
    expect(along[at(8, 2)]).toBeLessThan(along[at(4, 1)]);
    expect(along[at(4, 1)]).toBeLessThan(along[at(0, 1)]);
    // Across the tube, the two sides sit on opposite sides of the centre line, on the shaft and on the top.
    expect(Math.sign(across[at(8, 5)])).toBe(-Math.sign(across[at(9, 5)]));
    expect(Math.sign(across[at(3, 0)])).toBe(-Math.sign(across[at(3, 1)]));
    // Both stripes show up on the horizontal part too, not just the shaft.
    const bands = stripeBands(model, 3);
    const top = nodes.map((n, i) => (n[0] <= 6 ? bands[i] : -1)).filter((b) => b >= 0);
    expect(new Set(top)).toEqual(new Set([0, 1]));
  });

  it('each tree gets its own copy of the look; trees share one when segments run out', () => {
    const trees: Prop = { id: 't', name: 'Trees', kind: 'trees', controllerId: 'c3', start: 0, count: 3, perTree: 10 };
    const fx = (s: any) => wled16Effects[s.fx];
    const each = compileController([trees], look('magic_icicles'), cat, 30, 32);
    expect(each.segments.map((s) => [s.start, s.stop, fx(s), s.spc])).toEqual([
      [0, 10, 'Solid', 0], [0, 10, 'Fairytwinkle', 3],
      [10, 20, 'Solid', 0], [10, 20, 'Fairytwinkle', 3],
      [20, 30, 'Solid', 0], [20, 30, 'Fairytwinkle', 3],
    ]);
    expect(each.warnings).toEqual([]);
    const tight = compileController([trees], look('magic_icicles'), cat, 30, 4);
    expect(tight.segments.map((s) => [s.start, s.stop, fx(s)])).toEqual([[0, 30, 'Solid'], [0, 30, 'Fairytwinkle']]);
    expect(tight.warnings.join()).toMatch(/trees share one look/);
  });

  it('the pixel map puts each stripe together and maps every pixel once', () => {
    const m = buildLedmap(15, [canes(), path(12, 3)]);
    // band 0 is nodes 2, 4, 6 → pixels 1, 3, 5 of cane 1 and 7, 9, 11 of cane 2; band 1 the rest.
    expect(m.map).toEqual([1, 3, 5, 7, 9, 11, 0, 2, 4, 6, 8, 10, 12, 13, 14]);
    expect([...m.map].sort((a, b) => a - b)).toEqual([...Array(15).keys()]);
    expect(m.stripes.get('canes')).toEqual([[0, 6], [6, 12]]);
    expect(JSON.parse(ledmapFile(m))).toMatchObject({ n: 'Eaveglow' });
    expect(isIdentity(buildLedmap(5, [path(0, 5)]))).toBe(true);
  });

  it('canes show their stripes, path lights follow the look, the rest is off', () => {
    const c = compileController([canes(), path(12, 3)], look('magic_icicles'), cat, 20, 32);
    const fx = (s: any) => wled16Effects[s.fx];
    expect(c.segments.map((s) => [s.start, s.stop, s.on, fx(s)])).toEqual([
      [0, 6, true, 'Solid'],
      [6, 12, true, 'Solid'],
      [12, 15, true, 'Solid'],
      [12, 15, true, 'Fairytwinkle'],
      [15, 20, false, 'Solid'],
    ]);
    expect(c.segments[0].col).toEqual([CANE_COLORS[0]]);
    expect(c.segments[1].col).toEqual([CANE_COLORS[1]]);
    expect(c.segments.map((s) => s.id)).toEqual([0, 1, 2, 3, 4]);
    // Brightness per prop: WLED segment brightness, on every segment of that prop only.
    const dim = compileController([canes({ brightness: 50 }), { ...path(12, 3), brightness: 20 }], look('magic_icicles'), cat, 20, 32);
    expect(dim.segments.map((s) => s.bri)).toEqual([128, 128, 51, 51, 255]);
    const custom = compileController([canes({ colors: [[0, 255, 0], [255, 255, 255]] })], look('warm_white'), cat, 12);
    expect(custom.segments[0].col).toEqual([[0, 255, 0]]);
  });
});

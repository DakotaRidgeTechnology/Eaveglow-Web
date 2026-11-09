import { builtinLooks } from '../src/engine/library';
import { CANE_COLORS, Prop, buildLedmap, compileController, isIdentity, ledmapFile, stripeBands } from '../src/engine/props';
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
  it('diagonal bands', () => {
    // (row + col) / 2: node 1 (2,4)=6→3→1, node 2 (2,2)=4→0, node 3 (2,0)=2→1, node 4 (0,0)=0→0, node 5 (0,2)=2→1, node 6 (0,4)=4→0
    expect(stripeBands(parseXModel(XMODEL), 2)).toEqual([1, 0, 1, 0, 1, 0]);
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
    const custom = compileController([canes({ colors: [[0, 255, 0], [255, 255, 255]] })], look('warm_white'), cat, 12);
    expect(custom.segments[0].col).toEqual([[0, 255, 0]]);
  });
});

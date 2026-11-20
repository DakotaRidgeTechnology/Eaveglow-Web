import { generateLookFromZones, seedFromText } from '../src/engine/lookGenerator';
import { wled16Effects, wled16Palettes } from './fixtures_wled16';

const zones = [
  { id: 'side', name: 'Garage Left Side', start: 0, length: 30 },
  { id: 'front', name: 'Lower Front 1', start: 30, length: 40 },
  { id: 'apex', name: 'Garage Apex Left', start: 70, length: 1 },
];

const coherent = (seed: number) =>
  generateLookFromZones(zones, {
    coherent: true,
    effects: wled16Effects,
    palettes: wled16Palettes,
    seed,
  });

/** Everything that matters about a generated look, minus the random look id. */
const recipe = (look: ReturnType<typeof coherent>) =>
  look.layers.map((l) => ({
    effect: l.effect[0],
    palette: l.palette[0],
    colors: l.colors,
    speed: l.speed,
    intensity: l.intensity,
    target: l.target,
  }));

describe('coherent look generation', () => {
  it('regenerates exactly the same look from the same seed', () => {
    expect(recipe(coherent(12345))).toEqual(recipe(coherent(12345)));
  });

  it('gives a different look from a different seed', () => {
    expect(recipe(coherent(1))).not.toEqual(recipe(coherent(2)));
  });

  it('uses only effects the controller actually has', () => {
    for (const layer of coherent(777).layers) {
      expect(wled16Effects).toContain(layer.effect[0]);
    }
  });

  it('uses one palette across every layer, chosen from the controller', () => {
    const look = coherent(4242);
    const palettes = new Set(look.layers.map((l) => l.palette[0]));
    expect(palettes.size).toBe(1);
    expect(wled16Palettes).toContain([...palettes][0]);
  });

  it('gives each part a different effect', () => {
    const effects = coherent(99).layers.map((l) => l.effect[0]);
    expect(new Set(effects).size).toBe(effects.length);
  });

  it('keeps zone targets and layer stacking order', () => {
    const look = coherent(15);
    expect(look.layers).toHaveLength(3);
    // Sorted by priority: front 40, side 35, apex 100 -> apex renders last.
    expect(look.layers[2].target).toEqual({ kind: 'zones', zoneIds: ['apex'] });
    expect(look.layers.map((l) => (l.target.kind === 'zones' ? l.target.zoneIds : []))).toEqual([
      ['side'],
      ['front'],
      ['apex'],
    ]);
  });

  it('stays faithful to the naming rules with coherent off', () => {
    const look = generateLookFromZones(zones, { seed: 12345 });
    expect(look.layers.map((l) => l.effect[0])).toEqual(['Rain', 'Rain', 'Sparkle']);
    expect(look.layers.some((l) => l.palette.length > 0)).toBe(false);
  });

  it('survives an offline snapshot with no effect or palette lists', () => {
    const look = generateLookFromZones(zones, { coherent: true, seed: 3 });
    expect(look.layers).toHaveLength(3);
    expect(look.layers.every((l) => l.effect.length === 1)).toBe(true);
  });

  it('turns a text seed into a repeatable number', () => {
    expect(seedFromText('halloween')).toBe(seedFromText('halloween'));
    expect(seedFromText('halloween')).not.toBe(seedFromText('christmas'));
  });
});

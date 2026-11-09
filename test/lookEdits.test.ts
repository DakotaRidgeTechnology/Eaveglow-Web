import {
  addPartLayer,
  copyStyleFrom,
  layerZoneIds,
  removeLayer,
  setLayerZones,
} from '../src/engine/lookEdits';
import { builtinLooks, newCustomLook } from '../src/engine/library';
import { EffectCatalog, compileLook } from '../src/engine/segmentCompiler';
import { wled16Effects, wled16Palettes } from './fixtures_wled16';

const cat = new EffectCatalog(wled16Effects, wled16Palettes);
const layout = {
  totalPixels: 200,
  zones: [
    { id: 'roof', name: 'Roofline', start: 0, length: 150 },
    { id: 'garage', name: 'Garage', start: 150, length: 50 },
  ],
};

describe('different look per part', () => {
  it('adds, retargets and removes part layers; the base layer stays', () => {
    let look = addPartLayer(newCustomLook(), ['garage']);
    expect(look.l).toHaveLength(2);
    expect(layerZoneIds(look.l[1])).toEqual(['garage']);
    look = setLayerZones(look, 1, ['roof', 'garage']);
    expect(layerZoneIds(look.l[1])).toEqual(['roof', 'garage']);
    expect(removeLayer(look, 0).l).toHaveLength(2);
    expect(removeLayer(look, 1).l).toHaveLength(1);
  });

  it('copying a style from another look keeps where the layer applies', () => {
    const look = addPartLayer(newCustomLook(), ['garage']);
    const candy = builtinLooks.find((l) => l.id === 'builtin.candy_cane')!;
    const l = copyStyleFrom(look.l[1], candy);
    expect(l.e).toEqual(candy.l[0].e);
    expect(layerZoneIds(l)).toEqual(['garage']);
  });

  it('warm white base + Twinkle on the garage compiles to two different segments', () => {
    let look = newCustomLook();
    look.l[0] = { ...look.l[0], c: [[255, 170, 90]] };
    look = addPartLayer(look, ['garage']);
    look.l[1] = { ...look.l[1], e: ['Twinklefox'] };
    const segs = compileLook(layout, look, cat).segments;
    expect(segs.map((s) => [s.start, s.stop, wled16Effects[s.fx!]])).toEqual([
      [0, 150, 'Solid'],
      [150, 200, 'Twinklefox'],
    ]);
  });
});

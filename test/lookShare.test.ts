import { SHARE_PREFIX, decodeLook, encodeLook } from '../src/engine/lookShare';
import { Look } from '../src/engine/model';

const mine = [
  { id: 'z1', name: 'Roofline', start: 0, length: 100 },
  { id: 'z2', name: 'Garage', start: 100, length: 50 },
];
const theirs = [
  { id: 'a', name: 'garage', start: 0, length: 30 },
  { id: 'b', name: 'Porch', start: 30, length: 20 },
];
const look: Look = {
  id: 'custom.1',
  name: 'Team Spirit',
  emoji: '🏈',
  category: 'My Looks',
  layers: [
    { target: { kind: 'all' }, effect: ['Twinkle'], palette: [], colors: [[255, 200, 0]], speed: 90, intensity: 140 },
    { target: { kind: 'zones', zoneIds: ['z2'] }, effect: ['Railway'], palette: [], colors: [[255, 0, 0], [255, 255, 255]], speed: 128, intensity: 128 },
  ],
};

describe('sharing looks', () => {
  it('round trip: parts are shared by name and matched on the other house', () => {
    const text = encodeLook(look, mine);
    expect(text.startsWith(SHARE_PREFIX)).toBe(true);
    expect(text).toContain('"Garage"');
    expect(text).not.toContain('z2');
    const back = decodeLook(`Check out my lights! ${text} 🎉`, theirs);
    expect(back.id).not.toBe(look.id);
    expect(back).toMatchObject({ name: 'Team Spirit', emoji: '🏈', category: 'My Looks' });
    expect(back.layers[1].target).toEqual({ kind: 'zones', zoneIds: ['a'] });
    expect(back.layers[0]).toMatchObject({ effect: ['Twinkle'], colors: [[255, 200, 0]], speed: 90 });
  });

  it("leaves out parts the other house doesn't have", () => {
    const back = decodeLook(encodeLook(look, mine), [{ id: 'x', name: 'Porch', start: 0, length: 10 }]);
    expect(back.layers).toHaveLength(1);
  });

  it('cleans up odd values and explains bad text', () => {
    const odd = SHARE_PREFIX + JSON.stringify({ name: 'x'.repeat(99), layers: [{ target: { kind: 'all' }, effect: ['Solid'], colors: [[999, -5, 3.6]], speed: 1000 }] });
    const l = decodeLook(odd, []);
    expect(l.name).toHaveLength(40);
    expect(l.layers[0]).toMatchObject({ colors: [[255, 0, 4]], speed: 255, intensity: 128 });
    expect(() => decodeLook('hello', [])).toThrow(/isn't a shared Eaveglow look/);
    expect(() => decodeLook(SHARE_PREFIX + '{"name":"cut off', [])).toThrow(/incomplete/);
    expect(() => decodeLook(SHARE_PREFIX + '{"layers":[]}', [])).toThrow(/doesn't have anything/);
  });
});

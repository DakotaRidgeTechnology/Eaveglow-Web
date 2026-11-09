// Edits for looks with a different style on some parts of the house.
// Layer 0 is the base (whole house); later layers cover chosen parts and
// paint over it (see compileLook).
import { Look, LookLayer } from './model';

const withLayers = (look: Look, l: LookLayer[]): Look => ({ ...look, l });

/** Adds a part layer (copy of the base style) covering `zoneIds`. */
export const addPartLayer = (look: Look, zoneIds: string[]): Look =>
  withLayers(look, [...look.l, { ...structuredClone(look.l[0]), t: { kind: 'zones', zoneIds } }]);

/** Removes a part layer; the base layer stays. */
export const removeLayer = (look: Look, i: number): Look =>
  i <= 0
    ? look
    : withLayers(
        look,
        look.l.filter((_, k) => k !== i)
      );

export const setLayerZones = (look: Look, i: number, zoneIds: string[]): Look =>
  withLayers(
    look,
    look.l.map((l, k) => (k === i ? { ...l, t: { kind: 'zones', zoneIds } } : l))
  );

/** Takes another look's style (first layer), keeping where this layer applies and its spacing. */
export function copyStyleFrom(layer: LookLayer, source: Look): LookLayer {
  const s = source.l[0];
  return {
    ...layer,
    e: [...s.e],
    p: [...s.p],
    c: s.c.map((c) => [...c] as typeof c),
    s: s.s,
    i: s.i,
  };
}

/** Zone ids a part layer covers. */
export const layerZoneIds = (l: LookLayer) => (l.t.kind === 'zones' ? l.t.zoneIds : []);

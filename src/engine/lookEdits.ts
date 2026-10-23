// Edits for looks with a different style on some parts of the house.
// Layer 0 is the base (whole house); later layers cover chosen parts and
// paint over it (see compileLook).
import { Look, LookLayer } from './model';

const withLayers = (look: Look, layers: LookLayer[]): Look => ({ ...look, layers });

/** Adds a part layer (copy of the base style) covering `zoneIds`. */
export const addPartLayer = (look: Look, zoneIds: string[]): Look =>
  withLayers(look, [...look.layers, { ...structuredClone(look.layers[0]), target: { kind: 'zones', zoneIds } }]);

/** Removes a part layer; the base layer stays. */
export const removeLayer = (look: Look, i: number): Look =>
  i <= 0 ? look : withLayers(look, look.layers.filter((_, k) => k !== i));

export const setLayerZones = (look: Look, i: number, zoneIds: string[]): Look =>
  withLayers(look, look.layers.map((l, k) => (k === i ? { ...l, target: { kind: 'zones', zoneIds } } : l)));

/** Takes another look's style (first layer), keeping where this layer applies and its spacing. */
export function copyStyleFrom(layer: LookLayer, source: Look): LookLayer {
  const s = source.layers[0];
  return { ...layer, effect: [...s.effect], palette: [...s.palette], colors: s.colors.map((c) => [...c] as typeof c), speed: s.speed, intensity: s.intensity };
}

/** Zone ids a part layer covers. */
export const layerZoneIds = (l: LookLayer) => (l.target.kind === 'zones' ? l.target.zoneIds : []);

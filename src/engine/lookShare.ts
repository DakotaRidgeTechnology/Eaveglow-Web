// Share a custom look as text (to paste into another phone, a message or a
// forum post) and read one back. Parts of the house are shared by name,
// since ids differ from house to house.
import { newCustomLook } from './library';
import { CUSTOM_CATEGORY, LayerTarget, Look, LookLayer, Rgb, Zone } from './model';

export const SHARE_PREFIX = 'EAVEGLOW-LOOK:';

type SharedTarget = { kind: 'all' } | { kind: 'alternateZones'; phase?: number } | { kind: 'zones'; zoneNames: string[] };

export function encodeLook(look: Look, zones: Zone[]): string {
  const nameOf = (id: string) => zones.find((z) => z.id === id)?.name;
  const layers = look.layers.map(({ target, ...rest }) => ({
    ...rest,
    target:
      target.kind === 'zones'
        ? { kind: 'zones', zoneNames: target.zoneIds.map(nameOf).filter((n): n is string => !!n) }
        : target,
  }));
  return SHARE_PREFIX + JSON.stringify({ v: 1, name: look.name, emoji: look.emoji, layers });
}

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const names = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40).slice(0, max) : [];
const color = (v: unknown): Rgb | null =>
  Array.isArray(v) && v.length >= 3 ? [int(v[0], 0, 255, 0), int(v[1], 0, 255, 0), int(v[2], 0, 255, 0)] : null;

/**
 * Reads a shared look (the text may have other words around it) into a new
 * custom look. Zone parts are matched to `zones` by name; a part layer
 * whose parts this house doesn't have is left out.
 */
export function decodeLook(text: string, zones: Zone[]): Look {
  const at = text.indexOf(SHARE_PREFIX);
  if (at < 0) throw new Error("That isn't a shared Eaveglow look. It should start with EAVEGLOW-LOOK:");
  let data: any;
  try {
    const json = text.slice(at + SHARE_PREFIX.length).trim();
    data = JSON.parse(json.slice(0, json.lastIndexOf('}') + 1));
  } catch {
    throw new Error('That shared look is incomplete. Copy the whole text and try again.');
  }
  const rawLayers: any[] = Array.isArray(data?.layers) ? data.layers.slice(0, 8) : [];
  const layers: LookLayer[] = [];
  for (const l of rawLayers) {
    const effect = names(l?.effect, 6);
    const colors = (Array.isArray(l?.colors) ? l.colors : []).map(color).filter((c: Rgb | null): c is Rgb => !!c).slice(0, 5);
    if (!effect.length) continue;
    const target = readTarget(l?.target, zones);
    if (!target) continue;
    const layer: LookLayer = {
      target,
      effect,
      palette: names(l?.palette, 3),
      colors: colors.length ? colors : [[255, 255, 255]],
      speed: int(l?.speed, 0, 255, 128),
      intensity: int(l?.intensity, 0, 255, 128),
      reverse: l?.reverse === true,
    };
    if (l?.spacing) layer.spacing = { lit: int(l.spacing.lit, 1, 20, 1), skip: int(l.spacing.skip, 0, 50, 0) };
    if (l?.overlayEvery) layer.overlayEvery = int(l.overlayEvery, 2, 20, 4);
    layers.push(layer);
  }
  // The first layer is the whole house; parts and overlays sit on top of it.
  if (!layers.length || layers[0].target.kind === 'zones' || layers[0].overlayEvery) {
    throw new Error("That shared look doesn't have anything Eaveglow can show.");
  }
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 40) : 'Shared look';
  const emoji = typeof data.emoji === 'string' && data.emoji.length <= 8 ? data.emoji : '✨';
  return { ...newCustomLook(), name, emoji, category: CUSTOM_CATEGORY, layers };
}

function readTarget(t: any, zones: Zone[]): LayerTarget | null {
  if (t?.kind === 'all') return { kind: 'all' };
  if (t?.kind === 'alternateZones') return { kind: 'alternateZones', phase: int(t.phase, 0, 1, 0) };
  if (t?.kind === 'zones') {
    const wanted = names((t as SharedTarget & { kind: 'zones' }).zoneNames, 50).map((n) => n.toLowerCase());
    const zoneIds = zones.filter((z) => wanted.includes(z.name.toLowerCase())).map((z) => z.id);
    return zoneIds.length ? { kind: 'zones', zoneIds } : null;
  }
  return null;
}

// Installs Eaveglow's own (★) palettes on the controller as WLED custom
// palettes: files /palette0.json, /palette1.json, … which WLED reloads as
// soon as one is uploaded. Palette ids count down from 200 (WLED 16) or
// 255 (0.15); 0.15 allows 10, WLED 16 up to 129 (10 on ESP8266).
import { PalettePreset, isCustomPalette, paletteByWledName } from './library';
import { WledClient } from './wledClient';

export interface PaletteSlots {
  base: number;
  max: number;
}

export function paletteSlots(version: string, arch: string): PaletteSlots {
  const major = parseInt(version.split('.')[0], 10) || 0;
  if (major < 16) return { base: 255, max: 10 };
  return { base: 200, max: arch.toLowerCase().includes('8266') ? 10 : 129 };
}

const hex = (c: number[]) => c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** The WLED palette file: {"n": name, "palette": [pos, "RRGGBB", …]}. */
export function paletteFile(p: PalettePreset): string {
  const n = p.stops.length;
  const positions = p.positions ?? p.stops.map((_, i) => Math.round((i * 255) / Math.max(1, n - 1)));
  return JSON.stringify({ n: p.wled, palette: p.stops.flatMap((c, i) => [positions[i], hex(c)]) });
}

/** Custom palettes a look's layers want (first choice only). */
export const customPalettesIn = (palettes: string[][]) =>
  [...new Set(palettes.map((p) => p[0]).filter((n): n is string => !!n && isCustomPalette(n)))];

export class CustomPaletteInstaller {
  private verified = new Set<string>();

  constructor(
    private client: WledClient,
    private getMap: () => Record<string, number>,
    private saveMap: (m: Record<string, number>) => void,
  ) {}

  private async read(index: number): Promise<{ n?: string } | null | 'missing'> {
    const j = await this.client.readFile(`/palette${index}.json`);
    return j === null ? 'missing' : j;
  }

  /**
   * Makes sure the named palettes are on the controller. Returns name → WLED
   * palette id for the ones available; others are left for the fallback.
   */
  async ensure(names: string[], slots: PaletteSlots): Promise<{ ids: Record<string, number>; failed: string[] }> {
    const map = { ...this.getMap() };
    const ids: Record<string, number> = {};
    const failed: string[] = [];
    let changed = false;

    for (const name of names) {
      const preset = paletteByWledName(name);
      if (!preset) continue;
      let index: number | undefined = map[name];
      if (index !== undefined && !this.verified.has(name)) {
        const file = await this.read(index).catch(() => null);
        if (file === 'missing' || (file && file.n !== name)) {
          delete map[name];
          changed = true;
          index = undefined;
        } else this.verified.add(name);
      }
      if (index === undefined) {
        try {
          index = await this.install(preset, map, slots);
          map[name] = index;
          changed = true;
          this.verified.add(name);
        } catch {
          failed.push(name);
          continue;
        }
      }
      ids[name] = slots.base - index;
    }
    if (changed) this.saveMap(map);
    return { ids, failed };
  }

  /** Uploads into the lowest free slot (or adopts an existing copy). */
  private async install(preset: PalettePreset, map: Record<string, number>, slots: PaletteSlots): Promise<number> {
    const taken = new Set(Object.values(map));
    for (let i = 0; i < slots.max; i++) {
      if (taken.has(i)) continue;
      const file = await this.read(i);
      if (file !== 'missing') {
        if (file && file.n === preset.wled) return i; // already there
        continue; // someone else's palette
      }
      await this.client.uploadFile(`/palette${i}.json`, paletteFile(preset));
      return i;
    }
    throw new Error('No free custom palette slots');
  }
}

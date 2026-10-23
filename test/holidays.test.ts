import { CustomPaletteInstaller, customPalettesIn, paletteFile, paletteSlots } from '../src/engine/customPalettes';
import { byUpcoming, daysUntil, describeDays, easter, holidayDate } from '../src/engine/holidays';
import { builtinLooks, holidayGroups, paletteByWledName, palettePresets } from '../src/engine/library';
import { EffectCatalog, compileLook } from '../src/engine/segmentCompiler';
import { WledClient } from '../src/engine/wledClient';
import { wled16Effects, wled16Palettes } from './fixtures_wled16';

const ymd = (d: Date | null) => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const group = (id: string) => holidayGroups.find((h) => h.id === id)!;

describe('holiday dates', () => {
  it('computes Easter and related dates', () => {
    expect(ymd(easter(2026))).toBe('2026-4-5');
    expect(ymd(easter(2027))).toBe('2027-3-28');
    expect(ymd(holidayDate('easter:-47', 2026))).toBe('2026-2-17'); // Mardi Gras
  });

  it('computes Thanksgiving and Memorial Day', () => {
    expect(ymd(holidayDate('nth:11:4:4', 2026))).toBe('2026-11-26');
    expect(ymd(holidayDate('nth:11:4:4', 2027))).toBe('2027-11-25');
    expect(ymd(holidayDate('last:5:1', 2026))).toBe('2026-5-25');
  });

  it('knows what is coming up', () => {
    const oct23 = new Date(2026, 9, 23);
    expect(daysUntil(group('halloween'), oct23)).toBe(8);
    expect(byUpcoming(holidayGroups, oct23)[0].group.id).toBe('halloween');
    expect(byUpcoming(holidayGroups, oct23)[1].group.id).toBe('diwali');
    expect(daysUntil(group('new_year'), new Date(2026, 11, 31))).toBe(1);
    expect(describeDays(8)).toBe('in 8 days');
  });

  it('every holiday has looks, Halloween/Christmas/Easter/July 4th have lots', () => {
    const count = (id: string) => builtinLooks.filter((l) => l.group === id).length;
    for (const h of holidayGroups) expect(count(h.id), h.name).toBeGreaterThan(0);
    expect(count('halloween')).toBeGreaterThanOrEqual(15);
    expect(count('christmas')).toBeGreaterThanOrEqual(20);
    expect(count('easter')).toBeGreaterThanOrEqual(7);
    expect(count('july_4th')).toBeGreaterThanOrEqual(10);
  });
});

describe('custom palettes', () => {
  it('writes WLED palette files, with hard stops where defined', () => {
    const glory = JSON.parse(paletteFile(paletteByWledName('★ Old Glory')!));
    expect(glory.n).toBe('★ Old Glory');
    expect(glory.palette).toEqual([0, 'FF0000', 84, 'FF0000', 85, 'FFFFFF', 169, 'FFFFFF', 170, '0030FF', 255, '0030FF']);
    const candy = JSON.parse(paletteFile(paletteByWledName('★ Candy Corn')!));
    expect(candy.palette.length / 2).toBe(4);
    for (const p of palettePresets.filter((x) => x.wled.startsWith('★'))) {
      expect(JSON.parse(paletteFile(p)).palette.length).toBeLessThanOrEqual(36);
    }
  });

  it('palette ids count down from 200 on WLED 16 and 255 on 0.15', () => {
    expect(paletteSlots('16.0.1', 'esp32')).toEqual({ base: 200, max: 129 });
    expect(paletteSlots('16.0.1', 'esp8266')).toEqual({ base: 200, max: 10 });
    expect(paletteSlots('0.15.0', 'esp32')).toEqual({ base: 255, max: 10 });
  });

  /** Controller file system for palette files. */
  function controller(files: Record<string, string> = {}, locked = false) {
    const uploads: string[] = [];
    const fetchImpl = async (url: any, init?: RequestInit) => {
      const path = String(url);
      if (path === '/upload') {
        if (locked) return new Response('', { status: 401 });
        const file = (init!.body as FormData).get('data') as File;
        files[file.name] = await file.text();
        uploads.push(file.name);
        return new Response('ok');
      }
      return files[path] !== undefined ? new Response(files[path]) : new Response('', { status: 404 });
    };
    return { client: new WledClient('', fetchImpl as typeof fetch), files, uploads };
  }

  it('installs into free slots, skipping your own palettes, and reuses them next time', async () => {
    const c = controller({ '/palette0.json': JSON.stringify({ palette: [0, 'FF0000', 255, '0000FF'] }) });
    let map: Record<string, number> = {};
    const installer = new CustomPaletteInstaller(c.client, () => map, (m) => (map = m));
    const slots = paletteSlots('16.0.1', 'esp32');
    const r = await installer.ensure(['★ Candy Corn', '★ Peppermint'], slots);
    expect(c.uploads).toEqual(['/palette1.json', '/palette2.json']);
    expect(r.ids).toEqual({ '★ Candy Corn': 199, '★ Peppermint': 198 });
    expect(map).toEqual({ '★ Candy Corn': 1, '★ Peppermint': 2 });
    await installer.ensure(['★ Candy Corn'], slots);
    expect(c.uploads.length).toBe(2);

    // A new phone (empty map) finds the existing copy instead of duplicating it.
    let map2: Record<string, number> = {};
    const r2 = await new CustomPaletteInstaller(c.client, () => map2, (m) => (map2 = m)).ensure(['★ Peppermint'], slots);
    expect(r2.ids['★ Peppermint']).toBe(198);
    expect(c.uploads.length).toBe(2);
  });

  it('a look with a custom palette uses it when installed, else its built-in fallback', async () => {
    const look = builtinLooks.find((l) => l.id === 'builtin.hw_candy_corn')!;
    const layout = { totalPixels: 100, zones: [] };
    const plain = compileLook(layout, look, new EffectCatalog(wled16Effects, wled16Palettes));
    expect(wled16Palettes[plain.segments[0].pal!]).toBe('Orangery');
    expect(plain.warnings).toEqual([]);
    const withCustom = compileLook(layout, look, new EffectCatalog(wled16Effects, wled16Palettes, { '★ Candy Corn': 199 }));
    expect(withCustom.segments[0].pal).toBe(199);
    expect(customPalettesIn(look.layers.map((l) => l.palette))).toEqual(['★ Candy Corn']);
  });

  it('reports palettes it could not install (PIN lock)', async () => {
    const c = controller({}, true);
    const r = await new CustomPaletteInstaller(c.client, () => ({}), () => {}).ensure(['★ Grinch'], paletteSlots('16.0.1', 'esp32'));
    expect(r.failed).toEqual(['★ Grinch']);
    expect(r.ids).toEqual({});
  });
});

import { backupFileName, makeBackup, readBackup } from '../src/engine/backup';
import { checkForUpdate, isNewer, setUpdateChecks } from '../src/engine/updates';
import { defaultSettings } from '../src/store';

const settings = () => ({
  ...defaultSettings(),
  layout: { totalPixels: 300, zones: [{ id: 'z', name: 'Roofline', start: 0, length: 300 }] },
  customLooks: [{ id: 'custom.1', name: 'Team Spirit', emoji: '🏈', layers: [] } as any],
  customPalettes: { '★ Candy Corn': 0 },
  autopilot: { enabled: true, seasons: [], everydayLookId: 'builtin.warm_white', syncedDates: 'x' },
});

describe('backup', () => {
  it('round trip keeps the setup and drops what belongs to one controller', () => {
    const b = makeBackup(settings(), new Date(2026, 9, 24));
    const r = readBackup(JSON.stringify(b));
    expect(r.settings.customLooks[0].name).toBe('Team Spirit');
    expect(r.settings.layout?.zones).toHaveLength(1);
    expect(r.settings.customPalettes).toBeUndefined();
    expect(r.settings.autopilot?.syncedDates).toBeUndefined();
    expect(r.summary).toBe('1 custom look · 1 house part · schedule off · autopilot on');
    expect(backupFileName(new Date(2026, 9, 4))).toBe('eaveglow-backup-2026-10-04.json');
  });

  it('accepts a plain /eaveglow.json, rejects anything else', () => {
    expect(readBackup(JSON.stringify(settings())).summary).toMatch(/^1 custom look/);
    expect(() => readBackup('not json')).toThrow(/isn't an Eaveglow backup/);
    expect(() => readBackup(JSON.stringify({ presets: {} }))).toThrow(/isn't an Eaveglow backup/);
  });
});

describe('update checks', () => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) };
  const github = (tag: string) => async () => new Response(JSON.stringify({ tag_name: tag, html_url: 'https://example/r' }), { status: 200 });

  it('compares versions', () => {
    expect(isNewer('v1.10.0', '1.9.2')).toBe(true);
    expect(isNewer('1.1.0', '1.1.0')).toBe(false);
    expect(isNewer('1.0.9', '1.1.0')).toBe(false);
  });

  it('is off by default, then asks GitHub at most once a day', async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, github('v1.2.0')())) as typeof fetch;
    expect(await checkForUpdate('1.1.0', false, fetchImpl)).toEqual({ status: 'off' });
    expect(calls).toBe(0);
    setUpdateChecks(true);
    expect(await checkForUpdate('1.1.0', false, fetchImpl, 1000)).toEqual({ status: 'available', update: { version: '1.2.0', url: 'https://example/r' } });
    expect(await checkForUpdate('1.2.0', false, fetchImpl, 2000)).toEqual({ status: 'current' });
    expect(calls).toBe(1);
    expect((await checkForUpdate('1.1.0', true, (async () => { throw new Error('offline'); }) as typeof fetch)).status).toBe('failed');
  });
});

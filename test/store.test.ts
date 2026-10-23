import { WledClient } from '../src/engine/wledClient';
import { SETTINGS_FILE, SettingsStore } from '../src/store';

/** Controller file system with /upload, shared by several "phones". */
function controller(initial?: object) {
  const files: Record<string, string> = initial ? { [SETTINGS_FILE]: JSON.stringify(initial) } : {};
  let uploads = 0;
  const fetchImpl = async (url: any, init?: RequestInit) => {
    const path = String(url);
    if (path === '/upload') {
      const form = init!.body as FormData;
      const file = form.get('data') as File;
      files[file.name] = await file.text();
      uploads++;
      return new Response('ok', { status: 200 });
    }
    if (files[path] !== undefined) return new Response(files[path], { status: 200 });
    return new Response('', { status: 404 });
  };
  return { client: new WledClient('', fetchImpl as typeof fetch), files, uploads: () => uploads };
}

describe('settings on the controller', () => {
  it('starts with defaults, saves to /eaveglow.json and loads it on another phone', async () => {
    const c = controller();
    const phoneA = new SettingsStore(c.client, 0);
    await phoneA.load();
    expect(phoneA.settings.customLooks).toEqual([]);
    phoneA.update('layout', { totalPixels: 200, zones: [], spacing: { lit: 1, skip: 3 } });
    await phoneA.flush();
    expect(JSON.parse(c.files[SETTINGS_FILE]).layout.totalPixels).toBe(200);
    expect(phoneA.status).toBe('saved');

    const phoneB = new SettingsStore(c.client, 0);
    await phoneB.load();
    expect(phoneB.settings.layout?.spacing).toEqual({ lit: 1, skip: 3 });
  });

  it("two phones editing different things don't overwrite each other", async () => {
    const c = controller({ version: 1, customLooks: [], recentColors: [] });
    const a = new SettingsStore(c.client, 0);
    const b = new SettingsStore(c.client, 0);
    await a.load();
    await b.load();
    a.update('recentColors', [[1, 2, 3]]);
    b.update('activeLookId', 'builtin.rainbow');
    await a.flush();
    await b.flush();
    const saved = JSON.parse(c.files[SETTINGS_FILE]);
    expect(saved.recentColors).toEqual([[1, 2, 3]]);
    expect(saved.activeLookId).toBe('builtin.rainbow');
  });

  it('keeps changes and reports an error when the upload is refused (PIN lock)', async () => {
    const fetchImpl = async (url: any) =>
      String(url) === '/upload' ? new Response('locked', { status: 401 }) : new Response('', { status: 404 });
    const s = new SettingsStore(new WledClient('', fetchImpl as typeof fetch), 0);
    s.update('activeLookId', 'x');
    await s.flush();
    expect(s.status).toBe('error');
    expect(s.error).toContain('PIN');
    expect(s.settings.activeLookId).toBe('x');
  });
});

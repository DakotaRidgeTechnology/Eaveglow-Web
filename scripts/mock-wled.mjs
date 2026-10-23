// A pretend WLED 16 controller for development and end-to-end tests.
// Serves the built page like WLED does (gzipped), the JSON API, presets and
// a file system with /upload. Usage: node scripts/mock-wled.mjs [port]
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

export function startMockWled(port = 8099) {
  const effects = JSON.parse(readFileSync(new URL('../e2e/wled16-effects.json', import.meta.url)));
  const palettes = JSON.parse(readFileSync(new URL('../e2e/wled16-palettes.json', import.meta.url)));
  const files = {}; // controller file system
  const log = []; // every POST, for tests
  let state = { on: true, bri: 128, seg: [{ id: 0, start: 0, stop: 200, grp: 1, spc: 0, on: true, col: [[255, 160, 80]], fx: 0, pal: 0 }] };
  let cfg = { hw: { led: { total: 200, rgbwm: 3, fps: 42 } }, light: { gc: { bri: 1, col: 2.2, val: 2.2 } }, timers: { ins: [{ en: 1, hour: 7, min: 0, macro: 3 }] } };
  const presets = { 0: {}, 3: { n: 'Morning' } };

  const send = (res, code, body, type = 'application/json', extra = {}) => {
    res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', ...extra });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const path = url.pathname;
    if (req.method === 'POST' && path !== '/upload') log.push({ path, body: JSON.parse(raw.toString() || '{}') });

    if (path === '/eaveglow.htm') {
      const gz = new URL('../dist/eaveglow.htm.gz', import.meta.url);
      if (!existsSync(gz)) return send(res, 404, 'build first', 'text/plain');
      return send(res, 200, readFileSync(gz), 'text/html', { 'Content-Encoding': 'gzip' });
    }
    if (path === '/eaveglow-icon.png') return send(res, 200, readFileSync(new URL('../public/eaveglow-icon.png', import.meta.url)), 'image/png');
    if (path === '/json') return send(res, 200, { state, info: { name: 'Roofline', ver: '16.0.1', arch: 'esp32', leds: { count: +(process.env.LEDS ?? 200), maxseg: 32 } }, effects, palettes });
    if (path === '/json/state') {
      if (req.method === 'POST') {
        const b = log.at(-1).body;
        if ('on' in b) state.on = b.on;
        if ('bri' in b) state.bri = b.bri;
        if (b.seg) state.seg = b.seg.filter((s) => s.stop !== 0);
        if (b.psave) presets[b.psave] = { n: b.n, on: b.on };
      }
      return send(res, 200, state);
    }
    if (path === '/json/cfg') {
      if (req.method === 'POST') {
        cfg = { ...cfg, ...log.at(-1).body };
        return send(res, 200, { success: true });
      }
      return send(res, 200, cfg);
    }
    if (path === '/json/nodes') return send(res, 200, { nodes: [] });
    if (path === '/presets.json') return send(res, 200, presets);
    if (path === '/upload' && req.method === 'POST') {
      const form = await new Request('http://x/upload', { method: 'POST', headers: req.headers, body: raw }).formData();
      const file = form.get('data');
      files[file.name.startsWith('/') ? file.name : '/' + file.name] = await file.text();
      log.push({ path: '/upload', name: file.name });
      return send(res, 200, 'File Uploaded!', 'text/plain');
    }
    if (files[path] !== undefined) return send(res, 200, files[path]);
    send(res, 404, 'Not found', 'text/plain');
  });
  server.listen(port);
  return { server, files, log, get state() { return state; }, get cfg() { return cfg; }, presets, url: `http://localhost:${port}` };
}

if (process.argv[1] && process.argv[1].endsWith('mock-wled.mjs')) {
  const m = startMockWled(+(process.argv[2] ?? 8099));
  console.log(`Mock WLED on ${m.url}/eaveglow.htm`);
}

// Uploads Eaveglow to a WLED controller: node scripts/install.mjs 192.168.1.50
import { readFileSync } from 'node:fs';

const host = process.argv[2];
if (!host) {
  console.error('Usage: npm run install-to -- <wled-ip-or-hostname>');
  process.exit(1);
}
const base = host.startsWith('http') ? host : `http://${host}`;

async function upload(file, name, type) {
  const form = new FormData();
  form.append('data', new Blob([readFileSync(file)], { type }), name);
  const res = await fetch(`${base}/upload`, { method: 'POST', body: form });
  if (res.status === 401) throw new Error('The controller is PIN-locked. Unlock it in WLED → Config → Security & Updates.');
  if (!res.ok) throw new Error(`Upload of ${name} failed (${res.status}).`);
  console.log(`✓ ${name}`);
}

try {
  await upload('dist/eaveglow.htm.gz', '/eaveglow.htm.gz', 'application/gzip');
  await upload('dist/eaveglow-icon.png', '/eaveglow-icon.png', 'image/png');
  console.log(`\nDone! Open ${base}/eaveglow.htm on your phone, then Share → Add to Home Screen.`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

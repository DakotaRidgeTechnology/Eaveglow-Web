// Gzips the single-file build for the controller and checks its size.
import { readFileSync, renameSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT = 60 * 1024; // fits even WLED builds with a 256 KB file system
renameSync('dist/index.html', 'dist/eaveglow.htm');
const gz = gzipSync(readFileSync('dist/eaveglow.htm'), { level: 9 });
writeFileSync('dist/eaveglow.htm.gz', gz);
if (existsSync('public/eaveglow-icon.png')) copyFileSync('public/eaveglow-icon.png', 'dist/eaveglow-icon.png');
console.log(`dist/eaveglow.htm.gz: ${(gz.length / 1024).toFixed(1)} KB (limit ${LIMIT / 1024} KB)`);
if (gz.length > LIMIT) {
  console.error('Too big for the controller. Trim the bundle.');
  process.exit(1);
}

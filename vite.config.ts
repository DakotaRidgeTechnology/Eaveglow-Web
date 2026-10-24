import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// `WLED=192.168.1.50 npm run dev` proxies API calls to a real controller.
const wled = process.env.WLED ? `http://${process.env.WLED}` : undefined;

export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2020', assetsInlineLimit: 100000000, cssCodeSplit: false, reportCompressedSize: false },
  server: wled
    ? { proxy: Object.fromEntries(['/json', '/presets.json', '/upload', '/eaveglow.json'].map((p) => [p, wled])) }
    : undefined,
  test: { globals: true, environment: 'node' },
});

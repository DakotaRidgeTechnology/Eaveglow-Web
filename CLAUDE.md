# Eaveglow (web)

A single-page Preact + TypeScript app served by the WLED ESP32 itself (`/eaveglow.htm.gz` on WLED's
file system). Settings are shared in `/eaveglow.json` on the controller.

- Test: `npm test` (Vitest). Build: `npm run build` → `dist/eaveglow.htm.gz` (must stay ≤ 60 KB gzipped).
- End to end: `npm run build && node e2e/e2e.mjs` (mock WLED in `scripts/mock-wled.mjs`; set
  `PLAYWRIGHT_PATH`/`CHROMIUM_PATH` if Playwright isn't installed in the project).
- Install on a controller: `npm run install-to -- <ip>` or upload both `dist/` files at `http://<ip>/edit`.
- The looks/styles/palettes/holidays library is `src/engine/library.json` (edited directly).
- WLED behaviour the code relies on is documented in `docs/how-it-works.md`. Re-check it against the WLED source
  before changing timers, palettes or `/json/cfg` handling.
- The Flutter app (DakotaRidgeTechnology/Eaveglow) is frozen; don't update it.

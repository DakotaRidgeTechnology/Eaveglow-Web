# Eaveglow

*Beautiful roofline lighting, made easy. Works with WLED.*

Eaveglow's looks, zones, light spacing and schedules, as one small web page (about 36 KB) that lives
**on the ESP32 running WLED**. There's nothing to install on phones, no app store, and nothing expires.
Everyone on your Wi-Fi opens the same page and shares the same settings.

## Install on your controller (one time)

You need the two files `eaveglow.htm.gz` and `eaveglow-icon.png`. Build them with `npm run build`, which puts
them in `dist/`.

**Option A: from a computer, with one command**

```sh
cd web
npm install
npm run build
npm run install-to -- 192.168.1.50      # your controller's IP or wled-xxxx.local
```

**Option B: by hand, in WLED's file manager**

1. Open `http://<your-controller>/edit` in a browser (WLED → Config → Security & Updates →
   "Manage file system" on some versions).
2. Upload `eaveglow.htm.gz` and `eaveglow-icon.png`.

If the controller's settings are locked with a PIN, unlock them first (WLED → Config → Security & Updates).

## Use it

1. On any phone, tablet or computer on the same Wi-Fi, open **`http://<your-controller>/eaveglow.htm`**.
2. On iPhone, tap **Share → Add to Home Screen**. You get an Eaveglow icon that opens full-screen like an app.
3. Settings (house zones, spacing, custom looks, schedule) are saved **on the controller** in `/eaveglow.json`,
   so every device sees the same thing. WLED's own UI is still at `http://<your-controller>/`.

To update, rebuild and upload `eaveglow.htm.gz` again. Your settings are kept.

## Features

- **Looks:** 131 looks (Everyday, Holidays, Bulbs, Party, Sports, Nature). Holidays are grouped by holiday,
  sorted by which comes next, with a "coming up" card.
- **Make your own look:** 94 effect styles, 66 colors plus any color, and 70 color themes. 27 of the themes are
  Eaveglow's own (★) and get installed on the controller as WLED custom palettes when first used.
- **House zones and light spacing:** e.g. light every 4th LED, with a street-distance preview.
- **Schedules:** several on/off windows, sunrise/sunset with offsets. Saving replaces WLED's timers.
- **Shared settings:** settings live on the controller, so every phone sees the same setup.

Sunrise/sunset needs a zip/postal code or coordinates, because browsers don't allow location access on plain
`http` pages, which is how the controller serves the app.

See [docs/how-it-works.md](docs/how-it-works.md) for the WLED details.

## Development

```sh
npm install
npm test                         # engine + settings tests (Vitest)
npm run build                    # dist/eaveglow.htm.gz, must stay ≤ 60 KB
node scripts/mock-wled.mjs       # pretend WLED 16 on http://localhost:8099/eaveglow.htm
WLED=192.168.1.50 npm run dev    # live dev server talking to a real controller
node e2e/e2e.mjs                 # end-to-end in headless Chromium against the mock
                                 # (set PLAYWRIGHT_PATH / CHROMIUM_PATH if Playwright isn't installed locally)
```

The look, effect-style, palette, color and holiday library lives in `src/engine/library.json`. Edit it directly; the
tests check that every look works on WLED 0.15 and 16.0.1 and that custom palettes are valid. (It was originally
exported from the Flutter app in DakotaRidgeTechnology/Eaveglow, which is no longer updated.)

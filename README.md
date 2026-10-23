# Eaveglow for the web (runs on your WLED controller)

The same Eaveglow looks, zones, light spacing and schedules, as one small web page (about 31 KB) that lives
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

## Differences from the phone app

- **Not included:** camera mapping and AR measuring.
- **Sunrise/sunset location:** uses a **zip/postal code** or typed-in coordinates, because browsers only allow
  location access on secure (`https`) pages, and the controller serves plain `http`.
- **Finding the controller:** not needed, because the page comes from the controller itself.

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

The look/effect/color library is generated from the Flutter app so both stay identical:
`dart run tool/export_library.dart > web/src/engine/library.json` (run from the repo root).

# How Eaveglow works with WLED

Notes on the WLED behaviour Eaveglow relies on, checked against the WLED 16.0.1 and 0.15.0 source.
Source paths refer to `src/engine/` in this repo.

## Principles

1. **WLED is the driver.** The app never streams pixels. Every look becomes regular WLED state, so
   it keeps running without the phone and works with WLED's own timers, presets and UI.
2. **Users think in parts of the house, not segments.** The app owns the mapping from named zones
   to WLED segments and rebuilds the segments every time a look is applied.
3. **The core is pure TypeScript.** `compileLook` takes a layout, a look and an effect catalog and returns
   segments. It doesn't use I/O, which makes it easy to test and to reuse for on-screen previews.

## Data model

| Type | Meaning |
| --- | --- |
| `HouseLayout` | `totalPixels` + ordered `Zone`s for one controller, default `LightSpacing`, optional inches between pixels |
| `LightSpacing` | `lit` lights on, then `skip` off, which maps to WLED segment `grp`/`spc` |
| `Zone` | `name`, `start`, `length`, `reversed` |
| `Look` | Name, emoji, and an ordered list of `LookLayer`s |
| `LookLayer` | A target (all / specific zones / alternate zones), effect name candidates, palette candidates, up to 3 colors, speed, intensity, optional `LightSpacing` override |

Effects and palettes are stored by **name with fallbacks** (e.g. `['Candy Cane', 'Theater', 'Running']`),
because effect ids differ between WLED versions and builds. `EffectCatalog` resolves them against
the device's `/json` effect and palette lists at apply time.

## Segment compilation

`src/engine/segmentCompiler.ts`

1. Walk the zones in strip order. Each zone takes the **last** layer whose target matches it (painter's
   order). Pixels outside every zone, and zones that no layer covers, become "off" runs.
2. Merge adjacent runs that have the same layer and direction.
3. If there are more runs than `info.leds.maxseg`, repeatedly fold the shortest run into a neighbor
   (preferring a neighbor with the same layer), then re-merge. The user gets a warning.
4. Emit `WledSegment`s with consecutive ids. `CompiledLook.toStateJson` adds `{"id": n, "stop": 0}`
   for each segment left over from the previous look, so old segments are deleted, all in one
   `POST /json/state` with a short transition.

## Light spacing

WLED renders every effect onto a segment's *virtual* pixels. With `grp` = lit and `spc` = skip, only
every Nth physical light is used, so **every effect works with spacing**. The compiler applies
`layer.spacing ?? layout.spacing` to each lit segment ("off" segments stay 1/0). The "Bulbs" looks use
WLED's Solid Pattern effect (speed 0, intensity 0 means one light of color 1, then one of color 2), so with
`skip: 3` you get green, off, off, off, red, …

## Custom palettes (★)

Eaveglow's own color themes are WLED custom palettes: `/paletteN.json` files (`{"n": name, "palette": [pos, "RRGGBB", …]}`,
up to 18 entries) that WLED reloads as soon as one is uploaded. Palette ids count down from 200 on WLED 16 (129 slots,
10 on ESP8266) and from 255 on 0.15 (10 slots). The web app installs a palette into the lowest free slot the first
time a look uses it, never overwriting palettes it didn't create, and records slots in `/eaveglow.json`. Each
★ palette names a built-in fallback, which is used where it can't be installed (a PIN lock, no free slots,).

## Holidays

Holiday looks have `category: 'Holidays'` and a `group` (`library.json` → `holidays`: id, name, emoji and a date
rule: fixed, Easter offset, nth/last weekday, or explicit dates for lunar holidays). The web app sorts holidays by
how soon they come and shows a "coming up" card within 45 days.

## Scheduling

`scheduleCompiler.ts` → `scheduleService.ts`.

- Each enabled window becomes two WLED timers: one calls preset **"Eaveglow: Lights On"** (`{"on":true}`)
  and one calls **"Eaveglow: Lights Off"** (`{"on":false}`). The app creates those presets in the highest free
  slots (250 down) the first time. Saving a preset over the API also applies it, so the presets are saved
  in an order that leaves the lights as they were.
- **WLED 16:** `timers.ins` is a list (64 on ESP32, 16 on ESP8266). Posting it clears all existing timers.
  Sunrise = hour 255, sunset = hour 254, `min` = offset (±120). `dow` bit 0 = Monday … bit 6 = Sunday.
- **WLED 0.15:** a fixed layout of 8 clock timers, then sunrise, then sunset (both hour 255; offset ±59). The
  app always writes all 10 slots so old timers are cleared.
- A window that runs past midnight sends its "off" timer on the next day's weekday bit.
- The location (`if.ntp.lt/ln`) and time zone (`if.ntp.tz`, mapped from the phone's IANA zone to WLED's
  25 built-in zones; other zones fall back to UTC plus a fixed offset) are sent with the timers.
- **Partial `/json/cfg` updates reset some settings** to defaults when they're missing (`hw.led.rgbwm`,
  `hw.led.fps`, `light.gc.*`; see `deserializeConfig`). `preservedConfig()` copies those from the current config.
- WLED recalculates sunrise and sunset only on NTP sync, at 00:01, or when its clock jumps by 60 s or more.
  After saving, the app sets the clock 61 s back and then to the exact time, so a new location takes effect today.
- `sunTimes.ts` ports WLED's sunrise algorithm, so times shown in the app match the controller.
- Zip/postal codes are looked up with zippopotam.us (no key). Browsers block geolocation on `http` pages, so there is no "use my location".

## WLED API used

| Call | Purpose |
| --- | --- |
| `GET /json` | Info (LED count, max segments, name), state, effect and palette names |
| `GET /json/info` | Connection check during device setup |
| `POST /json/state` | Apply looks, power, brightness; save schedule presets (`psave`); set the clock (`time`) |
| `GET/POST /json/cfg` | Timers, time zone and location for schedules |
| `GET /presets.json` | Find or place the schedule's On/Off presets |
| mDNS `_wled._tcp` | Discovery |

## Seasonal autopilot

- WLED checks every timer (including sunrise/sunset) with `isTodayInDateRange(monthStart, dayStart, monthEnd, dayEnd)`
  before applying its preset (`wled00/ntp.cpp`), and ranges may wrap the year (Nov 27 – Jan 1). WLED 0.15 has
  date ranges on its 8 clock slots only.
- `seasonPeriods` (`src/engine/autopilot.ts`) splits the year into periods: each enabled season is its holiday's
  next date ± days before/after; on overlapping days the shorter season wins; gaps get the everyday look.
- Each season rotates through up to 7 looks by weekday (`rotationDays`: day d shows look d mod n, `dow` bit 0 =
  Monday). Time 1's "on" time gets one timer per look per period; other windows turn on with the plain
  "Eaveglow: Lights On" preset, keeping the day's look. Defaults use ~45 of the 64 timers (ESP32).
- Each look is saved once as an API preset `Eaveglow season: <look name>` (`seg` + `on: true`, deleting leftover
  segments up to `maxseg`). `psave` also applies the state, so the previous `on`/`bri`/`seg` is restored after.
  Season presets no longer used are deleted with `pdel`.
- Date ranges have no year, so moving holidays drift: when the app opens and today's computed dates differ from
  `autopilot.syncedDates`, it rewrites the timers (presets are only saved if missing).
- Special dates (`Autopilot.dates`, 'YYYY-MM-DD') beat seasons on shared days. One-time dates drop out once
  past; WLED can't tell years apart, so they leave the controller at the next app-open re-sync. A date inside a
  season splits it in two, which costs another set of rotation timers.

## Sleep timer

WLED's nightlight (`json.cpp`): `{nl: {on: true, dur: <minutes ≤255>, mode: 0, tbri: 0}}` switches the lights
off when `dur` runs out; the state reports `nl.rem` (seconds left, −1 when off). `{nl: {on: false}}` cancels.

## Timer backup

Before Eaveglow first replaces timers that call presets it didn't make, `applySchedule` saves
`cfg.timers.ins` to `/eaveglow-timers-backup.json` (never overwritten). "Restore the WLED timers you had before
Eaveglow" on the Schedule page posts them back with `preservedConfig`, and turns the schedule and autopilot off.

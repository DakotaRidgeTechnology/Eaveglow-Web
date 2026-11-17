# Generate from Zones — Documentation

The **🤖 Generate from zones** button creates a multi-layer look from your zone names. There are two modes: **faithful** (fixed rules) and **coherent random** (one palette, varied effects).

## How It Works

1. **Reads your zones** from the House zones page (🏠 icon)
2. **Classifies each zone** by name keywords (case-insensitive)
3. **Groups zones** by type
4. **Orders layers** by priority (bottom → top)
5. **Creates a look** with layers targeting the correct zones

## Zone Naming Convention

Name your zones with these keywords to get the intended effect family:

| Keyword in zone name | Effect family | Priority | Example Zone Names |
|---------------------|---------------|----------|-------------------|
| `apex` | Sparkle / twinkle | 100 (top) | `Lower Apex`, `Garage Apex Left` |
| `peak` | Sparkle / glitter | 80 | `Lower Peak`, `Garage Peak Left` |
| `front`, `soffit` | Rain / drip (then flow) | 40 | `Garage Front 1`, `Lower Front 1` |
| `side` | Flow / rain | 35 | `Garage Left Side`, `Lower Side` |
| `garage` | Solid / breathe (then flow) | 30 | `Garage`, `Garage Back` |
| (none matched) | Solid | 0 (fallback) | Any unrecognized name |

Higher priority renders later (on top), so apex sparkles draw over the peaks and roofline.

## Faithful mode (checkbox off)

Each zone group gets the fixed effect and colours from the table above. Deterministic — the same zones always produce the same look. No colour theme is forced, so side zones no longer get stuck on "Ocean".

## Coherent random mode (🎲 checkbox on)

This is the recommended mode for a whole-house display:

- **One palette for the entire look** — picked from the palettes actually installed on your controller. Every layer uses it, so the house looks deliberately decorated.
- **One colour set for the entire look** — taken from that palette's brightest stops (near-black gradient starts are skipped).
- **A shared rhythm** — speed and intensity are chosen once, with small per-part variation.
- **A different effect for every part** — chosen from the family that suits that part of the house (sparkle for apexes, rain/flow for fronts and sides, solid for garage). Effects are never repeated across layers, and every effect comes from your controller's real effect list, so nothing falls back to Solid because of a bad name.

### Seed (reproducible looks)

The **seed** field appears when 🎲 is on:

- **Leave it blank** — every click of 🤖 generates a new look and the toast shows the seed it used.
- **Type a seed** (a number or any word, e.g. `halloween`) — the exact same look is regenerated every time. Save the word in your notes and you can recreate that look later.

The palette, effects, colours, speeds and intensities are all derived from the seed. (The generated look gets a new id each time, as it would for any newly created look.)

## Step-by-Step Setup

### 1. Create Zones (House zones page → 🏠 icon)
1. Enable **"Set where each part starts"** if wiring is scattered (peaks)
2. Name each part with a keyword from the table above
3. Click **Save** — the generator reads saved settings, not temporary state

### 2. Import Current WLED Segments (Optional)
1. Go to **Make a look** (or Edit a look)
2. Click **📥 Import from WLED**
3. Each WLED segment maps to the zone containing its LED range, using its WLED label as the zone name

### 3. Generate Look
1. Go to **Make a look** (or Edit look)
2. Tick **🎲 Coherent random** (or leave off for fixed rules)
3. Optionally type a **seed** to reproduce a look
4. Click **🤖 Generate from zones**
5. Review the layers — the "Parts of the house" chips show each part's zone names and effect
6. Adjust anything you like, then **Save** or **Save & turn on**

## Example

With zones `Lower Side`, `Lower Front 1`, `Garage Peak Left`, `Garage Apex Right`, a coherent generation might produce:

| Part | Effect | Palette |
|------|--------|---------|
| Lower Side | Scanner | Icefire |
| Lower Front 1 | Stream | Icefire |
| Garage Peak Left | Colortwinkles | Icefire |
| Garage Apex Right | Candle Multi | Icefire |

Same seed → same four effects. Different seed → new palette and new effects, still matched to each part.

## Tips

- **Case-insensitive**: "Side", "SIDE", "side" all work
- **Partial match**: "Garage Left Side" matches `side` (35) and `garage` (30); `side` wins
- `"Rainbow"` is not treated as `"Rain"` for effect matching
- **Order matters**: higher priority = rendered later = on top
- **Offline**: if the controller snapshot is unavailable, the generator falls back to its built-in effect list and neutral colours

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Zone not getting the expected effect family | Check the zone name contains the right keyword |
| "Everything else" showing | Zones not saved — click **Save** on House zones page |
| Layers in wrong order | Check priority values in generator rules |
| Apex not on top | Ensure zone name contains "apex" (priority 100) |
| Random look looks too chaotic | Turn coherent random ON — it uses one palette for the whole house |
| Want the exact same look back | Re-enter the seed from the generation toast |

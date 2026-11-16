# Generate from Zones — Documentation

The **🤖 Generate from zones** button automatically creates a multi-layer look based on your zone names. It analyzes zone names and assigns appropriate effects per zone type.

## How It Works

1. **Reads your zones** from the House zones page (🏠 icon)
2. **Classifies each zone** by name keywords (case-insensitive)
3. **Groups zones** by type and assigns effects per group
4. **Orders layers** by priority (bottom → top)
5. **Creates a look** with layers targeting the correct zones

## Zone Naming Convention

Name your zones with these keywords to get the intended effects:

| Keyword in zone name | Effect Type | Priority | Example Zone Names |
|---------------------|-------------|----------|-------------------|
| `apex` | Sparkle (warm white) | 100 (top) | `Lower Apex`, `Garage Apex Left`, `Upper Apex Right` |
| `peak` | Sparkle (yellow/gold) | 80 | `Lower Peak`, `Garage Peak Left`, `Upper Peak Right` |
| `front`, `soffit` | Rain/Drip (white/blue) | 40 | `Garage Front 1`, `Lower Front 1`, `Upper Front 2` |
| `side` | Rain/Colorwaves (blue) | 35 | `Garage Left Side`, `Lower Side`, `Garage Right Side` |
| `garage` | Solid/Breathe (warm) | 30 | `Garage Front 1`, `Garage Left Side` |
| (none matched) | Solid warm white | 0 (fallback) | Any unrecognized name |

## Priority = Layer Order (Bottom → Top)

| Priority | Layer Position | Effect |
|----------|----------------|--------|
| 100 (apex) | Top | Sparkle on top of everything |
| 80 (peak) | ↑ | Sparkle on peaks |
| 40 (front) | ↓ | Rain/snow on fronts |
| 35 (side) | ↓ | Rain on sides |
| 30 (garage) | ↓ | Warm white on garage |
| 0 (fallback) | Bottom | Base layer |

## Step-by-Step Setup

### 1. Create Zones (House zones page → 🏠 icon)
1. Enable **"Set where each part starts"** toggle
2. Add each part with:
   - **Name**: Use keywords above (e.g., "Garage Left Side", "Lower Peak", "Upper Apex Right")
   - **Starts at pixel**: LED index where zone starts
   - **Lights**: Number of LEDs in this zone
3. Click **Save** (💾) — this persists zones to settings

### 2. Import Current WLED Segments (Optional)
1. Go to **Make a look** (or Edit an existing look)
2. Click **📥 Import from WLED** (second 📥 button)
3. Each WLED segment maps to the zone containing its LED range
4. Creates one layer per segment targeting the correct zone

### 3. Generate Look
1. Go to **Make a look** (or Edit look)
2. Click **🤖 Generate from zones**
3. Review generated layers:
   - Layer 0 (bottom): Sides, garage, fronts
   - Middle: Peaks
   - Top: Apexes
3. Adjust effects/colors if needed
4. Click **Save** or **Save & turn on**

## Example Zone Setup

For a house with Lower/Garage/Upper areas:

| Zone Name | Keyword Matched | Effect Assigned |
|-----------|-----------------|-----------------|
| `Garage Left Side` | `side` | Rain (blue palette) |
| `Lower Side` | `side` | Rain (blue palette) |
| `Garage Right Side` | `side` | Rain (blue palette) |
| `Garage Front 1` | `front` | Rain (white/blue) |
| `Lower Front 1` | `front` | Rain (white/blue) |
| `Lower Peak` | `peak` | Sparkle (yellow) |
| `Garage Peak Left` | `peak` | Sparkle (yellow) |
| `Lower Apex` | `apex` | Sparkle (warm white) |
| `Garage Apex Left` | `apex` | Sparkle (warm white) |
| `Upper Apex Left` | `apex` | Sparkle (warm white) |

## Tips

- **Case-insensitive**: "Side", "SIDE", "side" all work
- **Partial match**: "Garage Left Side" matches `side`, `garage`, `left` — highest priority wins
- **Multiple keywords**: "Garage Front" matches both `garage` (30) and `front` (40) → `front` wins (higher priority)
- **Order matters**: Higher priority = rendered later = on top
- **Save zones first**: Generator reads from saved settings, not temporary state

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Zone not getting expected effect | Check zone name contains the right keyword |
| Side zones not appearing | Ensure zone names contain "side" |
| "Everything else" showing | Zones not saved — click **Save** on House zones page |
| Layers in wrong order | Check priority values in generator rules |
| Apex not on top | Ensure zone name contains "apex" (priority 100) |
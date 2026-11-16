import { Zone, LookLayer, newId } from '../engine/model';

/** Rule for generating a layer from zones matching a pattern */
interface GenerationRule {
  /** Keywords that match this rule (case-insensitive, partial match on zone name) */
  keywords: string[];
  /** Layer configuration for matching zones */
  layer: Omit<LookLayer, 'target'>;
  /** Priority: higher = rendered later (on top) */
  priority: number;
}

/** Default generation rules based on common naming patterns */
export const DEFAULT_GENERATION_RULES: GenerationRule[] = [
  // Apexes - single LEDs at peaks, rendered LAST (on top)
  {
    keywords: ['apex'],
    priority: 100,
    layer: {
      effect: ['Sparkle', 'Twinkle', 'Twinklefox'],
      palette: [],
      colors: [[255, 120, 30], [255, 200, 150]], // warm white sparkle
      speed: 120,
      intensity: 200,
    },
  },
  // Peaks - sparkle effects
  {
    keywords: ['peak'],
    priority: 80,
    layer: {
      effect: ['Sparkle', 'Twinkle', 'Glitter'],
      palette: [],
      colors: [[255, 220, 50], [255, 170, 0], [255, 255, 255]], // yellow/gold sparkle
      speed: 150,
      intensity: 220,
    },
  },
  // Fronts/soffits - rain/snow effects
  {
    keywords: ['front', 'soffit'],
    priority: 40,
    layer: {
      effect: ['Rain', 'Drip', 'Drip Drop'],
      palette: [],
      colors: [[255, 255, 255], [200, 220, 255], [180, 200, 255]], // white/blue rain
      speed: 100,
      intensity: 180,
    },
  },
  // Sides - similar to fronts but different palette
  {
    keywords: ['side'],
    priority: 35,
    layer: {
      effect: ['Rain', 'Colorwaves', 'Flow'],
      palette: ['Ocean', 'Aurora'],
      colors: [[100, 200, 255], [50, 150, 255], [0, 100, 200]], // blue rain
      speed: 120,
      intensity: 160,
    },
  },
  // Garage (non-peak/front) - warm white
  {
    keywords: ['garage'],
    priority: 30,
    layer: {
      effect: ['Solid', 'Breathe'],
      palette: [],
      colors: [[255, 180, 120], [255, 200, 150]],
      speed: 80,
      intensity: 140,
    },
  },
  // Default fallback
  {
    keywords: ['*'],
    priority: 0,
    layer: {
      effect: ['Solid'],
      palette: [],
      colors: [[255, 200, 150]],
      speed: 64,
      intensity: 128,
    },
  },
];

/** Match a zone name against generation rules */
function matchZoneToRule(zoneName: string): GenerationRule {
  const lower = zoneName.toLowerCase();
  const sortedRules = [...DEFAULT_GENERATION_RULES].sort((a, b) => b.priority - a.priority);
  for (const rule of sortedRules) {
    if (rule.keywords.some(k => k === '*' || lower.includes(k.toLowerCase()))) {
      return rule;
    }
  }
  return DEFAULT_GENERATION_RULES[DEFAULT_GENERATION_RULES.length - 1];
}

/** Completely random: pick from ALL effects and ALL colors */
function fullyRandomLayer(layer: LookLayer): LookLayer {
  // All effects from all themes
  const allEffects = [
    'Solid', 'Blink', 'Breathe', 'Wipe', 'Wipe Random', 'Random Colors',
    'Sweep', 'Dynamic', 'Colorloop', 'Rainbow', 'Scan', 'Scan Dual',
    'Fade', 'Theater', 'Theater Rainbow', 'Running', 'Saw', 'Twinkle',
    'Dissolve', 'Dissolve Rnd', 'Sparkle', 'Sparkle Dark', 'Sparkle+',
    'Strobe', 'Strobe Rainbow', 'Strobe Mega', 'Blink Rainbow',
    'Android', 'Chase', 'Chase Random', 'Chase Rainbow', 'Chase Flash',
    'Chase Flash Rnd', 'Rainbow Runner', 'Colorful', 'Traffic Light',
    'Sweep Random', 'Chase 2', 'Aurora', 'Stream', 'Scanner', 'Lighthouse',
    'Fireworks', 'Rain', 'Tetrix', 'Fire Flicker', 'Gradient', 'Loading',
    'Rolling Balls', 'Fairy', 'Two Dots', 'Fairytwinkle', 'Running Dual',
    'Image', 'Chase 3', 'Tri Wipe', 'Tri Fade', 'Lightning', 'ICU',
    'Multi Comet', 'Scanner Dual', 'Stream 2', 'Oscillate', 'Pride 2015',
    'Juggle', 'Palette', 'Fire 2012', 'Colorwaves', 'Bpm', 'Fill Noise',
    'Noise 1', 'Noise 2', 'Noise 3', 'Noise 4', 'Colortwinkles', 'Lake',
    'Meteor', 'Copy Segment', 'Railway', 'Ripple', 'Twinklefox',
    'Twinklecat', 'Halloween Eyes', 'Solid Pattern', 'Solid Pattern Tri',
    'Spots', 'Spots Fade', 'Glitter', 'Candle', 'Fireworks Starburst',
    'Fireworks 1D', 'Bouncing Balls', 'Sinelon', 'Sinelon Dual',
    'Sinelon Rainbow', 'Popcorn', 'Drip', 'Plasma', 'Percent',
    'Ripple', 'Ripple Rainbow', 'Heartbeat', 'Phased', 'Chunchun',
    'Twinkleup', 'Twinklecat', 'Twinkleup', 'Drip Drop', 'Drip',
    'Chase 2', 'Chase 3', 'Tri Wipe', 'Tri Fade', 'Lightning',
    'Multi Comet', 'Scanner Dual', 'Stream 2', 'Oscillate', 'Pride 2015',
    'Juggle', 'Palette', 'Fire 2012', 'Colorwaves', 'Bpm', 'Fill Noise',
    'Noise 1', 'Noise 2', 'Noise 3', 'Noise 4', 'Colortwinkles', 'Lake',
    'Meteor', 'Copy Segment', 'Railway', 'Ripple', 'Twinklefox',
    'Twinklecat', 'Halloween Eyes', 'Solid Pattern', 'Solid Pattern Tri',
    'Spots', 'Spots Fade', 'Glitter', 'Candle', 'Fireworks Starburst',
    'Fireworks 1D', 'Bouncing Balls', 'Sinelon', 'Sinelon Dual',
    'Sinelon Rainbow', 'Popcorn', 'Drip', 'Plasma', 'Percent',
    'Ripple', 'Ripple Rainbow', 'Heartbeat', 'Phased', 'Chunchun',
    'Twinkleup', 'Twinklecat', 'Twinkleup', 'Drip Drop', 'Drip',
    'Chase 2', 'Chase 3', 'Tri Wipe', 'Tri Fade', 'Lightning',
    'Multi Comet', 'Scanner Dual', 'Stream 2', 'Oscillate', 'Pride 2015',
    'Juggle', 'Palette', 'Fire 2012', 'Colorwaves', 'Bpm', 'Fill Noise',
    'Noise 1', 'Noise 2', 'Noise 3', 'Noise 4', 'Colortwinkles', 'Lake',
    'Meteor', 'Copy Segment', 'Railway', 'Ripple', 'Twinklefox',
    'Twinklecat', 'Halloween Eyes', 'Solid Pattern', 'Solid Pattern Tri',
    'Spots', 'Spots Fade', 'Glitter', 'Candle', 'Fireworks Starburst',
    'Fireworks 1D', 'Bouncing Balls', 'Sinelon', 'Sinelon Dual',
    'Sinelon Rainbow', 'Popcorn', 'Drip', 'Plasma', 'Percent',
    'Ripple', 'Ripple Rainbow',
  ];

  // All colors from all themes
  const allColors: [number, number, number][] = [
    [255, 120, 30], [255, 200, 150], [255, 255, 200],
    [255, 180, 100], [255, 220, 180],
    [255, 220, 50], [255, 170, 0], [255, 255, 255],
    [255, 140, 0], [255, 100, 50],
    [255, 255, 255], [200, 220, 255], [180, 200, 255],
    [255, 200, 200], [150, 200, 255],
    [100, 200, 255], [50, 150, 255], [0, 100, 200],
    [0, 200, 255], [50, 200, 200],
    [0, 255, 255], [100, 100, 255], [150, 50, 255],
    [255, 180, 120], [255, 200, 150], [255, 140, 80],
    [255, 160, 100], [200, 120, 60],
    [255, 200, 150], [255, 180, 120], [255, 220, 180],
    [255, 0, 0], [0, 255, 0], [0, 0, 255],
    [255, 255, 0], [0, 255, 255], [255, 0, 255],
    [128, 0, 128], [255, 128, 0], [0, 128, 128],
  ];

  // Pick random effect and colors
  const effect = allEffects[Math.floor(Math.random() * allEffects.length)];
  const numColors = Math.floor(Math.random() * 3) + 1; // 1-3 colors
  const shuffledColors = [...allColors].sort(() => Math.random() - 0.5);
  const selectedColors = shuffledColors.slice(0, numColors);

  // Randomize speed and intensity within reasonable ranges
  const speed = Math.floor(Math.random() * 100) + 50; // 50-150
  const intensity = Math.floor(Math.random() * 100) + 100; // 100-200

  return {
    ...layer,
    effect: [effect],
    palette: [],  // Clear palette for fully random
    colors: selectedColors as [number, number, number][],
    speed,
    intensity,
  };
}

/** Randomize effect and colors within a rule's theme */
function randomizeLayer(layer: LookLayer, keywords: string[]): LookLayer {
  const isApex = keywords.includes('apex');
  const isPeak = keywords.includes('peak');
  const isFront = keywords.includes('front') || keywords.includes('soffit');
  const isSide = keywords.includes('side');
  const isGarage = keywords.includes('garage');

  // Effect pools by theme
  const effectPools = {
    apex: ['Sparkle', 'Twinkle', 'Twinklefox', 'Sparkle+'],
    peak: ['Sparkle', 'Twinkle', 'Glitter', 'Sparkle+', 'Sparkle Dark'],
    front: ['Rain', 'Drip', 'Drip Drop', 'Rainbow', 'Colorwaves'],
    side: ['Rain', 'Colorwaves', 'Flow', 'Pacifica', 'Aurora', 'Stream', 'Scanner', 'Sinelon'],
    garage: ['Solid', 'Breathe', 'Fade', 'Colorwaves'],
    default: ['Solid', 'Breathe', 'Fade'],
  };

  // Color pools by theme
  const colorPools: Record<string, [number, number, number][]> = {
    apex: [
      [255, 120, 30], [255, 200, 150], [255, 255, 200],
      [255, 180, 100], [255, 220, 180],
    ],
    peak: [
      [255, 220, 50], [255, 170, 0], [255, 255, 255],
      [255, 140, 0], [255, 100, 50],
    ],
    front: [
      [255, 255, 255], [200, 220, 255], [180, 200, 255],
      [255, 200, 200], [150, 200, 255],
    ],
    side: [
      [100, 200, 255], [50, 150, 255], [0, 100, 200],
      [0, 200, 255], [50, 200, 200],
      [0, 255, 255], [100, 100, 255], [150, 50, 255],
    ],
    garage: [
      [255, 180, 120], [255, 200, 150], [255, 140, 80],
      [255, 160, 100], [200, 120, 60],
    ],
    default: [
      [255, 200, 150], [255, 180, 120], [255, 220, 180],
    ],
  };

  // Determine theme
  let theme = 'default';
  if (isApex) theme = 'apex';
  else if (isPeak) theme = 'peak';
  else if (isFront) theme = 'front';
  else if (isSide) theme = 'side';
  else if (isGarage) theme = 'garage';

  const effects = effectPools[theme as keyof typeof effectPools] || effectPools.default;
  // For randomize: pick colors from ALL themes, not just the matched theme
  const allColors: [number, number, number][] = Object.values(colorPools).flat();

  // Pick random effect and colors
  const effect = effects[Math.floor(Math.random() * effects.length)];
  const numColors = Math.floor(Math.random() * 3) + 1; // 1-3 colors
  const shuffledColors = [...allColors].sort(() => Math.random() - 0.5);
  const selectedColors = shuffledColors.slice(0, numColors);

  // Randomize speed and intensity within reasonable ranges
  const speed = Math.floor(Math.random() * 100) + 50; // 50-150
  const intensity = Math.floor(Math.random() * 100) + 100; // 100-200

  return {
    ...layer,
    target: layer.target,
    effect: [effect],
    palette: [],  // Clear palette when randomizing colors
    colors: selectedColors as [number, number, number][],
    speed,
    intensity,
  };
}

/** Generate a look from zones */
export function generateLookFromZones(
  zones: Zone[],
  options: {
    name?: string;
    emoji?: string;
    category?: string;
    /** Use random effects within theme constraints */
    randomize?: boolean;
    /** Use completely random effects/colors ignoring themes */
    fullyRandom?: boolean;
  } = {}
): { id: string; name: string; emoji: string; category: string; layers: LookLayer[] } {
  // Group zones by matched rule priority
  const zoneGroups: Map<number, { rule: GenerationRule; zones: Zone[] }> = new Map();
  
  for (const zone of zones) {
    const rule = matchZoneToRule(zone.name);
    const priority = rule.priority;
    if (!zoneGroups.has(priority)) {
      zoneGroups.set(priority, { rule, zones: [] });
    }
    zoneGroups.get(priority)!.zones.push(zone);
  }

  // Create layers from groups, sorted by priority (lowest first = bottom layer)
  const sortedPriorities = Array.from(zoneGroups.keys()).sort((a, b) => a - b);
  const layers = sortedPriorities.map(priority => {
      const group = zoneGroups.get(priority)!;
      const zoneIds = group.zones.map(z => z.id);

      // Always target specific zones so UI shows zone names
      const target = { kind: 'zones' as const, zoneIds };

      let layer: LookLayer = { ...group.rule.layer, target };

      if (options.randomize) {
        // Randomize effect and colors within the rule's theme
        layer = randomizeLayer(layer, group.rule.keywords);
        // Ensure target is preserved
        layer.target = target;
      }

      if (options.fullyRandom) {
        // Completely random: pick from ALL effects and ALL colors
        layer = fullyRandomLayer(layer);
        layer.target = target;
      }

      return layer;
    });

  return {
    id: newId(),
    name: options.name ?? 'Generated',
    emoji: options.emoji ?? '🤖',
    category: options.category ?? 'Generated',
    layers,
  };
}

/** Generate and apply to a look object */
export function generateAndApplyToLook(
  zones: Zone[],
  baseLook?: { name?: string; emoji?: string; category?: string }
): { id: string; name: string; emoji: string; category: string; layers: LookLayer[] } {
  return generateLookFromZones(zones, baseLook);
}

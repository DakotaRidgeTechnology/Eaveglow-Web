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

/** Generate a look from zones */
export function generateLookFromZones(
  zones: Zone[],
  options: {
    name?: string;
    emoji?: string;
    category?: string;
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

      return {
        target,
        ...group.rule.layer,
      } as LookLayer;
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
import { paletteByWledName } from './library';
import { LookLayer, Rgb, Zone, newId } from './model';

type EffectFamily = 'sparkle' | 'flow' | 'rain' | 'solid';

/** Rule for generating a layer from zones matching a pattern. */
interface GenerationRule {
  /** Case-insensitive partial matches on the zone name. */
  keywords: string[];
  /** Effect families that suit this part of the house. */
  families: EffectFamily[];
  /** Faithful (non-random) layer settings. */
  layer: Omit<LookLayer, 'target'>;
  /** Higher = rendered later (on top). */
  priority: number;
}

/** Which real WLED effects belong to each family, matched by name. */
const FAMILY_KEYWORDS: Record<EffectFamily, string[]> = {
  sparkle: ['sparkle', 'twinkle', 'glitter', 'candle', 'firework'],
  flow: ['colorwaves', 'flow', 'stream', 'aurora', 'pacifica', 'scanner', 'sinelon', 'juggle', 'lake', 'ripple'],
  rain: ['rain', 'drip'],
  solid: ['solid', 'breathe', 'fade', 'colorloop', 'blink', 'strobe', 'gradient'],
};

/** Default generation rules based on common naming patterns. */
export const DEFAULT_GENERATION_RULES: GenerationRule[] = [
  {
    keywords: ['apex'],
    families: ['sparkle'],
    priority: 100,
    layer: {
      effect: ['Sparkle', 'Twinkle', 'Twinklefox'],
      palette: [],
      colors: [[255, 120, 30], [255, 200, 150]],
      speed: 120,
      intensity: 200,
    },
  },
  {
    keywords: ['peak'],
    families: ['sparkle'],
    priority: 80,
    layer: {
      effect: ['Sparkle', 'Twinkle', 'Glitter'],
      palette: [],
      colors: [[255, 220, 50], [255, 170, 0], [255, 255, 255]],
      speed: 150,
      intensity: 220,
    },
  },
  {
    keywords: ['front', 'soffit'],
    families: ['rain', 'flow'],
    priority: 40,
    layer: {
      effect: ['Rain', 'Drip', 'Drip Drop'],
      palette: [],
      colors: [[255, 255, 255], [200, 220, 255], [180, 200, 255]],
      speed: 100,
      intensity: 180,
    },
  },
  {
    keywords: ['side'],
    families: ['flow', 'rain'],
    priority: 35,
    layer: {
      effect: ['Rain', 'Colorwaves', 'Flow'],
      palette: [],
      colors: [[100, 200, 255], [50, 150, 255], [0, 100, 200]],
      speed: 120,
      intensity: 160,
    },
  },
  {
    keywords: ['garage'],
    families: ['solid', 'flow'],
    priority: 30,
    layer: {
      effect: ['Solid', 'Breathe'],
      palette: [],
      colors: [[255, 180, 120], [255, 200, 150]],
      speed: 80,
      intensity: 140,
    },
  },
  {
    keywords: ['*'],
    families: ['solid'],
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

/** Match a zone name against generation rules, highest priority first. */
function matchZoneToRule(zoneName: string): GenerationRule {
  const lower = zoneName.toLowerCase();
  const sorted = [...DEFAULT_GENERATION_RULES].sort((a, b) => b.priority - a.priority);
  return (
    sorted.find((rule) => rule.keywords.some((k) => k === '*' || lower.includes(k.toLowerCase()))) ??
    DEFAULT_GENERATION_RULES[DEFAULT_GENERATION_RULES.length - 1]
  );
}

/** Turn any text into a stable 32-bit seed (FNV-1a). */
export function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic PRNG so a seed always regenerates the same look. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const matchesKeyword = (name: string, keyword: string) =>
  keyword === 'rain' ? /\brain(?!bow)\b/i.test(name) : name.toLowerCase().includes(keyword);
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const pick = <T,>(items: T[], rand: () => number): T | undefined =>
  items.length ? items[Math.floor(rand() * items.length)] : undefined;

/** Everything the coherent generator decides once for the whole look. */
interface CoherentContext {
  rand: () => number;
  effects: string[];
  palette?: string;
  colors: Rgb[];
  speed: number;
  intensity: number;
  used: Set<string>;
}

/** Pick one effect that fits the zone family and hasn't been used yet. */
function chooseEffect(rule: GenerationRule, ctx: CoherentContext): string {
  const matchesFamily = (name: string, family: EffectFamily) =>
    FAMILY_KEYWORDS[family].some((k) => matchesKeyword(name, k));

  const unused = ctx.effects.filter((e) => !ctx.used.has(e));
  const fromFamilies = rule.families.flatMap((family) => unused.filter((e) => matchesFamily(e, family)));
  // De-duplicate while preserving family priority order.
  const candidates = [...new Set(fromFamilies)];
  const chosen = pick(candidates, ctx.rand) ?? pick(unused, ctx.rand) ?? rule.layer.effect[0];
  ctx.used.add(chosen);
  return chosen;
}

/** Build a coherent layer: shared palette/colors/rhythm, family-matched effect. */
function coherentLayer(base: LookLayer, rule: GenerationRule, ctx: CoherentContext): LookLayer {
  return {
    ...base,
    effect: [chooseEffect(rule, ctx)],
    palette: ctx.palette ? [ctx.palette] : [],
    colors: ctx.colors.map((c) => [...c] as Rgb),
    speed: clamp(ctx.speed + Math.floor(ctx.rand() * 25) - 12, 16, 250),
    intensity: clamp(ctx.intensity + Math.floor(ctx.rand() * 25) - 12, 16, 250),
  };
}

export interface GenerateOptions {
  name?: string;
  emoji?: string;
  category?: string;
  /** One palette for the whole look, effects varied by zone type. */
  coherent?: boolean;
  /** Effects available on this controller (snapshot.effects). */
  effects?: string[];
  /** Palettes available on this controller (snapshot.palettes). */
  palettes?: string[];
  /** Any number — the same seed always regenerates the same look. */
  seed?: number;
}

/**
 * Generate a look from zones.
 *
 * Faithful mode uses the fixed rules. Coherent mode picks ONE palette and
 * colour set for the entire house, then chooses a different family-appropriate
 * effect for every part — varied, but still looks deliberately decorated.
 */
export function generateLookFromZones(
  zones: Zone[],
  options: GenerateOptions = {}
): { id: string; name: string; emoji: string; category: string; layers: LookLayer[] } {
  const groups = new Map<number, { rule: GenerationRule; zones: Zone[] }>();
  for (const zone of zones) {
    const rule = matchZoneToRule(zone.name);
    if (!groups.has(rule.priority)) groups.set(rule.priority, { rule, zones: [] });
    groups.get(rule.priority)!.zones.push(zone);
  }
  const priorities = [...groups.keys()].sort((a, b) => a - b);

  const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rand = makeRandom(seed);

  // Decide the shared look once, before any layer is created.
  const availablePalettes = (options.palettes ?? []).filter(
    (p) => p && !/^(default|\* colors only)$/i.test(p.trim())
  );
  const palette = options.coherent ? pick(availablePalettes, rand) : undefined;
  const paletteStops = palette ? paletteByWledName(palette)?.stops : undefined;
  // Skip near-black gradient stops (e.g. Icefire starts at black) so a solid
  // effect never comes out dark; the palette still supplies the real gradient.
  const visibleStops = paletteStops?.filter((c) => c.some((v) => v > 20));
  const ctx: CoherentContext = {
    rand,
    effects: options.effects?.length
      ? options.effects
      : [...new Set(DEFAULT_GENERATION_RULES.flatMap((r) => r.layer.effect))],
    palette,
    colors: visibleStops?.length ? visibleStops.slice(0, 2) : [[255, 170, 90], [255, 255, 255]],
    speed: 64 + Math.floor(rand() * 70),
    intensity: 110 + Math.floor(rand() * 70),
    used: new Set<string>(),
  };

  const layers = priorities.map((priority) => {
    const group = groups.get(priority)!;
    const target = { kind: 'zones' as const, zoneIds: group.zones.map((z) => z.id) };
    const base: LookLayer = { ...group.rule.layer, target };
    return options.coherent ? coherentLayer(base, group.rule, ctx) : base;
  });

  return {
    id: newId(),
    name: options.name ?? (options.coherent ? 'Coherent' : 'Generated'),
    emoji: options.emoji ?? '🤖',
    category: options.category ?? 'Generated',
    layers,
  };
}

/** Generate and apply to a look object. */
export function generateAndApplyToLook(
  zones: Zone[],
  baseLook?: { name?: string; emoji?: string; category?: string }
): { id: string; name: string; emoji: string; category: string; layers: LookLayer[] } {
  return generateLookFromZones(zones, baseLook);
}

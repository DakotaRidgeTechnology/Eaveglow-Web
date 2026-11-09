import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../app';
import {
  addPartLayer,
  copyStyleFrom,
  layerZoneIds,
  removeLayer,
  setLayerZones,
} from '../engine/lookEdits';
import {
  builtinLooks,
  colorGroups,
  effectStyles,
  isCustomPalette,
  newCustomLook,
  paletteCandidates,
  palettePresets,
  styleCategories,
  styleForEffects,
} from '../engine/library';
import {
  CUSTOM_CATEGORY,
  LayerTarget,
  Look,
  LookLayer,
  Rgb,
  SOLID_SPACING,
  effectiveZones,
  rgbEquals,
  spacingLabel,
} from '../engine/model';
import { EffectCatalog, compileLook } from '../engine/segmentCompiler';
import {
  Chip,
  GradientBar,
  Header,
  SpacingPicker,
  StripPreview,
  Toggle,
  css,
  hexToRgb,
  rgbToHex,
} from './common';
import { ColorRow } from './lookEditor/ColorRow';
import { Slider } from './lookEditor/Slider';

const EMOJIS = [
  '✨',
  '🎄',
  '🎅',
  '❄️',
  '🎃',
  '👻',
  '❤️',
  '🍀',
  '🐣',
  '🇺🇸',
  '🎆',
  '🦃',
  '🕎',
  '🪔',
  '🏈',
  '⚽',
  '🏀',
  '⚾',
  '🏒',
  '🎉',
  '🎂',
  '🌈',
  '🌊',
  '🔥',
  '🌙',
  '⭐',
  '🌸',
  '🦄',
];

export function LookEditor(props: { lookId?: string }) {
  const { settings, store, snapshot, applyLook, toast, back } = useApp();
  const existing = settings.customLooks.find((l) => l.id === props.lookId);
  const [look, setLook] = useState<Look>(() => structuredClone(existing ?? newCustomLook()));
  const [active, setActive] = useState(0);
  const layer = look.l[active] ?? look.l[0];
  const [category, setCategory] = useState(() => styleForEffects(layer.e)?.category ?? 'steady');
  const [themes, setThemes] = useState(layer.p.length > 0);
  const selectLayer = (i: number, l = look) => {
    setActive(i);
    setCategory(styleForEffects(l.l[i].e)?.category ?? 'steady');
    setThemes(l.l[i].p.length > 0);
  };
  const [fxQuery, setFxQuery] = useState('');
  const style = styleForEffects(layer.e);
  const layout = settings.layout ?? { totalPixels: snapshot?.info.ledCount ?? 100, zones: [] };
  const zones = effectiveZones(layout);

  const setLayer = (patch: Partial<LookLayer>) =>
    setLook({ ...look, l: look.l.map((l, i) => (i === active ? { ...l, ...patch } : l)) });
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? '?';
  const partLabel = (i: number) =>
    i === 0
      ? look.l[0].t.kind === 'all'
        ? '🏠 Everything else'
        : '🏠 Main look'
      : layerZoneIds(look.l[i]).map(zoneName).join(' + ');
  const addPart = () => {
    const used = new Set(look.l.flatMap(layerZoneIds));
    const free = zones.find((z) => !used.has(z.id)) ?? zones[0];
    const next = addPartLayer(look, [free.id]);
    setLook(next);
    selectLayer(next.l.length - 1, next);
  };

  const catalog = useMemo(
    () => (snapshot ? new EffectCatalog(snapshot.effects, snapshot.palettes) : undefined),
    [snapshot]
  );
  const available = (cat: string) =>
    effectStyles.filter(
      (s) => s.category === cat && (!catalog || catalog.effectId(s.wled) !== undefined)
    );
  const devicePalettes = new Set(snapshot?.palettes.map((p) => p.toLowerCase()));
  // Eaveglow's own (★) themes are installed on the controller when used.
  const themeList = palettePresets.filter(
    (p) => isCustomPalette(p.wled) || !snapshot || devicePalettes.has(p.wled.toLowerCase())
  );
  const preview = compileLook(
    layout,
    look,
    catalog ??
      new EffectCatalog(
        [...layer.e, 'Solid'],
        palettePresets.map((p) => p.wled)
      ),
    64
  );

  const toggleColor = (c: Rgb) => {
    let colors = [...layer.c];
    if (colors.some((x) => rgbEquals(x, c))) {
      if (colors.length > 1) colors = colors.filter((x) => !rgbEquals(x, c));
    } else {
      if (colors.length === 3) colors.shift();
      colors.push(c);
    }
    setLayer({ c: colors });
  };

  const addCustom = (c: Rgb) => {
    const recent = [c, ...settings.recentColors.filter((x) => !rgbEquals(x, c))].slice(0, 8);
    store.update('recentColors', recent);
    if (!layer.c.some((x) => rgbEquals(x, c))) toggleColor(c);
  };

  const save = async (apply: boolean) => {
    const final: Look = { ...look, name: look.name.trim() || 'My Look', category: CUSTOM_CATEGORY };
    store.update('customLooks', [...settings.customLooks.filter((l) => l.id !== final.id), final]);
    if (apply) {
      try {
        const warnings = await applyLook(final);
        if (warnings.length) toast(warnings.join(' '));
      } catch (e) {
        return toast(String(e instanceof Error ? e.message : e));
      }
    }
    back();
  };

  const remove = () => {
    store.update(
      'customLooks',
      settings.customLooks.filter((l) => l.id !== look.id)
    );
    back();
  };

  const target = layer.t;
  const setTarget = (t: LayerTarget) => setLayer({ t });
  const effects = snapshot?.effects.filter((e) => e && e !== 'RSVD' && e !== '-') ?? [];

  return (
    <main>
      <Header title={existing ? 'Edit look' : 'Make a look'} back>
        <button
          class="icon"
          title="Export look"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(look));
              toast('Look copied to clipboard');
            } catch {
              toast('Could not copy to clipboard');
            }
          }}
        >
          📋
        </button>
        <button
          class="icon"
          title="Import look"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              const imported = JSON.parse(text) as Look;
              if (!imported.name || !imported.l) throw new Error('Invalid look');
              imported.id = `custom.${Date.now()}`;
              setLook(imported);
              toast('Look imported');
            } catch {
              toast('Could not read a valid look from clipboard');
            }
          }}
        >
          📥
        </button>
        {existing && (
          <button class="icon" title="Delete" onClick={remove}>
            🗑
          </button>
        )}
      </Header>
      <div class="sticky">
        <StripPreview
          layout={layout}
          segments={preview.segments}
          previews={preview.previewColors}
          showZones={false}
        />
      </div>

      <input
        class="name-input"
        value={look.name}
        placeholder="Name"
        aria-label="Look name"
        onInput={(e) => setLook({ ...look, name: e.currentTarget.value })}
      />
      <div class="chips scroll">
        {EMOJIS.map((e) => (
          <Chip key={e} selected={look.emoji === e} onClick={() => setLook({ ...look, emoji: e })}>
            <span class="emoji-chip">{e}</span>
          </Chip>
        ))}
      </div>

      <h3>Parts of the house</h3>
      {zones.length > 1 ? (
        <>
          <div class="chips parts">
            {look.l.map((l, i) =>
              // Overlays (e.g. Magic Icicles' twinkling lights) aren't a part of the house; they're kept as they are.
              l.o ? null : (
                <Chip key={i} selected={i === active} onClick={() => selectLayer(i)}>
                  {partLabel(i)}
                </Chip>
              )
            )}
            <Chip onClick={addPart}>＋ Different look for a part</Chip>
          </div>
          {active > 0 && (
            <div class="card part-edit">
              <small>This look shows on:</small>
              <div class="chips dense">
                {zones.map((z) => {
                  const ids = layerZoneIds(layer);
                  const on = ids.includes(z.id);
                  return (
                    <Chip
                      key={z.id}
                      selected={on}
                      // A part always covers at least one zone; use Remove to drop it.
                      onClick={() =>
                        !(on && ids.length === 1) &&
                        setLook(
                          setLayerZones(
                            look,
                            active,
                            on ? ids.filter((x) => x !== z.id) : [...ids, z.id]
                          )
                        )
                      }
                    >
                      {z.name}
                    </Chip>
                  );
                })}
              </div>
              <div class="row">
                <select
                  value=""
                  onChange={(e) => {
                    const src = [...builtinLooks, ...settings.customLooks].find(
                      (l) => l.id === e.currentTarget.value
                    );
                    if (src) {
                      const l = copyStyleFrom(layer, src);
                      setLayer(l);
                      setCategory(styleForEffects(l.e)?.category ?? 'steady');
                      setThemes(l.p.length > 0);
                    }
                  }}
                >
                  <option value="">Start from a look…</option>
                  {[...builtinLooks, ...settings.customLooks].map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.emoji} {l.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => (
                    setLook(removeLayer(look, active)),
                    selectLayer(0, removeLayer(look, active))
                  )}
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p class="hint">
          <a href="#/zones">Split your house into parts</a> to give each part its own look.
        </p>
      )}

      <h3>
        Effect <small>{style?.label ?? layer.e[0]}</small>
      </h3>
      <div class="chips scroll">
        {styleCategories.map((c) => (
          <Chip key={c.id} selected={c.id === category} onClick={() => setCategory(c.id)}>
            {c.emoji} {c.label}
          </Chip>
        ))}
      </div>
      <div class="chips dense">
        {available(category).map((s) => (
          <Chip key={s.id} selected={s.id === style?.id} onClick={() => setLayer({ e: s.wled })}>
            {s.emoji} {s.label}
          </Chip>
        ))}
      </div>
      {effects.length > 0 && (
        <details class="all-fx">
          <summary>All {effects.length} effects on your lights</summary>
          <input
            class="search"
            placeholder="Search effects"
            aria-label="Search effects"
            value={fxQuery}
            onInput={(e) => setFxQuery(e.currentTarget.value)}
          />
          <ul>
            {effects
              .filter((e) => e.toLowerCase().includes(fxQuery.toLowerCase()))
              .map((e) => (
                <li key={e}>
                  <button class={layer.e[0] === e ? 'on' : ''} onClick={() => setLayer({ e: [e] })}>
                    {e}
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}

      <h3>Colors</h3>
      <div class="segmented">
        <button class={!themes ? 'on' : ''} onClick={() => (setThemes(false), setLayer({ p: [] }))}>
          🎨 My colors
        </button>
        <button class={themes ? 'on' : ''} onClick={() => setThemes(true)}>
          🌈 Color themes
        </button>
      </div>
      {!themes ? (
        <>
          <div class="row">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                class="slot"
                style={layer.c[i] ? { background: css(layer.c[i]) } : undefined}
                onClick={() => layer.c[i] && toggleColor(layer.c[i])}
                title={layer.c[i] ? 'Remove' : ''}
              >
                {layer.c[i] ? '' : '+'}
                <small>{['1st', '2nd', '3rd'][i]}</small>
              </button>
            ))}
            <label class="button tonal">
              🎯 Any color
              <input
                type="color"
                value={rgbToHex(layer.c[layer.c.length - 1] ?? [255, 0, 0])}
                onChange={(e) => addCustom(hexToRgb(e.currentTarget.value))}
              />
            </label>
          </div>
          <p class="hint">Tap colors to add (up to 3). Tap a chosen color above to remove it.</p>
          {settings.recentColors.length > 0 && (
            <ColorRow
              title="Recent"
              colors={settings.recentColors.map((rgb) => ({ name: rgbToHex(rgb), rgb }))}
              selected={layer.c}
              onToggle={toggleColor}
            />
          )}
          {colorGroups.map((g) => (
            <ColorRow
              key={g.name}
              title={g.name}
              colors={g.colors}
              selected={layer.c}
              onToggle={toggleColor}
            />
          ))}
        </>
      ) : (
        <div class="themes">
          {themeList.map((p) => (
            <button
              key={p.wled}
              class={'theme' + (layer.p[0] === p.wled ? ' on' : '')}
              onClick={() => setLayer({ p: paletteCandidates(p) })}
            >
              <span>
                {p.emoji} {p.label}
                {isCustomPalette(p.wled) && <em class="new"> ★</em>}
              </span>
              <GradientBar colors={p.stops} />
            </button>
          ))}
        </div>
      )}

      {!style?.noSpeed && (
        <Slider
          label="Speed"
          left="🐢"
          right="🐇"
          value={layer.s}
          onChange={(speed) => setLayer({ s: speed })}
        />
      )}
      {!style?.noAmount && (
        <Slider
          label="Amount"
          left="🤏"
          right="🙌"
          value={layer.i}
          onChange={(intensity) => setLayer({ i: intensity })}
        />
      )}

      <h3>Light spacing</h3>
      <Toggle
        label="Use my house setting"
        hint={spacingLabel(layout.spacing ?? SOLID_SPACING)}
        checked={!layer.sp}
        onChange={(useHouse) =>
          setLayer({ sp: useHouse ? undefined : (layout.spacing ?? SOLID_SPACING) })
        }
      />
      {layer.sp && (
        <SpacingPicker
          value={layer.sp}
          onChange={(spacing) => setLayer({ sp: spacing })}
          inches={layout.inchesBetweenLights}
        />
      )}

      {zones.length > 1 && active === 0 && (
        <>
          <h3>Where</h3>
          <div class="chips">
            <Chip selected={target.kind === 'all'} onClick={() => setTarget({ kind: 'all' })}>
              Whole house
            </Chip>
            <Chip
              selected={target.kind === 'alternateZones'}
              onClick={() => setTarget({ kind: 'alternateZones', phase: 0 })}
            >
              Every other part
            </Chip>
            {zones.map((z) => {
              const on = target.kind === 'zones' && target.zoneIds.includes(z.id);
              return (
                <Chip
                  key={z.id}
                  selected={on}
                  onClick={() => {
                    const ids =
                      target.kind === 'zones' ? target.zoneIds.filter((id) => id !== z.id) : [];
                    if (!on) ids.push(z.id);
                    setTarget(ids.length ? { kind: 'zones', zoneIds: ids } : { kind: 'all' });
                  }}
                >
                  {z.name}
                </Chip>
              );
            })}
          </div>
        </>
      )}

      {preview.warnings.length > 0 && <p class="hint warn">{preview.warnings.join(' ')}</p>}
      <div class="buttons">
        <button class="primary" onClick={() => save(true)}>
          💡 Save & turn on
        </button>
        <button onClick={() => save(false)}>Save</button>
      </div>
    </main>
  );
}

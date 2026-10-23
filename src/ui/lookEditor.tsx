import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../app';
import { colorGroups, newCustomLook, palettePresets, styleCategories, styleForEffects, effectStyles } from '../engine/library';
import { CUSTOM_CATEGORY, LayerTarget, Look, LookLayer, Rgb, SOLID_SPACING, effectiveZones, rgbEquals, spacingLabel } from '../engine/model';
import { EffectCatalog, compileLook } from '../engine/segmentCompiler';
import { Chip, GradientBar, Header, SpacingPicker, StripPreview, Toggle, css, hexToRgb, rgbToHex } from './common';

const EMOJIS = ['✨', '🎄', '🎅', '❄️', '🎃', '👻', '❤️', '🍀', '🐣', '🇺🇸', '🎆', '🦃', '🕎', '🪔', '🏈', '⚽', '🏀', '⚾', '🏒', '🎉', '🎂', '🌈', '🌊', '🔥', '🌙', '⭐', '🌸', '🦄'];

export function LookEditor(props: { lookId?: string }) {
  const { settings, store, snapshot, applyLook, toast, back } = useApp();
  const existing = settings.customLooks.find((l) => l.id === props.lookId);
  const [look, setLook] = useState<Look>(() => structuredClone(existing ?? newCustomLook()));
  const layer = look.layers[0];
  const [category, setCategory] = useState(() => styleForEffects(layer.effect)?.category ?? 'steady');
  const [themes, setThemes] = useState(layer.palette.length > 0);
  const [fxQuery, setFxQuery] = useState('');
  const style = styleForEffects(layer.effect);
  const layout = settings.layout ?? { totalPixels: snapshot?.info.ledCount ?? 100, zones: [] };
  const zones = effectiveZones(layout);

  const setLayer = (patch: Partial<LookLayer>) => setLook({ ...look, layers: [{ ...layer, ...patch }] });

  const catalog = useMemo(
    () => (snapshot ? new EffectCatalog(snapshot.effects, snapshot.palettes) : undefined),
    [snapshot],
  );
  const available = (cat: string) =>
    effectStyles.filter((s) => s.category === cat && (!catalog || catalog.effectId(s.wled) !== undefined));
  const devicePalettes = new Set(snapshot?.palettes.map((p) => p.toLowerCase()));
  const themeList = palettePresets.filter((p) => !snapshot || devicePalettes.has(p.wled.toLowerCase()));
  const preview = compileLook(layout, look, catalog ?? new EffectCatalog([...layer.effect, 'Solid'], palettePresets.map((p) => p.wled)), 64);

  const toggleColor = (c: Rgb) => {
    let colors = [...layer.colors];
    if (colors.some((x) => rgbEquals(x, c))) {
      if (colors.length > 1) colors = colors.filter((x) => !rgbEquals(x, c));
    } else {
      if (colors.length === 3) colors.shift();
      colors.push(c);
    }
    setLayer({ colors });
  };

  const addCustom = (c: Rgb) => {
    const recent = [c, ...settings.recentColors.filter((x) => !rgbEquals(x, c))].slice(0, 8);
    store.update('recentColors', recent);
    if (!layer.colors.some((x) => rgbEquals(x, c))) toggleColor(c);
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
    store.update('customLooks', settings.customLooks.filter((l) => l.id !== look.id));
    back();
  };

  const target = layer.target;
  const setTarget = (t: LayerTarget) => setLayer({ target: t });
  const effects = snapshot?.effects.filter((e) => e && e !== 'RSVD' && e !== '-') ?? [];

  return (
    <main>
      <Header title={existing ? 'Edit look' : 'Make a look'} back>
        {existing && <button class="icon" title="Delete" onClick={remove}>🗑</button>}
      </Header>
      <div class="sticky">
        <StripPreview layout={layout} segments={preview.segments} previews={preview.previewColors} showZones={false} />
      </div>

      <input class="name-input" value={look.name} placeholder="Name" onInput={(e) => setLook({ ...look, name: e.currentTarget.value })} />
      <div class="chips scroll">
        {EMOJIS.map((e) => (
          <Chip key={e} selected={look.emoji === e} onClick={() => setLook({ ...look, emoji: e })}>
            <span class="emoji-chip">{e}</span>
          </Chip>
        ))}
      </div>

      <h3>Effect <small>{style?.label ?? layer.effect[0]}</small></h3>
      <div class="chips scroll">
        {styleCategories.map((c) => (
          <Chip key={c.id} selected={c.id === category} onClick={() => setCategory(c.id)}>
            {c.emoji} {c.label}
          </Chip>
        ))}
      </div>
      <div class="chips dense">
        {available(category).map((s) => (
          <Chip key={s.id} selected={s.id === style?.id} onClick={() => setLayer({ effect: s.wled })}>
            {s.emoji} {s.label}
          </Chip>
        ))}
      </div>
      {effects.length > 0 && (
        <details class="all-fx">
          <summary>All {effects.length} effects on your lights</summary>
          <input class="search" placeholder="Search effects" value={fxQuery} onInput={(e) => setFxQuery(e.currentTarget.value)} />
          <ul>
            {effects
              .filter((e) => e.toLowerCase().includes(fxQuery.toLowerCase()))
              .map((e) => (
                <li key={e}>
                  <button class={layer.effect[0] === e ? 'on' : ''} onClick={() => setLayer({ effect: [e] })}>
                    {e}
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}

      <h3>Colors</h3>
      <div class="segmented">
        <button class={!themes ? 'on' : ''} onClick={() => (setThemes(false), setLayer({ palette: [] }))}>🎨 My colors</button>
        <button class={themes ? 'on' : ''} onClick={() => setThemes(true)}>🌈 Color themes</button>
      </div>
      {!themes ? (
        <>
          <div class="row">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                class="slot"
                style={layer.colors[i] ? { background: css(layer.colors[i]) } : undefined}
                onClick={() => layer.colors[i] && toggleColor(layer.colors[i])}
                title={layer.colors[i] ? 'Remove' : ''}
              >
                {layer.colors[i] ? '' : '+'}
                <small>{['1st', '2nd', '3rd'][i]}</small>
              </button>
            ))}
            <label class="button tonal">
              🎯 Any color
              <input type="color" value={rgbToHex(layer.colors[layer.colors.length - 1] ?? [255, 0, 0])} onChange={(e) => addCustom(hexToRgb(e.currentTarget.value))} />
            </label>
          </div>
          <p class="hint">Tap colors to add (up to 3). Tap a chosen color above to remove it.</p>
          {settings.recentColors.length > 0 && (
            <ColorRow title="Recent" colors={settings.recentColors.map((rgb) => ({ name: rgbToHex(rgb), rgb }))} selected={layer.colors} onToggle={toggleColor} />
          )}
          {colorGroups.map((g) => (
            <ColorRow key={g.name} title={g.name} colors={g.colors} selected={layer.colors} onToggle={toggleColor} />
          ))}
        </>
      ) : (
        <div class="themes">
          {themeList.map((p) => (
            <button key={p.wled} class={'theme' + (layer.palette[0] === p.wled ? ' on' : '')} onClick={() => setLayer({ palette: [p.wled] })}>
              <span>{p.emoji} {p.label}</span>
              <GradientBar colors={p.stops} />
            </button>
          ))}
        </div>
      )}

      {!style?.noSpeed && (
        <Slider label="Speed" left="🐢" right="🐇" value={layer.speed} onChange={(speed) => setLayer({ speed })} />
      )}
      {!style?.noAmount && (
        <Slider label="Amount" left="🤏" right="🙌" value={layer.intensity} onChange={(intensity) => setLayer({ intensity })} />
      )}

      <h3>Light spacing</h3>
      <Toggle
        label="Use my house setting"
        hint={spacingLabel(layout.spacing ?? SOLID_SPACING)}
        checked={!layer.spacing}
        onChange={(useHouse) => setLayer({ spacing: useHouse ? undefined : layout.spacing ?? SOLID_SPACING })}
      />
      {layer.spacing && <SpacingPicker value={layer.spacing} onChange={(spacing) => setLayer({ spacing })} inches={layout.inchesBetweenLights} />}

      {zones.length > 1 && (
        <>
          <h3>Where</h3>
          <div class="chips">
            <Chip selected={target.kind === 'all'} onClick={() => setTarget({ kind: 'all' })}>Whole house</Chip>
            <Chip selected={target.kind === 'alternateZones'} onClick={() => setTarget({ kind: 'alternateZones', phase: 0 })}>Every other part</Chip>
            {zones.map((z) => {
              const on = target.kind === 'zones' && target.zoneIds.includes(z.id);
              return (
                <Chip
                  key={z.id}
                  selected={on}
                  onClick={() => {
                    const ids = target.kind === 'zones' ? target.zoneIds.filter((id) => id !== z.id) : [];
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
        <button class="primary" onClick={() => save(true)}>💡 Save & turn on</button>
        <button onClick={() => save(false)}>Save</button>
      </div>
    </main>
  );
}

function ColorRow(props: { title: string; colors: { name: string; rgb: Rgb }[]; selected: Rgb[]; onToggle: (c: Rgb) => void }) {
  return (
    <>
      <h4>{props.title}</h4>
      <div class="dots">
        {props.colors.map((c) => {
          const on = props.selected.some((s) => rgbEquals(s, c.rgb));
          return (
            <button key={c.name} class={'dot' + (on ? ' on' : '')} style={{ background: css(c.rgb) }} title={c.name} aria-label={c.name} onClick={() => props.onToggle(c.rgb)}>
              {on ? '✓' : ''}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Slider(props: { label: string; left: string; right: string; value: number; onChange: (v: number) => void }) {
  return (
    <>
      <h3>{props.label}</h3>
      <div class="row">
        <span>{props.left}</span>
        <input type="range" min={0} max={255} value={props.value} onInput={(e) => props.onChange(+e.currentTarget.value)} />
        <span>{props.right}</span>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../app';
import { builtinLooks } from '../engine/library';
import { LightSpacing, SOLID_SPACING, Zone, newId, sequential, spacingEquals, suggestedSpacing, validateLayout } from '../engine/model';
import { EffectCatalog, compileLook } from '../engine/segmentCompiler';
import { Chip, Header, NumberField, SpacingPicker, StripPreview } from './common';

const INCHES = [1, 2, 3, 4, 6, 8, 12, 18];

export function ZonesPage() {
  const { settings, store, snapshot, toast, back } = useApp();
  const saved = settings.layout;
  const ledCount = snapshot?.info.ledCount;
  const [total, setTotal] = useState(saved?.totalPixels ?? ledCount ?? 150);
  const [zones, setZones] = useState<Zone[]>(() => saved?.zones.length ? saved.zones : [{ id: newId(), name: 'Roofline', start: 0, length: saved?.totalPixels ?? ledCount ?? 150 }]);
  const [spacing, setSpacing] = useState<LightSpacing>(saved?.spacing ?? SOLID_SPACING);
  const [inches, setInches] = useState<number | undefined>(saved?.inchesBetweenLights);
  const touched = useRef(!!saved);

  // Opened before the controller answered: use its real LED count once known.
  useEffect(() => {
    if (!touched.current && ledCount) {
      touched.current = true;
      changeTotal(ledCount);
    }
  }, [ledCount]);

  /** Changes the light count; parts that filled the whole house keep doing
   * so (the last part grows or shrinks). */
  function changeTotal(n: number) {
    touched.current = true;
    setZones((zs) => {
      const sum = zs.reduce((a, z) => a + z.length, 0);
      if (sum !== total || zs.length === 0) return zs;
      const last = zs[zs.length - 1];
      return [...zs.slice(0, -1), { ...last, length: Math.max(1, last.length + n - total) }];
    });
    setTotal(n);
  }

  const layout = { totalPixels: total, zones: sequential(zones), spacing, inchesBetweenLights: inches };
  const preview = compileLook(layout, builtinLooks.find((l) => l.id === 'builtin.christmas_classic')!, new EffectCatalog(['Solid'], []), 64);
  const assigned = zones.reduce((n, z) => n + z.length, 0);
  const unassigned = total - assigned;

  const updateZone = (i: number, patch: Partial<Zone>) => setZones(zones.map((z, k) => (k === i ? { ...z, ...patch } : z)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= zones.length) return;
    const next = [...zones];
    [next[i], next[j]] = [next[j], next[i]];
    setZones(next);
  };
  const pickInches = (v: number) => {
    const wasSuggested = inches === undefined || spacingEquals(spacing, suggestedSpacing(inches));
    setInches(v);
    if (wasSuggested) setSpacing(suggestedSpacing(v));
  };

  const save = () => {
    const problems = validateLayout(layout);
    if (problems.length) return toast(problems[0]);
    store.update('layout', layout);
    toast('🏠 House saved');
    back();
  };

  return (
    <main>
      <Header title="House zones" back />
      <label class="field">
        How many lights are on your house?
        <NumberField value={total} min={1} onChange={changeTotal} ariaLabel="Number of lights" />
        {ledCount !== undefined && (
          <small>
            Your controller reports {ledCount}
            {ledCount !== total && (
              <>
                {' · '}
                <button class="link" onClick={() => changeTotal(ledCount)}>Use {ledCount}</button>
              </>
            )}
          </small>
        )}
      </label>

      <h3>Parts of the house, in wiring order</h3>
      <StripPreview layout={layout} segments={preview.segments} previews={preview.previewColors} />
      {unassigned !== 0 && (
        <p class="hint">
          {unassigned > 0 ? `${unassigned} lights aren't in a part yet (they'll stay off).` : `Parts use ${-unassigned} more lights than the house has.`}
        </p>
      )}
      {zones.map((z, i) => (
        <section class="card zone" key={z.id}>
          <div class="row">
            <input class="name-input" value={z.name} onInput={(e) => updateZone(i, { name: e.currentTarget.value })} />
            <button class="icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button class="icon" title="Move down" disabled={i === zones.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button class="icon" title="Remove" disabled={zones.length === 1} onClick={() => setZones(zones.filter((_, k) => k !== i))}>🗑</button>
          </div>
          <div class="row">
            <button class="round" onClick={() => updateZone(i, { length: Math.max(1, z.length - 1) })}>−</button>
            <NumberField class="center" value={z.length} min={1} onChange={(length) => updateZone(i, { length })} ariaLabel={`${z.name} lights`} />
            <button class="round" onClick={() => updateZone(i, { length: z.length + 1 })}>+</button>
            <span>lights</span>
          </div>
          <label class="check">
            <input type="checkbox" checked={!!z.reversed} onChange={(e) => updateZone(i, { reversed: e.currentTarget.checked })} /> Runs backwards
          </label>
        </section>
      ))}
      <button onClick={() => setZones([...zones, { id: newId(), name: `Part ${zones.length + 1}`, start: 0, length: unassigned > 0 ? unassigned : 10 }])}>
        ＋ Add a part
      </button>

      <h3>How far apart are the lights on the strip?</h3>
      <div class="chips">
        {INCHES.map((v) => (
          <Chip key={v} selected={inches === v} onClick={() => pickInches(v)}>{v}"</Chip>
        ))}
      </div>

      <h3>Space out the lights</h3>
      <p class="hint">Turn off lights in between so it looks like separate bulbs from the street. Every look uses this unless you change it for that look.</p>
      <SpacingPicker value={spacing} onChange={setSpacing} inches={inches} />

      <div class="buttons">
        <button class="primary" onClick={save}>Save</button>
      </div>
    </main>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../app';
import { builtinLooks } from '../engine/library';
import { LightSpacing, SOLID_SPACING, Zone, newId, sequential, spacingEquals, suggestedSpacing, validateLayout } from '../engine/model';
import { EffectCatalog, compileLook } from '../engine/segmentCompiler';
import { backupFileName, makeBackup, readBackup } from '../engine/backup';
import { RELEASES, UpdateCheck, checkForUpdate, setUpdateChecks, updateChecksEnabled } from '../engine/updates';
import { Settings } from '../store';
import { Chip, Dialog, Header, NumberField, SpacingPicker, StripPreview, Toggle } from './common';

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

      <BackupCard />
      <AboutCard />
    </main>
  );
}

/** Download everything set up in Eaveglow to this device, or put it back. */
function BackupCard() {
  const { store, settings, toast, saveSchedule, back } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ settings: Settings; savedAt?: string; summary: string }>();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    await store.flush().catch(() => undefined);
    const blob = new Blob([JSON.stringify(makeBackup(store.settings), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(readBackup(await f.text()));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      // Palette file slots belong to this controller; keep its own.
      const next = { ...pending.settings, customPalettes: settings.customPalettes };
      await store.replace(next);
      if (next.schedule?.enabled) {
        const r = await saveSchedule(next.schedule, next.autopilot);
        if (r.errors.length) toast(`Backup restored, but the schedule couldn't be saved: ${r.errors.join(' ')}`);
        else toast('Backup restored, and your schedule is back on your lights.');
      } else toast('Backup restored.');
      setPending(undefined);
      back();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card backup">
      <b>💾 Backup</b>
      <p class="hint">Your looks, house parts, schedule and autopilot live on the controller. WLED's own backup doesn't include them, so keep a copy before updating WLED or swapping hardware.</p>
      <div class="row">
        <button onClick={download}>⬇️ Download backup</button>
        <button onClick={() => file.current?.click()}>Restore from backup…</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Backup file" onChange={(e) => pick(e.currentTarget.files?.[0])} />
      <Dialog open={!!pending} onClose={() => !busy && setPending(undefined)}>
        <h2>Restore this backup?</h2>
        <p>
          {pending?.savedAt ? `From ${new Date(pending.savedAt).toLocaleDateString()}: ` : ''}
          {pending?.summary}
        </p>
        <p class="hint">This replaces everything set up in Eaveglow on these lights, for every phone in the house.</p>
        <div class="buttons">
          <button class="primary" disabled={busy} onClick={restore}>{busy ? 'Restoring…' : 'Restore'}</button>
          <button disabled={busy} onClick={() => setPending(undefined)}>Cancel</button>
        </div>
      </Dialog>
    </section>
  );
}

/** Version, and the optional once-a-day update check (off by default). */
function AboutCard() {
  const [enabled, setEnabled] = useState(updateChecksEnabled);
  const [result, setResult] = useState<UpdateCheck | 'checking'>();
  const check = async () => {
    setResult('checking');
    setResult(await checkForUpdate(__APP_VERSION__, true));
  };
  return (
    <section class="card">
      <b>Eaveglow {__APP_VERSION__}</b>
      <Toggle
        label="Check online for updates"
        hint="Off by default. When on, this phone asks GitHub once a day if there's a newer version. Nothing else leaves your network."
        checked={enabled}
        onChange={(on) => {
          setUpdateChecks(on);
          setEnabled(on);
          if (on) void check();
          else setResult(undefined);
        }}
      />
      {enabled && (
        <p class="hint">
          {result === 'checking' ? (
            'Checking…'
          ) : result?.status === 'available' ? (
            <>Version {result.update.version} is available. <a href={result.update.url} target="_blank" rel="noopener">See what's new and download</a></>
          ) : result?.status === 'current' ? (
            <>You're up to date. <button class="link" onClick={check}>Check again</button></>
          ) : result?.status === 'failed' ? (
            <>Couldn't reach GitHub (is this phone online?). <button class="link" onClick={check}>Try again</button></>
          ) : (
            <button class="link" onClick={check}>Check now</button>
          )}
        </p>
      )}
      <p class="hint">
        <a href={RELEASES} target="_blank" rel="noopener">All releases on GitHub</a>
      </p>
    </section>
  );
}

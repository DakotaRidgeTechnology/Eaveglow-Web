import { useState } from 'preact/hooks';
import { useApp } from '../app';
import { GeoLocation, Schedule, ScheduleTime, ScheduleWindow, Weekdays, newId } from '../engine/model';
import { capabilitiesFor, compileSchedule, WLED16 } from '../engine/scheduleCompiler';
import { applySchedule } from '../engine/scheduleService';
import { SunTimes, sunTimes } from '../engine/sunTimes';
import { browserTimezone, browserUtcOffsetMinutes } from '../engine/timezones';
import { Dialog, Header, Toggle } from './common';

const COUNTRIES: [string, string][] = [
  ['us', 'US'], ['ca', 'CA'], ['gb', 'GB'], ['au', 'AU'], ['de', 'DE'], ['fr', 'FR'], ['nl', 'NL'], ['mx', 'MX'], ['nz', 'NZ'], ['in', 'IN'],
];

const fmtClock = (h: number, m: number) => new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDate = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function describeTime(t: ScheduleTime, sun: SunTimes | null): string {
  if (t.kind === 'clock') return fmtClock(t.hour, t.minute);
  const base = t.offset === 0 ? (t.kind === 'sunrise' ? 'Sunrise' : 'Sunset') : `${Math.abs(t.offset)} min ${t.offset < 0 ? 'before' : 'after'} ${t.kind}`;
  const at = t.kind === 'sunrise' ? sun?.sunrise : sun?.sunset;
  return at ? `${base} (${fmtDate(new Date(at.getTime() + t.offset * 60000))})` : base;
}

/** Looks up a zip/postal code (zippopotam.us, no key needed). */
async function lookupZip(code: string, country: string): Promise<GeoLocation> {
  let c = code.trim();
  if (country === 'ca' || country === 'gb') c = c.split(' ')[0];
  if (!c) throw new Error('Enter a zip code.');
  let res: Response;
  try {
    res = await fetch(`https://api.zippopotam.us/${country}/${encodeURIComponent(c)}`);
  } catch {
    throw new Error("Couldn't look up that zip code. Check your internet connection, or enter coordinates.");
  }
  if (!res.ok) throw new Error(`We couldn't find "${code}".`);
  const place = (await res.json()).places?.[0];
  if (!place) throw new Error(`We couldn't find "${code}".`);
  return {
    lat: +place.latitude,
    lon: +place.longitude,
    label: [place['place name'], place['state abbreviation'], c.toUpperCase()].filter(Boolean).join(', '),
  };
}

export function SchedulePage() {
  const { settings, store, client, snapshot, toast } = useApp();
  const [schedule, setSchedule] = useState<Schedule>(() => structuredClone(settings.schedule));
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('us');
  const [locError, setLocError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState<{ windowId: string; which: 'on' | 'off' }>();
  const [result, setResult] = useState<string[]>();

  const caps = snapshot ? capabilitiesFor(snapshot.info.ver, snapshot.info.arch) : WLED16;
  const check = compileSchedule(schedule, 1, 2, caps);
  const loc = schedule.location;
  const sun = loc ? sunTimes(new Date(), loc.lat, loc.lon) : null;

  const updateWindow = (w: ScheduleWindow) => setSchedule({ ...schedule, windows: schedule.windows.map((x) => (x.id === w.id ? w : x)) });
  const addWindow = () =>
    setSchedule({
      ...schedule,
      windows: [
        ...schedule.windows,
        {
          id: newId('w'),
          enabled: true,
          on: { kind: 'clock', hour: schedule.windows.length ? 4 : 19, minute: 0 },
          off: { kind: 'clock', hour: schedule.windows.length ? 6 : 22, minute: 0 },
          days: Weekdays.all,
        },
      ],
    });

  const find = async () => {
    setLocError(undefined);
    try {
      setSchedule({ ...schedule, location: await lookupZip(zip, country) });
    } catch (e) {
      setLocError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await applySchedule(client, schedule, browserTimezone(), browserUtcOffsetMinutes());
      if (r.errors.length) return toast(r.errors.join(' '));
      store.update('schedule', schedule);
      setResult([
        schedule.enabled ? 'Your lights will now turn on and off by themselves, even when no phone is around.' : "Your lights won't switch automatically.",
        'Any timers that were set up in WLED before were replaced.',
        ...r.warnings,
      ]);
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const pickingWindow = schedule.windows.find((w) => w.id === picking?.windowId);

  return (
    <main>
      <Header title="Schedule" back />
      <section class="card">
        <Toggle
          label={<b>⏰ Automatic on & off</b>}
          hint="Saving replaces any timers already set up in WLED."
          checked={schedule.enabled}
          onChange={(enabled) => setSchedule({ ...schedule, enabled })}
        />
      </section>

      <fieldset disabled={!schedule.enabled} class={schedule.enabled ? '' : 'dim'}>
        {schedule.windows.map((w, i) => (
          <section class="card" key={w.id}>
            <div class="row spread">
              <b>Time {i + 1}</b>
              <span class="row">
                <input type="checkbox" role="switch" checked={w.enabled} onChange={(e) => updateWindow({ ...w, enabled: e.currentTarget.checked })} />
                <button class="icon" title="Remove" disabled={schedule.windows.length < 2} onClick={() => setSchedule({ ...schedule, windows: schedule.windows.filter((x) => x.id !== w.id) })}>
                  🗑
                </button>
              </span>
            </div>
            <div class="row times">
              <button class="time" onClick={() => setPicking({ windowId: w.id, which: 'on' })}>
                <small>💡 On</small>
                {describeTime(w.on, sun)}
              </button>
              <span>→</span>
              <button class="time" onClick={() => setPicking({ windowId: w.id, which: 'off' })}>
                <small>⭘ Off</small>
                {describeTime(w.off, sun)}
              </button>
            </div>
            <div class="days">
              {Weekdays.labels.map((d, k) => (
                <button key={d} class={'chip' + (Weekdays.has(w.days, k) ? ' on' : '')} onClick={() => updateWindow({ ...w, days: Weekdays.toggle(w.days, k) })}>
                  {d}
                </button>
              ))}
            </div>
            <small class="hint">{Weekdays.describe(w.days)}</small>
          </section>
        ))}
        <button onClick={addWindow}>＋ Add another time</button>

        <section class="card">
          <b>🌅 Sunrise & sunset location</b>
          {loc ? (
            <p>
              {loc.label}
              <br />
              <small>
                Today: sunrise {sun?.sunrise ? fmtDate(sun.sunrise) : '—'} · sunset {sun?.sunset ? fmtDate(sun.sunset) : '—'}
              </small>
            </p>
          ) : (
            <p class="hint">Needed only if a time uses sunrise or sunset.</p>
          )}
          <div class="row">
            <select value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
              {COUNTRIES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input placeholder="Zip / postal code" value={zip} onInput={(e) => setZip(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && find()} />
            <button onClick={find}>Find</button>
          </div>
          <details>
            <summary>Or enter coordinates</summary>
            <CoordinatesForm onSet={(l) => setSchedule({ ...schedule, location: l })} />
          </details>
          {locError && <p class="hint warn">{locError}</p>}
        </section>
      </fieldset>

      {schedule.enabled && check.errors.map((e) => <p key={e} class="hint warn">⚠️ {e}</p>)}
      <div class="buttons">
        <button class="primary" disabled={saving || (schedule.enabled && check.errors.length > 0)} onClick={save}>
          {saving ? 'Saving…' : '💾 Save to my lights'}
        </button>
      </div>

      <Dialog open={!!pickingWindow} onClose={() => setPicking(undefined)}>
        {pickingWindow && picking && (
          <TimePicker
            title={picking.which === 'on' ? 'Lights on' : 'Lights off'}
            initial={pickingWindow[picking.which]}
            onDone={(t) => {
              updateWindow({ ...pickingWindow, [picking.which]: t });
              setPicking(undefined);
            }}
          />
        )}
      </Dialog>
      <Dialog open={!!result} onClose={() => setResult(undefined)}>
        <h2>✅ {schedule.enabled ? 'Schedule saved' : 'Schedule turned off'}</h2>
        {result?.map((r) => <p key={r}>{r}</p>)}
        <button class="primary" onClick={() => setResult(undefined)}>OK</button>
      </Dialog>
    </main>
  );
}

function TimePicker(props: { title: string; initial: ScheduleTime; onDone: (t: ScheduleTime) => void }) {
  const [kind, setKind] = useState(props.initial.kind);
  const [clock, setClock] = useState(props.initial.kind === 'clock' ? props.initial : { kind: 'clock' as const, hour: 19, minute: 0 });
  const [offset, setOffset] = useState(props.initial.kind === 'clock' ? 0 : props.initial.offset);
  const value = `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
  const done = () => props.onDone(kind === 'clock' ? clock : { kind, offset });
  return (
    <div class="picker">
      <h2>{props.title}</h2>
      <div class="segmented">
        {(['clock', 'sunrise', 'sunset'] as const).map((k) => (
          <button key={k} class={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {k === 'clock' ? '🕒 Time' : k === 'sunrise' ? '🌅 Sunrise' : '🌙 Sunset'}
          </button>
        ))}
      </div>
      {kind === 'clock' ? (
        <input
          type="time"
          class="time-input"
          value={value}
          onInput={(e) => {
            const [h, m] = e.currentTarget.value.split(':').map(Number);
            if (!isNaN(h)) setClock({ kind: 'clock', hour: h, minute: m || 0 });
          }}
        />
      ) : (
        <>
          <p class="center">{offset === 0 ? `Right at ${kind}` : `${Math.abs(offset)} minutes ${offset < 0 ? 'before' : 'after'} ${kind}`}</p>
          <input type="range" min={-120} max={120} step={5} value={offset} onInput={(e) => setOffset(+e.currentTarget.value)} />
          <div class="row spread"><small>2 h before</small><small>2 h after</small></div>
        </>
      )}
      <button class="primary" onClick={done}>Done</button>
    </div>
  );
}

function CoordinatesForm(props: { onSet: (l: GeoLocation) => void }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const ok = Math.abs(+lat) <= 90 && Math.abs(+lon) <= 180 && lat !== '' && lon !== '';
  return (
    <div class="row">
      <input inputMode="decimal" placeholder="Latitude" value={lat} onInput={(e) => setLat(e.currentTarget.value)} />
      <input inputMode="decimal" placeholder="Longitude" value={lon} onInput={(e) => setLon(e.currentTarget.value)} />
      <button disabled={!ok} onClick={() => props.onSet({ lat: +lat, lon: +lon, label: `${(+lat).toFixed(3)}, ${(+lon).toFixed(3)}` })}>Set</button>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../app';
import { Autopilot, MAX_ROTATION, Season, SpecialDate, defaultAutopilot, describeMonthDay, seasonPeriods } from '../engine/autopilot';
import { builtinLooks, holidayGroups } from '../engine/library';
import { GeoLocation, Look, Schedule, ScheduleTime, ScheduleWindow, Weekdays, newId } from '../engine/model';
import { capabilitiesFor, compileSchedule, WLED16 } from '../engine/scheduleCompiler';
import { TIMERS_BACKUP, datedPresets, restoreOriginalTimers } from '../engine/scheduleService';
import { SunTimes, sunTimes } from '../engine/sunTimes';
import { Chip, Dialog, Header, NumberField, Toggle } from './common';

const COUNTRIES: [string, string][] = [
  ['us', 'US'], ['ca', 'CA'], ['gb', 'GB'], ['au', 'AU'], ['de', 'DE'], ['fr', 'FR'], ['nl', 'NL'], ['mx', 'MX'], ['nz', 'NZ'], ['in', 'IN'],
];

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const { settings, snapshot, toast, saveSchedule, client, store } = useApp();
  const [backup, setBackup] = useState<{ savedAt?: string; timers: unknown[] } | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    client.readFile(TIMERS_BACKUP).then((b) => Array.isArray(b?.timers) && setBackup(b), () => undefined);
  }, [client]);
  const [schedule, setSchedule] = useState<Schedule>(() => structuredClone(settings.schedule));
  const looks = useMemo(() => [...builtinLooks, ...settings.customLooks], [settings.customLooks]);
  const [auto, setAuto] = useState<Autopilot>(() => structuredClone(settings.autopilot ?? defaultAutopilot(holidayGroups, builtinLooks)));
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('us');
  const [locError, setLocError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState<{ windowId: string; which: 'on' | 'off' }>();
  const [result, setResult] = useState<string[]>();

  const caps = snapshot ? capabilitiesFor(snapshot.info.ver, snapshot.info.arch) : WLED16;
  const periods = useMemo(() => seasonPeriods(auto, holidayGroups).periods, [auto]);
  const autoOn = auto.enabled && schedule.enabled;
  const check = compileSchedule(schedule, autoOn ? { dated: datedPresets(periods, () => 1), plain: 1 } : 1, 2, caps);
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
      const r = await saveSchedule(schedule, auto);
      if (r.errors.length) return toast(r.errors.join(' '));
      if (!backup) client.readFile(TIMERS_BACKUP).then((b) => Array.isArray(b?.timers) && setBackup(b), () => undefined);
      const lookName = (id: string) => looks.find((l) => l.id === id)?.name ?? id;
      setResult([
        schedule.enabled ? 'Your lights will now turn on and off by themselves, even when no phone is around.' : "Your lights won't switch automatically.",
        ...(autoOn ? ['🗓 Autopilot looks:', ...periods.map((p) => `${p.emoji} ${p.label}, ${describeMonthDay(p.start)} – ${describeMonthDay(p.end)}: ${p.lookIds.map(lookName).join(', ')}`)] : []),
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

      <AutopilotCard autopilot={auto} onChange={setAuto} looks={looks} scheduleOn={schedule.enabled} />

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
      {backup && (
        <p class="center">
          <button class="link" onClick={() => setRestoring(true)}>Restore the WLED timers you had before Eaveglow</button>
        </p>
      )}
      <Dialog open={restoring} onClose={() => setRestoring(false)}>
        <h2>Restore your old timers?</h2>
        <p>
          This puts back the {backup?.timers.length} WLED timer{backup?.timers.length === 1 ? '' : 's'} your controller had
          {backup?.savedAt ? ` on ${new Date(backup.savedAt).toLocaleDateString()}` : ''}. Eaveglow's schedule and autopilot will be turned off.
        </p>
        <div class="buttons">
          <button onClick={() => setRestoring(false)}>Cancel</button>
          <button
            class="primary"
            onClick={async () => {
              setRestoring(false);
              try {
                if (!(await restoreOriginalTimers(client))) return toast("Couldn't find the saved timers.");
                const off = { ...schedule, enabled: false };
                setSchedule(off);
                store.update('schedule', off);
                if (settings.autopilot) store.update('autopilot', { ...settings.autopilot, enabled: false, syncedDates: undefined });
                setAuto({ ...auto, enabled: false });
                toast('Your old WLED timers are back.');
              } catch (e) {
                toast(String(e instanceof Error ? e.message : e));
              }
            }}
          >
            Restore
          </button>
        </div>
      </Dialog>
      <Dialog open={!!result} onClose={() => setResult(undefined)}>
        <h2>✅ {schedule.enabled ? 'Schedule saved' : 'Schedule turned off'}</h2>
        {result?.map((r) => <p key={r}>{r}</p>)}
        <button class="primary" onClick={() => setResult(undefined)}>OK</button>
      </Dialog>
    </main>
  );
}

function AutopilotCard(props: { autopilot: Autopilot; onChange: (a: Autopilot) => void; looks: Look[]; scheduleOn: boolean }) {
  const { autopilot: auto, looks } = props;
  const dates = useMemo(() => {
    // Each season's own dates, before overlaps are worked out.
    const out: Record<string, string> = {};
    for (const s of auto.seasons) {
      const p = seasonPeriods({ ...auto, seasons: [{ ...s, enabled: true }] }, holidayGroups).periods.find((x) => x.key === s.holidayId);
      if (p) out[s.holidayId] = `${describeMonthDay(p.start)} – ${describeMonthDay(p.end)}`;
    }
    return out;
  }, [auto]);
  const setSeason = (s: Season) => props.onChange({ ...auto, seasons: auto.seasons.map((x) => (x.holidayId === s.holidayId ? s : x)) });
  const lookSelect = (value: string, onPick: (id: string) => void, label: string, exclude: string[] = []) => (
    <select aria-label={label} value={value} onChange={(e) => e.currentTarget.value && onPick(e.currentTarget.value)}>
      {value === '' && <option value="">＋ Add another look…</option>}
      {looks.filter((l) => !exclude.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}
    </select>
  );
  /** Chips for the holiday's looks (and any others picked); tap to include in the rotation. */
  /** Chips for a holiday's looks (and any others picked); tap to include in the rotation. */
  const rotation = (group: string | undefined, ids: string[], set: (ids: string[]) => void) => {
    const shown = [...new Set([...looks.filter((l) => group && l.group === group).map((l) => l.id), ...ids])];
    const toggle = (id: string) => {
      const on = ids.includes(id);
      if (on && ids.length === 1) return;
      set(on ? ids.filter((x) => x !== id) : [...ids, id].slice(0, MAX_ROTATION));
    };
    return (
      <>
        <div class="chips dense rotation">
          {shown.map((id) => {
            const l = looks.find((x) => x.id === id);
            return l ? <Chip key={id} selected={ids.includes(id)} onClick={() => toggle(id)}>{l.emoji} {l.name}</Chip> : null;
          })}
        </div>
        <small class="hint">
          {ids.length === 1 ? 'Same look every day.' : `A different look each day, ${ids.length} in turn.`}
          {ids.length >= MAX_ROTATION ? ` Up to ${MAX_ROTATION}, one per day of the week.` : ''}
        </small>
        {ids.length < MAX_ROTATION && lookSelect('', (id) => set([...ids, id]), 'Add another look', shown)}
      </>
    );
  };
  const specials = auto.dates ?? [];
  const setDate = (d: SpecialDate) => props.onChange({ ...auto, dates: specials.map((x) => (x.id === d.id ? d : x)) });
  const addDate = () => {
    const today = isoDate(new Date());
    props.onChange({ ...auto, dates: [...specials, { id: newId('d'), name: '', start: today, end: today, lookIds: [looks[0].id], everyYear: false, enabled: true }] });
  };

  return (
    <section class={'card autopilot' + (props.scheduleOn ? '' : ' dim')}>
      <fieldset disabled={!props.scheduleOn}>
        <Toggle
          label={<b>🗓 Seasonal autopilot</b>}
          hint={props.scheduleOn ? 'Picks the look by date at Time 1\'s "on" time.' : 'Turn on Automatic on & off to use autopilot.'}
          checked={auto.enabled}
          onChange={(enabled) => props.onChange({ ...auto, enabled })}
        />
        {auto.enabled && (
          <>
            {auto.seasons.map((s) => {
              const h = holidayGroups.find((g) => g.id === s.holidayId);
              if (!h) return null;
              return (
                <div key={s.holidayId} class={'season' + (s.enabled ? '' : ' off')}>
                  <label class="row">
                    <input type="checkbox" checked={s.enabled} onChange={(e) => setSeason({ ...s, enabled: e.currentTarget.checked })} />
                    <b>{h.emoji} {h.name}</b>
                    <small class="hint">{dates[s.holidayId] ?? 'no date this year'}</small>
                  </label>
                  {s.enabled && (
                    <>
                      {rotation(s.holidayId, s.lookIds, (lookIds) => setSeason({ ...s, lookIds }))}
                      <div class="row days-around">
                        <NumberField value={s.daysBefore} ariaLabel={`${h.name} days before`} onChange={(n) => setSeason({ ...s, daysBefore: Math.min(n, 90) })} />
                        <small>days before,</small>
                        <NumberField value={s.daysAfter} ariaLabel={`${h.name} days after`} onChange={(n) => setSeason({ ...s, daysAfter: Math.min(n, 90) })} />
                        <small>after</small>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <h4 class="dates-title">📅 Special dates</h4>
            {specials.map((d) => (
              <div key={d.id} class={'season special' + (d.enabled ? '' : ' off')}>
                <div class="row">
                  <input type="checkbox" aria-label="Use this date" checked={d.enabled} onChange={(e) => setDate({ ...d, enabled: e.currentTarget.checked })} />
                  <input class="name-input" placeholder="Game day, birthday…" value={d.name} onInput={(e) => setDate({ ...d, name: e.currentTarget.value })} />
                  <button class="icon" title="Remove date" onClick={() => props.onChange({ ...auto, dates: specials.filter((x) => x.id !== d.id) })}>🗑</button>
                </div>
                <div class="row">
                  <input type="date" aria-label="From" value={d.start} onInput={(e) => { const v = e.currentTarget.value; v && setDate({ ...d, start: v, end: d.end < v ? v : d.end }); }} />
                  <span>to</span>
                  <input type="date" aria-label="To" value={d.end} min={d.start} onInput={(e) => { const v = e.currentTarget.value; v && setDate({ ...d, end: v < d.start ? d.start : v }); }} />
                </div>
                {rotation(undefined, d.lookIds, (lookIds) => setDate({ ...d, lookIds }))}
                <label class="row">
                  <input type="checkbox" checked={d.everyYear} onChange={(e) => setDate({ ...d, everyYear: e.currentTarget.checked })} />
                  <small>Every year</small>
                </label>
              </div>
            ))}
            <button onClick={addDate}>＋ Add a date (game day, birthday…)</button>
            {specials.some((d) => !d.everyYear) && (
              <p class="hint">One-time dates are removed from your lights the next time Eaveglow is opened after they pass.</p>
            )}
            <div class="season">
              <b>🏡 Rest of the year</b>
              {lookSelect(auto.everydayLookId, (everydayLookId) => props.onChange({ ...auto, everydayLookId }), 'Rest of the year look')}
            </div>
            <p class="hint">Where seasons overlap, the shorter one wins. Picking a look by hand still works; autopilot picks the season's look again at Time 1's "on" time.</p>
          </>
        )}
      </fieldset>
    </section>
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

import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { Autopilot, datesFingerprint, seasonPeriods } from './engine/autopilot';
import { builtinLooks, holidayGroups } from './engine/library';
import { Look, Schedule, WledSnapshot } from './engine/model';
import { ScheduleResult, applySchedule } from './engine/scheduleService';
import { browserTimezone, browserUtcOffsetMinutes } from './engine/timezones';
import { CustomPaletteInstaller, customPalettesIn, paletteSlots } from './engine/customPalettes';
import { EffectCatalog, compileLook, toStateJson } from './engine/segmentCompiler';
import { WledClient } from './engine/wledClient';
import { SettingsStore, Settings } from './store';
import { Home } from './ui/home';
import { LookEditor } from './ui/lookEditor';
import { SchedulePage } from './ui/schedule';
import { ZonesPage } from './ui/zones';

interface AppContext {
  client: WledClient;
  store: SettingsStore;
  settings: Settings;
  snapshot?: WledSnapshot;
  /** The last refresh failed: snapshot is out of date. */
  offline: boolean;
  refresh: () => Promise<void>;
  toast: (message: string) => void;
  applyLook: (look: Look) => Promise<string[]>;
  /** Writes the schedule (and seasons, if autopilot is on) to the
   * controller, then saves both to settings. */
  saveSchedule: (schedule: Schedule, autopilot: Autopilot | undefined, resave?: boolean) => Promise<ScheduleResult>;
  go: (route: string) => void;
  /** Back to the previous Eaveglow page, or Home if there isn't one (e.g.
   * a home-screen web app that reopened directly on this page). */
  back: () => void;
}

const Ctx = createContext<AppContext>(null as unknown as AppContext);
export const useApp = () => useContext(Ctx);

const route = () => location.hash.replace(/^#/, '') || '/';

export function App() {
  const client = useMemo(() => new WledClient(), []);
  const store = useMemo(() => new SettingsStore(client), [client]);
  const installer = useMemo(
    () => new CustomPaletteInstaller(client, () => store.settings.customPalettes ?? {}, (m) => store.update('customPalettes', m)),
    [client, store],
  );
  const [settings, setSettings] = useState(store.settings);
  const [snapshot, setSnapshot] = useState<WledSnapshot>();
  const [error, setError] = useState<string>();
  const [path, setPath] = useState(route());
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => store.subscribe(() => setSettings(store.settings)), [store]);
  useEffect(() => {
    const onNav = () => {
      setPath(route());
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', onNav);
    addEventListener('popstate', onNav);
    return () => {
      removeEventListener('hashchange', onNav);
      removeEventListener('popstate', onNav);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await client.fetchSnapshot());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);

  // While the controller can't be reached, keep trying quietly.
  useEffect(() => {
    if (!error) return;
    const t = setInterval(() => void refresh(), 10000);
    return () => clearInterval(t);
  }, [error, refresh]);

  useEffect(() => {
    void refresh();
    void store.load().then(() => resync());
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh, store]);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  /** The WLED state that shows a look, installing ★ palettes it needs. */
  const lookState = useCallback(
    async (look: Look, snap: WledSnapshot) => {
      const layout = store.settings.layout ?? { totalPixels: snap.info.ledCount, zones: [] };
      // Install any Eaveglow (★) palettes this look uses; if that's not
      // possible the look falls back to a similar built-in palette.
      const notes: string[] = [];
      let extra: Record<string, number> = {};
      const wanted = customPalettesIn(look.layers.map((l) => l.palette));
      if (wanted.length) {
        const r = await installer.ensure(wanted, paletteSlots(snap.info.ver, snap.info.arch));
        extra = r.ids;
        if (r.failed.length) {
          notes.push(`Couldn't add ${r.failed.map((n) => n.replace('★ ', '')).join(', ')} to your controller (is it PIN-locked?), so a similar built-in color theme is used.`);
        }
      }
      const catalog = new EffectCatalog(snap.effects, snap.palettes, extra);
      const compiled = compileLook(layout, look, catalog, snap.info.maxSegments);
      return { state: toStateJson(compiled, snap.state.seg.length), notes: [...notes, ...compiled.warnings] };
    },
    [store, installer],
  );

  const applyLook = useCallback(
    async (look: Look) => {
      const { state, notes } = await lookState(look, await client.fetchSnapshot());
      await client.setState(state);
      store.update('activeLookId', look.id);
      store.update('recentLooks', [look.id, ...(store.settings.recentLooks ?? []).filter((id) => id !== look.id)].slice(0, 6));
      void refresh();
      return notes;
    },
    [client, store, refresh, lookState],
  );

  const saveSchedule = useCallback(
    async (schedule: Schedule, autopilot: Autopilot | undefined, resave = true) => {
      const plan = autopilot?.enabled && schedule.enabled ? seasonPeriods(autopilot, holidayGroups) : undefined;
      const looks = [...builtinLooks, ...store.settings.customLooks];
      // A deleted custom look falls back to the everyday look.
      const findLook = (id: string) => looks.find((l) => l.id === id) ?? looks.find((l) => l.id === autopilot?.everydayLookId) ?? looks[0];
      const periods = plan?.periods.map((p) => ({ ...p, lookIds: [...new Set(p.lookIds.map((id) => findLook(id).id))] }));
      let snap: WledSnapshot | undefined;
      const r = await applySchedule(
        client,
        schedule,
        browserTimezone(),
        browserUtcOffsetMinutes(),
        new Date(),
        periods && {
          periods,
          resave,
          stateFor: async (id) => (await lookState(findLook(id), (snap ??= await client.fetchSnapshot()))).state,
          nameOf: (id) => findLook(id).name,
        },
      );
      if (r.errors.length) return r;
      store.update('schedule', schedule);
      if (autopilot) store.update('autopilot', { ...autopilot, syncedDates: plan ? datesFingerprint(plan.periods) : undefined });
      void refresh();
      const skipped = plan?.skipped.length ? [`No date is known for ${plan.skipped.join(', ')} this year, so it was skipped.`] : [];
      return { errors: [], warnings: [...skipped, ...r.warnings] };
    },
    [client, store, refresh, lookState],
  );

  // Moving holidays (Easter, Thanksgiving…) fall on different days each
  // year, and WLED's date ranges have no year: re-date the timers when the
  // dates computed today differ from the ones last written.
  const resync = useCallback(async () => {
    const { schedule, autopilot } = store.settings;
    if (!schedule.enabled || !autopilot?.enabled) return;
    if (datesFingerprint(seasonPeriods(autopilot, holidayGroups).periods) === autopilot.syncedDates) return;
    try {
      const r = await saveSchedule(schedule, autopilot, false);
      if (r.errors.length) throw new Error(r.errors.join(' '));
    } catch (e) {
      toast(`🗓 Couldn't update the autopilot dates on your lights: ${e instanceof Error ? e.message : e} Open Schedule and save to try again.`);
    }
  }, [store, saveSchedule, toast]);

  // In-app navigation is marked in history.state, so Back knows whether the
  // previous entry is an Eaveglow page.
  const go = useCallback((r: string) => {
    history.pushState({ eaveglow: true }, '', '#' + r);
    setPath(route());
    window.scrollTo(0, 0);
  }, []);

  const back = useCallback(() => {
    if (history.state?.eaveglow) {
      history.back();
    } else {
      history.replaceState(null, '', '#/');
      setPath('/');
      window.scrollTo(0, 0);
    }
  }, []);

  const ctx: AppContext = { client, store, settings, snapshot, offline: !!error, refresh, toast, applyLook, saveSchedule, go, back };
  const [page, arg] = path.split('/').filter(Boolean);

  return (
    <Ctx.Provider value={ctx}>
      {error && (
        <div class="banner error" role="alert">
          {error}
          {snapshot && ' Showing what the lights were doing last.'} <button class="link" onClick={refresh}>Retry</button>
        </div>
      )}
      {page === 'look' ? (
        <LookEditor lookId={arg === 'new' ? undefined : decodeURIComponent(arg ?? '')} />
      ) : page === 'zones' ? (
        <ZonesPage />
      ) : page === 'schedule' ? (
        <SchedulePage />
      ) : (
        <Home />
      )}
      <div class="toasts">
        {toasts.map((t) => (
          <div key={t.id} class="toast">{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

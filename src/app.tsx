import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { Look, WledSnapshot } from './engine/model';
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
  refresh: () => Promise<void>;
  toast: (message: string) => void;
  applyLook: (look: Look) => Promise<string[]>;
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

  useEffect(() => {
    void refresh();
    void store.load();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh, store]);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const applyLook = useCallback(
    async (look: Look) => {
      const snap = await client.fetchSnapshot();
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
      await client.setState(toStateJson(compiled, snap.state.seg.length));
      store.update('activeLookId', look.id);
      void refresh();
      return [...notes, ...compiled.warnings];
    },
    [client, store, refresh, installer],
  );

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

  const ctx: AppContext = { client, store, settings, snapshot, refresh, toast, applyLook, go, back };
  const [page, arg] = path.split('/').filter(Boolean);

  return (
    <Ctx.Provider value={ctx}>
      {error && !snapshot && (
        <div class="banner error">
          {error} <button class="link" onClick={refresh}>Retry</button>
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

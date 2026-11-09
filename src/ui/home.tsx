import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../app';
import {
  currentPeriod,
  defaultAutopilot,
  describeMonthDay,
  seasonPeriods,
} from '../engine/autopilot';
import { describeTime } from './schedule';
import { fetchWeather } from '../engine/weather';
import { startSoundReactive, stopSoundReactive } from '../engine/soundReactive';
import { byUpcoming, describeDays } from '../engine/holidays';
import { UpdateInfo, checkForUpdate } from '../engine/updates';
import { builtinLooks, holidayGroups, lookCategories, previewColorsFor } from '../engine/library';
import { CUSTOM_CATEGORY, Look } from '../engine/model';
import { Chip, Dialog, Header, StripPreview } from './common';
import { LookGrid } from './home/LookGrid';

const ALL = 'All';

/** 42 min, 1 h, 1 h 30 min */
const describeRemaining = (seconds: number) => {
  const total = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
};
const HOLIDAYS = 'Holidays';

export function Home() {
  const {
    snapshot,
    offline,
    settings,
    refresh,
    applyLook,
    setLights,
    toast,
    go,
    store,
    saveSchedule,
    guest,
  } = useApp();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'auto');

  useEffect(() => {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo>();
  // Only on phones where online update checks were turned on (House zones → About).
  useEffect(() => {
    void checkForUpdate(__APP_VERSION__).then(
      (r) => r.status === 'available' && setUpdate(r.update)
    );
  }, []);
  const [autoWant, setAutoWant] = useState<boolean>();
  const [category, setCategory] = useState(ALL);
  const [holiday, setHoliday] = useState<string>();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [showHidden, setShowHidden] = useState(false);
  const [weather, setWeather] = useState<{ temp: number; description: string } | null>(null);
  const [bri, setBri] = useState<number>();
  const [cct, setCct] = useState<number>();
  const [soundOn, setSoundOn] = useState(false);

  const looks = useMemo(() => [...builtinLooks, ...settings.customLooks], [settings.customLooks]);
  const categories = useMemo(
    () => [ALL, ...(settings.customLooks.length ? [CUSTOM_CATEGORY] : []), ...lookCategories],
    [settings.customLooks.length]
  );
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      looks.filter(
        (l) =>
          (category === ALL || (l.category ?? CUSTOM_CATEGORY) === category) &&
          (category !== HOLIDAYS || !holiday || l.h === holiday) &&
          (!q || l.name.toLowerCase().includes(q)) &&
          (showHidden || !(settings.hiddenLooks ?? []).includes(l.id))
      ),
    [looks, category, holiday, q, showHidden, settings.hiddenLooks]
  );
  const upcoming = useMemo(() => byUpcoming(holidayGroups), []);
  const next = upcoming.find((u) => u.days !== null && u.days <= 45);
  const pickCategory = (c: string, h?: string) => {
    setCategory(c);
    setHoliday(h);
  };
  // In Holidays with no holiday picked, show looks in sections by holiday,
  // soonest first.
  const sections =
    category === HOLIDAYS && !holiday
      ? upcoming
          .map((u) => ({ ...u, looks: shown.filter((l) => l.h === u.group.id) }))
          .filter((s) => s.looks.length)
      : null;
  const auto = settings.autopilot;
  const autoOn = !!auto?.enabled && settings.schedule.enabled;
  const period = useMemo(
    () => (autoOn ? currentPeriod(seasonPeriods(auto!, holidayGroups).periods) : undefined),
    [auto, autoOn]
  );
  const setAutopilot = async (enabled: boolean) => {
    setAutoWant(enabled);
    try {
      const a = { ...(auto ?? defaultAutopilot(holidayGroups, builtinLooks)), enabled };
      const r = await saveSchedule(settings.schedule, a, false);
      toast(
        r.errors.length
          ? r.errors.join(' ')
          : enabled
            ? '🗓 Autopilot is on'
            : 'Autopilot is off; the lights keep their current look.'
      );
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    } finally {
      setAutoWant(undefined);
    }
  };
  const state = snapshot?.state;
  const sleeping = state?.on && state.nl?.on && state.nl.rem > 0 ? state.nl.rem : 0;
  // Keep the "turning off in…" countdown current.
  useEffect(() => {
    if (!sleeping) return;
    const t = setInterval(() => void refresh(), 60000);
    return () => clearInterval(t);
  }, [!!sleeping, refresh]);

  // Weather-based look override + widget (cached 10 min)
  useEffect(() => {
    const loc = settings.schedule?.location;
    if (!loc) return;
    const cacheKey = `weather_${loc.lat}_${loc.lon}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { w, ts } = JSON.parse(cached);
      if (Date.now() - ts < 600000) {
        setWeather({ temp: w.temp, description: w.description });
        return;
      }
    }
    let cancelled = false;
    fetchWeather(loc.lat, loc.lon).then((w) => {
      if (cancelled || !w) return;
      setWeather({ temp: w.temp, description: w.description });
      sessionStorage.setItem(cacheKey, JSON.stringify({ w, ts: Date.now() }));
      const rules = settings.autopilot?.weatherRules ?? [];
      const rule = rules.find((r) => r.enabled && r.condition === w.condition);
      if (rule) {
        const look = [...builtinLooks, ...settings.customLooks].find((l) => l.id === rule.lookId);
        if (look) apply(look);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ') {
        e.preventDefault();
        if (state) setPower(!state.on);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (shown.length === 0) return;
        const currentIdx = shown.findIndex((l) => l.id === settings.activeLookId);
        const nextIdx =
          e.key === 'ArrowRight'
            ? (currentIdx + 1) % shown.length
            : (currentIdx - 1 + shown.length) % shown.length;
        apply(shown[nextIdx]);
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = +e.key - 1;
        if (idx < shown.length) apply(shown[idx]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, shown, settings.activeLookId]);
  const sleep = async (minutes: number | null) => {
    setSleepOpen(false);
    try {
      const problems = await setLights(
        minutes ? { nl: { on: true, dur: minutes, mode: 0, tbri: 0 } } : { nl: { on: false } }
      );
      if (problems.length) toast(problems.join(' '));
      else
        toast(
          minutes
            ? `The lights will turn off in ${minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`}.`
            : 'Sleep timer cancelled.'
        );
      await refresh();
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    }
  };
  const recent = (settings.recentLooks ?? [])
    .map((id) => looks.find((l) => l.id === id))
    .filter((l): l is Look => !!l);
  const layout =
    settings.layout ?? (snapshot ? { totalPixels: snapshot.info.ledCount, zones: [] } : undefined);

  const apply = async (look: Look) => {
    setBusy(look.id);
    try {
      const warnings = await applyLook(look);
      const note =
        autoOn && period
          ? ` Autopilot picks the ${period.key === 'everyday' ? 'everyday' : period.label} look again at Time 1's "on" time.`
          : '';
      toast((warnings.length ? warnings.join(' ') : `${look.emoji} ${look.name} is on!`) + note);
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(undefined);
    }
  };

  const setPower = async (on: boolean) => {
    try {
      const problems = await setLights({ on });
      if (problems.length) toast(problems.join(' '));
      await refresh();
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <main>
      <Header title={snapshot?.info.name ?? 'Eaveglow'}>
        <button class="icon" title="Schedule" onClick={() => go('/schedule')}>
          {settings.schedule.enabled ? '⏰' : '🕒'}
        </button>
        <button class="icon" title="House zones" onClick={() => go('/zones')}>
          🏠
        </button>
        <button
          class="icon"
          title="Theme"
          onClick={() => setTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')}
        >
          {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '⚙️'}
        </button>
        <button class="icon" title="Shows" onClick={() => go('/shows')}>
          🎬
        </button>
        <button class="icon" title="Help" onClick={() => go('/help')}>
          ❓
        </button>
        <button class="icon" title="WLED" onClick={() => (window.location.href = '/')}>
          ↩
        </button>
      </Header>

      {update && (
        <a class="banner action" href={update.url} target="_blank" rel="noopener">
          ✨ Eaveglow {update.version} is available. See what's new and how to update →
        </a>
      )}

      {!settings.layout && snapshot && (
        <button class="banner action" onClick={() => go('/zones')}>
          👋 Set up your house: tell Eaveglow about your roofline and light spacing →
        </button>
      )}

      <section class={'card' + (offline ? ' stale' : '')}>
        <div class="row">
          <span class="big">⏻ Lights</span>
          <input
            type="checkbox"
            role="switch"
            class="power"
            aria-label="Power"
            checked={state?.on ?? false}
            disabled={!state}
            onChange={(e) => setPower(e.currentTarget.checked)}
          />
        </div>
        <div class="row">
          <span>🔅</span>
          <input
            type="range"
            min={1}
            max={255}
            value={bri ?? state?.bri ?? 128}
            disabled={!state}
            onInput={(e) => setBri(+e.currentTarget.value)}
            onChange={async (e) => {
              await setLights({ on: true, bri: +e.currentTarget.value })
                .then((problems) => problems.length && toast(problems.join(' ')))
                .catch((err) => toast(String(err.message ?? err)));
              setBri(undefined);
              await new Promise((r) => setTimeout(r, 500));
              void refresh();
            }}
          />
          <span>🔆</span>
        </div>
        <div class="row presets">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              class="chip"
              disabled={!state}
              onClick={async () => {
                const val = Math.round((pct / 100) * 255);
                await setLights({ on: true, bri: val })
                  .then((problems) => problems.length && toast(problems.join(' ')))
                  .catch((err) => toast(String(err.message ?? err)));
                setBri(undefined);
                await new Promise((r) => setTimeout(r, 500));
                void refresh();
              }}
            >
              {pct}%
            </button>
          ))}
        </div>
        <div class="row">
          <span>🕯️</span>
          <input
            type="range"
            min={0}
            max={255}
            value={cct ?? state?.seg?.[0]?.cct ?? 127}
            disabled={!state}
            onInput={(e) => setCct(+e.currentTarget.value)}
            onChange={async (e) => {
              await setLights({ on: true, seg: [{ cct: +e.currentTarget.value }] })
                .then((problems) => problems.length && toast(problems.join(' ')))
                .catch((err) => toast(String(err.message ?? err)));
              setCct(undefined);
              void refresh();
            }}
          />
          <span>💡</span>
        </div>
        {!guest && (
          <button
            class="chip"
            onClick={async () => {
              if (soundOn) {
                stopSoundReactive();
                setSoundOn(false);
                toast('Sound reactive off');
              } else {
                const ok = await startSoundReactive((bri, cctVal) => {
                  void setLights({ on: true, bri, seg: [{ cct: cctVal }] });
                });
                if (ok) {
                  setSoundOn(true);
                  toast('🎤 Sound reactive on — speak or play music');
                } else {
                  toast('Microphone access denied');
                }
              }
            }}
          >
            {soundOn ? '🎤 Sound reactive ON' : '🎤 Sound reactive'}
          </button>
        )}
        {state?.on && state.bri > 0 && (
          <small class="hint">
            ⚡ ~
            {snapshot?.info.powerMa && snapshot.info.powerMa > 0
              ? Math.round(((snapshot.info.powerMa * (settings.stripVoltage ?? 5)) / 1000) * 10) /
                10
              : Math.round(
                  (snapshot?.info.ledCount ?? layout?.totalPixels ?? 0) * 0.3 * (state.bri / 255)
                )}{' '}
            W
            {snapshot?.info.powerMa && snapshot.info.powerMa > 0
              ? ' (from controller)'
              : ' (estimate)'}
          </small>
        )}
        {weather && (
          <small class="hint">
            🌤 {weather.temp}°F · {weather.description}
          </small>
        )}
        {layout && state && (
          <StripPreview
            layout={layout}
            segments={state.seg}
            previews={state.seg.map((s) =>
              previewColorsFor(
                s.col ?? [],
                snapshot.effects[s.fx ?? 0],
                (s.pal ?? 0) > 0 ? snapshot.palettes[s.pal!] : undefined
              )
            )}
          />
        )}
        {state?.on && (
          <div class="row spread sleep">
            {sleeping ? (
              <>
                <span>🌙 Turning off in {describeRemaining(sleeping)}</span>
                <button class="link" onClick={() => sleep(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button class="link" onClick={() => setSleepOpen(true)}>
                🌙 Sleep timer
              </button>
            )}
          </div>
        )}
        <p class={'sync ' + store.status}>
          {store.status === 'error'
            ? `⚠️ Not saved to the controller: ${store.error}`
            : store.status === 'saving'
              ? 'Saving…'
              : ''}
        </p>
      </section>

      {auto && settings.schedule.enabled && category === ALL && (
        <div class="banner autopilot">
          <span>
            <b>🗓 Autopilot</b>
            <small>
              {autoOn && period
                ? `${period.emoji} ${period.key === 'everyday' ? 'Everyday look' : period.label} until ${describeMonthDay(period.end)}${period.lookIds.length > 1 ? ' · new look each day' : ''}`
                : 'Off: the lights keep whatever look you pick.'}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Seasonal autopilot"
            checked={autoWant ?? autoOn}
            disabled={autoWant !== undefined}
            onChange={(e) => setAutopilot(e.currentTarget.checked)}
          />
        </div>
      )}

      {settings.schedule.enabled && settings.schedule.windows.length > 0 && category === ALL && (
        <div class="banner">
          <span>
            <b>⏰ Next schedule</b>
            <small>
              Lights turn on at {describeTime(settings.schedule.windows[0].on, null)}
              {period
                ? ` · ${period.emoji} ${period.key === 'everyday' ? 'Everyday' : period.label} look`
                : ''}
            </small>
          </span>
        </div>
      )}
      {next &&
        category === ALL &&
        looks.filter((l) => l.h === next.group.id && !(settings.hiddenLooks ?? []).includes(l.id))
          .length > 0 && (
          <button class="banner coming" onClick={() => pickCategory(HOLIDAYS, next.group.id)}>
            <span class="big-emoji">{next.group.emoji}</span>
            <span>
              <b>{next.group.name}</b> is {describeDays(next.days!)}
              <small>
                {
                  looks.filter(
                    (l) => l.h === next.group.id && !(settings.hiddenLooks ?? []).includes(l.id)
                  ).length
                }{' '}
                looks to get ready →
              </small>
            </span>
          </button>
        )}

      {recent.length > 0 && category === ALL && !q && (
        <>
          <h3 class="section">
            <span>Recent</span>
            <button class="link" onClick={() => store.update('recentLooks', [])}>
              Clear
            </button>
          </h3>
          <div class="recent">
            <LookGrid
              looks={recent}
              busy={busy}
              onPick={apply}
              onEdit={(id) => go(`/look/${encodeURIComponent(id)}`)}
            />
          </div>
        </>
      )}

      <div class="row spread">
        <h2>
          Looks <small>{shown.length}</small>
        </h2>
        <button
          class="icon"
          title="Search looks"
          onClick={() => (setSearching(!searching), setQuery(''))}
        >
          {searching ? '✕' : '🔍'}
        </button>
      </div>
      {searching && (
        <input
          class="search"
          autoFocus
          placeholder='Find a look, e.g. "candy"'
          aria-label="Search looks"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      )}
      <div class="chips scroll">
        {categories.map((c) => (
          <Chip key={c} selected={c === category} onClick={() => pickCategory(c)}>
            {c === HOLIDAYS ? '🎉 ' : ''}
            {c}
          </Chip>
        ))}
      </div>
      {category === HOLIDAYS && (
        <div class="chips scroll holidays">
          {upcoming.map(({ group, days }) => (
            <Chip
              key={group.id}
              selected={holiday === group.id}
              onClick={() => setHoliday(holiday === group.id ? undefined : group.id)}
            >
              {group.emoji} {group.name}
              {days !== null && days <= 60 && <small> · {describeDays(days)}</small>}
            </Chip>
          ))}
        </div>
      )}

      {sections ? (
        sections.map((sec) => (
          <section key={sec.group.id}>
            <h3 class="section">
              <span>
                {sec.group.emoji} {sec.group.name}
              </span>
              <small>{sec.days !== null && sec.days <= 60 ? describeDays(sec.days) : ''}</small>
            </h3>
            <LookGrid
              looks={sec.looks}
              busy={busy}
              onPick={apply}
              onEdit={(id) => go(`/look/${encodeURIComponent(id)}`)}
              onHide={(id) => {
                store.update('hiddenLooks', [...(settings.hiddenLooks ?? []), id]);
                if (settings.autopilot) {
                  const auto = settings.autopilot;
                  const cleaned = {
                    ...auto,
                    seasons: auto.seasons.map((s) => ({
                      ...s,
                      lookIds: s.lookIds.filter((lid) => lid !== id),
                    })),
                    dates: auto.dates?.map((d) => ({
                      ...d,
                      lookIds: d.lookIds.filter((lid) => lid !== id),
                    })),
                    everydayLookId:
                      auto.everydayLookId === id ? 'builtin.warm_white' : auto.everydayLookId,
                  };
                  store.update('autopilot', cleaned);
                }
              }}
              onUnhide={(id) =>
                store.update(
                  'hiddenLooks',
                  (settings.hiddenLooks ?? []).filter((x) => x !== id)
                )
              }
            />
          </section>
        ))
      ) : (
        <LookGrid
          looks={shown}
          busy={busy}
          onPick={apply}
          onEdit={(id) => go(`/look/${encodeURIComponent(id)}`)}
          onHide={(id) => {
            store.update('hiddenLooks', [...(settings.hiddenLooks ?? []), id]);
            if (settings.autopilot) {
              const auto = settings.autopilot;
              const cleaned = {
                ...auto,
                seasons: auto.seasons.map((s) => ({
                  ...s,
                  lookIds: s.lookIds.filter((lid) => lid !== id),
                })),
                dates: auto.dates?.map((d) => ({
                  ...d,
                  lookIds: d.lookIds.filter((lid) => lid !== id),
                })),
                everydayLookId:
                  auto.everydayLookId === id ? 'builtin.warm_white' : auto.everydayLookId,
              };
              store.update('autopilot', cleaned);
            }
          }}
          onUnhide={(id) =>
            store.update(
              'hiddenLooks',
              (settings.hiddenLooks ?? []).filter((x) => x !== id)
            )
          }
        />
      )}

      {!guest &&
        (() => {
          const hiddenInCategory = (settings.hiddenLooks ?? []).filter((id) => {
            const look = looks.find((l) => l.id === id);
            if (!look) return false;
            if (category !== ALL && (look.category ?? CUSTOM_CATEGORY) !== category) return false;
            if (category === HOLIDAYS && holiday && look.h !== holiday) return false;
            return true;
          }).length;
          return (
            hiddenInCategory > 0 && (
              <button class="chip" onClick={() => setShowHidden(!showHidden)}>
                {showHidden ? 'Hide hidden' : `Show ${hiddenInCategory} hidden`}
              </button>
            )
          );
        })()}

      {!guest && (
        <button class="fab" onClick={() => go('/look/new')}>
          🎨 Make a look
        </button>
      )}

      <Dialog open={sleepOpen} onClose={() => setSleepOpen(false)}>
        <h2>🌙 Turn off in…</h2>
        <div class="sleep-choices">
          {[30, 60, 120, 240].map((m) => (
            <button key={m} onClick={() => sleep(m)}>
              {m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`}
            </button>
          ))}
        </div>
        <button class="link" onClick={() => setSleepOpen(false)}>
          Never mind
        </button>
      </Dialog>
    </main>
  );
}

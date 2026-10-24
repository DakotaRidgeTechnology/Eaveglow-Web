import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../app';
import { currentPeriod, defaultAutopilot, describeMonthDay, seasonPeriods } from '../engine/autopilot';
import { byUpcoming, describeDays } from '../engine/holidays';
import { UpdateInfo, checkForUpdate } from '../engine/updates';
import { builtinLooks, holidayGroups, lookCategories, lookPreviewColors, previewColorsFor } from '../engine/library';
import { CUSTOM_CATEGORY, Look, isBuiltIn } from '../engine/model';
import { Chip, Dialog, Header, StripPreview, Swatch } from './common';

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
  const { snapshot, offline, settings, client, refresh, applyLook, toast, go, store, saveSchedule } = useApp();
  const [sleepOpen, setSleepOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo>();
  // Only on phones where online update checks were turned on (House zones → About).
  useEffect(() => {
    void checkForUpdate(__APP_VERSION__).then((r) => r.status === 'available' && setUpdate(r.update));
  }, []);
  const [autoWant, setAutoWant] = useState<boolean>();
  const [category, setCategory] = useState(ALL);
  const [holiday, setHoliday] = useState<string>();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [bri, setBri] = useState<number>();

  const looks = useMemo(() => [...builtinLooks, ...settings.customLooks], [settings.customLooks]);
  const categories = [ALL, ...(settings.customLooks.length ? [CUSTOM_CATEGORY] : []), ...lookCategories];
  const q = query.trim().toLowerCase();
  const shown = looks.filter(
    (l) =>
      (category === ALL || (l.category ?? CUSTOM_CATEGORY) === category) &&
      (category !== HOLIDAYS || !holiday || l.group === holiday) &&
      (!q || l.name.toLowerCase().includes(q)),
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
          .map((u) => ({ ...u, looks: shown.filter((l) => l.group === u.group.id) }))
          .filter((s) => s.looks.length)
      : null;
  const auto = settings.autopilot;
  const autoOn = !!auto?.enabled && settings.schedule.enabled;
  const period = useMemo(() => (autoOn ? currentPeriod(seasonPeriods(auto!, holidayGroups).periods) : undefined), [auto, autoOn]);
  const setAutopilot = async (enabled: boolean) => {
    setAutoWant(enabled);
    try {
      const a = { ...(auto ?? defaultAutopilot(holidayGroups, builtinLooks)), enabled };
      const r = await saveSchedule(settings.schedule, a, false);
      toast(r.errors.length ? r.errors.join(' ') : enabled ? '🗓 Autopilot is on' : 'Autopilot is off; the lights keep their current look.');
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
  const sleep = async (minutes: number | null) => {
    setSleepOpen(false);
    try {
      await client.setState(minutes ? { nl: { on: true, dur: minutes, mode: 0, tbri: 0 } } : { nl: { on: false } });
      toast(minutes ? `The lights will turn off in ${minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`}.` : 'Sleep timer cancelled.');
      await refresh();
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    }
  };
  const recent = (settings.recentLooks ?? []).map((id) => looks.find((l) => l.id === id)).filter((l): l is Look => !!l);
  const layout = settings.layout ?? (snapshot ? { totalPixels: snapshot.info.ledCount, zones: [] } : undefined);

  const apply = async (look: Look) => {
    setBusy(look.id);
    try {
      const warnings = await applyLook(look);
      const note = autoOn && period ? ` Autopilot picks the ${period.key === 'everyday' ? 'everyday' : period.label} look again at Time 1's "on" time.` : '';
      toast((warnings.length ? warnings.join(' ') : `${look.emoji} ${look.name} is on!`) + note);
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(undefined);
    }
  };

  const setPower = async (on: boolean) => {
    try {
      await client.setState({ on });
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
        <button class="icon" title="House zones" onClick={() => go('/zones')}>🏠</button>
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
          <input type="checkbox" role="switch" class="power" checked={state?.on ?? false} disabled={!state} onChange={(e) => setPower(e.currentTarget.checked)} />
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
              await client.setState({ on: true, bri: +e.currentTarget.value }).catch((err) => toast(String(err.message ?? err)));
              setBri(undefined);
              void refresh();
            }}
          />
          <span>🔆</span>
        </div>
        {layout && state && (
          <StripPreview
            layout={layout}
            segments={state.seg}
            previews={state.seg.map((s) =>
              previewColorsFor(s.col ?? [], snapshot.effects[s.fx ?? 0], (s.pal ?? 0) > 0 ? snapshot.palettes[s.pal!] : undefined),
            )}
          />
        )}
        {state?.on && (
          <div class="row spread sleep">
            {sleeping ? (
              <>
                <span>🌙 Turning off in {describeRemaining(sleeping)}</span>
                <button class="link" onClick={() => sleep(null)}>Cancel</button>
              </>
            ) : (
              <button class="link" onClick={() => setSleepOpen(true)}>🌙 Sleep timer</button>
            )}
          </div>
        )}
        <p class={'sync ' + store.status}>
          {store.status === 'error' ? `⚠️ Not saved to the controller: ${store.error}` : store.status === 'saving' ? 'Saving…' : ''}
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
          <input type="checkbox" role="switch" aria-label="Seasonal autopilot" checked={autoWant ?? autoOn} disabled={autoWant !== undefined} onChange={(e) => setAutopilot(e.currentTarget.checked)} />
        </div>
      )}

      {next && category === ALL && (
        <button class="banner coming" onClick={() => pickCategory(HOLIDAYS, next.group.id)}>
          <span class="big-emoji">{next.group.emoji}</span>
          <span>
            <b>{next.group.name}</b> is {describeDays(next.days!)}
            <small>{looks.filter((l) => l.group === next.group.id).length} looks to get ready →</small>
          </span>
        </button>
      )}

      {recent.length > 0 && category === ALL && !q && (
        <>
          <h3 class="section"><span>Recent</span></h3>
          <div class="recent">{lookGrid(recent)}</div>
        </>
      )}

      <div class="row spread">
        <h2>
          Looks <small>{shown.length}</small>
        </h2>
        <button class="icon" title="Search looks" onClick={() => (setSearching(!searching), setQuery(''))}>
          {searching ? '✕' : '🔍'}
        </button>
      </div>
      {searching && (
        <input class="search" autoFocus placeholder='Find a look, e.g. "candy"' value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
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
            <Chip key={group.id} selected={holiday === group.id} onClick={() => setHoliday(holiday === group.id ? undefined : group.id)}>
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
              <span>{sec.group.emoji} {sec.group.name}</span>
              <small>{sec.days !== null && sec.days <= 60 ? describeDays(sec.days) : ''}</small>
            </h3>
            {lookGrid(sec.looks)}
          </section>
        ))
      ) : (
        lookGrid(shown)
      )}

      <button class="fab" onClick={() => go('/look/new')}>🎨 Make a look</button>

      <Dialog open={sleepOpen} onClose={() => setSleepOpen(false)}>
        <h2>🌙 Turn off in…</h2>
        <div class="sleep-choices">
          {[30, 60, 120, 240].map((m) => (
            <button key={m} onClick={() => sleep(m)}>{m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`}</button>
          ))}
        </div>
        <button class="link" onClick={() => setSleepOpen(false)}>Never mind</button>
      </Dialog>
    </main>
  );

  function lookGrid(list: Look[]) {
    return (
      <div class="grid">
        {list.map((look) => (
          <div
            key={look.id}
            class={'tile' + (settings.activeLookId === look.id ? ' active' : '')}
            role="button"
            tabIndex={0}
            onClick={() => !busy && apply(look)}
          >
            <div class="tile-top">
              <span class="emoji">{look.emoji}</span>
              {busy === look.id ? (
                <span class="spinner" />
              ) : (
                !isBuiltIn(look) && (
                  <button class="edit" title="Edit" onClick={(e) => (e.stopPropagation(), go(`/look/${encodeURIComponent(look.id)}`))}>
                    ✎
                  </button>
                )
              )}
            </div>
            <span class="name">{look.name}</span>
            <Swatch colors={lookPreviewColors(look)} />
          </div>
        ))}
      </div>
    );
  }
}

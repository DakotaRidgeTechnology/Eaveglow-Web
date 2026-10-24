import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../app';
import { currentPeriod, defaultAutopilot, describeMonthDay, seasonPeriods } from '../engine/autopilot';
import { byUpcoming, describeDays } from '../engine/holidays';
import { builtinLooks, holidayGroups, lookCategories, lookPreviewColors, previewColorsFor } from '../engine/library';
import { CUSTOM_CATEGORY, Look, isBuiltIn } from '../engine/model';
import { Chip, Header, StripPreview, Swatch } from './common';

const ALL = 'All';
const HOLIDAYS = 'Holidays';

export function Home() {
  const { snapshot, settings, client, refresh, applyLook, toast, go, store, saveSchedule } = useApp();
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
      const r = await saveSchedule(settings.schedule, a);
      toast(r.errors.length ? r.errors.join(' ') : enabled ? '🗓 Autopilot is on' : 'Autopilot is off; the lights keep their current look.');
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    } finally {
      setAutoWant(undefined);
    }
  };
  const state = snapshot?.state;
  const layout = settings.layout ?? (snapshot ? { totalPixels: snapshot.info.ledCount, zones: [] } : undefined);

  const apply = async (look: Look) => {
    setBusy(look.id);
    try {
      const warnings = await applyLook(look);
      const note = autoOn && period ? ` Autopilot switches back to ${period.label.toLowerCase()} looks the next time the lights turn on.` : '';
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

      {!settings.layout && snapshot && (
        <button class="banner action" onClick={() => go('/zones')}>
          👋 Set up your house: tell Eaveglow about your roofline and light spacing →
        </button>
      )}

      <section class="card">
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

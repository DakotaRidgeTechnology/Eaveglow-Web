import { useMemo, useState } from 'preact/hooks';
import { useApp } from '../app';
import { builtinLooks, lookCategories, lookPreviewColors, previewColorsFor } from '../engine/library';
import { CUSTOM_CATEGORY, Look, isBuiltIn } from '../engine/model';
import { Chip, Header, StripPreview, Swatch } from './common';

const ALL = 'All';

export function Home() {
  const { snapshot, settings, client, refresh, applyLook, toast, go, store } = useApp();
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [bri, setBri] = useState<number>();

  const looks = useMemo(() => [...builtinLooks, ...settings.customLooks], [settings.customLooks]);
  const categories = [ALL, ...(settings.customLooks.length ? [CUSTOM_CATEGORY] : []), ...lookCategories];
  const q = query.trim().toLowerCase();
  const shown = looks.filter(
    (l) => (category === ALL || (l.category ?? CUSTOM_CATEGORY) === category) && (!q || l.name.toLowerCase().includes(q)),
  );
  const state = snapshot?.state;
  const layout = settings.layout ?? (snapshot ? { totalPixels: snapshot.info.ledCount, zones: [] } : undefined);

  const apply = async (look: Look) => {
    setBusy(look.id);
    try {
      const warnings = await applyLook(look);
      toast(warnings.length ? warnings.join(' ') : `${look.emoji} ${look.name} is on!`);
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
          <Chip key={c} selected={c === category} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <div class="grid">
        {shown.map((look) => (
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

      <button class="fab" onClick={() => go('/look/new')}>🎨 Make a look</button>
    </main>
  );
}

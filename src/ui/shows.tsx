import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../app';
import { builtinLooks } from '../engine/library';
import { Show, newShow } from '../engine/model';
import { Header, Dialog, NumberField } from './common';

export function ShowsPage() {
  const { settings, store, applyLook, toast } = useApp();
  const [shows, setShows] = useState<Show[]>(() => [...(settings.shows ?? [])]);
  const [editing, setEditing] = useState<Show | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const looks = [...builtinLooks, ...settings.customLooks];

  const save = async () => {
    store.update('shows', shows);
    await store.flush();
    toast('Shows saved');
  };

  const addShow = () => {
    const s = newShow();
    setShows([...shows, s]);
    setEditing(s);
  };

  const removeShow = (id: string) => {
    setShows(shows.filter((s) => s.id !== id));
    if (running === id) setRunning(null);
  };

  const updateShow = (updated: Show) => {
    setShows(shows.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(updated);
  };

  // Show runner
  useEffect(() => {
    if (!running) return;
    const show = shows.find((s) => s.id === running);
    if (!show || show.steps.length === 0) {
      setRunning(null);
      return;
    }

    let stepIndex = 0;
    let timer: ReturnType<typeof setTimeout>;

    const runStep = () => {
      const step = show.steps[stepIndex];
      const look = looks.find((l) => l.id === step.lookId);
      if (look) applyLook(look);
      timer = setTimeout(() => {
        stepIndex++;
        if (stepIndex >= show.steps.length) {
          if (show.loop) stepIndex = 0;
          else {
            setRunning(null);
            return;
          }
        }
        runStep();
      }, step.duration * 1000);
    };

    runStep();
    return () => clearTimeout(timer);
  }, [running]);

  return (
    <>
      <Header title="Shows" back />
      <div class="section">
        <p class="hint">
          Choreograph timed sequences of looks. Each step applies a look for a set duration.
        </p>
        {shows.length === 0 && <p class="center">No shows yet. Tap + to create one.</p>}
        {shows.map((show) => (
          <div key={show.id} class="card">
            <div class="row">
              <span class="big-emoji">{show.emoji}</span>
              <span class="name">{show.name}</span>
              <span class="hint">
                {show.steps.length} step{show.steps.length !== 1 ? 's' : ''}
                {show.loop ? ' · loops' : ''}
              </span>
            </div>
            <div class="row">
              <button
                class="primary"
                onClick={() => setRunning(running === show.id ? null : show.id)}
              >
                {running === show.id ? '⏹ Stop' : '▶ Play'}
              </button>
              <button onClick={() => setEditing(show)}>Edit</button>
              <button class="icon" onClick={() => removeShow(show.id)}>
                🗑
              </button>
            </div>
          </div>
        ))}
        <button class="primary" onClick={addShow}>
          + New Show
        </button>
        <button onClick={save}>Save</button>
      </div>

      {editing && (
        <Dialog open={!!editing} onClose={() => setEditing(null)}>
          <h2>Edit Show</h2>
          <input
            class="name-input"
            value={editing.name}
            aria-label="Show name"
            onInput={(e) => updateShow({ ...editing, name: e.currentTarget.value })}
          />
          <h3>Steps</h3>
          {editing.steps.map((step, i) => {
            return (
              <div key={i} class="row">
                <select
                  value={step.lookId}
                  onChange={(e) => {
                    const steps = [...editing.steps];
                    steps[i] = { ...steps[i], lookId: e.currentTarget.value };
                    updateShow({ ...editing, steps });
                  }}
                >
                  {looks.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.emoji} {l.name}
                    </option>
                  ))}
                </select>
                <NumberField
                  value={step.duration}
                  min={1}
                  ariaLabel="Duration in seconds"
                  onChange={(d) => {
                    const steps = [...editing.steps];
                    steps[i] = { ...steps[i], duration: d };
                    updateShow({ ...editing, steps });
                  }}
                />
                <span>s</span>
                <button
                  class="icon"
                  onClick={() => {
                    const steps = editing.steps.filter((_, j) => j !== i);
                    updateShow({ ...editing, steps });
                  }}
                >
                  🗑
                </button>
              </div>
            );
          })}
          <button
            onClick={() => {
              const steps = [...editing.steps, { lookId: looks[0]?.id ?? '', duration: 10 }];
              updateShow({ ...editing, steps });
            }}
          >
            + Add Step
          </button>
          <label class="toggle">
            <span>Loop</span>
            <input
              type="checkbox"
              role="switch"
              checked={editing.loop}
              onChange={(e) => updateShow({ ...editing, loop: e.currentTarget.checked })}
            />
          </label>
          <button class="primary" onClick={() => setEditing(null)}>
            Done
          </button>
        </Dialog>
      )}
    </>
  );
}

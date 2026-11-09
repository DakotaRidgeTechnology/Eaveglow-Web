import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../app';
import { builtinLooks } from '../engine/library';
import { newId } from '../engine/model';
import {
  CANE_COLORS,
  Controller,
  DEFAULT_PER_TREE,
  DEFAULT_STRIPE_WIDTH,
  Prop,
} from '../engine/props';
import { ForeignLedmapError } from '../engine/propSync';
import { Dialog, Header } from './common';
import { PropCard } from './props/PropCard';

interface Output {
  start: number;
  len: number;
}

interface Status {
  online: boolean;
  name?: string;
  ver?: string;
  leds?: number;
  outputs?: Output[];
}

/** Other WLED controllers and the props on them (candy canes, path lights). */
export function PropsPage() {
  const { settings, store, client, propSync, applyLook, toast, back } = useApp();
  const [controllers, setControllers] = useState<Controller[]>(() =>
    structuredClone(settings.controllers ?? [])
  );
  const [props, setProps] = useState<Prop[]>(() => structuredClone(settings.props ?? []));
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [host, setHost] = useState('');
  const [nodes, setNodes] = useState<{ name: string; ip: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [foreign, setForeign] = useState<Controller>();

  const check = async (c: Controller) => {
    const cl = propSync.clientFor(c);
    try {
      const [snap, cfg] = await Promise.all([
        cl.fetchSnapshot(),
        cl.fetchConfig().catch(() => null),
      ]);
      const cfgRecord = (cfg ?? {}) as Record<string, unknown>;
      const ledRecord = (cfgRecord.hw as Record<string, unknown> | undefined)?.led as
        Record<string, unknown> | undefined;
      const ins = (ledRecord?.ins as Record<string, unknown>[] | undefined) ?? [];
      const outputs: Output[] = ins
        .map((o) => ({ start: (o.start as number) ?? 0, len: (o.len as number) ?? 0 }))
        .filter((o) => o.len > 0);
      setStatus((s) => ({
        ...s,
        [c.id]: {
          online: true,
          name: snap.info.name,
          ver: snap.info.ver,
          leds: snap.info.ledCount,
          outputs,
        },
      }));
      return snap;
    } catch {
      setStatus((s) => ({ ...s, [c.id]: { online: false } }));
      return null;
    }
  };

  useEffect(() => {
    controllers.forEach((c) => void check(c));
    client.fetchNodes().then(setNodes);
    const t = setInterval(() => controllers.forEach((c) => void check(c)), 30000);
    return () => clearInterval(t);
  }, []);

  const addController = async (address: string, name?: string) => {
    const h = address
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!h) return;
    if (controllers.some((c) => c.host === h)) return toast('That controller is already added.');
    const c: Controller = { id: newId('c'), name: name ?? h, host: h };
    const snap = await check(c);
    if (!snap)
      return toast(`Couldn't reach a WLED controller at ${h}. Is it on, and on the same network?`);
    setControllers([...controllers, { ...c, name: name ?? snap.info.name ?? h }]);
    setHost('');
  };

  const setProp = (p: Prop) => setProps(props.map((x) => (x.id === p.id ? p : x)));
  const addProp = (c: Controller, kind: Prop['kind']) => {
    const outputs = status[c.id]?.outputs ?? [];
    const used = new Set(props.filter((p) => p.controllerId === c.id).map((p) => p.start));
    const out = outputs.find((o) => !used.has(o.start)) ?? {
      start: 0,
      len: status[c.id]?.leds ?? 0,
    };
    setProps([
      ...props,
      kind === 'candyCanes'
        ? {
            id: newId('p'),
            name: 'Candy canes',
            kind,
            controllerId: c.id,
            start: out.start,
            count: 1,
            stripeWidth: DEFAULT_STRIPE_WIDTH,
            colors: [...CANE_COLORS] as Prop['colors'],
          }
        : kind === 'trees'
          ? {
              id: newId('p'),
              name: 'Trees',
              kind,
              controllerId: c.id,
              start: out.start,
              count: Math.max(1, Math.floor(out.len / DEFAULT_PER_TREE)),
              perTree: DEFAULT_PER_TREE,
            }
          : {
              id: newId('p'),
              name: 'Path lights',
              kind,
              controllerId: c.id,
              start: out.start,
              count: out.len || 1,
            },
    ]);
  };

  const save = async (replaceForeignMap = false) => {
    setSaving(true);
    try {
      const incomplete = props.find((p) => p.kind === 'candyCanes' && !p.model);
      if (incomplete) return toast(`Add the xLights model file for "${incomplete.name}" first.`);
      const kept = props.filter((p) => controllers.some((c) => c.id === p.controllerId));
      store.update('controllers', controllers);
      store.update('props', kept);
      for (const c of controllers) {
        const mine = kept.filter((p) => p.controllerId === c.id);
        const leds = status[c.id]?.leds;
        if (!mine.length || !leds) continue;
        try {
          await propSync.ensureLedmap(c, mine, leds, replaceForeignMap);
        } catch (e) {
          if (e instanceof ForeignLedmapError) return setForeign(c);
          throw e;
        }
      }
      const active = [...builtinLooks, ...settings.customLooks].find(
        (l) => l.id === settings.activeLookId
      );
      const notes = active ? await applyLook(active) : [];
      toast(notes.length ? `Props saved. ${notes.join(' ')}` : 'Props saved.');
      back();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main>
      <Header title="Props" back />
      <p class="hint">
        Props like candy canes and path lights can be on another WLED controller. Eaveglow sends
        each controller its own part of every look, and writes your schedule and autopilot to all of
        them.
      </p>

      <div class="row">
        <button
          class="primary"
          onClick={async () => {
            const active = [...builtinLooks, ...settings.customLooks].find(
              (l) => l.id === settings.activeLookId
            );
            if (!active) return toast('No active look to sync');
            setSaving(true);
            try {
              await applyLook(active);
              toast('Synced to all controllers');
            } catch (e) {
              toast(String(e instanceof Error ? e.message : e));
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
        >
          {saving ? 'Syncing…' : '🔄 Sync all controllers'}
        </button>
      </div>

      {controllers.map((c) => {
        const st = status[c.id];
        const mine = props.filter((p) => p.controllerId === c.id);
        return (
          <section class="card controller" key={c.id}>
            <div class="row spread">
              <b>{c.name}</b>
              <button
                class="icon"
                title="Remove controller"
                onClick={() => setControllers(controllers.filter((x) => x.id !== c.id))}
              >
                🗑
              </button>
            </div>
            <small class={'hint' + (st && !st.online ? ' warn' : '')}>
              {c.host} ·{' '}
              {!st
                ? 'Checking…'
                : st.online
                  ? `WLED ${st.ver} · ${st.leds} lights`
                  : "Can't reach it right now"}
            </small>
            {mine.map((p) => (
              <PropCard
                key={p.id}
                prop={p}
                outputs={st?.outputs ?? []}
                onChange={setProp}
                onRemove={() => setProps(props.filter((x) => x.id !== p.id))}
              />
            ))}
            <div class="row">
              <button onClick={() => addProp(c, 'candyCanes')}>＋ Candy canes</button>
              <button onClick={() => addProp(c, 'pathLights')}>＋ Path lights</button>
              <button onClick={() => addProp(c, 'trees')}>＋ Trees</button>
            </div>
          </section>
        );
      })}

      <section class="card">
        <b>Add a controller</b>
        <div class="row">
          <input
            placeholder="IP address, e.g. 10.0.70.12"
            value={host}
            inputMode="decimal"
            aria-label="Controller IP address"
            onInput={(e) => setHost(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && addController(host)}
          />
          <button onClick={() => addController(host)}>Add</button>
        </div>
        {nodes
          .filter((n) => !controllers.some((c) => c.host === n.ip))
          .map((n) => (
            <div class="row spread" key={n.ip}>
              <span>
                {n.name} <small class="hint">{n.ip}</small>
              </span>
              <button onClick={() => addController(n.ip, n.name)}>Add</button>
            </div>
          ))}
        <p class="hint">
          Give each controller a fixed IP address (a DHCP reservation on your router) so Eaveglow
          can always find it.
        </p>
      </section>

      <div class="buttons">
        <button class="primary" disabled={saving} onClick={() => save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <Dialog open={!!foreign} onClose={() => setForeign(undefined)}>
        <h2>Replace the LED map?</h2>
        <p>
          {foreign?.name} already has a custom LED map (ledmap.json) that Eaveglow didn't make.
          Candy cane stripes need Eaveglow's own map. A copy of the old one is kept as
          ledmap-backup.json.
        </p>
        <div class="buttons">
          <button class="primary" onClick={() => (setForeign(undefined), save(true))}>
            Replace it
          </button>
          <button onClick={() => setForeign(undefined)}>Cancel</button>
        </div>
      </Dialog>
    </main>
  );
}

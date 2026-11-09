import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../app';
import { builtinLooks } from '../engine/library';
import { newId } from '../engine/model';
import { CANE_COLORS, Controller, DEFAULT_PER_TREE, DEFAULT_STRIPE_WIDTH, Prop, lightsEach, propLength, stripeBands } from '../engine/props';
import { ForeignLedmapError } from '../engine/propSync';
import { PropModel, parseXModel } from '../engine/xmodel';
import { Dialog, Header, NumberField, css, hexToRgb, rgbToHex } from './common';

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
  const [controllers, setControllers] = useState<Controller[]>(() => structuredClone(settings.controllers ?? []));
  const [props, setProps] = useState<Prop[]>(() => structuredClone(settings.props ?? []));
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [host, setHost] = useState('');
  const [nodes, setNodes] = useState<{ name: string; ip: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [foreign, setForeign] = useState<Controller>();

  const check = async (c: Controller) => {
    const cl = propSync.clientFor(c);
    try {
      const [snap, cfg] = await Promise.all([cl.fetchSnapshot(), cl.fetchConfig().catch(() => null)]);
      const outputs: Output[] = (cfg?.hw?.led?.ins ?? []).map((o: any) => ({ start: o.start ?? 0, len: o.len ?? 0 })).filter((o: Output) => o.len > 0);
      setStatus((s) => ({ ...s, [c.id]: { online: true, name: snap.info.name, ver: snap.info.ver, leds: snap.info.ledCount, outputs } }));
      return snap;
    } catch {
      setStatus((s) => ({ ...s, [c.id]: { online: false } }));
      return null;
    }
  };

  useEffect(() => {
    controllers.forEach((c) => void check(c));
    client.fetchNodes().then(setNodes);
  }, []);

  const addController = async (address: string, name?: string) => {
    const h = address.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!h) return;
    if (controllers.some((c) => c.host === h)) return toast('That controller is already added.');
    const c: Controller = { id: newId('c'), name: name ?? h, host: h };
    const snap = await check(c);
    if (!snap) return toast(`Couldn't reach a WLED controller at ${h}. Is it on, and on the same network?`);
    setControllers([...controllers, { ...c, name: name ?? snap.info.name ?? h }]);
    setHost('');
  };

  const setProp = (p: Prop) => setProps(props.map((x) => (x.id === p.id ? p : x)));
  const addProp = (c: Controller, kind: Prop['kind']) => {
    const outputs = status[c.id]?.outputs ?? [];
    const used = new Set(props.filter((p) => p.controllerId === c.id).map((p) => p.start));
    const out = outputs.find((o) => !used.has(o.start)) ?? { start: 0, len: status[c.id]?.leds ?? 0 };
    setProps([
      ...props,
      kind === 'candyCanes'
        ? { id: newId('p'), name: 'Candy canes', kind, controllerId: c.id, start: out.start, count: 1, stripeWidth: DEFAULT_STRIPE_WIDTH, colors: [...CANE_COLORS] as Prop['colors'] }
        : kind === 'trees'
          ? { id: newId('p'), name: 'Trees', kind, controllerId: c.id, start: out.start, count: Math.max(1, Math.floor(out.len / DEFAULT_PER_TREE)), perTree: DEFAULT_PER_TREE }
          : { id: newId('p'), name: 'Path lights', kind, controllerId: c.id, start: out.start, count: out.len || 1 },
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
      const active = [...builtinLooks, ...settings.customLooks].find((l) => l.id === settings.activeLookId);
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
        Props like candy canes and path lights can be on another WLED controller. Eaveglow sends each controller its own
        part of every look, and writes your schedule and autopilot to all of them.
      </p>

      {controllers.map((c) => {
        const st = status[c.id];
        const mine = props.filter((p) => p.controllerId === c.id);
        return (
          <section class="card controller" key={c.id}>
            <div class="row spread">
              <b>{c.name}</b>
              <button class="icon" title="Remove controller" onClick={() => setControllers(controllers.filter((x) => x.id !== c.id))}>🗑</button>
            </div>
            <small class={'hint' + (st && !st.online ? ' warn' : '')}>
              {c.host} · {!st ? 'Checking…' : st.online ? `WLED ${st.ver} · ${st.leds} lights` : "Can't reach it right now"}
            </small>
            {mine.map((p) => (
              <PropCard key={p.id} prop={p} outputs={st?.outputs ?? []} onChange={setProp} onRemove={() => setProps(props.filter((x) => x.id !== p.id))} />
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
          <input placeholder="IP address, e.g. 10.0.70.12" value={host} inputMode="decimal" onInput={(e) => setHost(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && addController(host)} />
          <button onClick={() => addController(host)}>Add</button>
        </div>
        {nodes.filter((n) => !controllers.some((c) => c.host === n.ip)).map((n) => (
          <div class="row spread" key={n.ip}>
            <span>{n.name} <small class="hint">{n.ip}</small></span>
            <button onClick={() => addController(n.ip, n.name)}>Add</button>
          </div>
        ))}
        <p class="hint">Give each controller a fixed IP address (a DHCP reservation on your router) so Eaveglow can always find it.</p>
      </section>

      <div class="buttons">
        <button class="primary" disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <Dialog open={!!foreign} onClose={() => setForeign(undefined)}>
        <h2>Replace the LED map?</h2>
        <p>
          {foreign?.name} already has a custom LED map (ledmap.json) that Eaveglow didn't make. Candy cane stripes need
          Eaveglow's own map. A copy of the old one is kept as ledmap-backup.json.
        </p>
        <div class="buttons">
          <button class="primary" onClick={() => (setForeign(undefined), save(true))}>Replace it</button>
          <button onClick={() => setForeign(undefined)}>Cancel</button>
        </div>
      </Dialog>
    </main>
  );
}

function PropCard(props: { prop: Prop; outputs: Output[]; onChange: (p: Prop) => void; onRemove: () => void }) {
  const { prop: p, outputs, onChange } = props;
  const { toast } = useApp();
  const perProp = lightsEach(p);
  const output = outputs.find((x) => x.start === p.start);
  const pickOutput = (start: number) => {
    const o = outputs.find((x) => x.start === start);
    onChange({ ...p, start, count: o && perProp ? Math.max(1, Math.floor(o.len / perProp)) : p.count });
  };
  const loadModel = async (f: File | undefined) => {
    if (!f) return;
    try {
      const model = parseXModel(await f.text());
      const o = outputs.find((x) => x.start === p.start);
      onChange({ ...p, model, count: o ? Math.max(1, Math.floor(o.len / model.nodes.length)) : p.count });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div class="prop">
      <div class="row">
        <span class="big-emoji">{p.kind === 'candyCanes' ? '🍭' : p.kind === 'trees' ? '🎄' : '🔦'}</span>
        <input class="name-input" value={p.name} onInput={(e) => onChange({ ...p, name: e.currentTarget.value })} />
        <button class="icon" title="Remove prop" onClick={props.onRemove}>🗑</button>
      </div>
      {outputs.length > 0 && (
        <select aria-label={`${p.name} output`} value={p.start} onChange={(e) => pickOutput(+e.currentTarget.value)}>
          {outputs.map((o, i) => (
            <option key={o.start} value={o.start}>Output {i + 1}: {o.len} lights</option>
          ))}
        </select>
      )}
      <label class="row brightness">
        <span>🔅</span>
        <input
          type="range"
          min={1}
          max={100}
          aria-label={`${p.name} brightness`}
          value={p.brightness ?? 100}
          onInput={(e) => onChange({ ...p, brightness: +e.currentTarget.value })}
        />
        <span class="pct">{p.brightness ?? 100}%</span>
      </label>
      {p.kind === 'trees' ? (
        <>
          <div class="row">
            <NumberField value={p.count} min={1} ariaLabel={`${p.name} count`} onChange={(count) => onChange({ ...p, count })} />
            <span>trees ×</span>
            <NumberField value={p.perTree ?? DEFAULT_PER_TREE} min={1} ariaLabel={`${p.name} lights per tree`} onChange={(perTree) => onChange({ ...p, perTree })} />
            <span>lights</span>
          </div>
          <small class="hint">
            {propLength(p)} lights{output ? ` of ${output.len} on this output` : ''}. Each tree shows its own copy of the current look.
            {output && propLength(p) > output.len ? ' That is more than this output has: check the numbers.' : ''}
          </small>
        </>
      ) : p.kind === 'candyCanes' ? (
        <>
          <label class="field">
            <small>xLights model of one cane (.xmodel, from the prop maker)</small>
            <input type="file" accept=".xmodel,text/xml" aria-label={`${p.name} model file`} onChange={(e) => loadModel(e.currentTarget.files?.[0])} />
          </label>
          {p.model && (
            <>
              <small class="hint">
                {p.model.name}: {p.model.nodes.length} lights per cane · {p.count} cane{p.count === 1 ? '' : 's'} = {propLength(p)} lights
              </small>
              <div class="row">
                <span>Canes</span>
                <NumberField value={p.count} min={1} ariaLabel={`${p.name} count`} onChange={(count) => onChange({ ...p, count })} />
                <span>Stripes</span>
                {(p.colors ?? CANE_COLORS).map((c, i) => (
                  <input
                    key={i}
                    type="color"
                    aria-label={`Stripe color ${i + 1}`}
                    value={rgbToHex(c)}
                    onChange={(e) => {
                      const colors = [...(p.colors ?? CANE_COLORS)] as Prop['colors'] & object;
                      colors[i] = hexToRgb(e.currentTarget.value);
                      onChange({ ...p, colors });
                    }}
                  />
                ))}
              </div>
              <div class="row cane-row">
                <CanePreview model={p.model} width={p.stripeWidth ?? DEFAULT_STRIPE_WIDTH} colors={p.colors ?? CANE_COLORS} />
                <label class="field">
                  <small>Stripe width</small>
                  <input type="range" min={2} max={12} value={p.stripeWidth ?? DEFAULT_STRIPE_WIDTH} onInput={(e) => onChange({ ...p, stripeWidth: +e.currentTarget.value })} />
                </label>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div class="row">
            <span>Use the first</span>
            <NumberField value={p.count} min={1} ariaLabel={`${p.name} count`} onChange={(count) => onChange({ ...p, count: output ? Math.min(count, output.len) : count })} />
            <span>{output ? `of ${output.len} lights on this output` : 'lights'}</span>
          </div>
          <small class="hint">
            They follow the current look.
            {output && p.count < output.len ? ` The other ${output.len - p.count} lights on this output (e.g. arches) are turned off by Eaveglow's looks.` : ''}
          </small>
        </>
      )}
    </div>
  );
}

function CanePreview(props: { model: PropModel; width: number; colors: [number, number, number][] }) {
  const bands = useMemo(() => stripeBands(props.model, props.width), [props.model, props.width]);
  const { width, height, nodes } = props.model;
  return (
    <svg class="cane" viewBox={`-1 -1 ${width + 1} ${height + 1}`} role="img" aria-label="Stripe preview">
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.9} fill={css(props.colors[bands[i]])} />
      ))}
    </svg>
  );
}

import { useMemo } from 'preact/hooks';
import { useApp } from '../../app';
import {
  CANE_COLORS,
  DEFAULT_PER_TREE,
  DEFAULT_STRIPE_WIDTH,
  Prop,
  lightsEach,
  propLength,
  stripeBands,
} from '../../engine/props';
import { PropModel, parseXModel } from '../../engine/xmodel';
import { NumberField, css, hexToRgb, rgbToHex } from '../common';

interface Output {
  start: number;
  len: number;
}

interface PropCardProps {
  prop: Prop;
  outputs: Output[];
  onChange: (p: Prop) => void;
  onRemove: () => void;
}

export function PropCard({ prop: p, outputs, onChange, onRemove }: PropCardProps) {
  const { toast } = useApp();
  const perProp = lightsEach(p);
  const output = outputs.find((x) => x.start === p.start);
  const pickOutput = (start: number) => {
    const o = outputs.find((x) => x.start === start);
    onChange({
      ...p,
      start,
      count: o && perProp ? Math.max(1, Math.floor(o.len / perProp)) : p.count,
    });
  };
  const loadModel = async (f: File | undefined) => {
    if (!f) return;
    try {
      const model = parseXModel(await f.text());
      const o = outputs.find((x) => x.start === p.start);
      onChange({
        ...p,
        model,
        count: o ? Math.max(1, Math.floor(o.len / model.nodes.length)) : p.count,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div class="prop">
      <div class="row">
        <span class="big-emoji">
          {p.kind === 'candyCanes' ? '🍭' : p.kind === 'trees' ? '🎄' : '🔦'}
        </span>
        <input
          class="name-input"
          value={p.name}
          onInput={(e) => onChange({ ...p, name: e.currentTarget.value })}
        />
        <button class="icon" title="Remove prop" onClick={onRemove}>
          🗑
        </button>
      </div>
      {outputs.length > 0 && (
        <select
          aria-label={`${p.name} output`}
          value={p.start}
          onChange={(e) => pickOutput(+e.currentTarget.value)}
        >
          {outputs.map((o, i) => (
            <option key={o.start} value={o.start}>
              Output {i + 1}: {o.len} lights
            </option>
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
            <NumberField
              value={p.count}
              min={1}
              ariaLabel={`${p.name} count`}
              onChange={(count) => onChange({ ...p, count })}
            />
            <span>trees ×</span>
            <NumberField
              value={p.perTree ?? DEFAULT_PER_TREE}
              min={1}
              ariaLabel={`${p.name} lights per tree`}
              onChange={(perTree) => onChange({ ...p, perTree })}
            />
            <span>lights</span>
          </div>
          <small class="hint">
            {propLength(p)} lights{output ? ` of ${output.len} on this output` : ''}. Each tree
            shows its own copy of the current look.
            {output && propLength(p) > output.len
              ? ' That is more than this output has: check the numbers.'
              : ''}
          </small>
        </>
      ) : p.kind === 'candyCanes' ? (
        <>
          <label class="field">
            <small>xLights model of one cane (.xmodel, from the prop maker)</small>
            <input
              type="file"
              accept=".xmodel,text/xml"
              aria-label={`${p.name} model file`}
              onChange={(e) => loadModel(e.currentTarget.files?.[0])}
            />
          </label>
          {p.model && (
            <>
              <small class="hint">
                {p.model.name}: {p.model.nodes.length} lights per cane · {p.count} cane
                {p.count === 1 ? '' : 's'} = {propLength(p)} lights
              </small>
              <div class="row">
                <span>Canes</span>
                <NumberField
                  value={p.count}
                  min={1}
                  ariaLabel={`${p.name} count`}
                  onChange={(count) => onChange({ ...p, count })}
                />
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
                <CanePreview
                  model={p.model}
                  width={p.stripeWidth ?? DEFAULT_STRIPE_WIDTH}
                  colors={p.colors ?? CANE_COLORS}
                />
                <label class="field">
                  <small>Stripe width</small>
                  <input
                    type="range"
                    min={2}
                    max={12}
                    value={p.stripeWidth ?? DEFAULT_STRIPE_WIDTH}
                    onInput={(e) => onChange({ ...p, stripeWidth: +e.currentTarget.value })}
                  />
                </label>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div class="row">
            <span>Use the first</span>
            <NumberField
              value={p.count}
              min={1}
              ariaLabel={`${p.name} count`}
              onChange={(count) =>
                onChange({ ...p, count: output ? Math.min(count, output.len) : count })
              }
            />
            <span>{output ? `of ${output.len} lights on this output` : 'lights'}</span>
          </div>
          <small class="hint">
            They follow the current look.
            {output && p.count < output.len
              ? ` The other ${output.len - p.count} lights on this output (e.g. arches) are turned off by Eaveglow's looks.`
              : ''}
          </small>
        </>
      )}
    </div>
  );
}

export function CanePreview({
  model,
  width,
  colors,
}: {
  model: PropModel;
  width: number;
  colors: [number, number, number][];
}) {
  const bands = useMemo(() => stripeBands(model, width), [model, width]);
  return (
    <svg
      class="cane"
      viewBox={`-1 -1 ${model.width + 1} ${model.height + 1}`}
      role="img"
      aria-label="Stripe preview"
    >
      {model.nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.9} fill={css(colors[bands[i]])} />
      ))}
    </svg>
  );
}

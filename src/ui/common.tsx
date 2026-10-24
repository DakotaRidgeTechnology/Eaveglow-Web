import { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../app';
import { BLACK, HouseLayout, LightSpacing, Rgb, SPACING_PRESETS, WledSegment, effectiveZones, rgbEquals, spacingEquals } from '../engine/model';

export const css = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`;

export const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
export const rgbToHex = (c: Rgb) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

export function Header(props: { title: string; back?: boolean; children?: ComponentChildren }) {
  const { back } = useApp();
  return (
    <header class="bar">
      {props.back && (
        <button class="icon back" aria-label="Back" onClick={back}>
          ‹
        </button>
      )}
      <h1>{props.title}</h1>
      <div class="actions">{props.children}</div>
    </header>
  );
}

export function Chip(props: { selected?: boolean; onClick: () => void; children: ComponentChildren; title?: string }) {
  return (
    <button class={'chip' + (props.selected ? ' on' : '')} onClick={props.onClick} title={props.title} aria-pressed={props.selected}>
      {props.children}
    </button>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: ComponentChildren; hint?: string }) {
  return (
    <label class="toggle">
      <span>
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function Swatch(props: { colors: Rgb[]; size?: number }) {
  return (
    <span class="swatch">
      {props.colors.slice(0, 5).map((c, i) => (
        <i key={i} style={{ background: css(c), width: props.size ?? 11, height: props.size ?? 11 }} />
      ))}
    </span>
  );
}

export const GradientBar = (props: { colors: Rgb[] }) => (
  <span
    class="gradient"
    style={{ background: props.colors.length > 1 ? `linear-gradient(90deg,${props.colors.map(css).join(',')})` : css(props.colors[0]) }}
  />
);

/** The roofline drawn pixel by pixel so spacing (1 on, 3 off) is visible. */
export function StripPreview(props: { layout: HouseLayout; segments: WledSegment[]; previews?: Rgb[][]; showZones?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const total = Math.max(1, props.layout.totalPixels);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d')!;
    g.scale(dpr, dpr);
    g.fillStyle = '#151515';
    g.fillRect(0, 0, w, h);
    const px = w / total;
    props.segments.forEach((seg, s) => {
      if (seg.on === false) return;
      const colors = (props.previews?.[s] ?? seg.col ?? []).filter((c) => !rgbEquals(c, BLACK));
      if (!colors.length) return;
      const lit = Math.max(1, seg.grp ?? 1);
      const period = lit + Math.max(0, seg.spc ?? 0);
      const spaced = period > lit;
      const virtualLen = Math.max(1, Math.ceil(((seg.stop - seg.start) / period) * lit));
      const band = spaced ? 1 : Math.max(1, Math.floor(virtualLen / (colors.length * 4)));
      for (let p = seg.start; p < seg.stop && p < total; p++) {
        const rel = p - seg.start;
        const within = rel % period;
        if (within >= lit) continue;
        const v = Math.floor(rel / period) * lit + within;
        g.fillStyle = css(colors[Math.floor(v / band) % colors.length]);
        if (px >= 4) {
          g.beginPath();
          g.arc(p * px + px / 2, h / 2, Math.min(px * 0.42, h * 0.3), 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(p * px, 3, px + 0.5, h - 6); // inset: the dark track frames white on a white card
      }
    });
  });
  return (
    <div class="strip">
      <canvas ref={ref} />
      {props.showZones !== false && props.layout.zones.length > 0 && (
        <div class="zone-labels">
          {effectiveZones(props.layout).map((z) => (
            <span key={z.id} style={{ left: `${(z.start / total) * 100}%`, width: `${(z.length / total) * 100}%` }}>
              {z.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SpacingPicker(props: { value: LightSpacing; onChange: (s: LightSpacing) => void; inches?: number }) {
  const { value, onChange, inches } = props;
  const fmt = (i: number) => (i >= 24 ? `${+(i / 12).toFixed(1)} ft` : `${+i.toFixed(1)} in`);
  const step = (field: 'lit' | 'skip', d: number) => {
    const next = { ...value, [field]: Math.max(field === 'lit' ? 1 : 0, Math.min(50, value[field] + d)) };
    onChange(next);
  };
  return (
    <div class="spacing">
      <div class="chips">
        {SPACING_PRESETS.map(([label, s]) => (
          <Chip key={label} selected={spacingEquals(s, value)} onClick={() => onChange(s)}>
            {label}
          </Chip>
        ))}
      </div>
      <div class="steppers">
        {(['lit', 'skip'] as const).map((f) => (
          <div class="stepper" key={f}>
            <small>{f === 'lit' ? 'Lights on' : 'Lights off'}</small>
            <button onClick={() => step(f, -1)} aria-label="Fewer">−</button>
            <b>{value[f]}</b>
            <button onClick={() => step(f, 1)} aria-label="More">+</button>
          </div>
        ))}
      </div>
      {inches ? (
        <p class="hint">
          {value.skip === 0 && value.lit === 1
            ? `Every light is used (${fmt(inches)} apart).`
            : `From the street, lit lights will be about ${fmt(inches * (value.lit + value.skip))} apart.`}
        </p>
      ) : null}
    </div>
  );
}

/** Native <dialog> wrapper. */
export function Dialog(props: { open: boolean; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);
  return (
    <dialog ref={ref} onClose={props.onClose} onClick={(e) => e.target === ref.current && props.onClose()}>
      {props.open && props.children}
    </dialog>
  );
}

/** A whole-number field that lets you clear it and type freely; the value
 * is applied as soon as it's valid and restored on blur if left invalid. */
export function NumberField(props: { value: number; min?: number; onChange: (n: number) => void; class?: string; ariaLabel?: string }) {
  const min = props.min ?? 0;
  const [text, setText] = useState(String(props.value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(props.value));
  }, [props.value, focused]);
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      class={props.class}
      aria-label={props.ariaLabel}
      value={focused ? text : String(props.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onInput={(e) => {
        const t = e.currentTarget.value.replace(/[^0-9]/g, '');
        setText(t);
        const n = parseInt(t, 10);
        if (!isNaN(n) && n >= min) props.onChange(n);
      }}
    />
  );
}

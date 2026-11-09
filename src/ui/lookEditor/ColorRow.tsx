import { Rgb, rgbEquals } from '../../engine/model';
import { css } from '../common';

interface ColorRowProps {
  title: string;
  colors: { name: string; rgb: Rgb }[];
  selected: Rgb[];
  onToggle: (c: Rgb) => void;
}

export function ColorRow({ title, colors, selected, onToggle }: ColorRowProps) {
  return (
    <>
      <h4>{title}</h4>
      <div class="dots">
        {colors.map((c) => {
          const on = selected.some((s) => rgbEquals(s, c.rgb));
          return (
            <button
              key={c.name}
              class={'dot' + (on ? ' on' : '')}
              style={{ background: css(c.rgb) }}
              title={c.name}
              aria-label={c.name}
              onClick={() => onToggle(c.rgb)}
            >
              {on ? '✓' : ''}
            </button>
          );
        })}
      </div>
    </>
  );
}

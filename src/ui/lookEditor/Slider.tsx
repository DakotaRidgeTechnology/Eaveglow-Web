interface SliderProps {
  label: string;
  left: string;
  right: string;
  value: number;
  onChange: (v: number) => void;
}

export function Slider({ label, left, right, value, onChange }: SliderProps) {
  return (
    <>
      <h3>{label}</h3>
      <div class="row">
        <span>{left}</span>
        <input
          type="range"
          min={0}
          max={255}
          value={value}
          onInput={(e) => onChange(+e.currentTarget.value)}
        />
        <span>{right}</span>
      </div>
    </>
  );
}

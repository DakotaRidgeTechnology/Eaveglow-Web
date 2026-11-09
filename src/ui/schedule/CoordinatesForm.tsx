import { useState } from 'preact/hooks';
import { GeoLocation } from '../../engine/model';

export function CoordinatesForm({ onSet }: { onSet: (l: GeoLocation) => void }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const ok = Math.abs(+lat) <= 90 && Math.abs(+lon) <= 180 && lat !== '' && lon !== '';
  return (
    <div class="row">
      <input
        inputMode="decimal"
        placeholder="Latitude"
        value={lat}
        onInput={(e) => setLat(e.currentTarget.value)}
      />
      <input
        inputMode="decimal"
        placeholder="Longitude"
        value={lon}
        onInput={(e) => setLon(e.currentTarget.value)}
      />
      <button
        disabled={!ok}
        onClick={() =>
          onSet({ lat: +lat, lon: +lon, label: `${(+lat).toFixed(3)}, ${(+lon).toFixed(3)}` })
        }
      >
        Set
      </button>
    </div>
  );
}

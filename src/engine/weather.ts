/** Free weather via Open-Meteo (no key, CORS-friendly). */

export type WeatherCondition = 'rain' | 'snow' | 'clear' | 'cloudy' | 'storm';

export interface CurrentWeather {
  condition: WeatherCondition;
  temp: number;
  description: string;
}

const CODE_MAP: Record<number, WeatherCondition> = {
  0: 'clear',
  1: 'clear',
  2: 'cloudy',
  3: 'cloudy',
  45: 'cloudy',
  48: 'cloudy',
  51: 'rain',
  53: 'rain',
  55: 'rain',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  80: 'rain',
  81: 'rain',
  82: 'rain',
  85: 'snow',
  86: 'snow',
  95: 'storm',
  96: 'storm',
  99: 'storm',
};

const DESC: Record<WeatherCondition, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Storm',
};

export async function fetchWeather(lat: number, lon: number): Promise<CurrentWeather | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m&temperature_unit=fahrenheit`
    );
    if (!res.ok) return null;
    const j = await res.json();
    const code = j.current?.weather_code ?? 0;
    const temp = j.current?.temperature_2m ?? 0;
    const condition = CODE_MAP[code] ?? 'cloudy';
    return { condition, temp: Math.round(temp), description: DESC[condition] };
  } catch {
    return null;
  }
}

// Sunrise/sunset with the same algorithm as WLED (wled00/ntp.cpp
// getSunriseUTC), so the times shown match what the controller uses.

const ZENITH = -0.83;
const DEG = Math.PI / 180;
const fmod = (a: number, b: number) => a - b * Math.trunc(a / b);

function sunriseUtcMinutes(year: number, month: number, day: number, lat: number, lon: number, sunset: boolean): number | null {
  const n1 = Math.floor((275 * month) / 9);
  const n2 = Math.floor((month + 9) / 12);
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const n = n1 - n2 * n3 + day - 30;
  const lngHour = lon / 15;
  const t = n + ((sunset ? 18 : 6) - lngHour) / 24;
  const m = 0.9856 * t - 3.289;
  const l = fmod(m + 1.916 * Math.sin(DEG * m) + 0.02 * Math.sin(2 * DEG * m) + 282.634, 360);
  let ra = fmod(Math.atan(0.91764 * Math.tan(DEG * l)) / DEG, 360);
  ra += Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90;
  ra /= 15;
  const sinDec = 0.39782 * Math.sin(DEG * l);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.sin(DEG * ZENITH) - sinDec * Math.sin(DEG * lat)) / (cosDec * Math.cos(DEG * lat));
  if (Math.abs(cosH) > 1) return null;
  let h = sunset ? Math.acos(cosH) / DEG : 360 - Math.acos(cosH) / DEG;
  h /= 15;
  const tt = h + ra - 0.06571 * t - 6.622;
  return Math.trunc(fmod(tt - lngHour, 24) * 60);
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
}

/** Sunrise and sunset on `date` (null in polar day/night). */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  const at = (sunset: boolean): Date | null => {
    for (let retry = 0; retry <= 3; retry++) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() - retry));
      const minutes = sunriseUtcMinutes(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), lat, lon, sunset);
      if (minutes === null) continue;
      const m = minutes < 0 ? minutes + 24 * 60 : minutes;
      return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) + m * 60000);
    }
    return null;
  };
  return { sunrise: at(false), sunset: at(true) };
}

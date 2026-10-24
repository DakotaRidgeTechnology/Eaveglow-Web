// Optional, off by default: once a day, ask GitHub whether a newer Eaveglow
// release exists. This is the only thing that leaves the local network, and
// only on phones where it's turned on. Settings stay per device.
export const RELEASES = 'https://github.com/DakotaRidgeTechnology/Eaveglow-Web/releases/latest';
const API = 'https://api.github.com/repos/DakotaRidgeTechnology/Eaveglow-Web/releases/latest';
const KEY = 'eaveglow.updates';
const DAY = 86400000;

export interface UpdateInfo {
  version: string;
  url: string;
}

interface Stored {
  enabled: boolean;
  checkedAt?: number;
  latest?: UpdateInfo;
}

/** 1.10.0 > 1.9.2; a leading "v" is ignored. */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

function read(): Stored {
  try {
    return { enabled: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { enabled: false };
  }
}

function write(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: checks just won't be remembered
  }
}

export const updateChecksEnabled = () => read().enabled;
export const setUpdateChecks = (enabled: boolean) => write({ ...read(), enabled });

export type UpdateCheck = { status: 'off' | 'current' | 'failed' } | { status: 'available'; update: UpdateInfo };

/** Asks GitHub for the latest release, at most once a day unless `force`. */
export async function checkForUpdate(current: string, force = false, fetchImpl: typeof fetch = (...a) => fetch(...a), now = Date.now()): Promise<UpdateCheck> {
  const s = read();
  if (!s.enabled) return { status: 'off' };
  const verdict = (latest?: UpdateInfo): UpdateCheck =>
    latest && isNewer(latest.version, current) ? { status: 'available', update: latest } : { status: 'current' };
  if (!force && s.checkedAt && now - s.checkedAt < DAY) return verdict(s.latest);
  try {
    const res = await fetchImpl(API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return { status: 'failed' };
    const json = await res.json();
    const latest = { version: String(json.tag_name ?? '').replace(/^v/, ''), url: json.html_url ?? RELEASES };
    write({ ...s, checkedAt: now, latest });
    return verdict(latest);
  } catch {
    return { status: 'failed' };
  }
}

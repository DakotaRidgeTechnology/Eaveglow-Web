// A downloadable copy of everything set up in Eaveglow (/eaveglow.json),
// for when the controller is wiped or replaced. WLED's own backup doesn't
// include it.
import type { Settings } from '../store';

export interface Backup {
  app: 'eaveglow';
  version: 1;
  savedAt: string;
  settings: Settings;
}

/** Leaves out what belongs to one controller: palette file slots, and the
 * dates last written to its timers (so a restore rewrites them). */
export function makeBackup(settings: Settings, now = new Date()): Backup {
  const { customPalettes: _slots, ...rest } = structuredClone(settings);
  if (rest.autopilot) delete rest.autopilot.syncedDates;
  return { app: 'eaveglow', version: 1, savedAt: now.toISOString(), settings: rest as Settings };
}

export const backupFileName = (now = new Date()) =>
  `eaveglow-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;

const isSettings = (s: any) => s && typeof s === 'object' && (Array.isArray(s.customLooks) || (s.schedule && typeof s.schedule === 'object'));

/** Reads a backup, or a plain /eaveglow.json downloaded from WLED's /edit. */
export function readBackup(text: string): { settings: Settings; savedAt?: string; summary: string } {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("That file isn't an Eaveglow backup.");
  }
  const settings = json?.app === 'eaveglow' ? json.settings : json;
  if (!isSettings(settings)) throw new Error("That file isn't an Eaveglow backup.");
  return { settings: { ...settings, version: 1 }, savedAt: json.savedAt, summary: describe(settings) };
}

function describe(s: Settings): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return [
    n(s.customLooks?.length ?? 0, 'custom look'),
    s.layout ? n(s.layout.zones.length, 'house part') : 'no house setup',
    `schedule ${s.schedule?.enabled ? 'on' : 'off'}`,
    ...(s.autopilot ? [`autopilot ${s.autopilot.enabled ? 'on' : 'off'}`] : []),
  ].join(' · ');
}

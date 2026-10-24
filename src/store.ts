// Settings shared by everyone in the house: saved as /eaveglow.json on the
// controller (WLED's file system), with a local copy so the page opens fast.
import { Autopilot } from './engine/autopilot';
import { HouseLayout, Look, Rgb, Schedule, initialSchedule } from './engine/model';
import { WledClient } from './engine/wledClient';

export const SETTINGS_FILE = '/eaveglow.json';
const LOCAL_KEY = 'eaveglow.settings';

export interface Settings {
  version: 1;
  layout?: HouseLayout;
  customLooks: Look[];
  schedule: Schedule;
  recentColors: Rgb[];
  activeLookId?: string;
  /** Eaveglow (★) palettes installed on the controller: name → file slot. */
  customPalettes?: Record<string, number>;
  /** Seasonal autopilot (looks by date); unset until first opened. */
  autopilot?: Autopilot;
}

type Key = keyof Omit<Settings, 'version'>;

export const defaultSettings = (): Settings => ({
  version: 1,
  customLooks: [],
  schedule: initialSchedule(),
  recentColors: [],
});

const normalize = (s: any): Settings => ({ ...defaultSettings(), ...(s && typeof s === 'object' ? s : {}), version: 1 });

function readLocal(): Settings | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(s: Settings) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
  } catch {
    // private mode or storage blocked: the controller copy still works
  }
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Holds settings and syncs them with the controller. Each change records
 * which keys were edited; on save the file is re-read and only those keys
 * are written over it, so two phones editing different things don't clash.
 */
export class SettingsStore {
  settings: Settings;
  status: SyncStatus = 'idle';
  error?: string;
  private dirty = new Set<Key>();
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private flushing?: Promise<void>;

  constructor(private client: WledClient, private delayMs = 600) {
    this.settings = readLocal() ?? defaultSettings();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /** Loads the shared copy from the controller. */
  async load() {
    try {
      const remote = await this.client.readFile(SETTINGS_FILE);
      if (remote) {
        const merged = normalize(remote);
        for (const k of this.dirty) (merged as any)[k] = this.settings[k];
        this.settings = merged;
        writeLocal(this.settings);
        this.emit();
      }
    } catch {
      // offline: keep the local copy
    }
  }

  update<K extends Key>(key: K, value: Settings[K]) {
    this.settings = { ...this.settings, [key]: value };
    this.dirty.add(key);
    writeLocal(this.settings);
    this.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Writes pending changes to the controller now. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.flushing) await this.flushing;
    if (this.dirty.size === 0) return;
    const keys = [...this.dirty];
    this.dirty.clear();
    this.status = 'saving';
    this.emit();
    this.flushing = (async () => {
      try {
        const remote = normalize(await this.client.readFile(SETTINGS_FILE));
        const merged: Settings = { ...remote };
        for (const k of keys) (merged as any)[k] = this.settings[k];
        // Keep anything edited while we were saving.
        for (const k of this.dirty) (merged as any)[k] = this.settings[k];
        await this.client.uploadFile(SETTINGS_FILE, JSON.stringify(merged));
        this.settings = merged;
        writeLocal(merged);
        this.status = 'saved';
        this.error = undefined;
      } catch (e) {
        for (const k of keys) this.dirty.add(k);
        this.status = 'error';
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.flushing = undefined;
        this.emit();
      }
    })();
    return this.flushing;
  }
}

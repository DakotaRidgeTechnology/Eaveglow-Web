// Minimal WLED JSON API client. The page is served by the controller, so
// requests go to the same origin by default.
import { WledSnapshot, WledState, parseSnapshot, parseState } from './model';

export class WledError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export class WledClient {
  /** `base` is '' (same origin) or e.g. 'http://192.168.1.50'. */
  constructor(readonly base = '', private fetchImpl: typeof fetch = (...a) => fetch(...a)) {}

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.base + path, { ...init, signal: AbortSignal.timeout?.(6000) });
    } catch {
      throw new WledError("Couldn't reach your lights. Are you on the same Wi-Fi?");
    }
    if (res.status === 401) {
      throw new WledError("Your controller's settings are locked with a PIN. Unlock them in WLED (Config → Security) and try again.", 401);
    }
    if (!res.ok && res.status !== 404) throw new WledError(`Your lights answered with an error (${res.status}).`, res.status);
    return res;
  }

  private async json(path: string, init?: RequestInit): Promise<any> {
    const res = await this.request(path, init);
    if (res.status === 404) throw new WledError('Not found', 404);
    return res.json();
  }

  fetchSnapshot = async (): Promise<WledSnapshot> => parseSnapshot(await this.json('/json'));

  fetchState = async (): Promise<WledState> => parseState(await this.json('/json/state'));

  setState = async (state: object): Promise<WledState> =>
    parseState(
      await this.json('/json/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state, v: true }),
      }),
    );

  fetchConfig = () => this.json('/json/cfg');

  setConfig = (cfg: object) =>
    this.json('/json/cfg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });

  /** Presets keyed by id; {} if none exist yet. */
  async fetchPresets(): Promise<Record<string, any>> {
    try {
      return await this.json('/presets.json');
    } catch (e) {
      if (e instanceof WledError && e.status === 404) return {};
      throw e;
    }
  }

  /** Reads a JSON file from the controller's filesystem, or null. */
  async readFile(path: string): Promise<any | null> {
    const res = await this.request(path, { cache: 'no-store' });
    if (res.status === 404) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  /** Writes a file to the controller's filesystem (WLED's /upload). */
  async uploadFile(path: string, content: string | Blob, type = 'application/json') {
    const form = new FormData();
    const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
    form.append('data', blob, path);
    await this.request('/upload', { method: 'POST', body: form });
  }

  setTime = (date: Date) => this.setState({ time: Math.floor(date.getTime() / 1000) });

  /** Other WLED controllers this one knows about (`/json/nodes`). */
  async fetchNodes(): Promise<{ name: string; ip: string }[]> {
    try {
      const j = await this.json('/json/nodes');
      return (j.nodes ?? []).map((n: any) => ({ name: n.name ?? n.ip, ip: n.ip }));
    } catch {
      return [];
    }
  }
}

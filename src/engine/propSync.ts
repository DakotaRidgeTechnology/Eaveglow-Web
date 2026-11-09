// Drives the other WLED controllers (props) alongside the main one. Each
// controller gets segments worked out for its own pixels, so spacing and
// layouts never have to match (unlike WLED Sync).
import { Look, WledSnapshot } from './model';
import {
  Controller,
  LEDMAP_NAME,
  Prop,
  buildLedmap,
  compileController,
  isIdentity,
  ledmapFile,
} from './props';
import { EffectCatalog, toStateJson } from './segmentCompiler';
import { WledClient } from './wledClient';

export const LEDMAP = '/ledmap.json';
export const LEDMAP_BACKUP = '/ledmap-backup.json';

export interface PropSetup {
  controllers: Controller[];
  props: Prop[];
}

export type Outcome = { controller: Controller; error?: string };

export class PropSync {
  private clients = new Map<string, WledClient>();
  /** Pixel maps known to be on each controller this session. */
  private synced = new Map<string, string>();

  constructor(
    private setup: () => PropSetup,
    private makeClient: (host: string) => WledClient = (host) =>
      new WledClient(`http://${host}`, undefined, 5000)
  ) {}

  clientFor(c: Controller): WledClient {
    const key = c.host;
    let client = this.clients.get(key);
    if (!client) this.clients.set(key, (client = this.makeClient(c.host)));
    return client;
  }

  /** Controllers that have props (the main one isn't listed here). */
  active(): { controller: Controller; props: Prop[] }[] {
    const { controllers, props } = this.setup();
    return controllers
      .map((controller) => ({
        controller,
        props: props.filter((p) => p.controllerId === controller.id),
      }))
      .filter((x) => x.props.length);
  }

  /**
   * The state that shows `look` on a controller's props. Uploads the pixel
   * map first when the canes changed. A ledmap.json that isn't Eaveglow's is
   * only replaced with `replaceForeignMap` (a copy is kept).
   */
  async stateFor(
    c: Controller,
    props: Prop[],
    look: Look,
    snap?: WledSnapshot,
    replaceForeignMap = false
  ) {
    const client = this.clientFor(c);
    snap ??= await client.fetchSnapshot();
    await this.ensureLedmap(c, props, snap.info.ledCount, replaceForeignMap);
    const catalog = new EffectCatalog(snap.effects, snap.palettes);
    const compiled = compileController(
      props,
      look,
      catalog,
      snap.info.ledCount,
      snap.info.maxSegments
    );
    return toStateJson(
      { ...compiled, previewColors: [] },
      Math.max(snap.state.seg.length, snap.info.maxSegments)
    );
  }

  async ensureLedmap(c: Controller, props: Prop[], totalPixels: number, replaceForeign = false) {
    const ledmap = buildLedmap(totalPixels, props);
    const file = ledmapFile(ledmap);
    if (this.synced.get(c.id) === file) return;
    const client = this.clientFor(c);
    const current = (await client.readFile(LEDMAP).catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const ours = !current || current.n === LEDMAP_NAME;
    if (current && JSON.stringify(current.map) === JSON.stringify(ledmap.map)) {
      this.synced.set(c.id, file);
      return;
    }
    if (!current && isIdentity(ledmap)) {
      this.synced.set(c.id, file);
      return;
    }
    if (!ours) {
      if (!replaceForeign) throw new ForeignLedmapError(c);
      await client.uploadFile(LEDMAP_BACKUP, JSON.stringify(current));
    }
    await client.uploadFile(LEDMAP, file);
    await client.setState({ ledmap: 0 });
    this.synced.set(c.id, file);
  }

  /** Does `fn` on every prop controller at once; one failing doesn't stop the others. */
  async each(
    fn: (c: Controller, client: WledClient, props: Prop[]) => Promise<unknown>
  ): Promise<Outcome[]> {
    return Promise.all(
      this.active().map(async ({ controller, props }) => {
        try {
          await fn(controller, this.clientFor(controller), props);
          return { controller };
        } catch (e) {
          return { controller, error: e instanceof Error ? e.message : String(e) };
        }
      })
    );
  }

  applyLook = (look: Look) =>
    this.each(async (c, client, props) => client.setState(await this.stateFor(c, props, look)));

  setState = (state: object) => this.each((_, client) => client.setState(state));
}

export class ForeignLedmapError extends Error {
  constructor(readonly controller: Controller) {
    super(
      `${controller.name} already has a custom LED map (ledmap.json). Open Props to replace it.`
    );
  }
}

/** "Props (10.0.70.12): couldn't reach…" for each controller that failed. */
export const describeFailures = (outcomes: Outcome[]) =>
  outcomes
    .filter((o) => o.error)
    .map((o) => `${o.controller.name} (${o.controller.host}): ${o.error}`);

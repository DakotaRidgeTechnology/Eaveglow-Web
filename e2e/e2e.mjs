// End-to-end check in headless Chromium against the mock controller:
// node e2e/e2e.mjs (after npm run build). Saves screenshots to e2e/shots/.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startMockWled } from '../scripts/mock-wled.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const shots = new URL('./shots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const mock = startMockWled(8099);
// A second controller for props: 2 six-light test canes on output 1, 5 path lights on output 2.
const props = startMockWled(8096, { leds: 17, name: 'Props', outputs: [[0, 12], [12, 5]] });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures++;
};

try {
  {
    // Regression: opening #/zones directly used to show 150 instead of the
    // controller's count, and changing the total didn't resize the part.
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(`${mock.url}/eaveglow.htm#/zones`);
    await page.waitForTimeout(600);
    check((await page.getByLabel('Number of lights').inputValue()) === '200', 'zones page uses the controller LED count');
    await page.getByLabel('Number of lights').fill('120');
    check((await page.getByLabel('Roofline lights').inputValue()) === '120', 'changing the total resizes the house part');
    // Regression: a home-screen web app can reopen straight on a page with no
    // Eaveglow page behind it; Back must go Home instead of doing nothing.
    await page.goto(`${mock.url}/eaveglow.htm#/schedule`);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForTimeout(300);
    check((await page.locator('header h1').innerText()) === 'Roofline' && page.url().startsWith(mock.url), 'Back on a directly opened page goes Home');
    await page.context().close();
  }
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
    await page.goto(`${mock.url}/eaveglow.htm`);
    await page.waitForSelector('.tile');
    await page.screenshot({ path: `${shots}home-${scheme}.png` });
    check(errors.length === 0, `${scheme}: no page errors ${errors.join(' | ')}`);
    if (scheme === 'dark') break;

    // Holidays: the coming-up card opens that holiday; a ★ palette look
    // installs its palette on the controller.
    const card = page.locator('.banner.coming');
    if (await card.count()) {
      await card.click();
      await page.screenshot({ path: `${shots}holidays.png` });
    }
    await page.getByRole('button', { name: /^🎉 Holidays/ }).click();
    await page.locator('.chips.holidays .chip', { hasText: 'Halloween' }).click();
    await page.getByText('Candy Corn', { exact: true }).click();
    await page.waitForSelector('.tile.active');
    await page.waitForTimeout(800);
    const ccPost = mock.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1);
    check(!!mock.files['/palette0.json'] && JSON.parse(mock.files['/palette0.json']).n === '★ Candy Corn', 'Candy Corn palette installed as /palette0.json');
    check(ccPost?.body.seg[0].pal === 200, 'look uses the custom palette (id 200)');
    await page.getByRole('button', { name: /^All/ }).click();

    // Apply a look.
    await page.getByText('Candy Cane', { exact: true }).click();
    await page.locator('.tile.active', { has: page.getByText('Candy Cane', { exact: true }) }).first().waitFor();
    const lookPost = mock.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1);
    const fxNames = JSON.parse((await import('node:fs')).readFileSync(new URL('./wled16-effects.json', import.meta.url)));
    check(!!lookPost && fxNames[lookPost.body.seg[0].fx] === 'Railway', 'applying Candy Cane sends the Railway effect to WLED');
    await page.evaluate(() => window.scrollTo(0, 0));
    check((await page.locator('.recent .tile .name').first().innerText()) === 'Candy Cane', 'Recent row shows the last look');

    // Sleep timer (WLED nightlight).
    await page.getByText('Sleep timer').click();
    await page.getByRole('button', { name: '1 hour', exact: true }).click();
    await page.getByText('Turning off in 1 h', { exact: false }).waitFor();
    check(mock.log.some((l) => l.body?.nl?.dur === 60 && l.body.nl.tbri === 0), 'sleep timer sends nightlight for 60 min');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByText('Sleep timer cancelled').waitFor();
    check(mock.log.filter((l) => l.body?.nl).at(-1).body.nl.on === false, 'sleep timer can be cancelled');

    // House zones: spacing every 4th, 3" apart, save → /eaveglow.json on the controller.
    await page.getByTitle('House zones').click();
    await page.getByLabel('Roofline lights').fill('150');
    await page.getByText('Add a part').click();
    await page.locator('.zone .name-input').last().fill('Garage');
    await page.getByText('3"').click();
    await page.getByRole('button', { name: 'Every 4th' }).click();
    await page.screenshot({ path: `${shots}zones.png`, fullPage: true });
    check(await page.getByText('about 12 in apart').isVisible(), 'street distance shown for 3" spacing, every 4th');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1200);
    const saved = mock.files['/eaveglow.json'] && JSON.parse(mock.files['/eaveglow.json']);
    check(saved?.layout?.spacing?.skip === 3 && saved.layout.inchesBetweenLights === 3 && saved.layout.zones.length === 2, 'settings (2 parts, spacing) saved to the controller');

    // Re-apply: spacing reaches WLED as spc.
    await page.getByText('Warm White').first().click();
    await page.waitForTimeout(500);
    const warm = mock.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1);
    check(warm.body.seg[0].spc === 3, 'house spacing applied to looks (spc 3)');

    // Magic Icicles: dim base on every lit light, a twinkling overlay on every 4th lit one.
    await page.locator('.tile', { has: page.getByText('Magic Icicles', { exact: true }) }).first().click();
    await page.locator('.tile.active', { has: page.getByText('Magic Icicles', { exact: true }) }).first().waitFor();
    const icy = mock.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1).body.seg.filter((x) => x.stop);
    check(
      icy.length === 2 && fxNames[icy[0].fx] === 'Solid' && icy[0].spc === 3 && fxNames[icy[1].fx] === 'Fairytwinkle' && icy[1].spc === 15 && icy[1].start === icy[0].start,
      `Magic Icicles: ${icy.map((x) => `${fxNames[x.fx]} spc ${x.spc}`).join(', ')}`,
    );

    // Make a custom look.
    await page.getByText('Make a look').click();
    await page.locator('.name-input').fill('Team Spirit');
    await page.getByRole('button', { name: 'Twinkle', exact: false }).first().click();
    await page.getByRole('button', { name: 'Gold' }).click();
    // Different look for one part: Candy Cane on the garage only.
    await page.getByText('Different look for a part').click();
    const part = page.locator('.part-edit');
    await part.getByRole('button', { name: 'Garage' }).click();
    await part.getByRole('button', { name: 'Roofline' }).click();
    await part.locator('select').selectOption({ label: '🍭 Candy Cane' });
    await page.screenshot({ path: `${shots}editor.png`, fullPage: true });
    await page.getByText('Save & turn on').click();
    await page.waitForSelector('.tile.active');
    await page.waitForTimeout(1000);
    const mixed = mock.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1).body.seg.filter((x) => x.stop);
    const fxAt = (start) => fxNames[mixed.find((x) => x.start === start)?.fx];
    check(mixed.length === 2 && fxAt(0) !== fxAt(150) && fxAt(150) === 'Railway', `different look per part: roofline ${fxAt(0)}, garage ${fxAt(150)}`);
    const custom = JSON.parse(mock.files['/eaveglow.json']).customLooks;
    check(custom.length === 1 && custom[0].name === 'Team Spirit', 'custom look saved to the controller');

    // A second "phone" sees the same settings.
    const page2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page2.goto(`${mock.url}/eaveglow.htm`);
    await page2.waitForSelector('.tile');
    await page2.waitForTimeout(500);
    check(await page2.getByText('Team Spirit').first().isVisible(), 'a second phone sees the custom look');

    // Schedule: turn on, two windows, save → WLED timers.
    await page.getByTitle('Schedule').click();
    await page.locator('.card .toggle input').first().check();
    await page.getByText('Add another time').click();
    await page.screenshot({ path: `${shots}schedule.png`, fullPage: true });
    await page.getByText('Save to my lights').click();
    await page.getByText('Schedule saved').waitFor();
    const cfgPost = mock.log.filter((l) => l.path === '/json/cfg').at(-1).body;
    const timers = cfgPost.timers.ins.map((t) => [t.hour, t.min]);
    check(JSON.stringify(timers) === JSON.stringify([[19, 0], [22, 0], [4, 0], [6, 0]]), `timers replaced: ${JSON.stringify(timers)}`);
    check(cfgPost.hw?.led?.rgbwm === 3 && cfgPost.light?.gc?.bri === 1, 'unrelated WLED settings preserved');
    check(Object.values(mock.presets).some((p) => p.n === 'Eaveglow: Lights On'), 'On/Off presets created');
    const backup = mock.files['/eaveglow-timers-backup.json'];
    check(scheme !== 'light' || (!!backup && JSON.parse(backup).timers[0].macro === 3), 'the old "Morning" WLED timer was backed up');

    if (scheme === 'light') {
      // Seasonal autopilot: looks by date, a different one each day.
      await page.getByRole('button', { name: 'OK', exact: true }).click();
      const before = JSON.stringify(mock.state.seg);
      await page.locator('.autopilot .toggle input').check();
      await page.getByText('Add a date').click();
      await page.getByPlaceholder('Game day, birthday…').fill('Game day');
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${shots}autopilot.png`, fullPage: true });
      await page.getByText('Save to my lights').click();
      await page.getByText('Schedule saved').waitFor({ timeout: 20000 });
      const ins = mock.log.filter((l) => l.path === '/json/cfg').at(-1).body.timers.ins;
      const oct = ins.filter((t) => t.start.mon === 10 && t.start.day === 1 && t.hour === 19);
      check(await page.getByText(/📅 Game day,/).isVisible(), 'special date (today) shows in the saved schedule');
      check(oct.length > 1 && new Set(oct.map((t) => t.macro)).size === oct.length && oct.reduce((m, t) => m | t.dow, 0) === 127, `Halloween rotates ${oct.length} looks by day`);
      check(ins.length <= 64 && ins.filter((t) => t.hour === 4).length === 1, `${ins.length} timers fit; Time 2 just turns on`);
      const season = Object.values(mock.presets).filter((p) => p.n?.startsWith('Eaveglow season: '));
      check(season.length > 5 && season.every((p) => p.on && p.seg?.length), `${season.length} season presets saved`);
      check(oct.every((t) => mock.presets[t.macro]?.n?.startsWith('Eaveglow season: ')), 'season timers call season presets');
      check(JSON.stringify(mock.state.seg) === before, 'lights put back after saving presets');
      await page.getByRole('button', { name: 'OK', exact: true }).click();
      await page.getByRole('button', { name: 'Back' }).click();
      const sw = page.getByLabel('Seasonal autopilot');
      await sw.waitFor();
      check(await sw.isChecked(), 'Home shows autopilot on');
      await page.screenshot({ path: `${shots}home-autopilot.png` });
      await sw.uncheck();
      await page.getByText('Autopilot is off').waitFor({ timeout: 20000 });
      const offIns = mock.log.filter((l) => l.path === '/json/cfg').at(-1).body.timers.ins;
      check(offIns.length === 4 && offIns[0].start.mon === 1 && offIns[0].end.mon === 12, 'autopilot toggle off: back to plain on/off timers');
      await page.waitForTimeout(1500); // settings save is debounced
      check(JSON.parse(mock.files['/eaveglow.json']).autopilot?.enabled === false, 'autopilot setting saved');

      // Restore the timers WLED had before Eaveglow.
      await page.getByTitle('Schedule').click();
      await page.getByText('Restore the WLED timers you had before Eaveglow').click();
      await page.getByRole('button', { name: 'Restore', exact: true }).click();
      await page.getByText('Your old WLED timers are back').waitFor();
      const restored = mock.log.filter((l) => l.path === '/json/cfg').at(-1).body.timers.ins;
      check(restored.length === 1 && restored[0].macro === 3 && restored[0].hour === 7, 'old WLED timers restored');
      await page.getByRole('button', { name: 'Back' }).click();

      // Backup: download, lose the custom look, restore it from the file.
      await page.getByTitle('House zones').click();
      check(await page.getByText(/^Eaveglow \d+\.\d+\.\d+$/).isVisible(), 'About shows the app version');
      check(!(await page.getByRole('switch', { name: /Check online for updates/ }).isChecked()), 'online update checks are off by default');
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Download backup').click()]);
      const backupPath = `${shots}backup.json`;
      await download.saveAs(backupPath);
      const backupJson = JSON.parse((await import('node:fs')).readFileSync(backupPath, 'utf8'));
      check(download.suggestedFilename().startsWith('eaveglow-backup-') && backupJson.settings.customLooks[0]?.name === 'Team Spirit', 'backup downloads with the custom look');
      const wiped = JSON.parse(mock.files['/eaveglow.json']);
      mock.files['/eaveglow.json'] = JSON.stringify({ ...wiped, customLooks: [] });
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForTimeout(800);
      await page.locator('input[aria-label="Backup file"]').setInputFiles(backupPath);
      await page.getByText('1 custom look', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Restore', exact: true }).click();
      await page.getByText('Backup restored', { exact: false }).waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);
      check(JSON.parse(mock.files['/eaveglow.json']).customLooks[0]?.name === 'Team Spirit', 'restoring the backup brings the custom look back');

      // Props on another controller: candy canes (striped by a pixel map) and path lights.
      await page.getByTitle('House zones').click();
      await page.getByText('Props & other controllers').click();
      await page.getByPlaceholder('IP address').fill('localhost:8096');
      await page.getByRole('button', { name: 'Add', exact: true }).first().click();
      await page.getByText('WLED 16.0.1 · 17 lights').waitFor();
      await page.getByText('＋ Candy canes').click();
      await page.locator('input[aria-label="Candy canes model file"]').setInputFiles(new URL('./test-cane.xmodel', import.meta.url).pathname);
      await page.getByText('Test Cane: 6 lights per cane · 2 canes = 12 lights').waitFor();
      await page.getByText('＋ Path lights').click();
      // Only the first 3 lights of the 5 on output 2 are path lights (the rest, e.g. arches, stay off).
      await page.getByLabel('Path lights count').fill('3');
      await page.getByText('The other 2 lights on this output', { exact: false }).waitFor();
      await page.screenshot({ path: `${shots}props.png`, fullPage: true });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText('Props saved', { exact: false }).waitFor({ timeout: 20000 });
      const ledmap = JSON.parse(props.files['/ledmap.json'] ?? '{}');
      check(ledmap.n === 'Eaveglow' && ledmap.map?.length === 17 && new Set(ledmap.map).size === 17 && props.state.ledmapLoads >= 1, `prop controller got a full pixel map: ${JSON.stringify(ledmap.map)}`);
      const propSeg = props.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1)?.body.seg.filter((x) => x.stop) ?? [];
      const red = propSeg.find((x) => x.start === 0);
      const white = propSeg.find((x) => x.start === red?.stop);
      check(JSON.stringify(red?.col) === '[[255,0,0]]' && JSON.stringify(white?.col) === '[[220,235,255]]' && white.stop === 12, 'candy canes: red and cool white stripe segments');
      check(propSeg.some((x) => x.start === 12 && x.stop === 15 && x.on), 'path lights (first 3 of output 2) follow the look');
      const offSeg = props.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1)?.body.seg.find((x) => x.start === 15);
      check(offSeg?.stop === 17 && offSeg.on === false, 'the rest of output 2 is turned off');
      check(JSON.stringify(mock.state.seg) !== '[]', 'main controller still has its look');

      // The schedule goes to the prop controller too.
      await page.getByRole('button', { name: 'Back', exact: true }).click(); // House zones → Home
      await page.getByTitle('Schedule').click();
      await page.locator('.card .toggle input').first().check(); // turned off by "restore old timers" above
      await page.getByText('Save to my lights').click();
      await page.getByText('Schedule saved').waitFor({ timeout: 20000 });
      check(props.log.some((l) => l.path === '/json/cfg' && l.body.timers?.ins?.length), 'schedule written to the prop controller');
      await page.getByRole('button', { name: 'OK', exact: true }).click();
      await page.getByRole('button', { name: 'Back' }).click();

      // Prop controller offline: the main lights still change, and the message says which controller failed.
      await new Promise((r) => props.server.close(r));
      props.server.closeAllConnections?.();
      await page.locator('.tile', { has: page.getByText('Warm White', { exact: true }) }).first().click();
      await page.locator('.toast', { hasText: 'Props (localhost:8096)' }).waitFor({ timeout: 15000 });
      check(true, 'an offline prop controller is named, the main look still applies');

      // Controller unreachable: a clear banner, then it recovers by itself.
      await new Promise((r) => mock.server.close(r) || setTimeout(r, 300));
      mock.server.closeAllConnections?.();
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.locator('.banner.error', { hasText: "Couldn't reach your lights" }).waitFor({ timeout: 10000 });
      check(true, 'offline banner shown when the controller is unreachable');
      mock.server.listen(8099);
      await page.locator('.banner.error').waitFor({ state: 'detached', timeout: 15000 });
      check(true, 'banner clears when the controller is back');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  mock.server.close();
  props.server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll end-to-end checks passed');
process.exit(failures ? 1 : 0);

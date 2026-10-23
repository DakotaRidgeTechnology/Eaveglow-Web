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
    await page.waitForSelector('.tile.active');
    const lookPost = mock.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1);
    const fxNames = JSON.parse((await import('node:fs')).readFileSync(new URL('./wled16-effects.json', import.meta.url)));
    check(!!lookPost && fxNames[lookPost.body.seg[0].fx] === 'Railway', 'applying Candy Cane sends the Railway effect to WLED');

    // House zones: spacing every 4th, 3" apart, save → /eaveglow.json on the controller.
    await page.getByTitle('House zones').click();
    await page.getByText('3"').click();
    await page.getByRole('button', { name: 'Every 4th' }).click();
    await page.screenshot({ path: `${shots}zones.png`, fullPage: true });
    check(await page.getByText('about 12 in apart').isVisible(), 'street distance shown for 3" spacing, every 4th');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1200);
    const saved = mock.files['/eaveglow.json'] && JSON.parse(mock.files['/eaveglow.json']);
    check(saved?.layout?.spacing?.skip === 3 && saved.layout.inchesBetweenLights === 3, 'settings saved to the controller file system');

    // Re-apply: spacing reaches WLED as spc.
    await page.getByText('Warm White').first().click();
    await page.waitForTimeout(500);
    const warm = mock.log.filter((l) => l.path === '/json/state' && l.body.seg).at(-1);
    check(warm.body.seg[0].spc === 3, 'house spacing applied to looks (spc 3)');

    // Make a custom look.
    await page.getByText('Make a look').click();
    await page.locator('.name-input').fill('Team Spirit');
    await page.getByRole('button', { name: 'Twinkle', exact: false }).first().click();
    await page.getByRole('button', { name: 'Gold' }).click();
    await page.screenshot({ path: `${shots}editor.png`, fullPage: true });
    await page.getByText('Save & turn on').click();
    await page.waitForSelector('.tile.active');
    await page.waitForTimeout(1000);
    const custom = JSON.parse(mock.files['/eaveglow.json']).customLooks;
    check(custom.length === 1 && custom[0].name === 'Team Spirit', 'custom look saved to the controller');

    // A second "phone" sees the same settings.
    const page2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page2.goto(`${mock.url}/eaveglow.htm`);
    await page2.waitForSelector('.tile');
    await page2.waitForTimeout(500);
    check(await page2.getByText('Team Spirit').isVisible(), 'a second phone sees the custom look');

    // Schedule: turn on, two windows, save → WLED timers.
    await page.getByTitle('Schedule').click();
    await page.locator('.card .toggle input').check();
    await page.getByText('Add another time').click();
    await page.screenshot({ path: `${shots}schedule.png`, fullPage: true });
    await page.getByText('Save to my lights').click();
    await page.getByText('Schedule saved').waitFor();
    const cfgPost = mock.log.filter((l) => l.path === '/json/cfg').at(-1).body;
    const timers = cfgPost.timers.ins.map((t) => [t.hour, t.min]);
    check(JSON.stringify(timers) === JSON.stringify([[19, 0], [22, 0], [4, 0], [6, 0]]), `timers replaced: ${JSON.stringify(timers)}`);
    check(cfgPost.hw?.led?.rgbwm === 3 && cfgPost.light?.gc?.bri === 1, 'unrelated WLED settings preserved');
    check(Object.values(mock.presets).some((p) => p.n === 'Eaveglow: Lights On'), 'On/Off presets created');
    await ctx.close();
  }
} finally {
  await browser.close();
  mock.server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll end-to-end checks passed');
process.exit(failures ? 1 : 0);

// Screenshots for the README and releases, taken against the mock controller
// at phone size: npm run build && node scripts/screenshots.mjs
// Writes docs/screenshots/*.png.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startMockWled } from './mock-wled.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const out = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

process.env.LEDS = '1468';
const mock = startMockWled(8098);
mock.state.seg[0].stop = 1468;
// A house that's already set up: three parts, autopilot on.
mock.files['/eaveglow.json'] = JSON.stringify({
  version: 1,
  layout: {
    totalPixels: 1468,
    zones: [
      { id: 'z1', name: 'Roofline', start: 0, length: 980 },
      { id: 'z2', name: 'Garage', start: 980, length: 288 },
      { id: 'z3', name: 'Peaks', start: 1268, length: 200 },
    ],
  },
  customLooks: [],
  recentColors: [],
  schedule: {
    enabled: true,
    windows: [{ id: 'w1', enabled: true, on: { kind: 'sunset', offset: 0 }, off: { kind: 'clock', hour: 23, minute: 0 }, days: 127 }],
    location: { lat: 44.08, lon: -103.23, label: 'Rapid City, SD, 57701' },
  },
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}${name}.png`, ...opts });
  console.log(`docs/screenshots/${name}.png`);
};

try {
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true, timezoneId: 'America/Denver', locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto(`${mock.url}/eaveglow.htm`);
    await page.waitForSelector('.tile');
    await page.addStyleTag({ content: '.toasts { display: none !important; }' });

    if (scheme === 'dark') {
      // Autopilot on (Schedule page), which also shows its banner on Home.
      await page.getByTitle('Schedule').click();
      await page.locator('.autopilot .toggle input').check();
      await shot(page, 'schedule');
      await page.locator('.autopilot').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70));
      await shot(page, 'autopilot');
      await page.getByText('Save to my lights').click();
      await page.getByText('Schedule saved').waitFor({ timeout: 30000 });
      await page.getByRole('button', { name: 'OK', exact: true }).click();
      await page.getByRole('button', { name: 'Back' }).click();
      await page.waitForSelector('.tile');

      await page.locator('.tile', { has: page.getByText('Halloween', { exact: true }) }).first().click();
      await page.locator('.tile.active', { has: page.getByText('Halloween', { exact: true }) }).first().waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'home');

      await page.getByRole('button', { name: /^🎉 Holidays/ }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'holidays');
      await page.getByRole('button', { name: /^All/ }).click();

      await page.getByTitle('House zones').click();
      await shot(page, 'zones');
      await page.getByRole('button', { name: 'Back' }).click();

      await page.getByText('Make a look').click();
      await page.locator('.name-input').fill('Game Night');
      await page.getByRole('button', { name: 'Twinkle', exact: false }).first().click();
      await page.getByText('Different look for a part').click();
      const part = page.locator('.part-edit');
      await part.getByRole('button', { name: 'Garage' }).click();
      await part.getByRole('button', { name: 'Roofline' }).click();
      await part.locator('select').selectOption({ label: '🍭 Candy Cane' });
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'editor');
    } else {
      await page.locator('.tile.active').first().waitFor();
      await shot(page, 'home-light');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  mock.server.close();
}

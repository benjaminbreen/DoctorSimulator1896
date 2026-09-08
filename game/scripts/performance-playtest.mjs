import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const url = arg('url', 'http://127.0.0.1:5175');
const output = resolve(arg('output', 'artifacts/performance/latest'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: !process.argv.includes('--headed'),
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
page.setDefaultTimeout(120000);
const errors = [], stages = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
  if (message.text().includes('-boot]')) { stages.push(message.text()); console.log(message.text()); }
});
await page.addInitScript(({ quality }) => {
  if (quality !== 'auto') localStorage.setItem('ghosts-game.tuning.v1', JSON.stringify({
    schemaVersion: 6, values: { graphicsQuality: quality, pixelRatioCap: 1.5 },
  }));
  performance.setResourceTimingBufferSize(5000);
  window.__perf = { frames: [], tasks: [], running: false };
  let last;
  function frame(now) {
    if (__perf.running && last !== undefined) __perf.frames.push(now - last);
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  new PerformanceObserver((list) => {
    if (__perf.running) __perf.tasks.push(...list.getEntries().map((e) => ({ start: e.startTime, ms: e.duration })));
  }).observe({ type: 'longtask', buffered: true });
}, { quality: arg('quality', 'auto') });
try {
  await page.goto(`${url}?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game?.stats.boot.complete, null, { timeout: 180000 });
  const boot = await page.evaluate(() => ({ ...__game.stats.boot, navigationMs: performance.now(), stats: { ...__game.stats } }));
  await page.waitForTimeout(3000);
  const samples = [];
  async function sample(name, action, seconds = 6) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => { __perf.frames = []; __perf.tasks = []; __perf.running = true; });
    if (action) await action();
    await page.waitForTimeout(seconds * 1000);
    // Wait for a paint as well: a blocked renderer can answer a queued command
    // before the RAF/long-task observers have delivered the stalled frame.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      __perf.running = false;
      const sorted = [...__perf.frames].sort((a, b) => a - b);
      return {
        frames: sorted.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)],
        p99: sorted[Math.floor(sorted.length * .99)], max: sorted.at(-1), over50: sorted.filter((v) => v > 50).length,
        longTasks: __perf.tasks, stats: { ...__game.stats }, position: [...__game.player.position],
      };
    });
    samples.push({ name, ...result });
    await writeFile(`${output}/results.json`, JSON.stringify({ url, walkTestSpeed: 4.1, boot, stages, samples, errors }, null, 2));
    console.log(name, JSON.stringify({ p95: result.p95, p99: result.p99, max: result.max, over50: result.over50, programs: result.stats.programs, draws: result.stats.draws }));
  }
  const sweep = () => page.evaluate(() => {
    clearInterval(window.__sweep);
    const start = __game.look.yaw;
    let tick = 0;
    // Fixed angular steps visit the same directions even if a frame stalls.
    window.__sweep = setInterval(() => {
      __game.setLook(start + (++tick / 90) * Math.PI * 2, .08);
      __game.look.revision++;
      if (tick === 90) clearInterval(window.__sweep);
    }, 50);
  });
  await sample('spawn-idle');
  if (!process.argv.includes('--no-screenshots')) await page.screenshot({ path: `${output}/spawn.png` });
  await sample('spawn-first-sweep', sweep, 8);
  await sample('npc-arrival', () => page.evaluate(() => __game.teleport(-28, 1, 65)));
  await sample('npc-first-sweep', sweep, 8);
  await sample('npc-repeat-sweep', sweep, 8);
  if (!process.argv.includes('--no-screenshots')) await page.screenshot({ path: `${output}/npc.png` });
  // Keep the measured route comparable when the game's default gait changes.
  const walkSpeed = await page.evaluate(() => { const speed = __game.tuning.walkSpeed; __game.set('walkSpeed', 4.1); return speed; });
  await page.keyboard.down('KeyW');
  await sample('walk', null, 4);
  await page.keyboard.up('KeyW');
  await page.evaluate(speed => __game.set('walkSpeed', speed), walkSpeed);
  await page.evaluate(() => { __game.teleport(82, 1.3, 68); __game.setLook(Math.PI, .08); __game.look.revision++; });
  await page.waitForTimeout(1500);
  if (!process.argv.includes('--no-screenshots')) await page.screenshot({ path: `${output}/street.png` });
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({ url: r.name, bytes: r.transferSize, ms: r.duration })));
  await writeFile(`${output}/results.json`, JSON.stringify({ url, walkTestSpeed: 4.1, boot, stages, samples, errors, resources }, null, 2));
  if (errors.length) console.error('Browser errors:', errors);
} finally {
  await browser.close();
}

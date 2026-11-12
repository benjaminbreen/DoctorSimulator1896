import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parkDistrictFor } from '../src/world/parkDistricts.js';

const arg = (name, fallback) => process.argv.find(value => value.startsWith('--' + name + '='))?.split('=').slice(1).join('=') ?? fallback;
const url = new URL(arg('url', 'http://127.0.0.1:5175'));
const output = resolve(arg('output', 'artifacts/performance/park-stream'));
const mbps = Number(arg('mbps', 20));
const startupBudget = Number(arg('startup-ms', 6000));
const errors = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});

function frameStats(frames) {
  const sorted = frames.map(frame => frame.ms).sort((a, b) => a - b);
  return {
    frames: sorted.length,
    p95: sorted[Math.floor(sorted.length * .95)] ?? null,
    max: sorted.at(-1) ?? null,
    over50: sorted.filter(ms => ms > 50.5).length,
  };
}

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: Number(arg('dpr', 1.5)),
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.location().url?.includes('/_vercel/insights/')) errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('/_vercel/insights/')) {
      errors.push(response.status() + ' ' + response.url());
    }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 28, downloadThroughput: mbps * 125000, uploadThroughput: mbps * 62500,
  });
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(2000);
    const run = window.__parkWalk = { frames: [], tasks: [] };
    new PerformanceObserver(list => {
      run.tasks.push(...list.getEntries().map(entry => [entry.startTime, entry.duration]));
    }).observe({ type: 'longtask', buffered: true });
    let sawIntro = false;
    let last;
    function frame(now) {
      const game = window.__game;
      if (document.querySelector('.park-intro')) sawIntro = true;
      else if (sawIntro && !run.opening && game?.stats.boot.complete) {
        run.opening = {
          time: now, position: [...game.player.position], grounded: game.player.grounded,
          bytes: performance.getEntriesByType('resource').reduce((total, resource) => total + resource.transferSize, 0),
        };
      }
      if (run.walking && last !== undefined) {
        run.frames.push({
          at: now, ms: now - last, position: [...game.player.position], job: game.stats.parkStream.active,
        });
      }
      last = now;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  url.searchParams.set('playtest', '1');
  url.searchParams.set('seed', '4');
  url.searchParams.set('zone', 'central-park');
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90000 });
  try {
    await page.waitForFunction(() => window.__parkWalk.opening, null, { timeout: 60000 });
  } catch (error) {
    const startup = await page.evaluate(() => ({
      boot: window.__game?.stats.boot,
      intro: Boolean(document.querySelector('.park-intro')),
      marks: performance.getEntriesByType('mark').map(mark => [mark.name, mark.startTime]),
    })).catch(() => null);
    await writeFile(resolve(output, 'results.json'), JSON.stringify({ startup, errors, failure: error.message }, null, 2));
    throw error;
  }
  await page.evaluate(() => {
    window.__playtest.startClock();
    window.__parkWalk.walking = true;
  });
  await page.keyboard.down('KeyW');
  try { await page.waitForTimeout(27000); }
  finally { await page.keyboard.up('KeyW'); }

  const run = await page.evaluate(() => {
    const game = window.__game;
    window.__parkWalk.walking = false;
    return {
      ...window.__parkWalk,
      marks: performance.getEntriesByType('mark').filter(mark => mark.name.startsWith('park:'))
        .map(mark => [mark.name, mark.startTime]),
      streamed: [...game.stats.parkStream.ready],
      endPosition: [...game.player.position],
      dpr: game.renderer.getPixelRatio(),
    };
  });
  const start = parkDistrictFor(run.opening.position);
  const firstAcross = run.frames.find(frame => parkDistrictFor(frame.position) !== start);
  const crossing = firstAcross && {
    from: start.id,
    to: parkDistrictFor(firstAcross.position).id,
    at: firstAcross.at,
    ...frameStats(run.frames.filter(frame => Math.abs(frame.at - firstAcross.at) <= 1500)),
  };
  const summary = { opening: run.opening, crossing, walk: frameStats(run.frames), mbps, errors };
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ ...summary, ...run }, null, 2));
  await page.screenshot({ path: resolve(output, 'after-crossing.png') });
  console.log(JSON.stringify(summary, null, 2));
  if (errors.length || !run.opening.grounded || run.opening.time > startupBudget
    || !crossing || crossing.over50 || !run.streamed.some(id => id.startsWith(crossing.to + ':'))) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

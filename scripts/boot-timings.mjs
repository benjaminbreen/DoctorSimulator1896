// Measure how long a zone takes to arrive, stage by stage.
//
// The staged boot advances off useFrame, so it only progresses while the page
// is actually rendering. An embedded preview pane reports document.hidden and
// throttles requestAnimationFrame to nothing, which makes any timing taken
// there a measurement of the throttle. Real Chrome, driven here, does not.
//
//   node scripts/boot-timings.mjs
//   node scripts/boot-timings.mjs --zone=consulting-office
//   node scripts/boot-timings.mjs --dev --runs=1
//
// Defaults to the production build on :5225, which is what a player downloads.
// Run `npm --prefix game run build` first, or pass --dev to measure the dev
// server instead (module transforms dominate there; useful only for A/B).

import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const found = args.find((entry) => entry.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const dev = args.includes('--dev');
const zone = flag('zone', 'central-park');
const runs = Number(flag('runs', 2));
// Localhost is not a connection anyone plays on: every asset arrives faster
// than it can be parsed, which hides whether download or main-thread work is
// the limit. --throttle=fast3g|slow4g|cable applies a realistic pipe.
const PIPES = {
  cable: { downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8, latency: 20 },
  slow4g: { downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8, latency: 100 },
  fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
};
const throttle = flag('throttle', null);
if (throttle && !PIPES[throttle]) throw new Error(`unknown pipe ${throttle}; use ${Object.keys(PIPES).join('|')}`);
const port = dev ? 5175 : 5225;
const url = flag('url', `http://127.0.0.1:${port}/`);

async function reachable() {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1200) })).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await reachable())) {
  const command = dev
    ? ['--prefix', 'game', 'run', 'dev']
    : ['--prefix', 'game', 'exec', 'vite', '--', 'preview', 'game', '--outDir', 'dist', '--port', String(port), '--strictPort'];
  server = spawn('npm', command, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  for (let attempt = 0; attempt < 60 && !(await reachable()); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
if (!(await reachable())) throw new Error(`no server answering at ${url}`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
// One context for every run: the second run then reads the first run's HTTP
// cache, which is the difference between a first visit and a return visit.
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

function report(label, stages, resources) {
  console.log(`\n${label}`);
  for (const [name, ms] of stages) console.log(`  ${name.padEnd(20)} ${String(ms).padStart(6)}ms`);
  // transferred is what crosses the wire; decoded counts cache hits too, so
  // comparing decoded totals makes a well-cached run look like a wasteful one.
  const transferred = resources.reduce((total, entry) => total + entry.transferKB, 0);
  const decoded = resources.reduce((total, entry) => total + entry.decodedKB, 0);
  const cached = resources.filter((entry) => entry.transferKB === 0 && entry.decodedKB > 0).length;
  console.log(
    `  ${'—'.padEnd(20)} ${(transferred / 1024).toFixed(1)}MB transferred`
    + ` (${(decoded / 1024).toFixed(1)}MB decoded) over ${resources.length} requests,`
    + ` ${cached} served from cache`,
  );
}

try {
  for (let run = 0; run < runs; run += 1) {
    const page = await context.newPage();
    if (throttle) {
      const client = await context.newCDPSession(page);
      await client.send('Network.enable');
      await client.send('Network.emulateNetworkConditions', { offline: false, ...PIPES[throttle] });
    }
    const stages = [];
    page.on('console', (message) => {
      const match = /\[(?:park|room)-boot\] (\S+) (\d+)ms/.exec(message.text());
      if (match) stages.push([match[1], Number(match[2])]);
    });
    await page.addInitScript(() => localStorage.removeItem('ghosts-game.tuning.v1'));
    await page.goto(`${url}?zone=${zone}`, { waitUntil: 'load', timeout: 60000 });
    try {
      await page.waitForFunction(() => window.__game?.stats?.boot?.complete === true, null, {
        timeout: 120000,
      });
    } catch {
      const state = await page.evaluate(() => window.__game?.stats?.boot ?? null);
      console.error(`  incomplete — stalled at ${state?.stage} after ${state?.elapsedMs}ms`);
    }
    const resources = await page.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => ({
        transferKB: Math.round(entry.transferSize / 1024),
        decodedKB: Math.round(entry.decodedBodySize / 1024),
      })));
    const pipe = throttle ? ` on ${throttle}` : '';
    report(`${zone}${pipe} — ${run === 0 ? 'first visit' : `return visit ${run}`}`, stages, resources);
    await page.close();
  }
} finally {
  await context.close();
  await browser.close();
  server?.kill();
}

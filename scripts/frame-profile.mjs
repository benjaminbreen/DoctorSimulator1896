// Measure steady-state frame cost in a zone: fps, frame-time percentiles,
// hitches, long tasks, draw calls, and (with --profile) a CPU self-time top
// list. Companion to boot-timings.mjs, which measures arrival instead.
//
//   node scripts/frame-profile.mjs
//   node scripts/frame-profile.mjs --zone=consulting-office --seconds=8
//   node scripts/frame-profile.mjs --profile --headed
//
// Defaults to the production build on :5225 (run `npm --prefix game run
// build` first). Headless Chrome on macOS can fall back to SwiftShader; the
// report prints the GL renderer string so a software run is never mistaken
// for a hardware one. --headed opens a real window on the machine's GPU.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium, devices } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const found = args.find((entry) => entry.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const dev = args.includes('--dev');
const headed = args.includes('--headed');
const profile = args.includes('--profile');
const still = args.includes('--still');
const zone = flag('zone', 'central-park');
const seconds = Number(flag('seconds', 10));
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

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  // In headless the compositor needs an explicit push toward the real GPU;
  // without these it silently renders on SwiftShader.
  args: ['--use-angle=metal', '--enable-gpu', '--enable-webgl', '--ignore-gpu-blocklist'],
});
// --mobile emulates the constrained-mobile tier (touch, coarse pointer, small
// screen): the game then drops post-processing, caps DPR at 1.25, and shrinks
// the shadow map, so this exercises the phone code path on desktop silicon.
const mobile = args.includes('--mobile');
// --retina: a MacBook-sized window at devicePixelRatio 2, the resolution the
// game actually renders at on the developer's machine.
const retina = args.includes('--retina');
const context = await browser.newContext(
  mobile
    ? { ...devices['iPhone 13'], deviceScaleFactor: 3 }
    : retina
      ? { viewport: { width: 1512, height: 900 }, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 800 } },
);

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

try {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`console.error: ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.removeItem('ghosts-game.tuning.v1'));
  const client = await context.newCDPSession(page);
  if (profile) {
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 200 });
  }
  await page.goto(`${url}?zone=${zone}`, { waitUntil: 'load', timeout: 60000 });
  try {
    await page.waitForFunction(() => window.__game?.stats?.boot?.complete === true, null, {
      timeout: 180000,
    });
  } catch {
    const state = await page.evaluate(() => window.__game?.stats?.boot ?? null);
    console.error(`boot incomplete — stalled at ${state?.stage} after ${state?.elapsedMs}ms`);
  }
  const glInfo = await page.evaluate(() => {
    const gl = window.__game?.renderer?.getContext?.();
    if (!gl) return 'no renderer';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  console.log(`zone=${zone} gl="${glInfo}"`);

  // Let post-boot shader compiles and downloads settle before sampling.
  await page.waitForTimeout(3000);

  // Arbitrary page-side setup before sampling, e.g. disabling one subsystem
  // to bisect a cost: --setup="__game.set('shadowsEnabled', false)"
  const setup = flag('setup', null);
  if (setup) {
    await page.evaluate((code) => new Function(code)(), setup);
    await page.waitForTimeout(500);
  }

  // Capture the settled frame for visual regression checks: --screenshot=path
  const shot = flag('screenshot', null);
  if (shot) {
    await page.screenshot({ path: shot });
    console.log(`screenshot written to ${shot}`);
  }

  // Evaluate an expression after boot and print it: --probe="expression"
  const probe = flag('probe', null);
  if (probe) {
    const value = await page.evaluate(async (code) => JSON.stringify(await new Function(`return (${code})`)(), null, 1), probe);
    console.log(`probe: ${value}`);
  }

  if (profile) await client.send('Profiler.start');
  await page.evaluate(({ still: holdStill, sampleMs }) => {
    window.__perf = { frames: [], long: [], done: false };
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perf.long.push(Math.round(entry.duration));
    });
    observer.observe({ entryTypes: ['longtask'] });
    if (!holdStill) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    }
    const baseYaw = window.__game.look?.yaw ?? 0;
    const start = performance.now();
    let last = start;
    const tick = (now) => {
      window.__perf.frames.push(now - last);
      last = now;
      // A slow pan while walking: the camera crosses the crowd, the shadow
      // frustum follows, and frustum-culling churn shows up in the numbers.
      if (!holdStill && window.__game.setLook) {
        window.__game.setLook(baseYaw + (now - start) * 0.00035, 0.28);
      }
      if (now - start < sampleMs) requestAnimationFrame(tick);
      else {
        window.__perf.done = true;
        observer.disconnect();
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
      }
    };
    requestAnimationFrame(tick);
  }, { still, sampleMs: seconds * 1000 });
  await page.waitForFunction(() => window.__perf?.done === true, null, {
    timeout: (seconds + 20) * 1000,
  });
  let cpuProfile = null;
  if (profile) {
    cpuProfile = (await client.send('Profiler.stop')).profile;
    const out = flag('profile-out', null);
    if (out) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(out, JSON.stringify(cpuProfile));
      console.log(`profile written to ${out}`);
    }
  }

  const result = await page.evaluate(() => {
    const g = window.__game;
    return {
      frames: window.__perf.frames.slice(1),
      long: window.__perf.long,
      draws: g.stats.draws,
      triangles: g.stats.triangles,
      programs: g.stats.programs,
      textures: g.stats.textures,
      geometries: g.stats.geometries,
      metrics: g.sceneMetrics(),
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  });

  const sorted = [...result.frames].sort((a, b) => a - b);
  const mean = result.frames.reduce((total, value) => total + value, 0) / result.frames.length;
  const over25 = result.frames.filter((value) => value > 25).length;
  const over50 = result.frames.filter((value) => value > 50).length;
  console.log(`frames=${result.frames.length} over ${seconds}s ${still ? '(standing)' : '(walking+pan)'}`);
  console.log(`  fps       ${(1000 / mean).toFixed(1)} avg`);
  console.log(`  frame ms  p50=${percentile(sorted, 50).toFixed(1)} p95=${percentile(sorted, 95).toFixed(1)} p99=${percentile(sorted, 99).toFixed(1)} worst=${sorted[sorted.length - 1].toFixed(1)}`);
  console.log(`  hitches   ${over25} frames >25ms, ${over50} frames >50ms`);
  console.log(`  longtasks ${result.long.length} (${result.long.slice(0, 12).join(',')}${result.long.length > 12 ? ',…' : ''})`);
  console.log(`  gpu load  draws=${result.draws} tris=${result.triangles} programs=${result.programs} textures=${result.textures} geometries=${result.geometries}`);
  if (result.metrics) {
    console.log(`  scene     meshes=${result.metrics.meshes} instanced=${result.metrics.instancedMeshes} skinned=${result.metrics.skinnedVisible} bones=${result.metrics.skinnedBones} tris≈${result.metrics.estimatedTriangles}`);
  }
  if (result.heapMB !== null) console.log(`  js heap   ${result.heapMB}MB`);

  if (cpuProfile) {
    // Self time per function: sample counts weighted by the measured average
    // sampling interval, grouped by functionName@url:line.
    const nodesById = new Map(cpuProfile.nodes.map((node) => [node.id, node]));
    const totalSamples = cpuProfile.samples?.length ?? 0;
    const durationUs = cpuProfile.endTime - cpuProfile.startTime;
    const usPerSample = totalSamples > 0 ? durationUs / totalSamples : 0;
    const selfCounts = new Map();
    for (const sample of cpuProfile.samples ?? []) {
      selfCounts.set(sample, (selfCounts.get(sample) ?? 0) + 1);
    }
    const rows = [...selfCounts.entries()]
      .map(([id, count]) => {
        const node = nodesById.get(id);
        const frame = node?.callFrame ?? {};
        const file = (frame.url || '').split('/').pop() || '(native)';
        const name = frame.functionName || '(anonymous)';
        return { label: `${name}  ${file}:${(frame.lineNumber ?? 0) + 1}`, ms: (count * usPerSample) / 1000 };
      })
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 30);
    console.log('\ncpu self time (top 30):');
    for (const row of rows) console.log(`  ${row.ms.toFixed(0).padStart(6)}ms  ${row.label}`);
  }
} finally {
  await context.close();
  await browser.close();
  server?.kill();
}

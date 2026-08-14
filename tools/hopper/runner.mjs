import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

export async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

// Reuse a dev server if one is already up; otherwise run our own and stop it
// on the way out.
export async function ensureGame(port) {
  const url = `http://127.0.0.1:${port}/`;
  if (await reachable(url)) return { url, stop: () => {} };
  const command = port === 5175
    ? ['--prefix', 'game', 'run', 'dev']
    : ['--prefix', 'game', 'run', 'dev', '--', '--port', String(port)];
  const child = spawn('npm', command, { cwd: REPO, stdio: 'ignore' });
  for (let index = 0; index < 60; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await reachable(url)) return { url, stop: () => child.kill() };
  }
  child.kill();
  throw new Error(`dev server did not come up on ${url}`);
}

export async function score(scorerUrl, png, probe, context) {
  const response = await fetch(`${scorerUrl}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ png_b64: png.toString('base64'), probe, context }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`scorer: ${body.error}`);
  return body;
}

// The teleport consumes a frame on its own, the controller resolves on the
// next, and shadows and the avatar pose follow.
async function settle(page) {
  await page.evaluate(
    () => new Promise((resolve) => {
      let frames = 8;
      const tick = () => {
        frames -= 1;
        if (frames > 0) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    }),
  );
  await page.waitForTimeout(50);
}

async function render(page, canvas, shot) {
  await page.evaluate((next) => window.__shot.apply(next), shot);
  await settle(page);
  const probe = await page.evaluate(() => window.__shot.probe());
  const png = await canvas.screenshot({ type: 'png' });
  return { probe, png };
}

// A Vite hot reload tears down the page mid-shot. Reload and carry on rather
// than lose a durable batch.
export async function renderResilient(page, canvas, shot, url, zone) {
  try {
    return await render(page, canvas, shot);
  } catch (error) {
    if (!/context|destroyed|navigat|Target closed|__shot|undefined.*(?:apply|probe)/i.test(error.message)) {
      throw error;
    }
    console.log('  page reloaded under us; recovering');
    await page.goto(`${url}?shot=1`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.__shot?.ready, null, { timeout: 90000 });
    await ensureZone(page, zone);
    return render(page, canvas, shot);
  }
}

export async function ensureZone(page, zone) {
  if ((await page.evaluate(() => window.__shot.world().zone)) === zone) return;
  await page.evaluate((nextZone) => window.__game.set('zone', nextZone), zone);
  await page.waitForTimeout(600);
  await page.waitForFunction(
    (nextZone) => window.__shot?.ready && window.__shot.world().zone === nextZone,
    zone,
    { timeout: 90000 },
  );
  await page.waitForTimeout(1200);
}

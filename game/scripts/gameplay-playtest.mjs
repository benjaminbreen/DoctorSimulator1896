import { chromium } from 'playwright-core';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGame } from '../../tools/hopper/runner.mjs';
import { MODULAR_HAIR_STYLES } from '../../shared/characters/modularHair.js';

const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const scenarios = {
  park: { zone: 'central-park', seed: 4 },
  appointment: { zone: 'central-park', seed: 4, hour: 9.72 },
  office: { zone: 'consulting-office', seed: 4 },
  'waiting-room': { zone: 'waiting-room', seed: 4 },
  nora: { zone: 'consulting-office', seed: 4, patient: 'Nora Byrne' },
  samuel: { zone: 'consulting-office', seed: 4, patient: 'Samuel Taylor' },
  carmela: { zone: 'consulting-office', seed: 4, patient: 'Carmela Russo' },
  wilhelmina: { zone: 'consulting-office', seed: 1, patient: 'Wilhelmina Otten' },
  chapuys: { zone: 'consulting-office', seed: 2, patient: 'Ferdinand de Chapuys' },
};

if (process.argv.includes('--help')) {
  console.log(`Usage: node game/scripts/gameplay-playtest.mjs [--scenario=park] [--seed=4]
  [--output=DIR] [--url=URL] [--headed] [--continuous] [--video] [--trace] [--offline]
  [--quality=auto|quality|performance]
  [--replay=actions.jsonl]

Scenarios: ${Object.keys(scenarios).join(', ')}
Send one JSON command per line on stdin. Every command saves a screenshot and state.
  {"type":"observe"}
  {"type":"click","name":"Fast Travel","index":0}
  {"type":"click","role":"button","name":"Your Consulting Room","exact":false}
  {"type":"fill","label":"Ask in your own words","value":"How do you sleep?"}
  {"type":"press","key":"Tab"}
  {"type":"move","keys":["KeyW"],"ms":500}
  {"type":"look","dx":150,"dy":-20}
  {"type":"scroll","dy":200}
  {"type":"wait","ms":1000}
  {"type":"resize","width":390,"height":844}
  {"type":"wait-seated"}
  {"type":"camera","position":[1.8,1,-2],"target":[0.45,0.7,-1.7],"fov":45}
  {"type":"assert","text":"Consultation"}
  {"type":"pause"} / {"type":"resume"} / {"type":"quit"}
Click/fill/assert also accept a CSS selector. Assert supports visible:false.
The browser pauses between actions by default. --continuous uses real timers.
Replay exits when finished. EOF, quit, and Ctrl+C close owned browser/server resources.`);
  process.exit(0);
}

const scenarioName = arg('scenario', 'park');
const scenario = scenarios[scenarioName];
if (!scenario) throw new Error(`Unknown scenario ${scenarioName}; use --help.`);
const seed = Number(arg('seed', scenario.seed));
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer.');
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(arg('output', resolve(repoRoot, `artifacts/gameplay/${new Date().toISOString().replaceAll(':', '-')}`)));
const continuous = process.argv.includes('--continuous');
const offline = process.argv.includes('--offline');
const quality = arg('quality', continuous ? 'auto' : 'quality');
if (!['auto', 'quality', 'performance'].includes(quality)) throw new Error('Unknown graphics quality.');
const config = { scenario: scenarioName, seed, continuous, offline, quality, output };
await mkdir(output, { recursive: true });
// Do not overwrite a previous run: its actions must remain a usable replay.
await writeFile(resolve(output, 'actions.jsonl'), '', { flag: 'wx' });

let server, browser, context, page, input;
let pausedBetweenActions = !continuous;
let browserPaused = false;
let step = 0;
let failedSteps = 0;
let stopping = false;
let closing;
const errors = [];
const emit = (value) => console.log(JSON.stringify(value));
function closeBrowser() {
  closing ??= (async () => {
    if (context && process.argv.includes('--trace')) {
      try { await context.tracing.stop({ path: resolve(output, 'trace.zip') }); } catch {}
    }
    await browser?.close();
  })();
  return closing;
}
const onSignal = () => {
  stopping = true;
  process.exitCode = 130;
  input?.close();
  // Closing the browser also releases a pending locator or scene wait.
  void closeBrowser();
  server?.stop();
};
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);

async function pauseBrowser() {
  if (browserPaused) return;
  // A busy renderer can consume the forward margin before pauseAt arrives.
  // That call still pauses timers, so retry against the now-stationary clock.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const at = await page.evaluate(() => Date.now() + 100);
    try {
      await page.clock.pauseAt(at);
      browserPaused = true;
      return;
    } catch (error) {
      if (!error.message.includes('Cannot fast-forward to the past') || attempt === 2) throw error;
    }
  }
}

async function waitForScene() {
  await page.waitForFunction(() => window.__game?.stats.boot.complete
    && __game.loadedZone === __game.tuning.zone
    && __game.actors.requested.every((id) => __game.actors.loaded.includes(id)), null, { timeout: 180000 });
  await page.locator('.park-intro').waitFor({ state: 'detached', timeout: 60000 });
  await page.locator('textarea[aria-label="Ask in your own words"]:disabled')
    .waitFor({ state: 'detached', timeout: 30000 });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

function target(command) {
  let locator = command.selector ? page.locator(command.selector)
    : page.getByRole(command.role ?? 'button', { name: command.name, exact: command.exact ?? true });
  if (command.index !== undefined) locator = locator.nth(command.index);
  return locator;
}

function duration(command, fallback = 500) {
  const ms = command.ms ?? fallback;
  if (!Number.isFinite(ms) || ms < 0 || ms > 60000) throw new Error('ms must be between 0 and 60000.');
  return ms;
}

function movementKeys(command) {
  const keys = command.keys ?? ['KeyW'];
  if (!Array.isArray(keys) || !keys.length
    || keys.some((key) => !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space'].includes(key))) {
    throw new Error('Movement keys must be WASD, ShiftLeft, or Space.');
  }
  return keys;
}

async function waitForPosition({ axis, below, above }, timeout) {
  const index = ['x', 'y', 'z'].indexOf(axis);
  if (index === -1 || (!Number.isFinite(below) && !Number.isFinite(above))) {
    throw new Error('Position target needs an axis and a finite above or below value.');
  }
  await page.waitForFunction(({ index, below, above }) => {
    const value = __game.player.position[index];
    return value <= (below ?? Infinity) && value >= (above ?? -Infinity);
  }, { index, below, above }, { timeout });
}

async function act(command) {
  switch (command.type) {
    case 'observe': case 'pause': case 'resume': case 'quit': return;
    case 'click': await target(command).click(); return;
    case 'fill': {
      const locator = command.selector ? page.locator(command.selector) : page.getByLabel(command.label, { exact: true });
      await locator.fill(command.value);
      return;
    }
    // Camera switches poll key state in the frame loop, so a zero-length
    // press can disappear between frames on a busy renderer.
    case 'press': await page.keyboard.press(command.key,{delay:duration(command,100)}); return;
    case 'move': {
      const ms = duration(command);
      const keys = [...movementKeys(command)];
      try {
        for (const key of keys) await page.keyboard.down(key);
        if (command.jumpAt) {
          await waitForPosition(command.jumpAt, ms);
          if (!keys.includes('Space')) keys.push('Space');
          await page.keyboard.down('Space');
        }
        if (command.until) await waitForPosition(command.until, ms);
        else await page.waitForTimeout(ms);
      } finally {
        for (const key of keys) await page.keyboard.up(key);
      }
      return;
    }
    case 'keys-down':
    case 'keys-up':
      for (const key of movementKeys(command)) await page.keyboard[command.type === 'keys-down' ? 'down' : 'up'](key);
      return;
    case 'place-player':
      if (command.position?.length !== 3 || !command.position.every(Number.isFinite) || !Number.isFinite(command.yaw)) {
        throw new Error('place-player needs a position and yaw.');
      }
      await page.evaluate(async ({ position, yaw, besideCarriage }) => {
        // The orbit camera keeps its previous heading through a teleport.
        // Shoulder mode lets the replay aim its next movement precisely.
        __game.set('cameraMode', 'shoulder');
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        if (besideCarriage !== undefined) {
          const car = __game.carriages[besideCarriage];
          if (!car) throw new Error('No carriage to approach.');
          const [side, y, forward] = position;
          position = [car.x + Math.cos(car.yaw) * side + Math.sin(car.yaw) * forward, y,
            car.z - Math.sin(car.yaw) * side + Math.cos(car.yaw) * forward];
        }
        __game.setLook(yaw, 0);
        __game.pendingYaw = yaw;
        __game.teleport(...position);
      }, command);
      return;
    case 'wait-motion':
      await page.waitForFunction(({ phase, minY, maxY, recent = false }) => {
        const { animation, position } = __game.player;
        return (recent ? animation?.lastAction : animation?.phase) === phase
          && position[1] >= (minY ?? -Infinity) && position[1] <= (maxY ?? Infinity);
      }, command, { timeout: duration(command, 10000) });
      return;
    case 'look': {
      const { width, height } = page.viewportSize();
      await page.mouse.move(width / 2, height * 0.4);
      await page.mouse.down();
      try {
        await page.mouse.move(width / 2 + (command.dx ?? 0), height * 0.4 + (command.dy ?? 0), { steps: 12 });
      } finally { await page.mouse.up(); }
      return;
    }
    case 'scroll': await page.mouse.wheel(command.dx ?? 0, command.dy ?? 0); return;
    case 'wait': await page.waitForTimeout(duration(command, 1000)); return;
    case 'resize': await page.setViewportSize({ width: command.width, height: command.height }); return;
    case 'camera': return;
    case 'patient-pose':
      if (!['clinic-idle', 'standing-idle', 'walk'].includes(command.body)) throw new Error('Unknown review pose.');
      await page.evaluate(body => {
        __game.scene.traverse(root => {
          if (root.userData.patientId) __game.cueActor(root.userData.patientId, { body, speaking: false });
        });
      }, command.body);
      return;
    case 'wait-seated':
      await page.waitForFunction(() => {
        let seated = false;
        __game.scene.traverse(root => { if (root.userData.patientId && root.userData.seatContact?.phase === 'seated') seated = true; });
        return seated;
      }, null, { timeout: 180000 });
      return;
    case 'assert': {
      const locator = command.selector ? target(command) : page.getByText(command.text, { exact: command.exact ?? false });
      await locator.waitFor({ state: command.visible === false ? 'hidden' : 'visible' });
      return;
    }
    default: throw new Error(`Unknown command type: ${command.type}`);
  }
}

async function capture(command, failure = null) {
  if (failure) failedSteps += 1;
  const stem = String(step++).padStart(4, '0');
  const screenshot = resolve(output, `${stem}.png`);
  const stateFile = resolve(output, `${stem}.json`);
  const state = await page.evaluate(hairStyleIds => {
    const visible = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        && element.getAttribute('aria-hidden') !== 'true';
    };
    const game = window.__game;
    const performances = [];
    const materialResponses = [];
    game?.scene?.traverse(root => {
      if (root.userData.materialResponse) materialResponses.push({ name: root.name, ...root.userData.materialResponse });
      if (!root.userData.patientId) return;
      const weights = {};
      const hairstyles = new Set(), facialHair = new Set(), grooming = {}, bodyShape = {};
      const hairMaterials = new Map();
      root.traverse(mesh => {
        const style = mesh.isMesh && mesh.visible && hairStyleIds.find(id => mesh.name.startsWith('Carmela_HairStyle_'+id.replaceAll('-', '_')));
        if (style) hairstyles.add(style);
        if (mesh.isMesh && mesh.visible && mesh.name.startsWith('Patient_FacialHair_')) facialHair.add(mesh.name.slice(19));
        if (style) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          hairMaterials.set(material.name, { name: material.name, alphaTest: material.alphaTest, transparent: material.transparent });
        }
        for (const [name, index] of Object.entries(mesh.morphTargetDictionary || {})) {
          const value = mesh.morphTargetInfluences[index];
          if (!name.startsWith('rc_') && value > .0001) weights[name] = value;
          if (['rc_bellySize','rc_waistWidth'].includes(name)) bodyShape[name.slice(3)] = value;
          if (style && name.startsWith('rc_hair')) grooming[name.slice(3)] = value;
        }
      });
      performances.push({ id: root.userData.patientId, assetPath: root.userData.assetPath, appearancePreset: root.userData.appearancePreset, ...root.userData.performance, seatContact:root.userData.seatContact, headwear:root.userData.headwear||null,eyelashes:root.userData.eyelashes||null,accessories:root.userData.accessories||null, weights, bodyShape, hair: { facialHair: [...facialHair], styles: [...hairstyles], grooming, materials: [...hairMaterials.values()] } });
    });
    return {
      url: location.href,
      zone: game?.loadedZone,
      position: game ? [...game.player.position] : null,
      player: game ? { grounded: game.player.grounded, yaw: game.player.yaw, ...game.player.animation } : null,
      prompt: game?.prompt ?? null,
      boot: game?.stats.boot,
      performances,
      materialResponses,
      clock: window.__playtest?.clock(),
      text: document.body.innerText,
      controls: [...document.querySelectorAll('button, input, textarea, select, [role="tab"]')]
        .filter(visible).map((element) => ({
          role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
          name: element.getAttribute('aria-label') ?? element.innerText ?? '',
          disabled: Boolean(element.disabled),
          value: element.value,
        })),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(visible)
        .map((element) => ({ name: element.getAttribute('aria-label'), text: element.innerText })),
      render: game ? { draws: game.stats.draws, triangles: game.stats.triangles,
        pixelRatio: game.stats.pixelRatio, graphicsQuality: game.stats.graphicsQuality } : null,
    };
  }, Object.keys(MODULAR_HAIR_STYLES));
  if (command.type === 'camera') {
    await page.evaluate(({ position, target, fov = 50, relativeToPatient = false, relativeToPlayer = false }) => {
      const { camera, renderer, scene } = __game;
      if (relativeToPatient) {
        let patient;
        scene.traverse(root => { if (root.userData.patientId) patient = root; });
        if (!patient) throw new Error('No patient to inspect.');
        const origin = patient.getWorldPosition(patient.position.clone()).toArray();
        position = position.map((value, axis) => value + origin[axis]);
        target = target.map((value, axis) => value + origin[axis]);
      }
      if (relativeToPlayer) {
        const origin = __game.player.position;
        position = position.map((value, axis) => value + origin[axis]);
        target = target.map((value, axis) => value + origin[axis]);
      }
      camera.position.set(...position);
      camera.lookAt(...target);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }, command);
    const style = await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body canvas { visibility: visible !important; }' });
    await style.evaluate(node => { node.id = 'playtest-camera-style'; });
  }
  await page.screenshot({ path: screenshot, timeout: 60000 });
  if (command.type === 'camera') await page.locator('#playtest-camera-style').evaluate(node => node.remove());
  if (arg('inspect-shadows', null) === stem) {
    for (const mode of ['on','off','restore']) {
      await page.evaluate(mode => {
        const game=window.__game;
        if(mode==='on')window.__shadowReview=[];
        if(mode==='off')game.scene.traverse(root=>{
          if(!root.userData.patientId)return;
          root.traverse(mesh=>{if(mesh.isMesh){window.__shadowReview.push([mesh,mesh.receiveShadow]);mesh.receiveShadow=false;}});
        });
        if(mode==='restore'){for(const [mesh,value] of window.__shadowReview)mesh.receiveShadow=value;delete window.__shadowReview;}
        game.renderer.render(game.scene,game.camera);
      },mode);
      if(mode!=='restore')await page.screenshot({path:resolve(output,`${stem}-shadow-${mode}.png`)});
    }
  }
  await writeFile(stateFile, JSON.stringify({ command, failure, paused: pausedBetweenActions, state, errors }, null, 2));
  const result = { step: stem, ok: !failure && errors.length === 0, screenshot, stateFile, failure, errorCount: errors.length };
  await appendFile(resolve(output, 'steps.jsonl'), `${JSON.stringify(result)}\n`);
  await writeFile(resolve(output, 'run.json'), JSON.stringify({ ...config, url: page.url(), steps: step, failedSteps, errors, status: 'running' }, null, 2));
  emit(arg('replay', null) ? result : { ...result,
    state: { zone: state.zone, clock: state.clock?.logical, prompt: state.prompt, text: state.text, controls: state.controls } });
}

async function execute(command) {
  if (!command || typeof command.type !== 'string') {
    process.exitCode = 1;
    await capture(command, 'A command must be an object with a type.');
    return false;
  }
  await appendFile(resolve(output, 'actions.jsonl'), `${JSON.stringify(command)}\n`);
  let failure = null;
  const inspectOnly = ['observe', 'assert', 'quit', 'pause', 'camera'].includes(command.type);
  try {
    if (command.type === 'pause') {
      if (continuous) throw new Error('Pause requires starting without --continuous.');
      pausedBetweenActions = true;
    }
    if (command.type === 'resume') pausedBetweenActions = false;
    if (!continuous && !inspectOnly) {
      await page.clock.resume();
      browserPaused = false;
    }
    await act(command);
    if (!inspectOnly) await waitForScene();
  } catch (error) {
    failure = error.message;
    process.exitCode = 1;
  } finally {
    if (!continuous && pausedBetweenActions) await pauseBrowser();
  }
  await capture(command, failure);
  return !failure;
}

try {
  server = arg('url', null) ? { url: arg('url'), stop() {} } : await ensureGame(Number(arg('port', 5175)));
  if (stopping) throw new Error('Playtest interrupted.');
  browser = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed'),
    handleSIGINT: false, handleSIGTERM: false,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  if (stopping) throw new Error('Playtest interrupted.');
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    ...(process.argv.includes('--video') ? { recordVideo: { dir: resolve(output, 'video'), size: { width: 1440, height: 900 } } } : {}) });
  // Fake time can make adaptive resolution blur captures for artificial stalls.
  // Keep paused visual reviews at a fixed quality; real-time runs default to auto.
  await context.addInitScript(({ quality }) => localStorage.setItem('ghosts-game.tuning.v1', JSON.stringify({
    schemaVersion: 6, values: { graphicsQuality: quality, pixelRatioCap: 1 },
  })), { quality });
  if (process.argv.includes('--trace')) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  page = await context.newPage();
  if (offline) {
    // Empty successful replies exercise the game's authored fallbacks without
    // making a model call or changing simulation facts and outcomes.
    await page.route('**/api/consult', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{}',
    }));
  }
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', (error) => errors.push({ kind: 'javascript', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url?.includes('/_vercel/insights/')) {
      errors.push({ kind: 'console', message: message.text() });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/_vercel/insights/')) {
      errors.push({ kind: 'http', status: response.status(), url: response.url() });
    }
  });
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push({ kind: 'request', url: request.url(), message: request.failure()?.errorText });
  });
  if (!continuous) await page.clock.install();
  const url = new URL(server.url);
  url.searchParams.set('playtest', '1');
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('zone', scenario.zone);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await waitForScene();
  if (scenario.patient) {
    const appointment = page.getByRole('button', { name: `Open the casebook for ${scenario.patient}`, exact: false });
    if (await appointment.count() !== 1) throw new Error(`${scenario.patient} is absent with seed ${seed}; use this scenario's default seed.`);
    await appointment.click();
    await page.getByRole('button', { name: `Ask ${scenario.patient} to return`, exact: false }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
    await waitForScene();
  }
  if (scenario.hour !== undefined) await page.evaluate((hour) => __game.set('timeOfDay', hour), scenario.hour);
  await page.evaluate(() => window.__playtest.startClock());
  if (pausedBetweenActions) await pauseBrowser();
  await capture({ type: 'start', scenario: scenarioName, seed });
  if (arg('replay', null)) {
    const commands = (await readFile(resolve(arg('replay')), 'utf8')).split(/\r?\n/).filter((line) => line.trim()).map(JSON.parse);
    for (const command of commands) {
      if (!await execute(command) || command.type === 'quit') break;
    }
  } else {
    input = createInterface({ input: process.stdin, terminal: false });
    for await (const line of input) {
      if (!line.trim()) continue;
      let command;
      try { command = JSON.parse(line); }
      catch (error) { emit({ ok: false, failure: error.message }); process.exitCode = 1; continue; }
      await execute(command);
      if (command.type === 'quit') break;
    }
  }
} catch (error) {
  emit({ ok: false, failure: error.message, output });
  process.exitCode = 1;
  if (page && !page.isClosed()) {
    try { await capture({ type: 'failure' }, error.message); } catch {}
  }
} finally {
  input?.close();
  await closeBrowser();
  // A signal may have arrived before launch returned and assigned browser.
  await browser?.close();
  server?.stop();
  if (errors.length) process.exitCode = 1;
  await writeFile(resolve(output, 'run.json'), JSON.stringify({ ...config, url: page?.url(),
    steps: step, failedSteps, errors, exitCode: process.exitCode ?? 0,
    status: stopping ? 'interrupted' : process.exitCode ? 'failed' : 'complete' }, null, 2));
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
}

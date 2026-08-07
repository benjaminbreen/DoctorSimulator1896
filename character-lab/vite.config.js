import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const labRoot = import.meta.dirname;
const projectRoot = path.resolve(labRoot, '..');
const generatedDir = path.join(labRoot, '.generated');
const cacheDir = path.join(generatedDir, 'cache');
const pipelineVersion = 'renderer-a-mpfb-v6-comparison-engines';
const blender = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
let activeGeneration = null;

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Preset request is too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Preset JSON is invalid')); }
    });
    request.on('error', reject);
  });
}

function runBlender(presetPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(blender, [
      '--background', '--python-exit-code', '1',
      '--python', path.join(projectRoot, 'scripts/characters/generate_patient.py'),
      '--', '--preset', presetPath, '--output', outputPath,
    ], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log = `${log}${chunk}`.slice(-16000); });
    child.stderr.on('data', (chunk) => { log = `${log}${chunk}`.slice(-16000); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(log) : reject(new Error(log || `Blender exited with code ${code}`)));
  });
}

function characterRegenerationPlugin() {
  return {
    name: 'character-regeneration',
    configureServer(server) {
      server.middlewares.use('/api/regenerate', async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        if (request.method !== 'POST') {
          response.statusCode = 405; response.end(JSON.stringify({ error: 'POST required' })); return;
        }
        if (activeGeneration) {
          response.statusCode = 409; response.end(JSON.stringify({ error: 'Blender is already regenerating a character' })); return;
        }
        const started = performance.now();
        try {
          const preset = await readJsonBody(request);
          if (!preset?.id || !preset?.values) throw new Error('Preset must contain id and values');
          if (!/^[a-z0-9-]+$/.test(preset.id)) throw new Error('Preset id may contain only lowercase letters, numbers, and hyphens');
          await mkdir(cacheDir, { recursive: true });
          const temporaryPreset = path.join(generatedDir, `${preset.id}.json`);
          const temporaryModel = path.join(generatedDir, `${preset.id}.glb`);
          const publicPreset = path.join(labRoot, 'public/presets', `${preset.id}.json`);
          const publicModel = path.join(labRoot, 'public/models', `${preset.id}.glb`);
          const signature = createHash('sha256').update(`${pipelineVersion}:${JSON.stringify(preset.values)}`).digest('hex').slice(0, 20);
          const cachedModel = path.join(cacheDir, `${preset.id}-${signature}.glb`);
          await writeFile(temporaryPreset, `${JSON.stringify(preset, null, 2)}\n`);
          let cached = true; let log = 'Restored a matching generated character from the local cache.';
          try { await access(cachedModel); } catch {
            cached = false;
            activeGeneration = runBlender(temporaryPreset, temporaryModel);
            log = await activeGeneration;
            await rename(temporaryModel, cachedModel);
          }
          await copyFile(cachedModel, publicModel);
          await rename(temporaryPreset, publicPreset);
          response.end(JSON.stringify({ ok: true, cached, signature, seconds: (performance.now() - started) / 1000, log: log.slice(-1200) }));
        } catch (error) {
          server.config.logger.error(error.stack || error.message);
          response.statusCode = 500;
          response.end(JSON.stringify({ error: error.message.split('\n').slice(-8).join('\n') }));
        } finally {
          activeGeneration = null;
        }
      });
    },
  };
}

export default { plugins: [characterRegenerationPlugin()] };

// Shared setup for the agent runners: choosing a patient, turning on live
// dialogue, and writing run logs.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORED_PATIENT_POOL, createConsultationPatients,
} from '../../src/consultation/patients.js';
import { renderOfflineDialogue } from '../../src/consultation/offlineRenderer.js';
import { renderJamesLetter, renderLunaDialogue } from '../../src/consultation/lunaRenderer.js';
import { POST as consultPost } from '../../../api/consult.mjs';

export const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const arg = (name, fallback = null) => (
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
);
export const flag = (name) => process.argv.includes(`--${name}`);

// Given names, except Ferdinand de Chapuys, whom the other scripts call chapuys.
const AUTHORED = Object.fromEntries(AUTHORED_PATIENT_POOL.map((patient) => {
  const given = patient.profile.identity.givenName.toLowerCase();
  return [given === 'ferdinand' ? 'chapuys' : given, patient];
}));

export const authoredNames = () => Object.keys(AUTHORED);

// 'carmela' picks an authored case. 'case:5:2' picks the third patient of the
// procedural day rolled from seed 5, which no model has seen.
export function pickPatient(spec) {
  if (AUTHORED[spec]) return AUTHORED[spec];
  const match = /^case:(\d+)(?::(\d+))?$/.exec(spec);
  if (!match) throw new Error(`Unknown patient "${spec}". Use ${authoredNames().join(', ')}, or case:SEED[:INDEX].`);
  const patients = createConsultationPatients({ daySeed: Number(match[1]), dayIndex: 1, count: 4 });
  const patient = patients[Number(match[2] || 0)];
  if (!patient) throw new Error(`Seed ${match[1]} has ${patients.length} patients.`);
  return patient;
}

async function loadKeys() {
  let text = '';
  try { text = await readFile(resolve(repoRoot, '.env.local'), 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(OPENAI_API_KEY|ANTHROPIC_API_KEY)\s*=\s*(.+?)\s*$/.exec(line);
    if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, '');
  }
}

let routed = false;
let calls = 0;

// The game's renderers post to /api/consult. In Node that path is served by
// calling the route handler directly, so the prompt and the disclosure rules
// are the deployed ones. Each call gets its own client address because the
// handler's per-client limit is sized for one human player, not a batch.
function routeConsultLocally() {
  if (routed) return;
  routed = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => {
    if (url !== '/api/consult') return realFetch(url, init);
    calls += 1;
    return consultPost(new Request('http://agent.local/api/consult', {
      method: 'POST',
      body: init.body,
      signal: init.signal,
      headers: {
        'content-type': 'application/json',
        origin: 'http://agent.local',
        host: 'agent.local',
        'x-forwarded-for': `agent-${calls}`,
      },
    }));
  };
}

// Offline: authored wording and templates only, no network. Live: custom
// questions and the James letter go to the model, as in the deployed game.
export async function dialogue(live) {
  await loadKeys();
  if (!live) return { renderDialogue: renderOfflineDialogue, renderLetter: null };
  if (!process.env.OPENAI_API_KEY) throw new Error('--live needs OPENAI_API_KEY in .env.local.');
  routeConsultLocally();
  return { renderDialogue: renderLunaDialogue, renderLetter: renderJamesLetter };
}

export async function writeLog(path, record) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

export function stamp() {
  return new Date().toISOString().replaceAll(':', '-').replace(/\..+$/, '');
}

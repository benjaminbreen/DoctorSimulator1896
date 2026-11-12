// Play one Carmela visit in the browser and the same choices as text, then
// compare what the two recorded. A difference means the consultation screen
// and the text runner no longer agree. Needs Chrome; takes about a minute.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARMELA_RUSSO } from '../src/consultation/patients.js';
import { createConsultSession } from './agent/consultSession.js';

const here = fileURLToPath(new URL('.', import.meta.url));

// The same route as playthroughs/carmela-outcome.jsonl, by authored id.
const TEXT_ROUTE = [
  { type: 'ask', id: 'carmela-ask-pattern' },
  { type: 'ask', id: 'carmela-ask-calamity' },
  { type: 'ask', id: 'carmela-response-steady' },
  { type: 'ask', id: 'carmela-ask-tonics' },
  { type: 'ask', id: 'carmela-ask-red-flags' },
  { type: 'examine', id: 'carmela-exam-cardiorespiratory' },
  { type: 'ask', id: 'carmela-ask-shop' },
  { type: 'decide' },
  { type: 'diagnose', id: 'carmela-dx-nervous-coca' },
  { type: 'prescribe', id: 'drug-stop-tonic' },
  { type: 'sign' },
  { type: 'respond', id: 'work' },
  { type: 'respond', id: 'gradual' },
  { type: 'sign' },
];

async function textVisit() {
  const session = createConsultSession({ patient: CARMELA_RUSSO });
  for (const action of TEXT_ROUTE) {
    const observation = await session.act(action);
    if (observation.error) throw new Error(`text run refused ${JSON.stringify(action)}: ${observation.error}`);
  }
  const state = session.state();
  return {
    diagnosis: state.diagnosisId,
    treatments: state.treatmentIds.join(','),
    minutes: state.elapsedMinutes,
    paymentCents: state.result.immediate.paymentCents,
    month: state.result.oneMonth.band,
    agreedPlan: state.treatmentAgreement?.summary || null,
  };
}

async function browserVisit() {
  const output = await mkdtemp(resolve(tmpdir(), 'ghosts-parity-'));
  const child = spawn(process.execPath, [
    resolve(here, 'gameplay-playtest.mjs'), '--scenario=carmela', '--offline', '--text',
    `--replay=${resolve(here, 'playthroughs/carmela-outcome.jsonl')}`, `--output=${output}`,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  await new Promise((done) => child.on('exit', done));
  const captures = (await readdir(output)).filter((name) => /^\d{4}\.json$/.test(name)).sort();
  if (!captures.length) throw new Error(`the browser replay captured nothing; see ${output}`);
  const last = JSON.parse(await readFile(resolve(output, captures.at(-1)), 'utf8'));
  if (last.failure) throw new Error(`the browser replay stopped at ${JSON.stringify(last.command)}: ${last.failure} (${output})`);
  const visit = last.state.casebook?.patients?.[CARMELA_RUSSO.id]?.visits?.at(-1);
  if (visit?.status !== 'complete') throw new Error(`the browser recorded no completed visit; see ${output}`);
  return {
    diagnosis: visit.diagnosis?.id,
    treatments: visit.treatments.map((item) => item.id).join(','),
    minutes: visit.summary.minutesUsed,
    paymentCents: visit.immediateOutcome.paymentCents,
    month: visit.oneMonthOutcome.band,
    agreedPlan: visit.agreedPlan,
  };
}

const [text, browser] = [await textVisit(), await browserVisit()];
console.table({ text, browser });
const differing = Object.keys(text).filter((key) => text[key] !== browser[key]);
if (differing.length) {
  console.error(`Text and browser disagree on: ${differing.join(', ')}`);
  process.exit(1);
}
console.log('Text and browser agree.');

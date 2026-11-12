// Play the game as text: one JSON action per line on stdin, one JSON
// observation per line on stdout. No browser. See docs/agent-play.md.

import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { createConsultSession } from './agent/consultSession.js';
import { createDaySession } from './agent/daySession.js';
import { arg, authoredNames, dialogue, flag, pickPatient, repoRoot, stamp, writeLog } from './agent/setup.js';

if (flag('help')) {
  console.log(`Usage:
  node game/scripts/agent-play.mjs --patient=carmela        one consultation
  node game/scripts/agent-play.mjs --patient=case:5:2       a procedural patient (seed 5, third of the day)
  node game/scripts/agent-play.mjs --day --seed=4           the whole practice day, and the days after

Options:
  --live            custom questions and the James letter use the model (needs OPENAI_API_KEY)
  --hints=full      show every diagnosis unranked instead of the ranked shortlist
  --authored        with --day: day one uses the authored patients
  --replay=FILE     run a recorded list of actions, then exit
  --log=FILE        where to write the run log (default artifacts/agent/)

Authored patients: ${authoredNames().join(', ')}.
Each observation lists the actions available now; send one back as JSON.
{"type":"observe"} repeats the observation. {"type":"quit"} or EOF ends the run.
The log, written on exit, holds the transcript and the authored ground truth.`);
  process.exit(0);
}

const hints = arg('hints', 'shortlist');
if (!['shortlist', 'full'].includes(hints)) throw new Error('--hints is shortlist or full.');
const live = flag('live');
const renderers = await dialogue(live);
const day = flag('day');
const seed = Number(arg('seed', 4));
const session = day
  ? createDaySession({ seed, authored: flag('authored'), hints, ...renderers })
  : createConsultSession({ patient: pickPatient(arg('patient', 'nora')), hints, ...renderers });

const emit = (value) => console.log(JSON.stringify(value));
emit(session.observe());

async function run(line) {
  let action;
  try { action = JSON.parse(line); } catch (error) {
    emit({ error: `not JSON: ${error.message}` });
    return true;
  }
  if (action.type === 'quit') return false;
  emit(await session.act(action));
  return true;
}

const replay = arg('replay');
if (replay) {
  const lines = (await readFile(resolve(replay), 'utf8')).split(/\r?\n/).filter((line) => line.trim());
  for (const line of lines) if (!await run(line)) break;
} else {
  for await (const line of createInterface({ input: process.stdin, terminal: false })) {
    if (line.trim() && !await run(line)) break;
  }
}

const path = resolve(arg('log', resolve(repoRoot, `artifacts/agent/${stamp()}-${day ? `day-${seed}` : arg('patient', 'nora').replaceAll(':', '-')}.json`)));
await writeLog(path, { mode: day ? 'day' : 'consultation', live, seed: day ? seed : undefined, ...session.log() });
emit({ log: path });

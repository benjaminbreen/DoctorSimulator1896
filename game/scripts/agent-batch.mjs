// Run many text playthroughs and tabulate them: patients x players x
// personas x repeats, or whole days by seed. See docs/agent-play.md.

import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createConsultSession } from './agent/consultSession.js';
import { createDaySession } from './agent/daySession.js';
import { PERSONAS, completer, createPlayer, play } from './agent/players.js';
import { arg, authoredNames, dialogue, flag, pickPatient, repoRoot, stamp, writeLog } from './agent/setup.js';

if (flag('help')) {
  console.log(`Usage:
  node game/scripts/agent-batch.mjs --patients=carmela,samuel --players=claude-opus-5-5 --personas=period,modern --runs=3
  node game/scripts/agent-batch.mjs --patients=all --players=random --runs=200
  node game/scripts/agent-batch.mjs --day --seeds=1,2,3 --days=2 --players=random

Options:
  --patients=LIST   authored names (${authoredNames().join(', ')}), case:SEED[:INDEX], or all
  --players=LIST    random, or model names (claude-* use Anthropic, others OpenAI)
  --personas=LIST   ${Object.keys(PERSONAS).join(', ')} (model players only; default period)
  --runs=N          repeats of each combination (default 1)
  --hints=full      every diagnosis unranked, instead of the ranked shortlist
  --live            patient replies to custom questions come from the model
  --judge=MODEL     a model reads each transcript for anachronism and manner
  --effort=LEVEL    reasoning effort passed to model players
  --max-steps=N     stop a run after N actions (default 80; 400 for days)
  --parallel=N      consultations at once (default 1; days always run one at a time)
  --out=DIR         output folder (default artifacts/agent/batch-<time>)`);
  process.exit(0);
}

const list = (name, fallback) => arg(name, fallback).split(',').map((item) => item.trim()).filter(Boolean);
const day = flag('day');
const players = list('players', 'random');
const personas = list('personas', 'period');
const runs = Number(arg('runs', 1));
const hints = arg('hints', 'shortlist');
const live = flag('live');
const effort = arg('effort');
const maxSteps = Number(arg('max-steps', day ? 400 : 80));
const judgeModel = arg('judge');
const out = resolve(arg('out', resolve(repoRoot, `artifacts/agent/batch-${stamp()}`)));
const renderers = await dialogue(live);

const JUDGE = `You review a transcript from a game set in a New York medical practice in June 1896. The player was the physician. Judge only the physician's own words: lines marked "own words" and the private reasoning. Lines marked "offered choice" were written by the game and are not the player's.

Report anachronisms: any concept, term, drug, test, or line of reasoning that a New York physician could not have used in 1896. Then score periodFidelity from 0 (thoroughly modern) to 10 (nothing out of period) and bedsideManner from 0 (cold or insulting) to 10 (attentive and kind).

Reply with one JSON object and nothing else:
{"anachronisms": [{"quote": "<the words>", "why": "<one sentence>"}], "periodFidelity": <0-10>, "bedsideManner": <0-10>, "summary": "<two sentences>"}`;

async function judge(log) {
  const lines = log.steps.map((step) => {
    const own = ['say', 'think'].includes(step.action.type) && step.action.text && !step.action.n;
    const words = step.action.text || step.action.label || step.action.id || '';
    return [
      step.reasoning ? `reasoning: ${step.reasoning}` : null,
      `${own ? 'own words' : 'offered choice'} [${step.action.type}]: ${words}`,
    ].filter(Boolean).join('\n');
  });
  const record = [
    ...lines,
    `diagnosis: ${log.outcome.diagnosis?.label || 'none'}`,
    `prescription: ${log.outcome.treatments.join(', ') || 'none'}`,
  ].join('\n');
  const { text } = await completer(judgeModel)(JUDGE, [{ role: 'user', content: record }]);
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

function consultRow(job, log, run) {
  const result = log.outcome.result;
  return {
    patient: job.patient,
    player: job.player,
    persona: job.persona || '',
    run: job.run,
    diagnosis: log.outcome.diagnosis?.label || `(${log.outcome.stage})`,
    best: log.groundTruth.choseBestDiagnosis,
    dxQuality: log.groundTruth.chosenDiagnosisQuality,
    evidence: `${log.groundTruth.evidence.found}/${log.groundTruth.evidence.of}`,
    minutes: log.outcome.minutesUsed,
    questions: log.outcome.questions,
    own: log.outcome.customQuestions,
    exams: log.outcome.examinations,
    satisfaction: result?.immediate?.satisfactionOutOfTen ?? '',
    month: result?.oneMonth?.band || '',
    promise: result?.scores?.scientificPromise ?? '',
    ...(judgeModel ? { fidelity: log.judge?.periodFidelity ?? '', manner: log.judge?.bedsideManner ?? '' } : {}),
    rejected: log.outcome.rejectedActions,
    error: run.error || '',
  };
}

async function runConsult(job, index) {
  const patient = pickPatient(job.patient);
  const session = createConsultSession({ patient, hints, ...renderers });
  const player = createPlayer(job.player, { persona: job.persona, effort, seed: job.run });
  const run = await play(session, player, { maxSteps });
  const log = { mode: 'consultation', live, player: player.name, ...run, ...session.log() };
  if (judgeModel && !job.player.startsWith('random') && log.steps.length) {
    try { log.judge = await judge(log); } catch (error) { log.judge = { error: error.message }; }
  }
  await writeLog(resolve(out, `${String(index).padStart(4, '0')}-${job.patient.replaceAll(':', '-')}-${job.player.replaceAll(/[^\w.-]/g, '_')}-${job.persona || 'none'}-${job.run}.json`), log);
  return consultRow(job, log, run);
}

async function runDay(job, index) {
  const session = createDaySession({ seed: job.seed, authored: flag('authored'), hints, ...renderers });
  const player = createPlayer(job.player, { persona: job.persona, effort, seed: job.run });
  const days = Number(arg('days', 1));
  const run = await play(session, player, { maxSteps, until: (current) => current.daysCompleted() >= days });
  const log = { mode: 'day', live, player: player.name, ...run, ...session.log() };
  await writeLog(resolve(out, `${String(index).padStart(4, '0')}-day-${job.seed}-${job.player.replaceAll(/[^\w.-]/g, '_')}-${job.persona || 'none'}-${job.run}.json`), log);
  const finished = log.days.filter((item) => !item.unfinished);
  const seen = finished.flatMap((item) => item.appointments);
  return {
    seed: job.seed,
    player: job.player,
    persona: job.persona || '',
    run: job.run,
    days: finished.length,
    seen: `${seen.filter((item) => item.outcome === 'Seen').length}/${seen.length}`,
    takings: finished.reduce((total, item) => total + item.takingsCents, 0),
    standing: log.final.standing,
    nerves: log.final.nerves,
    bestDx: `${log.consultations.filter((item) => item.groundTruth.choseBestDiagnosis).length}/${log.consultations.length}`,
    steps: run.steps,
    error: run.error || '',
  };
}

const jobs = [];
for (const player of players) {
  for (const persona of player.startsWith('random') ? [null] : personas) {
    for (let run = 1; run <= runs; run += 1) {
      if (day) {
        for (const seed of list('seeds', '4')) jobs.push({ seed: Number(seed), player, persona, run });
      } else {
        const names = arg('patients', 'all') === 'all' ? authoredNames() : list('patients');
        for (const patient of names) jobs.push({ patient, player, persona, run });
      }
    }
  }
}

// Days share the world modules' single state, so they never overlap.
const parallel = day ? 1 : Math.max(1, Number(arg('parallel', 1)));
const rows = new Array(jobs.length);
let next = 0;
await Promise.all(Array.from({ length: parallel }, async () => {
  while (next < jobs.length) {
    const index = next;
    next += 1;
    try {
      rows[index] = await (day ? runDay : runConsult)(jobs[index], index);
    } catch (error) {
      rows[index] = { ...jobs[index], error: error.message };
    }
  }
}));

const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
const cell = (value) => (/[",\n]/.test(String(value ?? '')) ? `"${String(value).replaceAll('"', '""')}"` : String(value ?? ''));
await writeLog(resolve(out, 'summary.json'), rows);
await writeFile(resolve(out, 'summary.csv'), `${[columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n')}\n`);

// Long batches print the totals; short ones print every run.
if (rows.length <= 40) console.table(rows);
if (!day) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.patient} | ${row.player}${row.persona ? ` | ${row.persona}` : ''}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const mean = (items, field) => {
    const values = items.map((item) => Number(item[field])).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : '';
  };
  console.table(Object.fromEntries([...groups].map(([key, items]) => [key, {
    runs: items.length,
    bestDx: `${items.filter((item) => item.best === true).length}/${items.length}`,
    dxQuality: mean(items, 'dxQuality'),
    minutes: mean(items, 'minutes'),
    satisfaction: mean(items, 'satisfaction'),
    improved: items.filter((item) => item.month === 'improved').length,
    harmed: items.filter((item) => ['worse', 'harmed'].includes(item.month)).length,
    noDiagnosis: items.filter((item) => String(item.diagnosis).startsWith('(')).length,
    errors: items.filter((item) => item.error).length,
  }])));
}
console.log(`Logs and summary: ${out}`);
if (rows.some((row) => row.error)) process.exitCode = 1;

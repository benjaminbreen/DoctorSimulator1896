const urlArg = process.argv.find((arg) => arg.startsWith('--url='));
const endpoint = new URL('/api/consult', urlArg?.slice(6) || 'http://127.0.0.1:5175');
const emotions = process.argv.includes('--emotions');
const turns = [
  'Please take your time. I will listen carefully to whatever you wish to say.',
  ...(emotions ? [
    'People like you always make a fuss. Why should I take you seriously?',
    'I spoke cruelly. I am sorry. You deserve to be heard, and I will listen carefully.',
  ] : []),
];
const recentTurns = [];
let currentEmotion = { expression: 'guarded', expressionIntensity: 0.5, gaze: 'doctor', bodyCue: 'clinic-idle' };

// Probe the live route directly: the game's silent offline fallback must not
// make a failed connection look like a successful model response.
for (const text of turns) {
  const payload = {
    schemaVersion: 1,
    task: 'render-patient-dialogue',
    patient: { name: 'Test patient', voice: 'A reserved fictional adult. Speak plainly.' },
    player: { text, stance: 'question' },
    knownFacts: [],
    allowedNewFacts: [],
    recentTurns,
    currentEmotion,
  };
  const started = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { origin: endpoint.origin, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });
    const reply = await response.json();
    const ok = response.ok && typeof reply.dialogue === 'string' && Boolean(reply.dialogue.trim())
      && typeof reply.expression === 'string' && typeof reply.bodyCue === 'string'
      && Number.isFinite(reply.expressionIntensity) && reply.expressionIntensity >= 0 && reply.expressionIntensity <= 1
      && ['doctor', 'away', 'down', 'neutral'].includes(reply.gaze);
    console.log(JSON.stringify({
      ok, status: response.status, elapsedMs: Math.round(performance.now() - started),
      doctor: text, ...reply,
    }, null, 2));
    if (!ok) {
      process.exitCode = 1;
      break;
    }
    currentEmotion = {
      expression: reply.expression, expressionIntensity: reply.expressionIntensity,
      gaze: reply.gaze, bodyCue: reply.bodyCue,
    };
    recentTurns.push({ player: text, patient: reply.dialogue, register: reply.register, ...currentEmotion });
  } catch (error) {
    console.error(`Luna check failed: ${error.message}. Start the game dev server with npm run game.`);
    process.exitCode = 1;
    break;
  }
}

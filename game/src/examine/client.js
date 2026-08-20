// A custom question about the object in front of you. The route renders an
// answer out of the record's facts; with no key configured the fallback below
// answers from the same facts by plain string matching, so the panel is never
// dead.

const REQUEST_TIMEOUT_MS = 10000;

const NOTHING =
  'Looking will not settle that. Nothing about the thing itself answers it.';

// Offline: return the fact whose words the question most nearly hits. Crude on
// purpose — it is a fallback, not a second dialogue system.
function offlineAnswer(facts, text) {
  const words = String(text)
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((word) => word.length > 3);
  if (words.length === 0) return NOTHING;
  let best = null;
  let bestScore = 0;
  for (const fact of facts) {
    const lower = fact.toLowerCase();
    const score = words.reduce((total, word) => total + (lower.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = fact;
      bestScore = score;
    }
  }
  return best ?? NOTHING;
}

export async function askAboutObject({
  subjectId,
  question,
  facts,
  seen,
  signal,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    return { answer: offlineAnswer(facts, question), source: 'offline' };
  }

  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl('/api/examine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        schemaVersion: 1,
        task: 'answer-examination-question',
        subjectId,
        question: String(question).trim(),
        // The facts travel with the request: they are the client's simulation
        // ground truth, and the route may state nothing outside them.
        facts,
        seen: seen.slice(-8),
      }),
    });
    if (!response.ok) throw new Error(`examine route returned ${response.status}`);
    const result = await response.json();
    if (typeof result.answer !== 'string' || !result.answer.trim()) {
      throw new Error('examine route returned no answer');
    }
    return { answer: result.answer.trim(), source: 'luna' };
  } catch (error) {
    if (controller.signal.aborted && signal?.aborted) throw error;
    return { answer: offlineAnswer(facts, question), source: 'offline' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

// One model call per procedural patient rewords their lines in their own
// voice. Ground truth never passes through here: the result only replaces
// wording, by line id, and the templates stand whenever it fails.

const ROUTE = '/api/consult';
// The route gives up at 18s; this only fires if the route is unreachable.
const TIMEOUT_MS = 20000;
const STORE_PREFIX = 'ghosts-voice-v1:';
const memory = new Map();
const pending = new Map();

// The drafts are part of the key, so editing a condition retires old voices.
function keyFor(patient) {
  let hash = 5381;
  for (const char of JSON.stringify(patient.voiceLines)) hash = (Math.imul(hash, 33) ^ char.charCodeAt(0)) >>> 0;
  return `${STORE_PREFIX}${patient.id}:${patient.profile?.seed}:${hash.toString(36)}`;
}

// Keep only known lines, drop the quotation marks the assembler adds itself,
// and reject anything with an unfilled placeholder or of runaway length.
export function cleanVoice(lines, reply) {
  const drafts = new Map(lines.map((line) => [line.id, line.text]));
  const voice = {};
  for (const line of reply?.lines || []) {
    if (!drafts.has(line?.id) || typeof line.text !== 'string') continue;
    const text = line.id.startsWith('choice:')
      ? line.text.trim()
      : line.text.trim().replace(/^[“"]+/, '').replace(/[”"]+$/, '').trim();
    if (!text || /\{\w+\}/.test(text) || text.length > drafts.get(line.id).length * 2 + 60) continue;
    voice[line.id] = text;
  }
  return Object.keys(voice).length ? voice : null;
}

export function cachedPatientVoice(patient) {
  if (!patient?.voiceLines) return null;
  const key = keyFor(patient);
  if (memory.has(key)) return memory.get(key);
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(key) || 'null');
    if (stored && typeof stored === 'object') {
      memory.set(key, stored);
      return stored;
    }
  } catch {}
  return null;
}

export function requestPatientVoice(patient, fetchImpl = globalThis.fetch) {
  if (!patient?.voiceLines?.length || typeof fetchImpl !== 'function') return Promise.resolve(null);
  const cached = cachedPatientVoice(patient);
  if (cached) return Promise.resolve(cached);
  const key = keyFor(patient);
  if (pending.has(key)) return pending.get(key);
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          task: 'render-patient-voice',
          schemaVersion: 1,
          patient: { style: patient.dialogueStyle, complaint: patient.profile.clinical.presentingComplaint },
          lines: patient.voiceLines,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const voice = cleanVoice(patient.voiceLines, await response.json());
      if (!voice) return null;
      memory.set(key, voice);
      try { globalThis.localStorage?.setItem(key, JSON.stringify(voice)); } catch {}
      return voice;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      pending.delete(key);
    }
  })();
  pending.set(key, request);
  return request;
}

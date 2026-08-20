import { buildDialogueModelPayload, buildJamesModelPayload } from './modelBoundary.js';
import { renderOfflineDialogue } from './offlineRenderer.js';

const ROUTE = '/api/consult';
// Measured replies land in 2-3s. The route gives up first, at 9s, so this only
// fires if the route itself is unreachable.
const TIMEOUT_MS = 10000;

// The model only ever supplies wording, a performance cue, and a reading of
// the doctor's manner. Decorum and termination stay deterministic so an
// insult cannot be talked away.
function merge(offline, reply, maxDisclosures) {
  return {
    dialogue: reply.dialogue,
    behavior: reply.behavior || offline.behavior,
    disclosedNow: (reply.disclosedNow || []).slice(0, maxDisclosures),
    reactionExpression: reply.expression || null,
    bodyCue: reply.bodyCue || null,
    appraisal: { ...offline.appraisal, register: reply.register || offline.appraisal.register },
  };
}

async function askModel(request, patient, offline) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildDialogueModelPayload(request, patient)),
      signal: controller.signal,
    });
    if (!response.ok) return offline;
    const reply = await response.json();
    if (!reply?.dialogue) return offline;
    return merge(offline, reply, request.maxDisclosures ?? 1);
  } catch {
    return offline;
  } finally {
    clearTimeout(timer);
  }
}

// Authored wording beats generated wording, so the model is asked only when a
// custom question matches no authored rule. Any failure returns the offline
// reply, which is what the consultation used before this route existed.
export function renderLunaDialogue(request, patient) {
  const offline = renderOfflineDialogue(request, patient);
  if (!request.custom || request.resolvedRuleId || offline.appraisal.terminates) return offline;
  return askModel(request, patient, offline);
}

// James reads the whole visit and writes in his own hand. Any failure returns
// null; the caller falls back to the templated letter in the result.
export async function renderJamesLetter(patient, state, result) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildJamesModelPayload(patient, state, result)),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const reply = await response.json();
    return typeof reply?.letter === 'string' && reply.letter.trim() ? reply.letter.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

import { npcDialogueDefinition, offlineNpcReply } from './npcDialogue.js';

const REQUEST_TIMEOUT_MS = 10000;

function fallback(npc, text) {
  return {
    dialogue: offlineNpcReply(npc, text),
    behavior: npc.offlineBehavior ?? '',
    source: 'offline',
  };
}

export async function renderNpcDialogue({
  npcId,
  text,
  recentTurns = [],
  worldTime,
  signal,
  fetchImpl = globalThis.fetch,
}) {
  const npc = npcDialogueDefinition(npcId);
  if (!npc) throw new Error('Unknown NPC dialogue');
  if (typeof fetchImpl !== 'function') return fallback(npc, text);

  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl('/api/npc-dialogue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        schemaVersion: 2,
        task: 'render-npc-dialogue',
        npcId,
        playerText: String(text).trim(),
        recentTurns: recentTurns.slice(-6),
        ...(worldTime ? { worldTime } : {}),
        // Speakers exist only in this client's simulation; the server
        // rebuilds the identical deterministic definition from this packet.
        crowdContext: npc.clientContext,
      }),
    });
    if (!response.ok) throw new Error(`NPC dialogue route returned ${response.status}`);
    const result = await response.json();
    if (typeof result.dialogue !== 'string' || !result.dialogue.trim()) {
      throw new Error('NPC dialogue route returned no dialogue');
    }
    return {
      dialogue: result.dialogue.trim(),
      behavior: typeof result.behavior === 'string' ? result.behavior.trim() : '',
      source: 'luna',
    };
  } catch (error) {
    if (controller.signal.aborted && signal?.aborted) throw error;
    return fallback(npc, text);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

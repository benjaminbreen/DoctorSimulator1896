// NPC dialogue registry. Speakers are procedural: providers (the crowd, the
// park keeper) build definitions from live simulation context. The definition
// carries everything the language model may know; when the model is
// unreachable, a small deterministic responder answers instead.

const PROVIDERS = [];

export function registerNpcDialogueProvider(provider) {
  if (typeof provider === 'function' && !PROVIDERS.includes(provider)) {
    PROVIDERS.push(provider);
  }
}

export function npcDialogueDefinition(id) {
  for (const provider of PROVIDERS) {
    const definition = provider(id);
    if (definition) return definition;
  }
  return null;
}

function cleanQuestion(text) {
  return String(text ?? '').trim().toLocaleLowerCase('en-US');
}

// Offline stand-in for the model: greeting, the year, where they are bound,
// otherwise a shrug. Everything else needs the live route.
export function offlineNpcReply(npc, text) {
  const question = cleanQuestion(text);
  if (/^(hello|hullo|good (morning|day|evening)|how do you do)\b/.test(question)) {
    return npc.greetingDialogue ?? 'Good day to you, sir.';
  }
  if (/\byear\b|o'clock|what time|the hour|what day|what month/.test(question)) {
    return 'It is eighteen ninety-six, sir.';
  }
  if (/where|bound|headed|going|off to/.test(question)) {
    return `I am ${npc.whereabouts ?? 'only passing through'}, sir.`;
  }
  return npc.fallbackDialogue ?? 'I could not rightly say, sir.';
}

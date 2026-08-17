// A piece of money held out to somebody. Whether it is taken is decided here,
// by station, before anyone speaks — an officer hands a bribe back and a
// respectable woman refuses to be tipped, so those pieces return to the purse
// and the model is told it is giving them back rather than pocketing them.

import { getAgent, listAgents } from './agents.js';
import { moneyMannerFor } from './crowdDialogue.js';
import { settleGrievance } from './grievances.js';
import { addPiece, denomination, removePiece } from './purse.js';

// Two stations refuse money on principle rather than on the day.
const REFUSING = new Set(['bribe', 'affront']);

const offers = new Map();

function archetypeOf(dialogueId) {
  const direct = getAgent(dialogueId)?.dialogueContext;
  if (direct) return direct.archetype;
  for (const agent of listAgents()) {
    if (agent.dialogueId === dialogueId) return agent.dialogueContext?.archetype;
  }
  return undefined;
}

// One live offer per person, cleared when their conversation closes.
export function offerPiece(dialogueId, pieceId) {
  const piece = denomination(pieceId);
  if (!dialogueId || !piece) return null;
  if (!removePiece(pieceId, 1)) return null;

  const manner = moneyMannerFor(archetypeOf(dialogueId));
  const refused = REFUSING.has(manner);
  // Refused money never really left the player's hand.
  if (refused) addPiece(pieceId, 1);
  else settleGrievance(dialogueId);

  const offer = {
    pieceId, label: piece.label, cents: piece.cents, refused,
  };
  offers.set(dialogueId, offer);
  return offer;
}

export function offerTo(dialogueId) {
  return offers.get(dialogueId) ?? null;
}

export function clearOffer(dialogueId) {
  offers.delete(dialogueId);
}

export function resetOffersForTests() {
  offers.clear();
}

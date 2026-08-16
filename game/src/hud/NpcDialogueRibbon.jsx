import { useEffect, useMemo, useRef, useState } from 'react';
import { stopUsing } from '../world/interaction.js';
import { npcDialogueDefinition } from '../world/npcDialogue.js';
import { renderNpcDialogue } from '../world/npcDialogueClient.js';
import { receiveGood } from '../world/pocket.js';
import { formatPrice, getPurseCents, spendCents, subscribePurse } from '../world/purse.js';
import { settleGrievance } from '../world/grievances.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import './npc-dialogue.css';

export default function NpcDialogueRibbon({ conversation, worldClock }) {
  const npc = useMemo(
    () => npcDialogueDefinition(conversation?.npcId),
    [conversation?.npcId],
  );
  const open = Boolean(conversation && npc);
  const panelRef = useDismissableOverlay(open, stopUsing, {
    autoFocus: false,
    trapFocus: true,
    blockInput: true,
  });
  const [dialogue, setDialogue] = useState('');
  const [behavior, setBehavior] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [recentTurns, setRecentTurns] = useState([]);
  const [purse, setPurse] = useState(getPurseCents);
  const requestRef = useRef(null);

  // The purse publishes its pieces; the ribbon only needs the total.
  useEffect(() => subscribePurse(() => setPurse(getPurseCents())), []);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    if (!open) return undefined;
    setDialogue(npc.opening);
    setBehavior('');
    setQuestion('');
    setBusy(false);
    setRecentTurns([]);
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [open, npc]);

  // Conversation slows the civil clock rather than stopping it. Restore the
  // exact previous rate when this ribbon releases the player.
  useEffect(() => {
    if (!open) return undefined;
    const previousRate = worldClock.getSnapshot().rate;
    worldClock.setRate(Math.min(previousRate, 1));
    return () => worldClock.setRate(previousRate);
  }, [open, worldClock]);

  useEffect(() => {
    if (conversation && !npc) stopUsing();
  }, [conversation, npc]);

  async function ask(playerText) {
    if (!playerText || busy) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setBehavior('');
    const snapshot = worldClock.getSnapshot();
    try {
      const result = await renderNpcDialogue({
        npcId: npc.id,
        text: playerText,
        recentTurns,
        worldTime: {
          year: snapshot.date.year,
          month: snapshot.date.month,
          date: snapshot.date.date,
          hour: snapshot.visual.hour,
          minute: snapshot.visual.minute,
        },
        signal: controller.signal,
      });
      setDialogue(result.dialogue);
      setBehavior(result.behavior);
      setRecentTurns((turns) => [...turns, { player: playerText, npc: result.dialogue }].slice(-6));
      setQuestion('');
    } catch (error) {
      if (error?.name !== 'AbortError') throw error;
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  }

  function askQuestion(event) {
    event.preventDefault();
    return ask(question.trim());
  }

  // The money moves here, before the model speaks: the sale is a simulation
  // fact, and the reply only reports it. A refused sale never reaches Luna.
  function buy(good) {
    if (busy || !spendCents(good.priceCents)) return undefined;
    const owed = Boolean(npc.grievance);
    // Paying off a theft settles the debt for something already taken; a sale
    // hands over goods. `good.id` must name a row in goods.js.
    if (owed) settleGrievance(npc.id);
    else receiveGood(good.id);
    return ask(owed
      ? `I hand over ${formatPrice(good.priceCents)} to settle for what I took.`
      : `I hand over ${formatPrice(good.priceCents)} for ${good.label}.`);
  }

  if (!open) return null;

  return (
    <div className="npc-dialogue-layer">
      <section
        ref={panelRef}
        className="npc-dialogue-ribbon"
        role="dialog"
        aria-modal="true"
        aria-labelledby="npc-dialogue-speaker"
        tabIndex={-1}
      >
        <button
          className="npc-dialogue-close"
          type="button"
          onClick={stopUsing}
          aria-label={`End conversation with ${npc.name}`}
        >
          ×
        </button>
        <div className="npc-dialogue-speaker-copy">
          <div className="npc-dialogue-speaker-tab" id="npc-dialogue-speaker">
            <strong>{npc.name}</strong>
            <small>{npc.role}</small>
          </div>
          <p className={`npc-dialogue-line${busy ? ' is-waiting' : ''}`} aria-live="polite">
            {busy ? `${npc.name} considers your question…` : dialogue}
          </p>
          <div className="npc-dialogue-status">
            {behavior || 'Conversation'} <span aria-hidden="true">·</span> Nearby time slowed
          </div>
        </div>
        <div className="npc-dialogue-replies">
          <h2>Your reply</h2>
          {npc.sells.map((good) => (
            <button
              className="npc-dialogue-topic npc-dialogue-buy"
              type="button"
              key={good.id}
              disabled={busy || purse < good.priceCents}
              onClick={() => buy(good)}
            >
              {npc.grievance ? `Pay for ${good.label}` : `Buy ${good.label}`}
              <em>{formatPrice(good.priceCents)}</em>
            </button>
          ))}
          {npc.suggestedQuestions.map((suggested) => (
            <button
              className="npc-dialogue-topic"
              type="button"
              key={suggested}
              disabled={busy}
              onClick={() => ask(suggested)}
            >
              {suggested}
            </button>
          ))}
          <form className="npc-dialogue-question" onSubmit={askQuestion}>
            <label htmlFor="npc-dialogue-question">Ask {npc.name} a question</label>
            <input
              id="npc-dialogue-question"
              type="text"
              value={question}
              maxLength={400}
              autoComplete="off"
              placeholder="Ask in your own words…"
              disabled={busy}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button type="submit" disabled={busy || !question.trim()}>
              {busy ? 'Asking' : 'Ask'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

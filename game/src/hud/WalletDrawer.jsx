import { useCallback, useEffect, useState } from 'react';
import { formatPrice, getPurse, getPurseCents, subscribePurse } from '../world/purse.js';
import { offerPiece } from '../world/moneyOffer.js';
import { useInstrument } from '../world/interaction.js';
import { notice } from '../world/notices.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import { useMoneyDrag } from './useMoneyDrag.js';
import MoneyPiece from './MoneyPiece.jsx';
import './wallet.css';

// Notes lie flat in the billfold; coins sit in the pocket beside it. Either
// can be dragged out and pressed on somebody standing near enough to take it.
export default function WalletDrawer({ open, onClose }) {
  const [purse, setPurse] = useState(getPurse);
  useEffect(() => subscribePurse(setPurse), []);

  const handleDrop = useCallback((piece, target) => {
    if (target.kind !== 'npc') {
      notice('You think better of it and put the money away.', { key: 'wallet-drop' });
      return;
    }
    // The purse loses the piece here, before anyone speaks.
    if (!offerPiece(target.id, piece.id)) return;
    onClose();
    useInstrument({
      id: `conversation:${target.id}`,
      kind: 'conversation',
      npcId: target.id,
      dialogueName: target.name,
    });
  }, [onClose]);

  const { drag, start } = useMoneyDrag(handleDrop);

  const panelRef = useDismissableOverlay(open, onClose, {
    autoFocus: true,
    trapFocus: true,
    blockInput: true,
  });

  if (!open) return null;

  const cents = getPurseCents();
  const notes = purse.filter((piece) => piece.kind === 'note');
  const coins = purse.filter((piece) => piece.kind === 'coin');

  const pieceProps = (piece) => ({
    title: `${piece.label} — drag onto someone to give it`,
    onPointerDown: (event) => start(piece, event),
  });

  return (
    <div className="wallet-layer">
      {/* Clicking the world outside the billfold puts it away. */}
      <button className="wallet-scrim" type="button" aria-label="Put the wallet away" onClick={onClose} />
      <section
        ref={panelRef}
        className={`wallet-drawer${drag ? ' is-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-total"
        tabIndex={-1}
      >
        <button className="wallet-close" type="button" onClick={onClose} aria-label="Put the wallet away">
          ×
        </button>

        <div className="wallet-body">
          <div className="wallet-billfold">
            {notes.length === 0
              ? <p className="wallet-empty">No paper money.</p>
              : notes.map((piece) => (
                <div className="wallet-note" key={piece.id} {...pieceProps(piece)}>
                  <MoneyPiece piece={piece} size={96} />
                  {piece.count > 1 && <span className="wallet-count">×{piece.count}</span>}
                </div>
              ))}
          </div>

          <div className="wallet-total">
            <h2 id="wallet-total">On hand</h2>
            <p>{formatPrice(cents)}</p>
            <div className="wallet-spoken">Drag a piece onto someone to give it</div>
          </div>

          <div className="wallet-pocket">
            {coins.length === 0
              ? <p className="wallet-empty">Not a cent in coin.</p>
              : coins.map((piece) => (
                <div className="wallet-coin" key={piece.id} {...pieceProps(piece)}>
                  <MoneyPiece piece={piece} size={82} />
                  {piece.count > 1 && <span className="wallet-count">×{piece.count}</span>}
                </div>
              ))}
          </div>
        </div>
      </section>

      {drag && (
        <>
          {/* Who is near enough to take it. Without these the player is
              guessing, and a miss reads as the feature being broken. */}
          {(drag.candidates ?? []).map((who) => (
            <div
              key={who.id}
              className={`money-target${drag.over?.id === who.id ? ' is-over' : ''}`}
              style={{ left: who.screenX, top: who.screenY }}
            >
              <span>{who.name}</span>
            </div>
          ))}
          <div
            className={`money-in-hand${drag.over ? ' is-over' : ''}`}
            style={{ left: drag.x, top: drag.y }}
          >
            <MoneyPiece piece={drag.piece} size={drag.piece.kind === 'note' ? 82 : 70} />
          </div>
          {drag.over && (
            <div className="money-drop-hint" style={{ left: drag.x, top: drag.y }}>
              Give to {drag.over.name}
            </div>
          )}
        </>
      )}
    </div>
  );
}

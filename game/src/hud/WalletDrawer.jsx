import { useEffect, useState } from 'react';
import { describePurse, formatPrice, getPurse, getPurseCents, subscribePurse } from '../world/purse.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import MoneyPiece from './MoneyPiece.jsx';
import './wallet.css';

// Notes lie flat in the billfold; coins sit in the pocket beside it.
export default function WalletDrawer({ open, onClose }) {
  const [purse, setPurse] = useState(getPurse);
  useEffect(() => subscribePurse(setPurse), []);

  const panelRef = useDismissableOverlay(open, onClose, {
    autoFocus: true,
    trapFocus: true,
    blockInput: true,
  });

  if (!open) return null;

  const cents = getPurseCents();
  const notes = purse.filter((piece) => piece.kind === 'note');
  const coins = purse.filter((piece) => piece.kind === 'coin');

  return (
    <div className="wallet-layer">
      {/* Clicking the world outside the billfold puts it away. */}
      <button className="wallet-scrim" type="button" aria-label="Put the wallet away" onClick={onClose} />
      <section
        ref={panelRef}
        className="wallet-drawer"
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
                <div className="wallet-note" key={piece.id} title={piece.label}>
                  <MoneyPiece piece={piece} size={96} />
                  {piece.count > 1 && <span className="wallet-count">×{piece.count}</span>}
                </div>
              ))}
          </div>

          <div className="wallet-total">
            <h2 id="wallet-total">On hand</h2>
            <p>{formatPrice(cents)}</p>
            <div className="wallet-spoken">{describePurse(cents)}</div>
          </div>

          <div className="wallet-pocket">
            {coins.length === 0
              ? <p className="wallet-empty">Not a cent in coin.</p>
              : coins.map((piece) => (
                <div className="wallet-coin" key={piece.id} title={piece.label}>
                  <MoneyPiece piece={piece} size={82} />
                  {piece.count > 1 && <span className="wallet-count">×{piece.count}</span>}
                </div>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}

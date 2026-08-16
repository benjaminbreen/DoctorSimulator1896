import { useEffect, useState } from 'react';
import { getPocket, heldGood, runVerb, stowHeld, subscribePocket } from '../world/pocket.js';
import { subscribeThrowablePlay } from '../world/throwablePlay.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import './wallet.css';

// What the doctor has about him. The thing in hand keeps its own row at the
// top, because putting it away is the action most often wanted here.
export default function ItemsDrawer({ open, onClose }) {
  const [pocket, setPocket] = useState(getPocket);
  const [held, setHeld] = useState(heldGood);
  useEffect(() => subscribePocket(setPocket), []);
  useEffect(() => subscribeThrowablePlay(() => setHeld(heldGood())), []);

  const panelRef = useDismissableOverlay(open, onClose, {
    autoFocus: true,
    trapFocus: true,
    blockInput: true,
  });

  if (!open) return null;

  const rows = [
    ...(held ? [{ ...held, count: 1, inHand: true }] : []),
    ...pocket.map((item) => ({ ...item, inHand: false })),
  ];

  return (
    <div className="wallet-layer">
      <button className="wallet-scrim" type="button" aria-label="Put your things away" onClick={onClose} />
      <section
        ref={panelRef}
        className="wallet-drawer wallet-drawer--items"
        role="dialog"
        aria-modal="true"
        aria-labelledby="items-title"
        tabIndex={-1}
      >
        <button className="wallet-close" type="button" onClick={onClose} aria-label="Put your things away">
          ×
        </button>

        <h2 className="items-title" id="items-title">About your person</h2>

        {rows.length === 0 ? (
          <p className="wallet-empty items-none">Your pockets are empty.</p>
        ) : (
          <ul className="items-list">
            {rows.map((item) => (
              <li className={`items-row${item.inHand ? ' is-held' : ''}`} key={`${item.id}${item.inHand ? ':hand' : ''}`}>
                <span
                  className={`throw-icon throw-icon--${item.icon ?? 'round'}`}
                  style={{ '--throw-object': item.color }}
                  aria-hidden="true"
                ><i /><b /></span>
                <span className="items-name">
                  <strong>{item.short}</strong>
                  {item.inHand ? <small>In hand</small> : item.count > 1 ? <small>×{item.count}</small> : null}
                </span>
                <span className="items-verbs">
                  {item.inHand ? (
                    <button type="button" onClick={() => stowHeld()}>Put away</button>
                  ) : item.throwable ? (
                    <button type="button" disabled={Boolean(held)} onClick={() => runVerb(item.id, 'throw')}>
                      Take in hand
                    </button>
                  ) : null}
                  {item.verbs
                    .filter((verb) => verb.id !== 'throw')
                    .map((verb) => (
                      <button type="button" key={verb.id} onClick={() => runVerb(item.id, verb.id)}>
                        {verb.label}
                      </button>
                    ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

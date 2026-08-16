import { useEffect, useState } from 'react';
import {
  estimateThrowableRange,
  getThrowablePlay,
  subscribeThrowablePlay,
} from '../world/throwablePlay.js';
import { goodOfThrowable, handVerb } from '../world/goods.js';
import { throwableDefinition } from '../world/throwables.js';

// The card in the top right for whatever is in hand. Throwing gets the reticle
// and the charge bar; every other verb gets the same card with one line of
// instruction. Class names stay `throw-*` because it is the same card.
export default function HeldItemHud() {
  const [play, setPlay] = useState(() => getThrowablePlay());
  useEffect(() => subscribeThrowablePlay(setPlay), []);

  const item = goodOfThrowable(play.heldType);
  const definition = throwableDefinition(play.heldType);
  if (play.phase === 'empty' || play.phase === 'picking-up' || !item || !definition) return null;

  const verb = handVerb(item.id);
  const throwing = verb?.id === 'throw';
  const charging = play.phase === 'charging';
  const distance = Math.round(estimateThrowableRange(play.charge, play.heldType));
  const title = play.phase === 'held'
    ? `${item.short} ready`
    : charging ? 'Throw power' : 'Let fly!';
  const instruction = play.phase === 'held'
    ? (throwing ? 'Hold to charge' : verb?.label ?? 'Use it')
    : charging ? 'Release to throw' : 'Away it goes';

  return (
    <div
      className={`throw-aim throw-aim--${item.id} throw-aim--${play.phase}`}
      style={{ '--throw-accent': definition.aimColor, '--throw-object': item.color }}
    >
      {throwing && play.phase !== 'held'
        ? <span className="throw-reticle" aria-hidden="true"><i /></span>
        : null}
      <div className="throw-card">
        <span className={`throw-icon throw-icon--${item.icon ?? 'round'}`} aria-hidden="true"><i /><b /></span>
        <span className="throw-copy">
          <strong>{title}</strong>
          <span><kbd>E</kbd>{instruction}</span>
        </span>
        {charging ? <strong className="throw-distance">≈ {distance}<small>m</small></strong> : null}
        {throwing ? (
          <i className="throw-charge" aria-hidden="true">
            <b style={{ width: `${Math.max(4, play.charge * 100)}%` }} />
          </i>
        ) : null}
      </div>
    </div>
  );
}

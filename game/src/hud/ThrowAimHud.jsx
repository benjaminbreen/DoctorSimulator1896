import { useEffect, useState } from 'react';
import {
  estimateThrowableRange,
  getThrowablePlay,
  subscribeThrowablePlay,
} from '../world/throwablePlay.js';
import { throwableDefinition } from '../world/throwables.js';

export default function ThrowAimHud() {
  const [play, setPlay] = useState(() => getThrowablePlay());
  useEffect(() => subscribeThrowablePlay(setPlay), []);

  const definition = throwableDefinition(play.heldType);
  if (play.phase === 'empty' || play.phase === 'picking-up' || !definition) return null;
  const charging = play.phase === 'charging';
  const distance = Math.round(estimateThrowableRange(play.charge, play.heldType));
  const title = play.phase === 'held' ? `${definition.label} ready` : charging ? 'Throw power' : 'Let fly!';
  const instruction = play.phase === 'held' ? 'Hold to charge' : charging ? 'Release to throw' : 'Away it goes';

  return (
    <div
      className={`throw-aim throw-aim--${definition.id} throw-aim--${play.phase}`}
      style={{ '--throw-accent': definition.aimColor, '--throw-object': definition.color }}
    >
      {play.phase !== 'held' ? <span className="throw-reticle" aria-hidden="true"><i /></span> : null}
      <div className="throw-card">
        <span className={`throw-icon throw-icon--${definition.icon ?? 'round'}`} aria-hidden="true"><i /><b /></span>
        <span className="throw-copy">
          <strong>{title}</strong>
          <span><kbd>E</kbd>{instruction}</span>
        </span>
        {charging ? <strong className="throw-distance">≈ {distance}<small>m</small></strong> : null}
        <i className="throw-charge" aria-hidden="true">
          <b style={{ width: `${Math.max(4, play.charge * 100)}%` }} />
        </i>
      </div>
    </div>
  );
}

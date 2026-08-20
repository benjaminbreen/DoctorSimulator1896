import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPlayer, NEURASTHENIA_RECOVERY_TARGET, subscribePlayer } from '../world/player.js';
import { requestFastTravel, travelMinutesBetween } from '../world/travel.js';
import { notice } from '../world/notices.js';
import { neurastheniaVisual } from './neurastheniaVisual.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import './neurasthenia.css';

const RECOVERY_OPTIONS = ['Carousel', 'Checkers', 'Park bench', 'Conversation', 'Sunny stroll'];

export default function NeurastheniaCrisis({ runtime, worldClock, consultationActive }) {
  const player = useSyncExternalStore(subscribePlayer, getPlayer, getPlayer);
  const [acknowledged, setAcknowledged] = useState(false);
  const visual = neurastheniaVisual(player.neurasthenia);
  const crisis = Boolean(player.neurastheniaCrisis);
  const showCard = crisis && !consultationActive && !acknowledged;
  const cardRef = useDismissableOverlay(showCard, seekRelief);

  useEffect(() => {
    if (!crisis) setAcknowledged(false);
  }, [crisis]);

  function seekRelief() {
    if (runtime.values.zone !== 'central-park') {
      const origin = runtime.values.zone;
      if (!requestFastTravel(runtime, 'central-park')) return;
      worldClock.advanceMinutes(travelMinutesBetween(origin, 'central-park'), { reason: 'travel' });
      notice('You make your way to Central Park in search of relief.', { key: 'nervous-crisis' });
    }
    setAcknowledged(true);
  }

  return (
    <>
      {visual.visible && (
        <div
          className={`neurasthenia-vision${crisis ? ' is-crisis' : ''}`}
          style={{
            '--nerves-opacity': visual.opacity,
            '--nerves-aperture': `${visual.aperture}%`,
            '--nerves-blur': `${visual.blur}px`,
          }}
          aria-hidden="true"
        />
      )}
      {showCard && (
        <div className="neurasthenia-crisis-layer">
          <section ref={cardRef} className="neurasthenia-crisis-card" role="dialog" aria-modal="true" aria-labelledby="nervous-crisis-title">
            <span className="neurasthenia-crisis-kicker">Your nerves give way</span>
            <h2 id="nervous-crisis-title">Nervous Crisis</h2>
            <p>Your sight closes in. You cannot receive another patient until you recover.</p>
            <button type="button" onClick={seekRelief}>
              {runtime.values.zone === 'central-park' ? 'Find some relief' : 'Go to Central Park'}
            </button>
          </section>
        </div>
      )}
      {crisis && acknowledged && (
        <aside className="neurasthenia-objective" aria-live="polite">
          <strong>Recover your nerves</strong>
          <span>{Math.round(player.neurasthenia)} — safe at {NEURASTHENIA_RECOVERY_TARGET}</span>
          <small>{RECOVERY_OPTIONS.join(' · ')}</small>
        </aside>
      )}
    </>
  );
}

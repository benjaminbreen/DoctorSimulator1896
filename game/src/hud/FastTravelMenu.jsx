import { notice } from '../world/notices.js';
import {
  availableFastTravelDestinations,
  requestFastTravel,
  travelMinutesBetween,
} from '../world/travel.js';
import { EyebrowArrow } from './chrome.jsx';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import { markFastTravelUsed } from './onboardingProgress.js';

export default function FastTravelMenu({ open, onClose, runtime, worldClock }) {
  const containerRef = useDismissableOverlay(open, onClose);

  if (!open) return null;

  const destinations = availableFastTravelDestinations(runtime.values.zone);

  const travel = (destinationId) => {
    if (runtime.values.zone === destinationId) return;
    const originId = runtime.values.zone;
    const destination = requestFastTravel(runtime, destinationId);
    if (!destination) return;
    worldClock.advanceMinutes(travelMinutesBetween(originId, destinationId), {
      reason: 'travel',
    });
    markFastTravelUsed();
    onClose();
    notice(`You make your way to ${destination.noticeLabel}.`, { key: 'travel' });
  };

  return (
    <div className="ghud-scrim ghud-travel-scrim" onPointerDown={onClose}>
      <section
        ref={containerRef}
        className="ghud-travel-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ghud-travel-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="ghud-letters-close" onClick={onClose} aria-label="Close fast travel">
          ×
        </button>
        <div className="ghud-eyebrow ghud-travel-eyebrow">
          <EyebrowArrow size={22} />
          <span id="ghud-travel-title">Fast Travel</span>
          <EyebrowArrow flip size={22} />
        </div>
        <p className="ghud-travel-intro">Where would you like to go?</p>
        <div className="ghud-travel-destinations">
          {destinations.map((destination) => {
            const current = runtime.values.zone === destination.id;
            return (
              <button
                key={destination.id}
                type="button"
                className="ghud-travel-destination"
                disabled={current}
                onClick={() => travel(destination.id)}
              >
                <span className="ghud-travel-name">{destination.label}</span>
                <span className="ghud-travel-detail">{current ? 'Current location' : destination.detail}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

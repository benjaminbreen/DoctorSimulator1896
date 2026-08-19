import { useEffect, useState } from 'react';

function BannerArt({ directory, artId, variant, className }) {
  const fallback = artId ? `/ui/${directory}/${artId}.webp` : null;
  const preferred = variant && artId
    ? `/ui/${directory}/${artId}-${variant}.webp`
    : fallback;
  const [src, setSrc] = useState(preferred);

  useEffect(() => setSrc(preferred), [preferred]);

  if (!src) return null;

  return (
    <div className={className} aria-hidden="true">
      <img
        src={src}
        alt=""
        decoding="async"
        onError={() => setSrc(src === fallback ? null : fallback)}
      />
    </div>
  );
}

// A later subtype may provide `<id>-<variant>.webp`; the base banner remains
// the dependable fallback when that more specific asset does not exist.
export default function EventArt({ eventId, variant }) {
  return (
    <BannerArt
      directory="events"
      artId={eventId}
      variant={variant}
      className="dayflow-event-art"
    />
  );
}

// Outcome panels reuse the event-card layout whichever kind they came from.
// Passing the chosen option id as `variant` means a future
// `<art>-<choice>.webp` is picked up with no code change.
export function OutcomeArt({ kind, artId, variant }) {
  return (
    <BannerArt
      directory={kind === 'caller' ? 'callers' : 'events'}
      artId={artId}
      variant={variant}
      className="dayflow-event-art"
    />
  );
}

export function CallerArt({ requestId, variant }) {
  return (
    <BannerArt
      directory="callers"
      artId={requestId}
      variant={variant}
      className="dayflow-caller-art"
    />
  );
}

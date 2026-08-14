import { useEffect, useState } from 'react';
import { subscribeNotices, dismissNotice } from '../world/notices.js';
import { ink, surface, surfaceStyle, label } from './theme.js';
import './Toasts.css';

// Notices, stacked at the top right and out of the way of both the walk
// prompt and the instrument console. They sit above everything, including
// instrument mode, because the thing most worth saying — that the machine has
// just hurt you — happens while you are using it.

// The left rule is the whole signal: brass for an observation, amber for a
// caution, red for something that happened to you.
const RULE = {
  plain: ink.edge,
  warn: 'rgba(214, 150, 62, 0.75)',
  hurt: 'rgba(200, 78, 54, 0.8)',
};

function Toast({ item }) {
  const [shown, setShown] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [item.id]);
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => dismissNotice(item.id), item.seconds * 1000);
    return () => clearTimeout(timer);
  }, [item.id, item.seconds, paused]);

  const wikipedia = item.landmark?.wikipedia;

  return (
    <div
      className={`${surface} toast-item${item.landmark ? ' toast-item--landmark' : ''} border-l-2 transition-all duration-300`}
      style={{
        ...surfaceStyle,
        borderLeftColor: RULE[item.tone] ?? RULE.plain,
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateX(0)' : 'translateX(12px)',
      }}
      onMouseEnter={item.landmark ? () => setPaused(true) : undefined}
      onMouseLeave={item.landmark ? () => setPaused(false) : undefined}
    >
      {item.landmark && (
        <button
          type="button"
          className="toast-dismiss"
          aria-label={`Dismiss ${item.text}`}
          onClick={() => dismissNotice(item.id)}
        >
          ×
        </button>
      )}
      <p className="toast-title text-[13px] leading-snug" style={{ color: ink.ivory }}>{item.text}</p>
      {item.landmark?.location && (
        <p className="toast-landmark-location">{item.landmark.location}</p>
      )}
      {wikipedia && (
        <div className={`toast-wikipedia toast-wikipedia--${wikipedia.status}`}>
          {wikipedia.thumbnail && (
            <img
              className="toast-wikipedia-thumbnail"
              src={wikipedia.thumbnail}
              alt={`${item.text}, from Wikipedia`}
            />
          )}
          <div className="toast-wikipedia-copy">
            {wikipedia.status === 'loading' && <p>Loading from Wikipedia…</p>}
            {wikipedia.status === 'unavailable' && <p>Wikipedia details are unavailable right now.</p>}
            {wikipedia.status === 'missing' && <p>No matching Wikipedia article was found.</p>}
            {item.landmark.wikipediaContext && (
              <p className="toast-wikipedia-context">{item.landmark.wikipediaContext}</p>
            )}
            {wikipedia.extract && <p className="toast-wikipedia-extract">{wikipedia.extract}</p>}
            {wikipedia.url && (
              <a href={wikipedia.url} target="_blank" rel="noreferrer">
                Read more on Wikipedia <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>
      )}
      {item.detail && (
        <p className={`${label} toast-detail mt-1.5`} style={{ color: ink.muted }}>
          {item.detail}
        </p>
      )}
    </div>
  );
}

export default function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribeNotices(setItems), []);
  if (items.length === 0) return null;
  return (
    <div className="toast-stack pointer-events-none" aria-live="polite">
      {items.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </div>
  );
}

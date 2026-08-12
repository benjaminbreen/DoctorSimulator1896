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
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => dismissNotice(item.id), item.seconds * 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [item.id, item.seconds]);

  return (
    <div
      className={`${surface} toast-item border-l-2 transition-all duration-300`}
      style={{
        ...surfaceStyle,
        borderLeftColor: RULE[item.tone] ?? RULE.plain,
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateX(0)' : 'translateX(12px)',
      }}
    >
      <p className="text-[13px] leading-snug" style={{ color: ink.ivory }}>
        {item.text}
      </p>
      {item.detail && (
        <p className={`${label} mt-1.5`} style={{ color: ink.muted }}>
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

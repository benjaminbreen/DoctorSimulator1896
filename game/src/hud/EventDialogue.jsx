// The one sentence that matters right now: a cry for a doctor, an officer's
// challenge, Roosevelt over the crowd. A centred bar for the words and a plate
// above the speaker's head so the player knows who said it.
//
// The plate follows the speaker from an animation frame rather than React
// state: the position changes every frame and the words do not.

import {
  useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
} from 'react';
import {
  announcementScreen,
  dismissAnnouncement,
  getAnnouncement,
  subscribeAnnouncement,
} from '../world/announcements.js';
import './event-dialogue.css';

// Whatever else is standing at the foot of the screen. The bar sits on top of
// the tallest of them rather than across it; anything added later joins the
// stack by carrying data-hud-foot.
const FOOT = '.ghud-actions, .ghud-note, .control-helper, .mctl-left, .mctl-right, [data-hud-foot]';
const FOOT_GAP = 12;

export default function EventDialogue({ raised = false }) {
  const entry = useSyncExternalStore(subscribeAnnouncement, getAnnouncement);
  const badge = useRef(null);
  const line = useRef(null);
  const [shown, setShown] = useState(false);
  const [foot, setFoot] = useState(null);

  // Measured rather than guessed: the plinth's height is its own business, and
  // a number copied here would be wrong the first time it changes.
  useLayoutEffect(() => {
    if (!entry?.line || raised) {
      setFoot(null);
      return undefined;
    }
    const place = () => {
      const bar = line.current?.getBoundingClientRect();
      let top = window.innerHeight;
      for (const node of document.querySelectorAll(FOOT)) {
        const rect = node.getBoundingClientRect();
        if (rect.height <= 0) continue;
        // Only what the bar would actually run into.
        if (bar && (rect.right < bar.left || rect.left > bar.right)) continue;
        top = Math.min(top, rect.top);
      }
      setFoot(top < window.innerHeight ? window.innerHeight - top + FOOT_GAP : null);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [entry?.id, entry?.line, raised]);

  useEffect(() => {
    if (!entry) {
      setShown(false);
      return undefined;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => dismissAnnouncement(entry.id), entry.seconds * 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [entry]);

  useEffect(() => {
    if (!entry) return undefined;
    let raf = 0;
    const follow = () => {
      const node = badge.current;
      if (node) {
        const screen = announcementScreen();
        node.style.opacity = screen.visible ? '1' : '0';
        node.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [entry?.id]);

  if (!entry) return null;

  return (
    <div className={`event-dialogue${raised ? ' event-dialogue--raised' : ''}`}>
      <div className="event-badge" ref={badge}>
        <div className="event-badge-plate">
          <span className="event-badge-name">{entry.speaker}</span>
          {entry.station && <span className="event-badge-station">{entry.station}</span>}
        </div>
        <span className="event-badge-stem" aria-hidden="true" />
      </div>
      {/* An inspected stranger gets the plate and no words. */}
      {entry.line && (
        <p
          ref={line}
          className={`event-line event-line--carry-${entry.carry}${shown ? ' is-shown' : ''}`}
          style={foot === null ? undefined : { bottom: `${foot}px` }}
          role="status"
        >
          <span className="event-line-speaker">{entry.speaker}:</span>
          {` ${entry.line}`}
        </p>
      )}
    </div>
  );
}

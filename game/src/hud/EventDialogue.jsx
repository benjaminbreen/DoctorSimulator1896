// The one sentence that matters right now: a cry for a doctor, an officer's
// challenge, Roosevelt over the crowd. A centred bar for the words and a plate
// above the speaker's head so the player knows who said it.
//
// The plate follows the speaker from an animation frame rather than React
// state: the position changes every frame and the words do not.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  announcementScreen,
  dismissAnnouncement,
  getAnnouncement,
  subscribeAnnouncement,
} from '../world/announcements.js';
import './event-dialogue.css';

export default function EventDialogue({ raised = false }) {
  const entry = useSyncExternalStore(subscribeAnnouncement, getAnnouncement);
  const badge = useRef(null);
  const [shown, setShown] = useState(false);

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
          className={`event-line event-line--carry-${entry.carry}${shown ? ' is-shown' : ''}`}
          role="status"
        >
          <span className="event-line-speaker">{entry.speaker}:</span>
          {` ${entry.line}`}
        </p>
      )}
    </div>
  );
}

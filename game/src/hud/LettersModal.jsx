// The letters modal: a writing-desk view over the scene. Left page lists the
// correspondence; right page shows the opened letter on a deckle-edged sheet.
// Correspondence data and its source notes come from hudState. The delivery
// may be fictional, but the interface never hides that distinction.
//
// Learn is the seat of the future educational layer: the primary source a
// letter draws on, and a historical note beside it.

import { useEffect, useState } from 'react';
import { letters, learnFromLetter, replyToLetterLater } from './hudState.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import {
  EnvelopeIcon, SealedEnvelopeIcon, EyebrowArrow, BookIcon, ArchiveBoxIcon,
  WatchIcon, FlourishRule,
} from './chrome.jsx';

export default function LettersModal({ open, onClose, readIds, onRead, archivedIds, onArchive }) {
  const [selectedId, setSelectedId] = useState(letters[0]?.id);
  // Escape, Tab trap, focus restore, and input blocking all live in the hook.
  const containerRef = useDismissableOverlay(open, onClose);

  // Arrows move through the post.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSelectedId((current) => {
        const index = letters.findIndex((entry) => entry.id === current);
        const next = Math.min(letters.length - 1, Math.max(0, index + step));
        return letters[next].id;
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // Opening the modal reads the letter already on display.
  useEffect(() => {
    if (open && selectedId) onRead(selectedId);
  }, [open, selectedId, onRead]);

  if (!open) return null;

  const letter = letters.find((entry) => entry.id === selectedId) ?? letters[0];

  return (
    <div className="ghud-scrim" onPointerDown={onClose}>
      <section
        ref={containerRef}
        className="ghud-letters"
        role="dialog"
        aria-modal="true"
        aria-label="Letters"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="ghud-letters-head">
          <EnvelopeIcon size={26} />
          <h2 className="ghud-letters-title">Letters</h2>
          <button
            type="button"
            className="ghud-letters-close"
            onClick={onClose}
            aria-label="Close letters"
          >
            ×
          </button>
        </header>

        <div className="ghud-letters-body">
          <div className="ghud-letters-page">
            <div className="ghud-eyebrow">
              <EyebrowArrow />
              <span>Correspondence</span>
              <EyebrowArrow flip />
            </div>

            <ul className="ghud-letters-list">
              {letters.map((entry) => {
                const unread = !readIds.has(entry.id);
                const archived = archivedIds.has(entry.id);
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={[
                        'ghud-letter-item',
                        entry.id === letter.id ? 'ghud-letter-item--open' : '',
                        unread ? 'ghud-letter-item--unread' : '',
                        archived ? 'ghud-letter-item--archived' : '',
                      ].join(' ')}
                      onClick={() => setSelectedId(entry.id)}
                      aria-current={entry.id === letter.id}
                    >
                      <SealedEnvelopeIcon unread={unread} />
                      <span className="ghud-letter-item-text">
                        <span className="ghud-letter-sender">{entry.sender}</span>
                        <span className="ghud-letter-meta">{`${entry.place} • ${entry.date}`}</span>
                        <span className="ghud-letter-subject">{entry.subject}</span>
                      </span>
                      {archived && <span className="ghud-letter-tag">Archived</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="ghud-letters-foot">
              <span>{`${letters.length} ${letters.length === 1 ? 'letter' : 'letters'} in your possession`}</span>
            </div>
          </div>

          <div className="ghud-col-rule" aria-hidden="true" />

          <article className="ghud-letter-page">
            <div className="ghud-letter-frame">
              <div className="ghud-letter-sheet" key={letter.id}>
                <header className="ghud-letter-head">
                  <h3>{letter.sender}</h3>
                  <div className="ghud-letter-place">{letter.place}</div>
                  <div className="ghud-letter-date">{letter.date}</div>
                  <FlourishRule />
                </header>
                {letter.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="ghud-letter-para">{paragraph}</p>
                ))}
                <p className="ghud-letter-valediction">{letter.valediction}</p>
                <p className="ghud-letter-signature">{letter.signature}</p>
                <p className="ghud-letter-sigtitle">{letter.signatureTitle}</p>
                {letter.provenance && (
                  <aside className="ghud-letter-provenance">
                    <strong>{letter.provenance.label}</strong>
                    <span>{letter.provenance.note}</span>
                    <a href={letter.provenance.sourceUrl} target="_blank" rel="noreferrer">
                      Read the published source
                    </a>
                  </aside>
                )}
              </div>
            </div>
            <footer className="ghud-letter-verbs">
              <button
                type="button"
                className="ghud-letter-verb ghud-letter-verb--learn"
                onClick={() => learnFromLetter(letter)}
              >
                <BookIcon />
                <span>Learn</span>
              </button>
              <button
                type="button"
                className="ghud-letter-verb"
                onClick={() => {
                  replyToLetterLater();
                  onClose();
                }}
              >
                <WatchIcon size={17} />
                <span>Reply Later</span>
              </button>
              <button
                type="button"
                className="ghud-letter-verb"
                onClick={() => onArchive(letter.id)}
              >
                <ArchiveBoxIcon />
                <span>Archive</span>
              </button>
            </footer>
          </article>
        </div>
      </section>
    </div>
  );
}

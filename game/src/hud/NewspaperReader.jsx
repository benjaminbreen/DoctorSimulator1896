import { useEffect, useRef, useState } from 'react';
import { edition as editionById } from '../world/newspapers.js';
import { closeReading, subscribeReading } from '../world/reading.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import './newspaper.css';

// The paper held up to read: the archive scan, full screen, with zoom and
// drag so the small type can actually be got at.

const ZOOMS = [1, 1.6, 2.4, 3.4];

export default function NewspaperReader() {
  const [editionId, setEditionId] = useState(null);
  const [zoomStep, setZoomStep] = useState(0);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => subscribeReading(setEditionId), []);

  const paper = editionById(editionId);
  const open = Boolean(paper);
  const panelRef = useDismissableOverlay(open, closeReading, {
    autoFocus: true,
    trapFocus: true,
    blockInput: true,
  });

  // A fresh opening starts fitted to the screen, not where the last reading
  // was left.
  useEffect(() => {
    if (!open) return;
    setZoomStep(0);
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo(0, 0);
  }, [open, editionId]);

  if (!open) return null;

  const zoom = ZOOMS[zoomStep];

  const onPointerDown = (event) => {
    if (zoomStep === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  };

  const endDrag = () => { dragRef.current = null; };

  return (
    <div className="paper-layer">
      <button className="paper-scrim" type="button" aria-label="Fold the paper up" onClick={closeReading} />
      <section
        ref={panelRef}
        className="paper-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${paper.masthead}, ${paper.dateline}`}
        tabIndex={-1}
      >
        <header className="paper-bar">
          <div className="paper-bar-title">
            <strong>{paper.masthead}</strong>
            <small>{paper.dateline}</small>
          </div>
          <div className="paper-bar-tools">
            <button
              type="button"
              onClick={() => setZoomStep((step) => Math.max(0, step - 1))}
              disabled={zoomStep === 0}
              aria-label="Hold the paper further off"
            >
              −
            </button>
            <span className="paper-zoom" aria-live="polite">{zoomStep === 0 ? 'Whole page' : `${zoom}×`}</span>
            <button
              type="button"
              onClick={() => setZoomStep((step) => Math.min(ZOOMS.length - 1, step + 1))}
              disabled={zoomStep === ZOOMS.length - 1}
              aria-label="Bring the paper closer"
            >
              +
            </button>
            <button type="button" className="paper-close" onClick={closeReading}>Fold it up</button>
          </div>
        </header>

        <div
          ref={viewportRef}
          className={`paper-viewport${zoomStep > 0 ? ' is-zoomed' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* Fitted whole at 1×; wider than the frame after that. */}
          <img
            src={paper.image}
            alt={`Front page of ${paper.masthead}, ${paper.dateline}`}
            style={zoomStep === 0
              ? { width: 'auto', maxWidth: '100%', maxHeight: '100%' }
              : { width: `${zoom * 100}%` }}
            draggable={false}
          />
        </div>

        <p className="paper-source">
          <a href={paper.sourceUrl} target="_blank" rel="noreferrer">
            {paper.masthead}, {paper.dateline}
          </a>
          . Chronicling America, Library of Congress.
        </p>
      </section>
    </div>
  );
}

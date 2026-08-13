import { useEffect, useRef, useState } from 'react';

// Count only time delivered in short, paintable frames. A long main-thread
// stall contributes at most one frame, so loading can never consume the
// reading time between title-card beats.
const MAX_FRAME_MS = 50;
const ROLE_AT_MS = 900;
const SECRET_AT_MS = 2000;
const CREDIT_AT_MS = 3100;
const FADE_AT_MS = 4700;
const FADE_DURATION_MS = 900;
const REDUCED_MOTION_FADE_DURATION_MS = 150;

export default function ParkIntro({ ready }) {
  const readyRef = useRef(ready);
  const phaseRef = useRef(1);
  const [phase, setPhase] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const roleAt = reducedMotion ? 0 : ROLE_AT_MS;
    const secretAt = reducedMotion ? 0 : SECRET_AT_MS;
    const creditAt = reducedMotion ? 0 : CREDIT_AT_MS;
    const fadeAt = reducedMotion ? 3500 : FADE_AT_MS;
    const fadeDuration = reducedMotion ? REDUCED_MOTION_FADE_DURATION_MS : FADE_DURATION_MS;
    let frame = null;
    let last = null;
    let viewedMs = 0;
    let fadeStartedAt = null;

    const tick = (now) => {
      if (last !== null) viewedMs += Math.min(now - last, MAX_FRAME_MS);
      last = now;

      if (phaseRef.current < 2 && viewedMs >= roleAt) {
        phaseRef.current = 2;
        setPhase(2);
      }
      if (phaseRef.current < 3 && viewedMs >= secretAt) {
        phaseRef.current = 3;
        setPhase(3);
      }
      if (phaseRef.current < 4 && viewedMs >= creditAt) {
        phaseRef.current = 4;
        setPhase(4);
      }
      if (fadeStartedAt === null && phaseRef.current >= 4 && viewedMs >= fadeAt && readyRef.current) {
        fadeStartedAt = viewedMs;
        setLeaving(true);
      }
      if (fadeStartedAt !== null && viewedMs - fadeStartedAt >= fadeDuration) {
        setVisible(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  if (!visible) return null;
  return (
    <div className={`park-intro${leaving ? ' park-intro--leaving' : ''}`} role="status">
      <div className="park-intro__title-card">
        <div className="park-intro__location">
          <p className="park-intro__place">New York · 1896</p>
          <div className="park-intro__rule" />
          <h1>Central Park</h1>
          <p className="park-intro__time">Morning, half past nine</p>
        </div>
        <p
          className={`park-intro__premise${phase >= 2 ? ' park-intro__premise--visible' : ''}`}
          aria-hidden={phase < 2}
        >
          You are a young physician specializing in nervous ailments, eager to prove yourself and
          pay your office rent…
        </p>
        <p
          className={`park-intro__secret${phase >= 3 ? ' park-intro__secret--visible' : ''}`}
          aria-hidden={phase < 3}
        >
          while secretly trying to cure your own neurasthenia.
        </p>
        <p
          className={`park-intro__credit${phase >= 4 ? ' park-intro__credit--visible' : ''}`}
          aria-hidden={phase < 4}
        >
          A prototype based on the work-in-progress book <cite>Ghosts of the Machine Age</cite> by
          Benjamin Breen
        </p>
      </div>
    </div>
  );
}

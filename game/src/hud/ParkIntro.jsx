import { useEffect, useState } from 'react';

export default function ParkIntro({ ready, onDismiss }) {
  const [phase, setPhase] = useState(1);
  const [skipped, setSkipped] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase(4);
      return undefined;
    }
    const timers = [500, 1300, 2100].map((delay, index) => setTimeout(() => setPhase(index + 2), delay));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    if (skipped || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDismiss();
      return undefined;
    }
    const timer = setTimeout(onDismiss, 160);
    return () => clearTimeout(timer);
  }, [onDismiss, ready, skipped]);

  return (
    <div className={`park-intro${ready ? ' park-intro--leaving' : ''}`}>
      {!skipped && <div className="park-intro__title-card">
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
        <button className="park-intro__skip" type="button" onClick={() => setSkipped(true)}>Skip intro</button>
      </div>}
      {!ready && <p className="park-intro__loading" role="status">Entering Central Park…</p>}
    </div>
  );
}

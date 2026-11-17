import { useCallback, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { gameDebug } from '../debug.js';
import { distanceToDistrict } from '../world/parkDistricts.js';

function distanceToJob(position, job) {
  if (job.sites) {
    return job.sites.reduce((nearest, site) => Math.min(nearest, distanceToDistrict(position, site)), Infinity);
  }
  return job.district ? distanceToDistrict(position, job.district) : 0;
}

// One mounted job at a time keeps file decoding and GPU preparation from
// competing with each other. Completed districts stay mounted to keep state,
// except on phones (unloadMargin set): there a job unmounts once the player is
// unloadMargin beyond its range, because a fully loaded park outruns the GPU.
// Eager (playtests) runs several at once: frame pacing does not matter there.
export default function ParkStream({ jobs, full, eager, enabled, unloadMargin, Stage, onReady, onUnload, onComplete }) {
  const [started, setStarted] = useState([]);
  const finished = useRef(new Set());
  // Separate from finished so an unloaded job still counts toward completion.
  const everFinished = useRef(new Set());
  const nextUnloadAt = useRef(0);
  const active = useRef(new Set());
  const nextAt = useRef(0);
  const nextWarmAt = useRef(0);
  const warmed = useRef(new Set());
  const positionAtReveal = useRef(null);
  const time = useRef(0);
  const schedule = useMemo(() => jobs.map((job, index) => ({ ...job, index })), [jobs]);

  useFrame(({ clock }) => {
    time.current = clock.elapsedTime;
    if (!enabled) return;
    const { position, velocity, moveRequested } = gameDebug.player;
    const ahead = [position[0] + velocity[0] * 6, 0, position[2] + velocity[2] * 6];
    if (!positionAtReveal.current) positionAtReveal.current = { position: [...position], time: clock.elapsedTime };
    const entry = positionAtReveal.current;
    const movement = Math.hypot(position[0] - entry.position[0], position[2] - entry.position[2]);
    const settled = !moveRequested && Math.hypot(velocity[0], velocity[2]) < .3;
    const idleDetail = settled && clock.elapsedTime - entry.time > 5;
    if ((movement > 2 || idleDetail) && clock.elapsedTime >= nextWarmAt.current) {
      nextWarmAt.current = clock.elapsedTime + .4;
      const target = schedule.find(job => job.preload && !warmed.current.has(job.warmKey)
        && Math.min(distanceToJob(position, job), distanceToJob(ahead, job)) < job.range + 10);
      if (target) {
        warmed.current.add(target.warmKey);
        target.preload().catch(() => {});
      }
    }
    if (unloadMargin && !full && !eager && clock.elapsedTime >= nextUnloadAt.current) {
      nextUnloadAt.current = clock.elapsedTime + 1;
      const far = schedule.filter(job => finished.current.has(job.id) && Number.isFinite(job.range)
        && distanceToJob(position, job) > job.range + unloadMargin);
      if (far.length) {
        for (const job of far) {
          finished.current.delete(job.id);
          onUnload(job.id);
        }
        const dropped = new Set(far.map(job => job.index));
        setStarted(current => current.filter(index => !dropped.has(index)));
        gameDebug.stats.parkStream.ready = [...finished.current];
      }
    }
    if (active.current.size >= (eager ? 6 : 1) || (!eager && clock.elapsedTime < nextAt.current)) return;
    let next;
    let best = Infinity;
    for (const job of schedule) {
      if (finished.current.has(job.id) || active.current.has(job.id) || (job.after && !finished.current.has(job.after))) continue;
      const distance = distanceToJob(position, job);
      // Eager keeps the range rule and drops the movement rules, so a playtest
      // capture shows the settled view without walking about first.
      if (!full && (distance > job.range || (!eager && ((job.stationary && !settled)
        || (movement < job.movement && !idleDetail))))) continue;
      const forecastDistance = distanceToJob(ahead, job);
      const rank = Math.min(distance, forecastDistance) + forecastDistance * .3 + (job.priority ?? 0);
      if (rank >= best) continue;
      best = rank;
      next = job;
    }
    gameDebug.stats.parkStream.idle = !next && active.current.size === 0;
    if (!next) return;
    active.current.add(next.id);
    gameDebug.stats.parkStream.active = next.id;
    setStarted(current => [...current, next.index]);
  });

  const rendered = useCallback(index => {
    const job = schedule[index];
    if (!job || finished.current.has(job.id)) return;
    finished.current.add(job.id);
    gameDebug.stats.parkStream.ready = [...finished.current];
    performance.mark('park:stream:' + job.id);
    active.current.delete(job.id);
    gameDebug.stats.parkStream.active = [...active.current].at(-1) ?? null;
    nextAt.current = time.current + .12;
    onReady(job.id);
    const first = !everFinished.current.has(job.id);
    everFinished.current.add(job.id);
    if (first && everFinished.current.size === schedule.length) onComplete();
  }, [onComplete, onReady, schedule]);

  return started.map(index => (
    <Stage key={schedule[index].id} active streaming stage={index} onRendered={rendered}>
      {schedule[index].node}
    </Stage>
  ));
}

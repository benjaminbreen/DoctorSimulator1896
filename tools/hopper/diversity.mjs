// Shared winner selection for mixed-zone Hopper searches.

import { GAMUT_FAMILIES, familyTargets } from './gamut_plan.mjs';

function turnDistance(left, right) {
  return Math.abs(((left - right + Math.PI) % (Math.PI * 2)) - Math.PI);
}

export function nearDuplicate(left, right) {
  if (left.zone !== right.zone) return false;
  const a = left.shot.camera;
  const b = right.shot.camera;
  const distance = Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2],
  );
  return distance < 1.5 && turnDistance(a.yaw, b.yaw) < 0.45;
}

export function selectDiverseResults(entries, limit) {
  const remaining = [...entries].sort((a, b) => b.total - a.total);
  const selected = [];
  const zoneCounts = new Map();
  const timeCounts = new Map();
  const pairCounts = new Map();
  const compositionCounts = new Map();
  const subjectArchetypeCounts = new Map();
  const subjectScenarioCounts = new Map();
  const vibeCounts = new Map();
  const cameraStratumCounts = new Map();
  const shadowFamilyCounts = new Map();
  const sunAzimuthCounts = new Map();

  const count = (map, key) => map.get(key) ?? 0;
  const increment = (map, key) => map.set(key, count(map, key) + 1);
  const timeOf = (entry) => entry.timeBand ?? entry.shot.meta?.timeBand ?? 'other';
  const vibeOf = (entry) => entry.vibe ?? entry.shot.meta?.vibe ?? 'legacy';
  const cameraStratumOf = (entry) => entry.cameraStratum ?? entry.shot.meta?.cameraStratum ?? 'ground';
  const shadowFamilyOf = (entry) => entry.shadowFamily ?? entry.shot.meta?.shadowFamily ?? 'profile';
  const sunAzimuthOf = (entry) => entry.sunAzimuthSector ?? entry.shot.meta?.sunAzimuthSector ?? 'physical';
  const subjectArchetypeOf = (entry) => (
    entry.subjectArchetype ?? entry.shot.meta?.subjectArchetype ?? entry.shot.subject?.archetype ?? null
  );
  const subjectScenarioOf = (entry) => (
    entry.subjectScenario ?? entry.shot.meta?.subjectScenario ?? entry.shot.subject?.scenario ?? null
  );
  const categoryCap = (values) => Math.ceil(limit / Math.max(1, new Set(values).size));
  const zoneCap = categoryCap(entries.map((entry) => entry.zone));
  const timeCap = categoryCap(entries.map(timeOf));
  const vibeCap = categoryCap(entries.map(vibeOf));

  while (selected.length < limit) {
    const available = remaining.filter(
      (entry) => !selected.some((kept) => nearDuplicate(entry, kept)),
    );
    // Exact caps make a 30-frame pass land at 3/zone and 5/daypart/vibe when
    // supply permits. If a sparse category makes the intersection impossible,
    // relax the caps and still return the best complete sheet.
    const coreCapped = available.filter((entry) => (
      count(zoneCounts, entry.zone) < zoneCap
      && count(timeCounts, timeOf(entry)) < timeCap
    ));
    const fullyCapped = coreCapped.filter(
      (entry) => count(vibeCounts, vibeOf(entry)) < vibeCap,
    );
    // Preserve zone and daypart coverage when a correlated or sparse vibe
    // cell is unavailable. Vibe is the first cap to relax; only a genuinely
    // exhausted zone/time grid falls back to all remaining candidates.
    const candidates = fullyCapped.length > 0
      ? fullyCapped
      : (coreCapped.length > 0 ? coreCapped : available);
    if (candidates.length === 0) break;
    candidates.sort((a, b) => {
      const aTime = timeOf(a);
      const bTime = timeOf(b);
      const aComposition = a.shot.meta?.composition ?? 'other';
      const bComposition = b.shot.meta?.composition ?? 'other';
      const aVibe = vibeOf(a);
      const bVibe = vibeOf(b);
      const aCameraStratum = cameraStratumOf(a);
      const bCameraStratum = cameraStratumOf(b);
      const aShadowFamily = shadowFamilyOf(a);
      const bShadowFamily = shadowFamilyOf(b);
      const aSunAzimuth = sunAzimuthOf(a);
      const bSunAzimuth = sunAzimuthOf(b);
      const aSubjectArchetype = subjectArchetypeOf(a);
      const bSubjectArchetype = subjectArchetypeOf(b);
      const aSubjectScenario = subjectScenarioOf(a);
      const bSubjectScenario = subjectScenarioOf(b);
      const aPriority = [
        count(zoneCounts, a.zone),
        aSubjectArchetype ? count(subjectArchetypeCounts, aSubjectArchetype) : 0,
        aSubjectScenario ? count(subjectScenarioCounts, aSubjectScenario) : 0,
        Math.max(count(timeCounts, aTime), count(vibeCounts, aVibe)),
        count(timeCounts, aTime) + count(vibeCounts, aVibe),
        count(cameraStratumCounts, aCameraStratum),
        count(shadowFamilyCounts, aShadowFamily),
        count(sunAzimuthCounts, aSunAzimuth),
        count(pairCounts, `${a.zone}|${aTime}`),
        count(compositionCounts, aComposition),
      ];
      const bPriority = [
        count(zoneCounts, b.zone),
        bSubjectArchetype ? count(subjectArchetypeCounts, bSubjectArchetype) : 0,
        bSubjectScenario ? count(subjectScenarioCounts, bSubjectScenario) : 0,
        Math.max(count(timeCounts, bTime), count(vibeCounts, bVibe)),
        count(timeCounts, bTime) + count(vibeCounts, bVibe),
        count(cameraStratumCounts, bCameraStratum),
        count(shadowFamilyCounts, bShadowFamily),
        count(sunAzimuthCounts, bSunAzimuth),
        count(pairCounts, `${b.zone}|${bTime}`),
        count(compositionCounts, bComposition),
      ];
      for (let index = 0; index < aPriority.length; index += 1) {
        if (aPriority[index] !== bPriority[index]) return aPriority[index] - bPriority[index];
      }
      return b.total - a.total;
    });
    const chosen = candidates[0];
    selected.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
    const time = timeOf(chosen);
    increment(zoneCounts, chosen.zone);
    increment(timeCounts, time);
    increment(pairCounts, `${chosen.zone}|${time}`);
    increment(compositionCounts, chosen.shot.meta?.composition ?? 'other');
    increment(vibeCounts, vibeOf(chosen));
    increment(cameraStratumCounts, cameraStratumOf(chosen));
    increment(shadowFamilyCounts, shadowFamilyOf(chosen));
    increment(sunAzimuthCounts, sunAzimuthOf(chosen));
    const subjectArchetype = subjectArchetypeOf(chosen);
    const subjectScenario = subjectScenarioOf(chosen);
    if (subjectArchetype) increment(subjectArchetypeCounts, subjectArchetype);
    if (subjectScenario) increment(subjectScenarioCounts, subjectScenario);
  }
  return selected;
}

export function selectGamutResults(entries, limit) {
  const targets = familyTargets(limit);
  const selected = [];
  for (const family of GAMUT_FAMILIES) {
    const candidates = entries.filter((entry) => (
      (entry.sceneFamily ?? entry.shot.meta?.sceneFamily) === family.id
    ));
    selected.push(...selectDiverseResults(candidates, Math.min(targets[family.id], candidates.length)));
  }
  if (selected.length < limit) {
    const already = new Set(selected);
    const remaining = entries.filter((entry) => !already.has(entry));
    selected.push(...selectDiverseResults(remaining, limit - selected.length));
  }
  return selected.slice(0, limit);
}

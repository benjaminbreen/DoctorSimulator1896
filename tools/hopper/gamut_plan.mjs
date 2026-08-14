import {
  CAMERA_STRATA,
  SHADOW_FAMILIES,
  SUN_AZIMUTH_SECTORS,
  TIME_BANDS,
  VIBE_FAMILIES,
  counterbalancedFactors,
  makeRng,
} from './space.mjs';

export const INTERIOR_ZONES = Object.freeze([
  'consulting-office',
  'waiting-room',
  'foyer',
  'cattell-lab',
  'metropolitan-club-lobby',
  'new-netherland-lobby',
  'interior:fifth-east-a-0',
  'interior:fifth-east-a-2',
  'interior:navarro-flats-b',
]);

// Sixty frames yield exactly 6, 6, 15, 15, 9 and 9 examples. Raised and
// rooftop architecture together are capped at 15% of the whole experiment.
export const GAMUT_FAMILIES = Object.freeze([
  Object.freeze({ id: 'park-landscape', label: 'Park landscape', weight: 0.10, zone: 'central-park' }),
  Object.freeze({ id: 'park-people', label: 'People in the park', weight: 0.10, zone: 'central-park' }),
  Object.freeze({ id: 'street-people', label: 'People on the street', weight: 0.25, zone: 'central-park' }),
  Object.freeze({ id: 'window-figure', label: 'Woman at a window', weight: 0.25, zones: INTERIOR_ZONES }),
  Object.freeze({ id: 'interior-room', label: 'Other interiors', weight: 0.15, zones: INTERIOR_ZONES }),
  Object.freeze({ id: 'elevated-architecture', label: 'Raised and rooftop architecture', weight: 0.15, zone: 'central-park' }),
]);

export function familyTargets(total, families = GAMUT_FAMILIES) {
  const exact = families.map((family) => family.weight * total);
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((sum, count) => sum + count, 0);
  const remainderOrder = families.map((family, index) => ({
    index,
    remainder: exact[index] - counts[index],
    id: family.id,
  })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const row of remainderOrder) {
    if (left <= 0) break;
    counts[row.index] += 1;
    left -= 1;
  }
  return Object.fromEntries(families.map((family, index) => [family.id, counts[index]]));
}

function shuffledBlocks(values, total, seed) {
  const rng = makeRng(seed);
  const result = [];
  while (result.length < total) {
    const block = [...values];
    for (let index = block.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      [block[index], block[swap]] = [block[swap], block[index]];
    }
    result.push(...block.slice(0, total - result.length));
  }
  return result;
}

export function buildGamutPlan(total = 60, seed = 1) {
  if (!Number.isInteger(total) || total <= 0) throw new Error('total must be a positive integer');
  const targets = familyTargets(total);
  const tasks = [];
  for (const family of GAMUT_FAMILIES) {
    const count = targets[family.id];
    for (let familyIndex = 0; familyIndex < count; familyIndex += 1) {
      const zones = family.zones ?? [family.zone];
      const zone = zones[familyIndex % zones.length];
      tasks.push({
        family: family.id,
        familyLabel: family.label,
        familyIndex,
        zone,
        cameraStratum: family.id === 'elevated-architecture'
          ? CAMERA_STRATA[1 + (familyIndex % 2)].id
          : CAMERA_STRATA[0].id,
        composition: family.id === 'park-landscape'
          ? 'landscape'
          : family.id === 'park-people' || family.id === 'street-people'
            ? 'people'
            : family.id === 'window-figure'
              ? 'window-figure'
              : family.id === 'interior-room'
                ? (familyIndex % 2 ? 'figure' : 'architecture')
                : 'architecture',
      });
    }
  }

  const times = shuffledBlocks(TIME_BANDS, tasks.length, seed ^ 0x9e3779b1);
  const vibes = shuffledBlocks(VIBE_FAMILIES, tasks.length, seed ^ 0x85ebca6b);
  const exteriorIndices = tasks
    .map((task, index) => task.zone === 'central-park' ? index : -1)
    .filter((index) => index >= 0);
  const exteriorFactors = counterbalancedFactors(
    [{ id: 'fixed' }],
    SHADOW_FAMILIES,
    SUN_AZIMUTH_SECTORS,
    exteriorIndices.length,
    seed ^ 0xc2b2ae35,
  );
  const factorsByIndex = new Map(exteriorIndices.map((taskIndex, index) => [
    taskIndex,
    exteriorFactors[index],
  ]));

  return tasks.map((task, index) => {
    const factors = factorsByIndex.get(index);
    return {
      ...task,
      index,
      timeBand: times[index].id,
      vibe: vibes[index].id,
      shadowFamily: factors?.shadowFamily.id ?? 'profile',
      sunAzimuthSector: factors?.sunAzimuthSector.id ?? 'physical',
    };
  });
}

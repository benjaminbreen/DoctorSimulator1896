import test from 'node:test';
import assert from 'node:assert/strict';
import { lobbyStaffForZone, LOBBY_STAFF_MODELS } from '../src/world/lobbyStaff.js';
import { rollIdentity } from '../src/world/npcIdentity.js';
import { getZone, zones } from '../src/world/zones.js';
import { suggestedQuestions } from '../src/world/npcQuestions.js';

function outlineOf(zoneId) {
  return zones[zoneId].blueprint.outline;
}

function insideOutline([x, z], outline) {
  const xs = outline.map((point) => point[0]);
  const zs = outline.map((point) => point[1]);
  return x > Math.min(...xs) && x < Math.max(...xs)
    && z > Math.min(...zs) && z < Math.max(...zs);
}

test('every authored lobby keeps a bellhop, and the hotel a maid as well', () => {
  const hotel = lobbyStaffForZone('new-netherland-lobby');
  assert.deepEqual(
    hotel.map((entry) => entry.kind).sort(),
    ['bellhop', 'maid'],
    'the hotel has both',
  );
  assert.equal(lobbyStaffForZone('metropolitan-club-lobby').length, 1);
  assert.equal(lobbyStaffForZone('foyer').length, 1);
  assert.equal(lobbyStaffForZone('central-park').length, 0, 'the park is not a lobby');
});

test('staff stand inside the room they are posted in', () => {
  for (const zoneId of ['new-netherland-lobby', 'metropolitan-club-lobby', 'foyer']) {
    const outline = outlineOf(zoneId);
    for (const entry of lobbyStaffForZone(zoneId)) {
      assert.ok(
        insideOutline(entry.position, outline),
        `${entry.id} at ${entry.position} is outside ${zoneId}`,
      );
    }
  }
});

test('staff are not standing on the spot the player arrives at', () => {
  for (const zoneId of ['new-netherland-lobby', 'metropolitan-club-lobby', 'foyer']) {
    const spawn = zones[zoneId].blueprint.navigation.defaultSpawn;
    for (const entry of lobbyStaffForZone(zoneId)) {
      const gap = Math.hypot(entry.position[0] - spawn[0], entry.position[1] - spawn[2]);
      assert.ok(gap > 1.5, `${entry.id} is ${gap.toFixed(1)}m from the arrival point`);
    }
  }
});

test('each has a rolled identity, a model, and questions fit for a lobby', () => {
  for (const zoneId of ['new-netherland-lobby', 'foyer']) {
    for (const entry of lobbyStaffForZone(zoneId)) {
      const identity = rollIdentity(entry.archetype, 77);
      assert.ok(identity, `${entry.archetype} has an identity table`);
      assert.match(identity.profession, /bellhop|hall boy|porter|maid|laundress/);
      assert.ok(LOBBY_STAFF_MODELS[entry.kind], `${entry.kind} has a model`);
      const asked = suggestedQuestions({
        archetype: entry.archetype, role: entry.role, place: zoneId, hour: 11, seed: 3,
      });
      assert.doesNotMatch(asked.join(' '), /park|carousel/i, 'no park talk indoors');
      assert.doesNotMatch(asked.join(' '), /where are you bound/i, 'they are on duty');
    }
  }
});

test('a grand generated interior gets a hall boy; a humble one does not', () => {
  const generated = [];
  for (const id of Object.keys(zones)) generated.push(id);
  // Walk the real generated interiors rather than inventing a zone.
  const interiorIds = zones['central-park'].extraTransitions
    .map((transition) => transition.to.zone)
    .filter((id) => id.startsWith('interior:'));
  assert.ok(interiorIds.length > 0, 'the park has interiors to enter');

  let withStaff = 0;
  for (const id of interiorIds) {
    const zone = getZone(id, {});
    assert.ok(zone, `${id} generates`);
    const staff = lobbyStaffForZone(id, zone);
    const declared = (zone.features ?? []).includes('lobby-staff');
    if (staff.length > 0) {
      withStaff += 1;
      assert.ok(declared, `${id} places staff but does not declare the feature`);
      const outline = zone.blueprint.outline;
      assert.ok(insideOutline(staff[0].position, outline), `${id} staff inside the room`);
      assert.equal(staff[0].kind, 'bellhop');
    }
  }
  // Not every building is grand, so this proves the gate does something.
  assert.ok(withStaff < interiorIds.length, 'some interiors are too modest for staff');
  assert.ok(generated.length > 0);
});

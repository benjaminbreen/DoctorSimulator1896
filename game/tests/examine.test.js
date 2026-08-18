import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginExamination,
  endExamination,
  getExamination,
  openProcedures,
  forgetExaminedSubjects,
  recordQuestion,
  runProcedure,
} from '../src/examine/session.js';
import { examinable, examinableIds, CONFIDENCE } from '../src/examine/examinables.js';
import { classifySubject, subjectClasses, subjectRecord } from '../src/examine/subjects.js';
import { pickSubject, pickableItems, surfaceClassAt } from '../src/examine/picking.js';
import { getPlayer } from '../src/world/player.js';
import { examineFraming, resetExamineDistance, adjustExamineDistance, examineDistance } from '../src/examine/framing.js';

test('every record is complete enough for the panel to render it', () => {
  for (const id of examinableIds()) {
    const record = examinable(id);
    assert.ok(record.title && record.subtitle && record.opening, `${id} has a heading`);
    assert.ok(record.procedures.length >= 2, `${id} has something to try`);
    assert.ok(record.facts.length >= 4, `${id} has facts to answer from`);
    for (const step of record.procedures) {
      assert.ok(step.minutes > 0, `${id}/${step.id} costs time`);
      assert.ok(CONFIDENCE[step.finding.confidence], `${id}/${step.id} names a known confidence`);
    }
  }
});

test('a procedure yields its finding once and costs its minutes', () => {
  beginExamination('ladys-glove');
  assert.equal(getExamination().entries.length, 1);

  const first = runProcedure('wear');
  assert.equal(first.minutes, 2);
  assert.equal(getExamination().minutes, 2);
  const entry = getExamination().entries.at(-1);
  assert.equal(entry.finding.label, 'Its condition');

  // Running it again adds nothing and costs nothing.
  assert.equal(runProcedure('wear'), null);
  assert.equal(getExamination().entries.length, 2);
  assert.equal(getExamination().minutes, 2);

  assert.deepEqual(openProcedures().map((step) => step.id), ['wrist', 'lying']);
  endExamination();
  assert.equal(getExamination(), null);
});

test('an unknown subject does not open a session', () => {
  assert.equal(beginExamination('no-such-thing'), null);
  endExamination();
});

test('answers are kept apart from observations, so only observations are re-sent', () => {
  beginExamination('opium-pipe');
  runProcedure('bowl');
  recordQuestion('who smoked it?', 'Nothing in the pipe says so.', 'offline');
  const kinds = getExamination().entries.map((entry) => entry.kind);
  assert.deepEqual(kinds, ['observation', 'procedure', 'question']);
  endExamination();
});

test('framing stands off along the line the player is already on', () => {
  const item = {
    position: [2, 1, 0],
    size: [0.2, 0.1, 0.1],
    affordance: { span: 0.2 },
  };
  const framing = examineFraming(item, [5, 1.6, 0]);
  // Same side as the viewer, above the object, and radius away from it.
  assert.ok(framing.position[0] > 2);
  assert.ok(framing.position[1] > 1);
  const reach = Math.hypot(
    framing.position[0] - framing.target[0],
    framing.position[1] - framing.target[1],
    framing.position[2] - framing.target[2],
  );
  assert.ok(Math.abs(reach - framing.radius) < 1e-9, 'the eye starts exactly one radius out');
});

test('the dolly clamps rather than running to zero or to the far wall', () => {
  resetExamineDistance();
  assert.equal(examineDistance(), 1);
  adjustExamineDistance(-40);
  assert.ok(examineDistance() >= 0.6);
  adjustExamineDistance(40);
  assert.ok(examineDistance() <= 2.6);
  resetExamineDistance();
});

test('a click lands on the smallest thing that contains it', () => {
  const bench = { id: 'bench', position: [10, 0.5, 0], size: [1.5, 1, 0.7] };
  const bottle = { id: 'bottle', position: [10, 1.1, 0], size: [0.1, 0.2, 0.1] };
  const building = { id: 'block', position: [10, 8, 0], size: [20, 16, 20] };
  const all = [building, bench, bottle];

  assert.equal(pickSubject(all, [10, 1.1, 0]).id, 'bottle');
  assert.equal(pickSubject(all, [10.5, 0.5, 0]).id, 'bench');
  assert.equal(pickSubject(all, [18, 8, 8]).id, 'block');
  // Well outside everything: open ground, not the nearest wall.
  assert.equal(pickSubject([bench], [40, 0.5, 40]), null);
});

test('collider-only boxes are not things to look at', () => {
  const items = [
    { id: 'real', position: [0, 0, 0], size: [1, 1, 1] },
    { id: 'hidden', position: [0, 0, 0], size: [1, 1, 1], render: false },
    { id: 'infill', position: [0, 0, 0], size: [1, 1, 1], kind: 'block-infill' },
  ];
  assert.deepEqual(pickableItems(items).map((item) => item.id), ['real']);
});

test('the pond is told from the ground it sits in', () => {
  const water = { level: -0.5, outline: [[-10, -10], [10, -10], [10, 10], [-10, 10]] };
  assert.equal(surfaceClassAt([0, -0.5, 0], water), 'water');
  assert.equal(surfaceClassAt([40, -0.5, 0], water), 'ground');
  assert.equal(surfaceClassAt([0, 3, 0], water), 'ground');
  assert.equal(surfaceClassAt([0, -0.5, 0], null), 'ground');
});

test('a picked subject reads the same way every time it is picked', () => {
  const item = { id: 'schist-4', size: [0.9, 0.6, 0.8] };
  const once = subjectRecord({ item, id: 'schist-4', place: 'Central Park', className: 'stone' });
  const twice = subjectRecord({ item, id: 'schist-4', place: 'Central Park', className: 'stone' });
  assert.deepEqual(once, twice);
  // A different stone gets its own roll, so an outcrop is not eight identical
  // paragraphs.
  const other = subjectRecord({ item, id: 'schist-9', place: 'Central Park', className: 'stone' });
  assert.notDeepEqual(once.procedures, other.procedures);
});

test('classification reads fields the world builders already set', () => {
  assert.equal(classifySubject({ kind: 'tree' }), 'tree');
  assert.equal(classifySubject({ model: 'small_park_bench' }), 'timber');
  assert.equal(classifySubject({ model: 'low-poly_lamp_post' }), 'ironwork');
  assert.equal(classifySubject({ texture: 'brick' }), 'masonry');
  assert.equal(classifySubject({ finish: 'bottleGlass' }), 'glassware');
  assert.equal(classifySubject({ finish: 'mahogany' }), 'timber');
  assert.equal(classifySubject({}), 'thing');
});

test('every class builds a record the panel can render', () => {
  for (const className of subjectClasses()) {
    const record = subjectRecord({
      item: { size: [0.5, 0.4, 0.5] }, id: `x-${className}`, place: 'Somewhere', className,
    });
    assert.ok(record.title && record.opening && record.subtitle);
    assert.equal(record.procedures.length, 3);
    assert.ok(record.facts.length >= 5);
    for (const step of record.procedures) {
      assert.ok(typeof step.observation === 'string' && step.observation.length > 40);
      assert.ok(CONFIDENCE[step.finding.confidence], `${className}/${step.id} confidence`);
    }
  }
});

test('a settled look eases the nerves once and no more', () => {
  forgetExaminedSubjects();
  const record = subjectRecord({ item: { size: [1, 1, 1] }, id: 'stone-1', place: 'here', className: 'stone' });

  beginExamination('stone-1', record);
  const before = getPlayer().neurasthenia;
  runProcedure('grain');
  endExamination();
  const after = getPlayer().neurasthenia;
  assert.ok(after < before, 'looking closely settles the nerves');

  // The same stone a second time is just a stone.
  beginExamination('stone-1', record);
  runProcedure('weather');
  endExamination();
  assert.equal(getPlayer().neurasthenia, after);
});

test('looking without doing anything earns nothing', () => {
  forgetExaminedSubjects();
  const record = subjectRecord({ item: { size: [1, 1, 1] }, id: 'stone-2', place: 'here', className: 'stone' });
  const before = getPlayer().neurasthenia;
  beginExamination('stone-2', record);
  endExamination();
  assert.equal(getPlayer().neurasthenia, before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parkItems } from '../src/world/centralPark.js';
import { PARK_LANDMARKS } from '../src/world/parkLandmarks.js';

const EXPECTED_TITLES = {
  dairy: 'The Dairy',
  carousel: 'Central Park Carousel',
  arsenal: 'Arsenal (Central Park)',
  pond: 'The Pond and Hallett Nature Sanctuary',
  gapstow: 'The Pond and Hallett Nature Sanctuary',
  menagerie: 'Central Park Zoo',
  fifthAvenuePlaza: 'Grand Army Plaza (Manhattan)',
};

test('park landmark cards have authored locations and conservative Wikipedia mappings', () => {
  assert.deepEqual(Object.keys(PARK_LANDMARKS).sort(), Object.keys(EXPECTED_TITLES).sort());
  for (const [id, title] of Object.entries(EXPECTED_TITLES)) {
    const landmark = PARK_LANDMARKS[id];
    assert.ok(landmark.landmarkLabel, `${id} has a display name`);
    assert.ok(landmark.landmarkLocation, `${id} has a nearby street location`);
    assert.equal(landmark.wikipediaTitle, title);
  }
});

test('cards distinguish the 1896 scene from later Wikipedia subjects', () => {
  for (const id of ['carousel', 'gapstow', 'menagerie', 'fifthAvenuePlaza']) {
    assert.ok(PARK_LANDMARKS[id].wikipediaContext, `${id} explains the article relationship`);
  }
  assert.match(PARK_LANDMARKS.carousel.wikipediaContext, /original 1871 carousel/);
  assert.match(PARK_LANDMARKS.menagerie.wikipediaContext, /predecessor/);
  assert.match(PARK_LANDMARKS.fifthAvenuePlaza.wikipediaContext, /1916/);
});

test('the Arsenal and both Menagerie sheds carry clickable card metadata', () => {
  const arsenal = parkItems.find((item) => item.id === 'arsenal');
  assert.deepEqual(
    {
      label: arsenal.landmarkLabel,
      location: arsenal.landmarkLocation,
      wikipediaTitle: arsenal.wikipediaTitle,
    },
    {
      label: PARK_LANDMARKS.arsenal.landmarkLabel,
      location: PARK_LANDMARKS.arsenal.landmarkLocation,
      wikipediaTitle: PARK_LANDMARKS.arsenal.wikipediaTitle,
    },
  );

  const sheds = parkItems.filter((item) => item.id.startsWith('menagerie-shed-'));
  assert.equal(sheds.length, 2);
  for (const shed of sheds) assert.equal(shed.wikipediaTitle, PARK_LANDMARKS.menagerie.wikipediaTitle);
});

test('authored park meshes expose the shared landmark click policy', async () => {
  const sceneDirectory = fileURLToPath(new URL('../src/scene/', import.meta.url));
  const components = {
    'DairyCottage.jsx': 'PARK_LANDMARKS.dairy',
    'Carousel.jsx': 'PARK_LANDMARKS.carousel',
    'GapstowBridge.jsx': 'PARK_LANDMARKS.gapstow',
    'Water.jsx': 'PARK_LANDMARKS.pond',
    'StreetSurfaces.jsx': 'PARK_LANDMARKS.fifthAvenuePlaza',
  };
  for (const [filename, metadata] of Object.entries(components)) {
    const source = await readFile(`${sceneDirectory}${filename}`, 'utf8');
    assert.match(source, /identifyLandmark/);
    assert.ok(source.includes(metadata), `${filename} uses ${metadata}`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWikipediaArticle, identifyLandmark } from '../src/world/landmarkInformation.js';

test('Wikipedia lookup requests two plain-text sentences, a free thumbnail and the canonical URL', async () => {
  let requested;
  const article = await fetchWikipediaArticle('Metropolitan Club (New York City)', async (url) => {
    requested = url;
    return {
      ok: true,
      async json() {
        return {
          query: {
            pages: [{
              pageid: 17054629,
              title: 'Metropolitan Club (New York City)',
              extract: 'First sentence. Second sentence.',
              fullurl: 'https://en.wikipedia.org/wiki/Metropolitan_Club_(New_York_City)',
              thumbnail: { source: 'https://upload.wikimedia.org/example.jpg' },
            }],
          },
        };
      },
    };
  });

  assert.equal(requested.origin + requested.pathname, 'https://en.wikipedia.org/w/api.php');
  assert.equal(requested.searchParams.get('origin'), '*');
  assert.equal(requested.searchParams.get('exsentences'), '2');
  assert.equal(requested.searchParams.get('explaintext'), '1');
  assert.equal(requested.searchParams.get('pilicense'), 'free');
  assert.equal(requested.searchParams.get('titles'), 'Metropolitan Club (New York City)');
  assert.deepEqual(article, {
    title: 'Metropolitan Club (New York City)',
    extract: 'First sentence. Second sentence.',
    thumbnail: 'https://upload.wikimedia.org/example.jpg',
    url: 'https://en.wikipedia.org/wiki/Metropolitan_Club_(New_York_City)',
  });
});

test('Wikipedia lookup treats a missing page as an ordinary no-result fallback', async () => {
  const article = await fetchWikipediaArticle('No such landmark', async () => ({
    ok: true,
    async json() {
      return { query: { pages: [{ title: 'No such landmark', missing: true }] } };
    },
  }));
  assert.equal(article, null);
});

test('camera-turn drags do not identify the building where the drag ends', () => {
  let stopped = false;
  const result = identifyLandmark(
    { landmarkLabel: 'Metropolitan Club' },
    { delta: 12, stopPropagation: () => { stopped = true; } },
  );
  assert.equal(result, false);
  assert.equal(stopped, false);
});

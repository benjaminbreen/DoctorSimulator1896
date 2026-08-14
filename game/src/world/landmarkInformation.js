import { notice } from './notices.js';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const NOTICE_KEY = 'building-identification';
const wikipediaCache = new Map();
let latestSelection = 0;

function wikipediaRequestUrl(title) {
  const url = new URL(WIKIPEDIA_API);
  const parameters = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    redirects: '1',
    prop: 'extracts|pageimages|info',
    inprop: 'url',
    exintro: '1',
    exsentences: '2',
    explaintext: '1',
    piprop: 'thumbnail',
    pithumbsize: '320',
    pilicense: 'free',
    titles: title,
  };
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url;
}

// One Action API request returns the article's plain-text introduction, lead
// image and canonical URL. PageImages is restricted to freely licensed media;
// images remain remote Wikipedia assets and are not bundled into the game.
export async function fetchWikipediaArticle(title, fetcher = globalThis.fetch) {
  if (!title || typeof fetcher !== 'function') return null;
  const response = await fetcher(wikipediaRequestUrl(title));
  if (!response.ok) throw new Error(`Wikipedia request failed (${response.status})`);
  const payload = await response.json();
  const page = payload?.query?.pages?.[0];
  if (!page?.pageid || page.missing) return null;
  return {
    title: page.title,
    extract: page.extract ?? '',
    thumbnail: page.thumbnail?.source ?? null,
    url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`,
  };
}

function cachedWikipediaArticle(title) {
  if (!wikipediaCache.has(title)) {
    const request = fetchWikipediaArticle(title).catch((error) => {
      wikipediaCache.delete(title);
      throw error;
    });
    wikipediaCache.set(title, request);
  }
  return wikipediaCache.get(title);
}

function landmarkNotice(item, wikipedia = null) {
  notice(item.landmarkLabel, {
    key: NOTICE_KEY,
    seconds: 18,
    detail: 'Landmark',
    landmark: {
      location: item.landmarkLocation ?? null,
      wikipediaContext: item.wikipediaContext ?? null,
      wikipedia,
    },
  });
}

export function showLandmarkInformation(item) {
  if (!item?.landmarkLabel) return false;
  const selection = ++latestSelection;
  const wikipediaTitle = item.wikipediaTitle;
  landmarkNotice(item, wikipediaTitle ? { status: 'loading' } : null);
  if (!wikipediaTitle) return true;

  cachedWikipediaArticle(wikipediaTitle)
    .then((article) => {
      if (selection !== latestSelection) return;
      landmarkNotice(item, article
        ? { status: 'ready', ...article }
        : { status: 'missing' });
    })
    .catch(() => {
      if (selection !== latestSelection) return;
      landmarkNotice(item, { status: 'unavailable' });
    });
  return true;
}

// Shared click policy for ordinary boxes, authored models and instanced
// landmark shells. Pointer drags turn the camera and must not identify the
// building where the drag happened to end.
export function identifyLandmark(item, event) {
  if ((event?.delta ?? 0) > 5 || !item?.landmarkLabel) return false;
  event?.stopPropagation?.();
  return showLandmarkInformation(item);
}

// index.html preloads the player avatar before any module can run, so it
// repeats the device test in plain script. A stale copy is expensive and
// silent: the game downloads the preloaded file and then downloads the one it
// actually wanted. Run both against the same device shapes and compare.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playerAvatarUrl } from '../src/scene/playerModel.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const DEVICES = [
  { label: 'iPhone', maxTouchPoints: 5, coarse: true, width: 393, height: 852 },
  { label: 'iPad', maxTouchPoints: 5, coarse: true, width: 1024, height: 1366 },
  { label: 'large tablet', maxTouchPoints: 5, coarse: true, width: 1376, height: 1032 },
  { label: 'MacBook', maxTouchPoints: 0, coarse: false, width: 1512, height: 982 },
  { label: 'desktop', maxTouchPoints: 0, coarse: false, width: 2560, height: 1440 },
  { label: 'touchscreen laptop', maxTouchPoints: 10, coarse: false, width: 1920, height: 1080 },
];

// The inline script is the only <script> in index.html without a src.
function inlinePreloadScript() {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'index.html no longer carries an inline preload script');
  return match[1];
}

// Runs the inline script against a fake device and returns the href it asked
// the browser to preload.
function preloadedHref(device) {
  let href = null;
  const link = {
    set href(value) { href = value; },
    get href() { return href; },
  };
  const scope = {
    navigator: { maxTouchPoints: device.maxTouchPoints },
    screen: { width: device.width, height: device.height },
    window: { matchMedia: (query) => ({ matches: query.includes('coarse') && device.coarse }) },
    document: {
      createElement: () => link,
      head: { appendChild: () => {} },
    },
  };
  const run = new Function(
    ...Object.keys(scope),
    inlinePreloadScript(),
  );
  run(...Object.values(scope));
  return href;
}

// playerAvatarUrl reads these off globalThis at call time.
function moduleUrl(device) {
  const saved = {
    navigator: globalThis.navigator,
    screen: globalThis.screen,
    matchMedia: globalThis.matchMedia,
  };
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { maxTouchPoints: device.maxTouchPoints },
      configurable: true,
    });
    globalThis.screen = { width: device.width, height: device.height };
    globalThis.matchMedia = (query) => ({ matches: query.includes('coarse') && device.coarse });
    return playerAvatarUrl();
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: saved.navigator, configurable: true });
    globalThis.screen = saved.screen;
    globalThis.matchMedia = saved.matchMedia;
  }
}

test('the preload names the file PlayerAvatar loads, on every device shape', () => {
  for (const device of DEVICES) {
    assert.equal(preloadedHref(device), moduleUrl(device), device.label);
  }
});

test('the preload asks for a CORS fetch, matching three\'s FileLoader', () => {
  const script = inlinePreloadScript();
  assert.match(script, /rel\s*=\s*'preload'/);
  assert.match(script, /as\s*=\s*'fetch'/);
  assert.match(script, /crossOrigin\s*=\s*'anonymous'/);
});

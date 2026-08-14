import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('the game shell follows the visible mobile viewport', () => {
  const app = source('../src/App.jsx');
  const styles = source('../src/styles.css');

  assert.match(app, /className="game-shell flex/);
  assert.doesNotMatch(app, /\bh-screen\b/);
  assert.match(styles, /\.game-shell\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s);
});

test('short landscape fully resets and compacts the pocket action shelf', () => {
  const styles = source('../src/hud/hud.css');
  const queryStart = styles.indexOf('@media (max-width: 900px) and (max-height: 500px)');
  assert.notEqual(queryStart, -1);
  const landscape = styles.slice(queryStart, styles.indexOf('@media (prefers-reduced-motion', queryStart));

  assert.match(landscape, /\.ghud-actions\s*\{[^}]*top:[^;}]+;[^}]*right:[^;}]+;[^}]*bottom:\s*auto;[^}]*left:\s*auto;[^}]*transform:\s*none;/s);
  assert.match(landscape, /\.ghud-action-caption\s*\{\s*display:\s*none;/);
  assert.match(landscape, /\.ghud-time-date\s*\{\s*display:\s*none;/);
  assert.match(landscape, /\.ghud-rule\s*\{\s*display:\s*none;/);
});

test('touch controls and mobile notices remain safe-area anchored', () => {
  const controls = source('../src/hud/MobileControls.css');
  const toasts = source('../src/hud/Toasts.css');

  assert.match(controls, /bottom:\s*calc\(14px \+ env\(safe-area-inset-bottom/);
  assert.match(controls, /bottom:\s*calc\(16px \+ env\(safe-area-inset-bottom/);
  assert.match(toasts, /env\(safe-area-inset-right/);
  assert.match(toasts, /@media \(max-width: 900px\) and \(max-height: 500px\)/);
});

test('an active mobile consultation compacts chrome without shrinking touch targets', () => {
  const app = source('../src/hud/GameHud.jsx');
  const consultation = source('../src/consultation/ConsultationView.jsx');
  const hudStyles = source('../src/hud/hud.css');
  const consultationStyles = source('../src/consultation/consultation.css');

  assert.match(app, /quiet \? ' ghud--quiet' : ''/);
  assert.match(app, /'Consulting Office': 'Consulting Rm\.'/);
  assert.match(consultation, /patient && state \? ' gcon--active' : ''/);
  assert.match(hudStyles, /\.ghud--quiet \.ghud-bar\s*\{[^}]*height:\s*64px;/s);
  assert.match(hudStyles, /\.ghud--quiet \.ghud-mono-wrap\s*\{\s*display:\s*none;/);
  assert.match(consultationStyles, /\.gcon--active \.gcon-rail\s*\{[^}]*height:\s*54px;/s);
  assert.match(consultationStyles, /\.gcon--active \.gcon-rail-item\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(consultationStyles, /\.gcon--active \.gcon-card,[\s\S]*font-size:\s*12\.25px;/);
});

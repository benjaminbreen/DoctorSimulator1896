#!/usr/bin/env node
// Frame cost of one switch at one viewpoint. Alternates the switch with the
// baseline four times in one session, so drift between runs cancels, and
// prints median frame time with the frame-rate cap off.
//
//   node game/scripts/frame-ab.mjs consulting-office 1.2,1.2,0 set:aoEnabled:false
//   node game/scripts/frame-ab.mjs central-park 38,62,1.2 hide:instanced set:shadowsEnabled:false
//   PRE='set:paintStyle:"hopper"' node game/scripts/frame-ab.mjs ... (applied to both sides)
//
// Needs the dev server on 5175 and the display awake: with the display
// asleep, headless Chrome stalls and the numbers mean nothing.
import { chromium } from 'playwright-core';
const [zone, at, ...conds] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('ghosts-game.tuning.v1', JSON.stringify({ schemaVersion: 6, values: { graphicsQuality: 'quality' } })));
const p = await ctx.newPage(); p.setDefaultTimeout(180000);
const ready = () => p.waitForFunction(() => window.__game?.stats.boot.complete && __game.loadedZone === __game.tuning.zone && (__game.stats.parkStream?.idle ?? true) && __game.actors.requested.every((id) => __game.actors.loaded.includes(id)));
await p.goto(`http://127.0.0.1:5175/?playtest=1&seed=4&zone=${zone}&parkNear=1`); await ready(); await p.waitForTimeout(2000);
const [x, z, yaw] = at.split(',').map(Number);
await p.evaluate(async ({ x, z, yaw }) => { const { terrainHeight } = await import('/src/world/terrain.js'); __game.set('cameraMode', 'first'); await new Promise(r => setTimeout(r, 500)); __game.teleport(x, (__game.tuning.zone === 'central-park' ? terrainHeight(x, z) : 0) + .3, z); __game.pendingYaw = yaw; __game.setLook(yaw, 0); }, { x, z, yaw });
await p.waitForTimeout(800); await ready(); await p.waitForTimeout(5000);
// Slow pan, so culling, shadows and the reflection all keep working.
const sample = () => p.evaluate(async () => { const t = []; let last = performance.now(); const yaw0 = __game.look.yaw; const start = last;
  await new Promise(done => { const tick = () => { const now = performance.now(); t.push(now - last); last = now; __game.setLook(yaw0 + Math.sin((now - start) / 700) * 0.5, 0); if (now - start < 2200) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
  __game.setLook(yaw0, 0); t.sort((a, b) => a - b); return t[Math.floor(t.length / 2)]; });
const apply = (spec, on) => p.evaluate(([spec, on]) => { const [kind, key, value] = spec.split(':'); window.__ab ??= {};
  if (kind === 'set') { if (on) { window.__ab[key] = __game.tuning[key]; __game.set(key, JSON.parse(value)); } else __game.set(key, window.__ab[key]); }
  if (kind === 'hide') __game.scene.traverse(o => { const hit = key === 'skinned' ? o.isSkinnedMesh : key === 'instanced' ? o.isInstancedMesh : key === 'water' ? o.material?.uniforms?.uReflection : o.name === key; if (!hit) return; if (on) { o.userData.__was = o.visible; o.visible = false; } else if (o.userData.__was !== undefined) o.visible = o.userData.__was; }); }, [spec, on]);
if (process.env.PRE) { for (const spec of process.env.PRE.split(' ')) await apply(spec, true); await p.waitForTimeout(4000); }
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(zone, at, await p.evaluate(() => JSON.stringify({ dpr: __game.stats.pixelRatio, draws: __game.stats.draws, tris: __game.stats.triangles, reflMs: +(__game.stats.reflectionMs || 0).toFixed(1) })));
for (const spec of conds) { const A = [], B = [];
  for (let i = 0; i < 4; i += 1) { A.push(await sample()); await apply(spec, true); await p.waitForTimeout(1200); B.push(await sample()); await apply(spec, false); await p.waitForTimeout(1200); }
  console.log(`  ${spec.padEnd(34)} base ${med(A).toFixed(2)}ms  with ${med(B).toFixed(2)}ms  saves ${(med(A) - med(B)).toFixed(2)}ms (${Math.round((1 - med(B) / med(A)) * 100)}%)`); }
await b.close();

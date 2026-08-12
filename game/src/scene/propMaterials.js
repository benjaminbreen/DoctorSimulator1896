// Materials for the built props, in one place.
//
// The three renderers that draw them — the room, the props panel, and the
// contact sheet — each had their own copy of "colour plus roughness", which
// meant a piece looked like three different objects depending where you were
// standing. This is the single answer.
//
// A named finish carries the physical properties *and* a texture set. A finish
// is three canvases, not one: colour, roughness and bump. Colour alone gives a
// painted-on look, because a real surface is read from how its gloss varies
// across it — the dull ring of tarnish on a brass fitting, the open pores in
// mahogany — and that variation lives in the roughness, not the albedo.

import * as THREE from 'three';
import { labelFont } from '../world/labelFonts.js';

const cache = new Map();
const labels = new Map();

// Deterministic noise, so a finish looks the same every run and a texture
// diffed against a screenshot means something.
function rand(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function canvas(size) {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  return element;
}

// Speckle: the base of every worn surface. Fine grain, no visible period.
function speckle(context, size, amount, tint = [0, 0, 0]) {
  const image = context.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (rand(i * 0.37) - 0.5) * 2 * amount;
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + n * 255 + tint[0]));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + n * 255 + tint[1]));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + n * 255 + tint[2]));
  }
  context.putImageData(image, 0, 0);
}

// Soft irregular patches — tarnish, wear, a scrubbed patch of bench.
function blotches(context, size, count, colour, radius, seedBase) {
  for (let i = 0; i < count; i += 1) {
    const x = rand(seedBase + i * 3.1) * size;
    const y = rand(seedBase + i * 7.7) * size;
    const r = radius[0] + rand(seedBase + i * 11.3) * (radius[1] - radius[0]);
    const blot = context.createRadialGradient(x, y, 0, x, y, r);
    blot.addColorStop(0, colour);
    blot.addColorStop(1, colour.replace(/[\d.]+\)$/, '0)'));
    context.fillStyle = blot;
    context.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// ---------------------------------------------------------------------------
// The finishes. Each returns { colour, rough, bump } canvases.

// Lacquered brass. Turned stock keeps faint concentric marks, but they are
// hairlines, not stripes: the earlier version banded because the marks were
// drawn at full strength on a regular period, which a repeat then multiplied.
// What actually reads as brass is the tarnish — dull, blotchy, and only in the
// roughness.
function brass() {
  const size = 256;
  const colour = canvas(size);
  const cc = colour.getContext('2d');
  cc.fillStyle = '#ad8942';
  cc.fillRect(0, 0, size, size);
  // Broad warmth drift, so no two square inches match.
  blotches(cc, size, 14, 'rgba(196, 158, 82, 0.30)', [40, 110], 3);
  blotches(cc, size, 18, 'rgba(112, 84, 38, 0.22)', [24, 80], 19);
  // Turning marks: sub-pixel at any real size, so keep them faint.
  for (let y = 0; y < size; y += 1) {
    const a = 0.02 + rand(y * 2.3) * 0.05;
    cc.fillStyle = rand(y * 5.1) > 0.5 ? `rgba(226,196,124,${a})` : `rgba(92,68,30,${a})`;
    cc.fillRect(0, y, size, 1);
  }
  speckle(cc, size, 0.035);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  // Dark = smooth. Polished brass with tarnish coming up through it.
  rc.fillStyle = '#3c3c3c';
  rc.fillRect(0, 0, size, size);
  blotches(rc, size, 22, 'rgba(190, 190, 190, 0.55)', [18, 70], 19);
  blotches(rc, size, 10, 'rgba(20, 20, 20, 0.5)', [30, 90], 41);
  speckle(rc, size, 0.06);

  return { colour, rough, bump: rough, bumpScale: 0.0012 };
}

// Japanned iron: baked black lacquer over a casting. Nearly matte, with the
// orange-peel of a brushed varnish and grey showing where a hand goes.
function iron() {
  const size = 256;
  const colour = canvas(size);
  const cc = colour.getContext('2d');
  cc.fillStyle = '#26282b';
  cc.fillRect(0, 0, size, size);
  // Faint and small: japanned iron is a smooth baked lacquer, and broad light
  // patches on it read as polished granite instead.
  blotches(cc, size, 14, 'rgba(72, 74, 78, 0.13)', [8, 30], 7);
  blotches(cc, size, 10, 'rgba(12, 12, 14, 0.3)', [10, 36], 23);
  speckle(cc, size, 0.022);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#a4a4a4';
  rc.fillRect(0, 0, size, size);
  // Worn patches polish back to a shine.
  blotches(rc, size, 14, 'rgba(70, 70, 70, 0.4)', [10, 34], 7);
  speckle(rc, size, 0.05);

  return { colour, rough, bump: rough, bumpScale: 0.0018 };
}

// French-polished mahogany. Grain lines run the length of the board, are
// hairline-fine, and are nearly the colour of the wood — the barber-pole look
// comes from drawing them dark and evenly spaced. Pores and figure carry the
// character instead.
function mahogany() {
  const size = 512;
  const colour = canvas(size);
  const cc = colour.getContext('2d');
  cc.fillStyle = '#4d2a19';
  cc.fillRect(0, 0, size, size);
  // Figure: broad, soft bands of lighter and darker heartwood. Kept faint and
  // numerous — a few strong ones read as painted stripes once the map tiles.
  for (let i = 0; i < 22; i += 1) {
    const x = rand(i * 4.4) * size;
    const w = 20 + rand(i * 9.1) * 70;
    const grad = cc.createLinearGradient(x - w, 0, x + w, 0);
    const light = rand(i * 2.2) > 0.5;
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, light ? 'rgba(112,66,40,0.11)' : 'rgba(34,17,10,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    cc.fillStyle = grad;
    cc.fillRect(x - w, 0, w * 2, size);
  }
  // Grain: many fine lines, low contrast, irregularly spaced.
  for (let i = 0; i < 520; i += 1) {
    const x = rand(i * 1.13) * size;
    const drift = (rand(i * 3.7) - 0.5) * 14;
    const dark = rand(i * 8.9) > 0.72;
    cc.strokeStyle = dark ? 'rgba(36, 19, 11, 0.20)' : 'rgba(104, 62, 38, 0.13)';
    cc.lineWidth = dark ? 1.6 : 0.9;
    cc.beginPath();
    cc.moveTo(x, 0);
    cc.bezierCurveTo(x + drift, size * 0.33, x - drift, size * 0.66, x, size);
    cc.stroke();
  }
  // Open pores: short dashes along the grain. This is the tell for mahogany.
  for (let i = 0; i < 900; i += 1) {
    const x = rand(i * 5.3) * size;
    const y = rand(i * 6.1) * size;
    cc.fillStyle = 'rgba(28, 14, 8, 0.22)';
    cc.fillRect(x, y, 1, 2 + rand(i * 2.9) * 6);
  }
  speckle(cc, size, 0.02);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  // French polish is a gloss, so mostly smooth; the pores are what catch.
  rc.fillStyle = '#3a3a3a';
  rc.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i += 1) {
    const x = rand(i * 5.3) * size;
    const y = rand(i * 6.1) * size;
    rc.fillStyle = 'rgba(200, 200, 200, 0.5)';
    rc.fillRect(x, y, 1, 2 + rand(i * 2.9) * 6);
  }
  blotches(rc, size, 10, 'rgba(150, 150, 150, 0.35)', [30, 90], 61);
  speckle(rc, size, 0.05);

  return { colour, rough, bump: rough, bumpScale: 0.0009 };
}

// Vulcanite (ebonite): moulded hard rubber, the black of every shutter,
// binding post and instrument knob of the period. It is not flat black — it is
// a very dark brown that goes glossy where it is handled and chalky where it
// is not. Without this a shutter is a hole in the screen.
function ebonite() {
  const size = 256;
  const colour = canvas(size);
  const cc = colour.getContext('2d');
  cc.fillStyle = '#232021';
  cc.fillRect(0, 0, size, size);
  // Sulphur bloom: the brown haze old vulcanite gets. Kept small and faint —
  // large soft patches on a flat panel read as smudges on the lens, not as a
  // surface.
  blotches(cc, size, 34, 'rgba(96, 70, 46, 0.07)', [8, 34], 13);
  blotches(cc, size, 20, 'rgba(10, 9, 9, 0.3)', [8, 28], 29);
  // Mould flow lines, very soft.
  for (let i = 0; i < 40; i += 1) {
    const y = rand(i * 3.3) * size;
    cc.fillStyle = `rgba(58, 50, 44, ${0.04 + rand(i * 7.1) * 0.06})`;
    cc.fillRect(0, y, size, 1 + rand(i * 1.9) * 3);
  }
  speckle(cc, size, 0.03);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#5a5a5a';
  rc.fillRect(0, 0, size, size);
  blotches(rc, size, 16, 'rgba(30, 30, 30, 0.55)', [26, 84], 13);
  blotches(rc, size, 10, 'rgba(180, 180, 180, 0.4)', [20, 70], 29);
  speckle(rc, size, 0.07);

  return { colour, rough, bump: rough, bumpScale: 0.0006 };
}

// An ivory dial: creamy, faintly foxed, engraved with graduations. This is
// what makes a chronoscope read as an instrument rather than a shape.
function dial() {
  const size = 512;
  const colour = canvas(size);
  const context = colour.getContext('2d');
  context.fillStyle = '#e9e3d1';
  context.fillRect(0, 0, size, size);
  const centre = 256;
  context.strokeStyle = 'rgba(46, 40, 30, 0.8)';
  for (let tick = 0; tick < 100; tick += 1) {
    const angle = (tick / 100) * Math.PI * 2 - Math.PI / 2;
    const major = tick % 10 === 0;
    const inner = major ? 186 : 206;
    context.lineWidth = major ? 3.2 : 1.2;
    context.beginPath();
    context.moveTo(centre + Math.cos(angle) * inner, centre + Math.sin(angle) * inner);
    context.lineTo(centre + Math.cos(angle) * 226, centre + Math.sin(angle) * 226);
    context.stroke();
  }
  context.strokeStyle = 'rgba(46, 40, 30, 0.55)';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(centre, centre, 232, 0, Math.PI * 2);
  context.stroke();
  // Numerals, suggested rather than written: at any real size these are a few
  // pixels, and drawn glyphs would only alias.
  context.fillStyle = 'rgba(46, 40, 30, 0.7)';
  for (let mark = 0; mark < 10; mark += 1) {
    const angle = (mark / 10) * Math.PI * 2 - Math.PI / 2;
    context.fillRect(centre + Math.cos(angle) * 160 - 7, centre + Math.sin(angle) * 160 - 5, 14, 10);
  }
  blotches(context, size, 26, 'rgba(150, 120, 70, 0.10)', [4, 16], 5);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#787878';
  rc.fillRect(0, 0, size, size);
  speckle(rc, size, 0.08);
  return { colour, rough, bump: null, bumpScale: 0 };
}

// Deal: plain softwood bench top, scrubbed pale and stained by use.
function deal() {
  const size = 256;
  const colour = canvas(size);
  const cc = colour.getContext('2d');
  cc.fillStyle = '#9d8462';
  cc.fillRect(0, 0, size, size);
  for (let board = 0; board < 4; board += 1) {
    const y = board * 64;
    const tone = 0.9 + rand(board * 12.9) * 0.2;
    cc.fillStyle = `rgba(${Math.round(158 * tone)}, ${Math.round(133 * tone)}, ${Math.round(99 * tone)}, 0.55)`;
    cc.fillRect(0, y, size, 64);
    cc.fillStyle = 'rgba(56, 40, 25, 0.45)';
    cc.fillRect(0, y, size, 1.5);
    for (let g = 0; g < 26; g += 1) {
      cc.fillStyle = `rgba(96, 74, 48, ${0.06 + rand(board * 3 + g) * 0.1})`;
      cc.fillRect(0, y + 3 + g * 2.3, size, 1);
    }
  }
  // Ink, reagent and burn marks: a laboratory bench is not a new one.
  blotches(cc, size, 12, 'rgba(48, 36, 22, 0.30)', [8, 34], 71);
  speckle(cc, size, 0.03);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#c2c2c2';
  rc.fillRect(0, 0, size, size);
  blotches(rc, size, 12, 'rgba(90, 90, 90, 0.5)', [8, 34], 71);
  speckle(rc, size, 0.07);

  return { colour, rough, bump: rough, bumpScale: 0.0025 };
}

// Card stock and paper labels: fibrous, dead matte, faintly yellowed.
function card() {
  const size = 256;
  const colour = canvas(size);
  const cc = colour.getContext('2d');
  cc.fillStyle = '#e6dfcc';
  cc.fillRect(0, 0, size, size);
  blotches(cc, size, 18, 'rgba(178, 158, 118, 0.14)', [10, 46], 97);
  speckle(cc, size, 0.03);
  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#e0e0e0';
  rc.fillRect(0, 0, size, size);
  speckle(rc, size, 0.07);
  return { colour, rough, bump: rough, bumpScale: 0.0004 };
}

// Crushed ice: white granular top over cold blue depth. The glint lives in
// the roughness — scattered single smooth grains catch the sky.
function ice() {
  const size = 256;
  const colour = canvas(size);
  const cc = colour.getContext('2d');
  cc.fillStyle = '#e4edf0';
  cc.fillRect(0, 0, size, size);
  blotches(cc, size, 16, 'rgba(148, 186, 199, 0.35)', [14, 46], 9);
  blotches(cc, size, 10, 'rgba(96, 142, 160, 0.25)', [8, 26], 31);
  blotches(cc, size, 20, 'rgba(255, 255, 255, 0.5)', [4, 14], 47);
  speckle(cc, size, 0.07);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#b0b0b0';
  rc.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i += 1) {
    const x = rand(i * 3.7) * size;
    const y = rand(i * 7.9) * size;
    rc.fillStyle = `rgba(20, 20, 20, ${0.5 + rand(i * 1.3) * 0.5})`;
    rc.fillRect(x, y, 1 + rand(i * 5.1), 1 + rand(i * 2.7));
  }
  blotches(rc, size, 12, 'rgba(230, 230, 230, 0.4)', [10, 40], 9);
  speckle(rc, size, 0.08);

  return { colour, rough, bump: rough, bumpScale: 0.004 };
}

const MAKERS = { brass, iron, mahogany, ebonite, dial, deal, card, ice };

function canvasTexture(element, srgb) {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Painted cart planking, one set per paint colour: board seams, grain, and
// paint rubbed back to timber where hands and loads wear it.
const plankSets = new Map();

function plankMaps(colour) {
  if (plankSets.has(colour)) return plankSets.get(colour);
  const size = 256;
  const col = canvas(size);
  const cc = col.getContext('2d');
  cc.fillStyle = colour;
  cc.fillRect(0, 0, size, size);
  for (let board = 0; board < 4; board += 1) {
    const y = board * 64;
    const tone = (rand(board * 5.7) - 0.5) * 0.16;
    cc.fillStyle = tone > 0 ? `rgba(255,244,220,${tone})` : `rgba(20,14,8,${-tone})`;
    cc.fillRect(0, y, size, 64);
    cc.fillStyle = 'rgba(18,12,6,0.55)';
    cc.fillRect(0, y, size, 2);
    for (let g = 0; g < 30; g += 1) {
      cc.fillStyle = `rgba(30,20,10,${0.03 + rand(board * 9 + g) * 0.07})`;
      cc.fillRect(0, y + 3 + g * 2.1, size, 1);
    }
  }
  blotches(cc, size, 10, 'rgba(150,124,88,0.18)', [8, 30], 53);
  blotches(cc, size, 8, 'rgba(15,12,8,0.16)', [10, 40], 71);
  speckle(cc, size, 0.035);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#c6c6c6';
  rc.fillRect(0, 0, size, size);
  // Rubbed paint goes smooth.
  blotches(rc, size, 10, 'rgba(70,70,70,0.4)', [8, 30], 53);
  speckle(rc, size, 0.06);

  const set = { map: canvasTexture(col, true), rough: canvasTexture(rough, false) };
  plankSets.set(colour, set);
  return set;
}

// Striped vendor awning canvas: cream and one colour, sun-faded.
const awningSets = new Map();

function awningMaps(colour) {
  if (awningSets.has(colour)) return awningSets.get(colour);
  const size = 256;
  const col = canvas(size);
  const cc = col.getContext('2d');
  for (let stripe = 0; stripe < 8; stripe += 1) {
    cc.fillStyle = stripe % 2 === 0 ? '#e9dfc6' : colour;
    cc.fillRect(stripe * 32, 0, 32, size);
    cc.fillStyle = `rgba(40,32,20,${0.04 + rand(stripe * 3.3) * 0.05})`;
    cc.fillRect(stripe * 32, 0, 2, size);
  }
  blotches(cc, size, 12, 'rgba(120,100,70,0.10)', [10, 44], 33);
  blotches(cc, size, 8, 'rgba(255,250,235,0.12)', [16, 50], 57);
  speckle(cc, size, 0.03);

  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#d2d2d2';
  rc.fillRect(0, 0, size, size);
  speckle(rc, size, 0.05);

  const set = { map: canvasTexture(col, true), rough: canvasTexture(rough, false) };
  awningSets.set(colour, set);
  return set;
}

// Coach lacquer is subtly mottled and worn along high spots. At carriage
// scale this reads as painted wood instead of a perfectly smooth plastic box.
const coachPaintSets = new Map();

function coachPaintMaps(colour) {
  if (coachPaintSets.has(colour)) return coachPaintSets.get(colour);
  const size = 256;
  const col = canvas(size);
  const cc = col.getContext('2d');
  cc.fillStyle = colour;
  cc.fillRect(0, 0, size, size);
  blotches(cc, size, 20, 'rgba(255,236,202,0.055)', [10, 42], 101);
  blotches(cc, size, 18, 'rgba(14,11,9,0.11)', [8, 34], 131);
  for (let scratch = 0; scratch < 38; scratch += 1) {
    const y = rand(211 + scratch * 4.1) * size;
    const x = rand(241 + scratch * 6.3) * size;
    cc.fillStyle = `rgba(170,130,82,${0.025 + rand(scratch) * 0.04})`;
    cc.fillRect(x, y, 8 + rand(scratch * 3.7) * 48, 1);
  }
  speckle(cc, size, 0.018);
  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = '#696969';
  rc.fillRect(0, 0, size, size);
  blotches(rc, size, 22, 'rgba(165,165,165,0.32)', [8, 38], 131);
  speckle(rc, size, 0.045);
  const set = { map: canvasTexture(col, true), rough: canvasTexture(rough, false) };
  coachPaintSets.set(colour, set);
  return set;
}

function wovenMaps(colour, leatherSurface = false) {
  const size = 256;
  const col = canvas(size);
  const cc = col.getContext('2d');
  cc.fillStyle = colour;
  cc.fillRect(0, 0, size, size);
  if (leatherSurface) {
    for (let mark = 0; mark < 520; mark += 1) {
      const x = rand(mark * 2.7) * size;
      const y = rand(mark * 6.1) * size;
      cc.fillStyle = `rgba(20,12,9,${0.025 + rand(mark * 1.3) * 0.05})`;
      cc.fillRect(x, y, 1.4, 1.4);
    }
  } else {
    cc.strokeStyle = 'rgba(230,220,190,0.055)';
    for (let line = 0; line < size; line += 6) {
      cc.beginPath(); cc.moveTo(line, 0); cc.lineTo(line, size); cc.stroke();
      cc.beginPath(); cc.moveTo(0, line); cc.lineTo(size, line); cc.stroke();
    }
  }
  blotches(cc, size, 14, 'rgba(12,10,8,0.12)', [10, 42], leatherSurface ? 173 : 191);
  const rough = canvas(size);
  const rc = rough.getContext('2d');
  rc.fillStyle = leatherSurface ? '#868686' : '#d0d0d0';
  rc.fillRect(0, 0, size, size);
  speckle(rc, size, leatherSurface ? 0.07 : 0.1);
  return { map: canvasTexture(col, true), rough: canvasTexture(rough, false) };
}

const coachLeatherSets = new Map();
const coachCanvasSets = new Map();

function textureSet(name) {
  if (!MAKERS[name]) return null;
  if (!cache.has(name)) {
    const built = MAKERS[name]();
    const wrap = (element, srgb) => {
      if (!element) return null;
      const texture = new THREE.CanvasTexture(element);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 8;
      return texture;
    };
    cache.set(name, {
      map: wrap(built.colour, true),
      roughnessMap: wrap(built.rough, false),
      bumpMap: wrap(built.bump, false),
      bumpScale: built.bumpScale ?? 0,
    });
  }
  return cache.get(name);
}

export function propTexture(name) {
  return textureSet(name)?.map ?? null;
}

// The physical half. `finish` names one of these; anything else falls back to
// painted wood, which is what most of the built furniture is.
//
// `tile` is how many metres one repeat of the texture covers in the world. It
// has to be here because a box's UVs run 0..1 per face whatever its size, so
// one shared repeat count prints the grain a metre wide on a 36mm upright and
// hairline on a bench top. Same fault the wallpaper had, same fix.
const FINISH = {
  brass: { texture: 'brass', tile: 0.14, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.5 },
  brassDull: { texture: 'brass', tile: 0.14, roughness: 0.55, metalness: 0.75, envMapIntensity: 1.0 },
  iron: { texture: 'iron', tile: 0.2, roughness: 0.66, metalness: 0.35, envMapIntensity: 0.7 },
  steel: { texture: 'iron', tile: 0.2, roughness: 0.24, metalness: 0.95, envMapIntensity: 1.8 },
  // Mahogany was cut from wide boards: the figure runs about a hand apart.
  mahogany: { texture: 'mahogany', tile: 0.3, roughness: 0.36, metalness: 0.02, envMapIntensity: 0.9 },
  deal: { texture: 'deal', tile: 0.6, roughness: 0.8, metalness: 0, envMapIntensity: 0.4 },
  // A dial face is one engraving, not a tiling pattern: it must not repeat.
  dial: { texture: 'dial', tile: null, roughness: 0.42, metalness: 0, envMapIntensity: 0.5 },
  ebonite: { texture: 'ebonite', tile: 0.12, roughness: 0.34, metalness: 0.04, envMapIntensity: 1.1 },
  // Old brass that nobody polishes: runners, beading, the backs of things.
  brassAged: { texture: 'brass', tile: 0.14, roughness: 0.62, metalness: 0.6, envMapIntensity: 0.7, tint: '#9a8353' },
  ivory: { texture: 'card', tile: 0.3, roughness: 0.45, metalness: 0, envMapIntensity: 0.6, tint: '#f2ecdc' },
  card: { texture: 'card', tile: 0.12, roughness: 0.92, metalness: 0, envMapIntensity: 0.3 },
};

// One texture per finish per size, so the grain runs at a constant real-world
// scale across a whole instrument without cloning a map per mesh.
const sized = new Map();
const laboratoryBenchMaps = new Map();
const bottleSurfaceSets = new Map();
let laboratoryBenchSource = null;
let labelPaperImage = null;

function mapsFor(spec, size) {
  const set = textureSet(spec.texture);
  if (!set) return null;
  if (!spec.tile) return set;
  // Across the largest two faces of the part: enough to be right on the face
  // you actually look at, without a per-face split.
  const [sx, sy, sz] = size ?? [1, 1, 1];
  const across = Math.max(sx, sz);
  const key = `${spec.texture}:${across.toFixed(3)}:${sy.toFixed(3)}`;
  if (!sized.has(key)) {
    const u = Math.max(across / spec.tile, 0.4);
    const v = Math.max(sy / spec.tile, 0.4);
    const clone = (texture) => {
      if (!texture) return null;
      const copy = texture.clone();
      copy.needsUpdate = true;
      copy.repeat.set(u, v);
      return copy;
    };
    sized.set(key, {
      map: clone(set.map),
      roughnessMap: clone(set.roughnessMap),
      bumpMap: clone(set.bumpMap),
      bumpScale: set.bumpScale,
    });
  }
  return sized.get(key);
}

function laboratoryBenchSourceMaps() {
  if (laboratoryBenchSource) return laboratoryBenchSource;
  const loader = new THREE.TextureLoader();
  const load = (file, color = false) => {
    const texture = loader.load(`/textures/props/laboratory-bench/${file}`);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  laboratoryBenchSource = {
    map: load('pale-deal-albedo.webp', true),
    roughnessMap: load('pale-deal-roughness.webp'),
    normalMap: load('pale-deal-normal.webp'),
    aoMap: load('pale-deal-ao.webp'),
  };
  return laboratoryBenchSource;
}

// ImageGen supplies the de-lit colour source. The other channels are derived
// from separate local fields, so gloss and relief do not simply repeat the
// colour values. Copies keep scale and grain direction local to each part.
function mapsForLaboratoryBench(item) {
  // Contact sheets can show several differently sized procedural assets at
  // once. Reuse one source set there instead of cloning four 2K textures for
  // every distinct board dimension.
  if (item.texturePreview) return laboratoryBenchSourceMaps();
  const tile = item.textureScale ?? 0.42;
  const rotation = item.grainRotation ?? 0;
  const offset = item.textureOffset ?? [0, 0];
  const dimensions = [...(item.size ?? [1, 1, 1])].sort((a, b) => b - a);
  const u = Math.max(dimensions[0] / tile, 0.35);
  const v = Math.max(dimensions[1] / tile, 0.35);
  const key = `${u.toFixed(3)}:${v.toFixed(3)}:${rotation.toFixed(3)}:${offset[0]}:${offset[1]}`;
  if (!laboratoryBenchMaps.has(key)) {
    const clone = (texture, channel = 0) => {
      const copy = texture.clone();
      copy.center.set(0.5, 0.5);
      copy.rotation = rotation;
      copy.repeat.set(u, v);
      copy.offset.set(offset[0], offset[1]);
      copy.channel = channel;
      copy.needsUpdate = true;
      return copy;
    };
    const source = laboratoryBenchSourceMaps();
    laboratoryBenchMaps.set(key, {
      map: clone(source.map),
      roughnessMap: clone(source.roughnessMap),
      normalMap: clone(source.normalMap),
      // Use the primary UV set. The procedural geometry does not need a
      // duplicated UV channel merely to read its ambient-occlusion map.
      aoMap: clone(source.aoMap, 0),
    });
  }
  return laboratoryBenchMaps.get(key);
}

function bottleSurfaceMaps(name, repeat = [1, 1]) {
  const key = `${name}:${repeat[0]}:${repeat[1]}`;
  if (bottleSurfaceSets.has(key)) return bottleSurfaceSets.get(key);
  const loader = new THREE.TextureLoader();
  const load = (channel, color = false) => {
    const texture = loader.load(`/textures/props/labeled-bottle/${name}-${channel}.webp`);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.anisotropy = 8;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const set = {
    map: load('albedo', true),
    roughnessMap: load('roughness'),
    normalMap: load('normal'),
  };
  bottleSurfaceSets.set(key, set);
  return set;
}

function laboratoryTextureShader(intensity) {
  const value = Math.max(0, Math.min(2, intensity)).toFixed(2);
  return (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        vec3 propTextureColor;
        if (${value} <= 1.0) {
          propTextureColor = mix(vec3(1.0), sampledDiffuseColor.rgb, ${value});
        } else {
          propTextureColor = clamp(
            (sampledDiffuseColor.rgb - vec3(0.72)) * ${value} + vec3(0.72),
            0.0,
            1.0
          );
        }
        diffuseColor *= vec4(propTextureColor, sampledDiffuseColor.a);
      #endif`,
    );
  };
}

// A colour wheel's disc: sectors of coloured paper, and the smear they turn
// into as it spins.
//
// `blur` is the fraction of a turn the eye integrates over, which is what
// fusion physically is — the disc is not changing colour, your retina is
// averaging it. At 0 the sectors are crisp; at 1 they are one flat colour.
// Drawing it this way rather than cross-fading to an average means the
// half-fused state, which is the interesting one, comes out right for free.
const discs = new Map();

export function discTexture(sectors, blur = 0) {
  const key = `${sectors.map((s) => `${s.color}:${s.fraction.toFixed(3)}`).join('|')}@${blur.toFixed(2)}`;
  if (discs.has(key)) return discs.get(key);
  const size = 512;
  const element = canvas(size);
  const cc = element.getContext('2d');
  const centre = size / 2;
  cc.fillStyle = '#1b1917';
  cc.fillRect(0, 0, size, size);

  const steps = blur <= 0 ? 1 : Math.max(2, Math.round(6 + blur * 34));
  cc.globalAlpha = 1 / steps;
  for (let pass = 0; pass < steps; pass += 1) {
    const smear = steps === 1 ? 0 : (pass / steps) * blur * Math.PI * 2;
    let angle = -Math.PI / 2 + smear;
    for (const sector of sectors) {
      const sweep = sector.fraction * Math.PI * 2;
      if (sweep <= 0) continue;
      cc.fillStyle = sector.color;
      cc.beginPath();
      cc.moveTo(centre, centre);
      cc.arc(centre, centre, centre - 6, angle, angle + sweep);
      cc.closePath();
      cc.fill();
      angle += sweep;
    }
  }
  cc.globalAlpha = 1;
  // The brass washer that clamps the papers to the spindle.
  cc.fillStyle = '#9c7f42';
  cc.beginPath();
  cc.arc(centre, centre, 26, 0, Math.PI * 2);
  cc.fill();

  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // Only ever a few dozen distinct discs, but a long session sliding a control
  // would otherwise grow this without limit.
  if (discs.size > 64) {
    const oldest = discs.keys().next().value;
    discs.get(oldest).dispose();
    discs.delete(oldest);
  }
  discs.set(key, texture);
  return texture;
}

function labelLines(context, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || context.measureText(text).width <= maxWidth) return [text];
  let best = [text];
  let bestWidth = Infinity;
  for (let split = 1; split < words.length; split += 1) {
    const lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
    const width = Math.max(...lines.map((line) => context.measureText(line).width));
    if (width < bestWidth) {
      best = lines;
      bestWidth = width;
    }
  }
  return best;
}

function drawLabel(element, spec) {
  const context = element.getContext('2d');
  const width = element.width;
  const height = element.height;
  const font = labelFont(spec.font);
  const text = String(spec.text ?? '').trim() || 'UNTITLED';
  context.clearRect(0, 0, width, height);
  context.fillStyle = spec.paper ?? '#ded0aa';
  context.fillRect(0, 0, width, height);
  if (labelPaperImage?.complete) {
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.globalAlpha = 0.38 + (spec.paperAge ?? 0.25) * 0.42;
    context.drawImage(labelPaperImage, 0, 0, width, height);
    context.restore();
  }

  // Fixed seeded marks make the paper readable as paper without changing
  // between frames or competing with small lettering.
  const markCount = Math.round(35 + (spec.paperAge ?? 0.25) * 180);
  for (let index = 0; index < markCount; index += 1) {
    const x = rand(index * 3.7 + text.length) * width;
    const y = rand(index * 8.1 + spec.font.length) * height;
    context.fillStyle = `rgba(83, 58, 31, ${0.018 + rand(index * 1.9) * 0.026})`;
    context.fillRect(x, y, 1 + rand(index) * 3, 1 + rand(index * 2.3) * 2);
  }

  const ink = spec.ink ?? '#2d2118';
  context.strokeStyle = ink;
  context.lineWidth = 8;
  context.strokeRect(28, 28, width - 56, height - 56);
  context.lineWidth = 2;
  context.strokeRect(43, 43, width - 86, height - 86);
  context.beginPath();
  context.moveTo(110, 105);
  context.lineTo(width - 110, 105);
  context.moveTo(110, height - 105);
  context.lineTo(width - 110, height - 105);
  context.stroke();

  let fontSize = 122;
  let lines = [];
  do {
    context.font = `700 ${fontSize}px "${font.family}", Georgia, serif`;
    lines = labelLines(context, text, width - 150);
    fontSize -= 4;
  } while (fontSize > 46 && Math.max(...lines.map((line) => context.measureText(line).width)) > width - 150);

  context.fillStyle = ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lineHeight = fontSize * 1.02;
  const firstY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => context.fillText(line, width / 2, firstY + index * lineHeight));
}

function ensureLabelPaperImage() {
  if (labelPaperImage || typeof Image === 'undefined') return;
  labelPaperImage = new Image();
  labelPaperImage.onload = () => {
    for (const texture of labels.values()) {
      drawLabel(texture.image, texture.userData.labelSpec);
      texture.needsUpdate = true;
    }
  };
  labelPaperImage.src = '/textures/props/labeled-bottle/paper-albedo.webp';
}

export function labelTexture(spec) {
  const normalized = {
    text: String(spec?.text ?? '').slice(0, 80),
    font: labelFont(spec?.font).id,
    ink: spec?.ink ?? '#2d2118',
    paper: spec?.paper ?? '#ded0aa',
    paperAge: Math.max(0, Math.min(1, spec?.paperAge ?? 0.25)),
  };
  const key = JSON.stringify(normalized);
  if (labels.has(key)) return labels.get(key);

  const element = document.createElement('canvas');
  element.width = 1024;
  element.height = 512;
  drawLabel(element, normalized);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.userData.labelSpec = normalized;
  ensureLabelPaperImage();
  if (labels.size > 64) {
    const oldest = labels.keys().next().value;
    labels.get(oldest).dispose();
    labels.delete(oldest);
  }
  labels.set(key, texture);

  // The CSS fonts may finish after Three.js requests the first material.
  // Redraw this same cached texture when its chosen face becomes available.
  if (document.fonts?.load) {
    const font = labelFont(normalized.font);
    document.fonts.load(`700 122px "${font.family}"`)
      .then(() => {
        drawLabel(element, normalized);
        texture.needsUpdate = true;
      })
      .catch(() => {});
  }
  return texture;
}

/**
 * Material props for an item or part. PropMaterial chooses the corresponding
 * standard or physical Three.js material in every renderer.
 */
export function materialFor(item) {
  if (item.label) {
    const paper = item.label.surface === 'agedPaper' ? bottleSurfaceMaps('paper') : null;
    return {
      map: labelTexture(item.label),
      ...(paper ? {
        roughnessMap: paper.roughnessMap,
        normalMap: paper.normalMap,
        normalScale: new THREE.Vector2(0.18, 0.18),
      } : {}),
      color: '#ffffff',
      roughness: 0.84 + (item.label.paperAge ?? 0.25) * 0.12,
      metalness: 0,
      envMapIntensity: 0.35,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    };
  }
  // Coloured paper on a disc: matte, and its own texture rather than a finish.
  if (item.disc) {
    return {
      map: discTexture(item.disc, item.discBlur ?? 0),
      color: '#ffffff',
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.4,
    };
  }
  if (item.finish === 'bottleGlass') {
    return {
      materialModel: 'physical',
      color: item.color ?? '#d8ebe7',
      roughness: item.roughness ?? 0.07,
      metalness: 0,
      transmission: item.transmission ?? 0.96,
      ior: 1.5,
      thickness: item.wallThickness ?? 0.002,
      attenuationColor: item.color ?? '#d8ebe7',
      attenuationDistance: item.attenuationDistance ?? 0.42,
      envMapIntensity: 1.7,
      specularIntensity: 1,
      side: THREE.DoubleSide,
    };
  }
  if (item.finish === 'bottleLiquid') {
    return {
      materialModel: 'physical',
      color: item.surfaceColor ?? '#fff8ed',
      roughness: item.roughness ?? 0.11,
      metalness: 0,
      transmission: item.transmission ?? 0.72,
      ior: 1.333,
      thickness: item.thickness ?? 0.06,
      attenuationColor: item.color ?? '#6f4b25',
      attenuationDistance: item.attenuationDistance ?? 0.085,
      envMapIntensity: 1.25,
      specularIntensity: 0.8,
      side: THREE.DoubleSide,
    };
  }
  if (item.finish === 'bottleCork') {
    const cork = bottleSurfaceMaps('cork', [2, 1.35]);
    return {
      color: item.tint ?? '#ffffff',
      map: cork.map,
      roughnessMap: cork.roughnessMap,
      normalMap: cork.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.45,
    };
  }
  if (item.glass) {
    return {
      color: item.color ?? '#cfe0dc',
      transparent: true,
      opacity: item.opacity ?? 0.3,
      roughness: 0.06,
      metalness: 0,
      envMapIntensity: 1.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    };
  }
  if (item.finish === 'laboratoryDeal') {
    const set = mapsForLaboratoryBench(item);
    const normalStrength = item.normalStrength ?? 0.34;
    const textureIntensity = item.textureIntensity ?? 1;
    return {
      color: item.tint ?? '#ffffff',
      map: set.map,
      roughnessMap: set.roughnessMap,
      normalMap: set.normalMap,
      normalScale: new THREE.Vector2(normalStrength, normalStrength),
      aoMap: set.aoMap,
      aoMapIntensity: item.aoStrength ?? 0.45,
      roughness: item.roughness ?? 0.82,
      metalness: 0,
      envMapIntensity: 0.55,
      onBeforeCompile: laboratoryTextureShader(textureIntensity),
      customProgramCacheKey: () => `laboratory-texture-intensity-${textureIntensity.toFixed(2)}`,
      needsUpdate: true,
    };
  }
  if (item.finish === 'plank') {
    const set = plankMaps(item.color ?? '#6d5b44');
    return {
      color: '#ffffff', map: set.map, roughnessMap: set.rough,
      bumpMap: set.rough, bumpScale: 0.0022,
      roughness: 1, metalness: 0, envMapIntensity: 0.45,
    };
  }
  if (item.finish === 'awning') {
    const set = awningMaps(item.color ?? '#7f8a72');
    return {
      color: '#ffffff', map: set.map, roughnessMap: set.rough,
      roughness: 1, metalness: 0, envMapIntensity: 0.35,
      side: THREE.DoubleSide,
    };
  }
  if (item.finish === 'coachPaint') {
    const set = coachPaintMaps(item.color ?? '#26372f');
    return {
      color: '#ffffff', map: set.map, roughnessMap: set.rough,
      bumpMap: set.rough, bumpScale: 0.0008,
      roughness: 0.48, metalness: 0.02, envMapIntensity: 0.9,
    };
  }
  if (item.finish === 'coachLeather' || item.finish === 'coachCanvas') {
    const colour = item.color ?? '#252b28';
    const cache = item.finish === 'coachLeather' ? coachLeatherSets : coachCanvasSets;
    if (!cache.has(colour)) cache.set(colour, wovenMaps(colour, item.finish === 'coachLeather'));
    const set = cache.get(colour);
    return {
      color: '#ffffff', map: set.map, roughnessMap: set.rough,
      bumpMap: set.rough, bumpScale: item.finish === 'coachLeather' ? 0.0011 : 0.0022,
      roughness: item.finish === 'coachLeather' ? 0.72 : 0.94,
      metalness: 0, envMapIntensity: item.finish === 'coachLeather' ? 0.6 : 0.35,
      side: THREE.DoubleSide,
    };
  }
  // Ice goes through the physical model: a little transmission puts the cold
  // blue depth under the frost that a flat map cannot fake.
  if (item.finish === 'ice') {
    const set = mapsFor({ texture: 'ice', tile: 0.28 }, item.size);
    return {
      materialModel: 'physical',
      color: '#f2f8fa',
      map: set.map,
      roughnessMap: set.roughnessMap,
      bumpMap: set.bumpMap,
      bumpScale: set.bumpScale,
      roughness: 0.55,
      metalness: 0,
      transmission: 0.28,
      ior: 1.31,
      thickness: 0.14,
      attenuationColor: '#8fd0da',
      attenuationDistance: 0.3,
      envMapIntensity: 1.7,
      specularIntensity: 1,
    };
  }
  const spec = FINISH[item.finish] ?? null;
  const set = spec?.texture ? mapsFor(spec, item.size) : null;
  // A map already carries the colour. Multiplying a dark tint over a dark
  // texture is what turned every instrument into a silhouette: mahogany at
  // #4a2c1d times a mahogany photo is nearly black. Tint only on request.
  return {
    color: set ? (item.tint ?? spec.tint ?? '#ffffff') : (item.color ?? '#4a3826'),
    vertexColors: item.vertexColors ?? false,
    roughness: item.roughness ?? spec?.roughness ?? 0.75,
    metalness: item.metalness ?? spec?.metalness ?? 0,
    envMapIntensity: spec?.envMapIntensity ?? 1,
    emissive: item.emissive ?? '#000000',
    emissiveIntensity: item.emissive ? 1.6 : 0,
    ...(set
      ? {
          map: set.map,
          roughnessMap: set.roughnessMap,
          ...(set.bumpMap && set.bumpScale ? { bumpMap: set.bumpMap, bumpScale: set.bumpScale } : {}),
        }
      : {}),
  };
}

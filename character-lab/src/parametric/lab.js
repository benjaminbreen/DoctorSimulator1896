import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PARAM_GROUPS, defaultParams, rollParams } from './params.js';
import { buildFigure } from './figure.js';

// Standalone viewer for the parametric 1896 crowd figure. Open
// /parametric.html on the lab dev server.

const stage = document.getElementById('stage');
const panel = document.getElementById('panel');
const hud = document.getElementById('hud');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1410');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(33, 1, 0.05, 60);
camera.position.set(1.7, 1.35, 3.1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.92, 0);
controls.enableDamping = true;

const key = new THREE.DirectionalLight('#fff0da', 2.6);
key.position.set(2.4, 3.8, 2.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3; key.shadow.camera.right = 3;
key.shadow.camera.top = 4; key.shadow.camera.bottom = -1;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.015;
scene.add(key);
scene.add(new THREE.DirectionalLight('#b9c8d8', 0.5).translateX(-3).translateY(2).translateZ(-1));
const rim = new THREE.DirectionalLight('#ffe2b8', 1.1);
rim.position.set(-1.6, 3, -3.4);
scene.add(rim);
scene.add(new THREE.AmbientLight('#5a4d3d', 0.35));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(7, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: '#2b241d', roughness: 0.95 }),
);
ground.receiveShadow = true;
scene.add(ground);

// ---------- state ----------

let params = defaultParams();
let seed = 1896;
let figure = null;
let crowd = [];
let crowdOn = false;
const clock = new THREE.Clock();
let frames = 0;
let fpsAt = performance.now();
let fps = 0;

let figureTris = 0;
function countTris(root) {
  let tris = 0;
  root.traverse((o) => {
    if (o.geometry) {
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
    }
  });
  return Math.round(tris);
}

function rebuild() {
  if (figure) { scene.remove(figure.group); figure.dispose(); }
  figure = buildFigure({ ...params });
  scene.add(figure.group);
  figureTris = countTris(figure.group);
}

function rebuildCrowd() {
  for (const f of crowd) { scene.remove(f.group); f.dispose(); }
  crowd = [];
  if (!crowdOn) return;
  for (let i = 0; i < 11; i += 1) {
    const p = rollParams(seed * 31 + i * 7 + 3);
    p.animMode = i % 3 === 2 ? 'idle' : 'walk';
    const f = buildFigure(p);
    const col = i % 6;
    const row = Math.floor(i / 6);
    f.group.position.set((col - 2.5) * 1.05 + (row ? 0.5 : 0), 0, -1.5 - row * 1.4);
    f.group.rotation.y = (Math.random() - 0.5) * 0.4;
    scene.add(f.group);
    crowd.push(f);
  }
}

// ---------- panel ----------

function optionsFor(param) {
  if (param.optionsBySex) return param.optionsBySex[params.sex];
  return param.options;
}

function control(param) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('label');
  label.textContent = param.label;
  row.appendChild(label);
  if (param.type === 'select') {
    const select = document.createElement('select');
    for (const opt of optionsFor(param)) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      select.appendChild(o);
    }
    select.value = params[param.id];
    select.onchange = () => { setParam(param.id, select.value); };
    select.dataset.param = param.id;
    row.appendChild(select);
  } else {
    const range = document.createElement('input');
    range.type = 'range';
    range.min = param.min; range.max = param.max; range.step = param.step;
    range.value = params[param.id];
    const num = document.createElement('input');
    num.type = 'number';
    num.min = param.min; num.max = param.max; num.step = param.step;
    num.value = params[param.id];
    range.oninput = () => { num.value = range.value; setParam(param.id, Number(range.value)); };
    num.onchange = () => { range.value = num.value; setParam(param.id, Number(num.value)); };
    range.dataset.param = param.id;
    num.dataset.param = param.id;
    row.appendChild(range);
    row.appendChild(num);
  }
  return row;
}

let rebuildQueued = false;
function setParam(id, value) {
  params[id] = value;
  if (id === 'sex' || id === 'socialClass') {
    // wardrobe and grooming options differ by sex/class: reroll those fields
    const fresh = rollParams(seed, { sex: params.sex, socialClass: params.socialClass });
    for (const k of ['hairStyle', 'facialHair', 'outfit', 'hat', 'coatColor', 'legColor', 'accentColor', 'fabricPattern', 'wear']) params[k] = fresh[k];
    if (id === 'sex') { params.height = fresh.height; params.waist = fresh.waist; params.hips = fresh.hips; params.shoulders = fresh.shoulders; }
    refreshPanel();
  }
  if (!rebuildQueued) {
    rebuildQueued = true;
    requestAnimationFrame(() => { rebuildQueued = false; rebuild(); });
  }
}

function refreshPanel() {
  panel.querySelectorAll('[data-param]').forEach((el) => {
    const id = el.dataset.param;
    if (el.tagName === 'SELECT') {
      const param = PARAM_GROUPS.flatMap((g) => g.params).find((q) => q.id === id);
      el.innerHTML = '';
      for (const opt of optionsFor(param)) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        el.appendChild(o);
      }
    }
    el.value = params[id];
  });
}

function buildPanel() {
  panel.innerHTML = '';
  const title = document.createElement('h1');
  title.textContent = 'Parametric Crowd Figure · 1896';
  panel.appendChild(title);

  const seedRow = document.createElement('div');
  seedRow.className = 'seedrow';
  const seedInput = document.createElement('input');
  seedInput.value = seed;
  const rollBtn = document.createElement('button');
  rollBtn.className = 'primary';
  rollBtn.textContent = 'Randomize';
  rollBtn.onclick = () => {
    seed = Math.floor(Math.random() * 99991);
    seedInput.value = seed;
    params = rollParams(seed);
    refreshPanel();
    rebuild();
  };
  const rerollBtn = document.createElement('button');
  rerollBtn.textContent = 'Use seed';
  rerollBtn.onclick = () => {
    seed = Number(seedInput.value) || 1;
    params = rollParams(seed);
    refreshPanel();
    rebuild();
  };
  seedRow.append(rollBtn, seedInput, rerollBtn);
  panel.appendChild(seedRow);

  const camRow = document.createElement('div');
  camRow.className = 'btnrow';
  const views = {
    Full: { pos: [1.7, 1.35, 3.1], tgt: [0, 0.92, 0] },
    Face: { pos: [0.25, 1.62, 0.72], tgt: [0, 1.55, 0] },
    'Three-quarter': { pos: [1.3, 1.5, 1.7], tgt: [0, 1.15, 0] },
    Crowd: { pos: [2.6, 1.9, 5.4], tgt: [0, 1.0, -1.2] },
  };
  for (const [name, view] of Object.entries(views)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => {
      camera.position.set(...view.pos);
      controls.target.set(...view.tgt);
    };
    camRow.appendChild(b);
  }
  const crowdBtn = document.createElement('button');
  crowdBtn.textContent = 'Crowd test';
  crowdBtn.onclick = () => { crowdOn = !crowdOn; rebuildCrowd(); };
  camRow.appendChild(crowdBtn);
  panel.appendChild(camRow);

  for (const group of PARAM_GROUPS) {
    const details = document.createElement('details');
    details.open = ['identity', 'wardrobe', 'performance'].includes(group.id);
    const summary = document.createElement('summary');
    summary.textContent = group.label;
    details.appendChild(summary);
    for (const param of group.params) details.appendChild(control(param));
    panel.appendChild(details);
  }
}

// ---------- loop ----------

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  if (figure) figure.update(dt);
  for (const f of crowd) f.update(dt);
  controls.update();
  renderer.render(scene, camera);
  frames += 1;
  const now = performance.now();
  if (now - fpsAt > 500) {
    fps = Math.round((frames * 1000) / (now - fpsAt));
    frames = 0; fpsAt = now;
    hud.textContent = `${fps} fps · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris scene · FIGURE ${figureTris} tris`;
  }
}

buildPanel();
rebuild();
resize();
tick();

window.__parametric = { scene, camera, controls, get figure() { return figure; }, get params() { return params; }, rollParams, rebuild };

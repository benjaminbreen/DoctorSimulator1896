// Interactive review page for a baked expression shape set. Loads the
// authored character, plays its seated idle, and drives the morphs either
// the way the game does (recipes, caps, blink, speech jaw) or raw per-shape.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  FACIAL_EXPRESSION_RECIPES,
  FACIAL_GAZE_RECIPES,
  safeFaceWeight,
  speechJawWeight,
} from '../../shared/characters/facePerformance.js';

const MODEL = '/models/samuel-taylor.glb';

const stage = document.getElementById('stage');
const hud = document.getElementById('hud');
const controlsHost = document.getElementById('controls');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#211a12');
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight('#e8dcc4', '#3a2f20', 1.1));
const key = new THREE.DirectionalLight('#fff2dd', 2.2);
key.position.set(0.6, 1.2, 1.4);
scene.add(key);

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const state = {
  mode: 'performance',
  expression: 'neutral',
  speaking: false,
  autoBlink: true,
  clip: 'ClinicIdle',
  raw: {},
};

const loader = new GLTFLoader()
  .setMeshoptDecoder(MeshoptDecoder)
  .setKTX2Loader(new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer));

const gltf = await loader.loadAsync(MODEL);
scene.add(gltf.scene);
const mixer = new THREE.AnimationMixer(gltf.scene);
let action = mixer.clipAction(gltf.animations.find((clip) => clip.name === state.clip));
action.play();

let faceMesh = null;
gltf.scene.traverse((object) => {
  if (object.isSkinnedMesh && object.morphTargetDictionary && !faceMesh) faceMesh = object;
});
const morphNames = Object.keys(faceMesh.morphTargetDictionary);
for (const name of morphNames) state.raw[name] = 0;

let head = null;
gltf.scene.traverse((object) => { if (object.name === 'mixamorigHead' && !head) head = object; });

function frameHead() {
  // Sample the pose first: the seated idle carries the head well below the
  // bind pose.
  mixer.update(1 / 30);
  gltf.scene.updateMatrixWorld(true);
  const target = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.04, 0));
  camera.position.copy(target).add(new THREE.Vector3(0.1, 0.03, 0.5));
  orbit.target.copy(target);
  orbit.update();
}

/* ---- controls ---- */

function button(label, onClick) {
  const el = document.createElement('button');
  el.textContent = label;
  el.addEventListener('click', () => onClick(el));
  return el;
}

function check(label, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = value;
  box.addEventListener('change', () => onChange(box.checked));
  wrap.append(box, label);
  return wrap;
}

const modeRow = document.createElement('div');
modeRow.className = 'btnrow';
const performanceButton = button('Performance', () => setMode('performance'));
const rawButton = button('Raw sliders', () => setMode('raw'));
modeRow.append(performanceButton, rawButton);
controlsHost.append(modeRow);

function setMode(mode) {
  state.mode = mode;
  performanceButton.classList.toggle('active', mode === 'performance');
  rawButton.classList.toggle('active', mode === 'raw');
  performanceSection.style.display = mode === 'performance' ? '' : 'none';
  rawSection.style.display = mode === 'raw' ? '' : 'none';
}

const performanceSection = document.createElement('div');
const expressionRow = document.createElement('div');
expressionRow.className = 'btnrow';
for (const name of ['neutral', ...Object.keys(FACIAL_EXPRESSION_RECIPES)]) {
  const el = button(name, () => {
    state.expression = name;
    for (const child of expressionRow.children) child.classList.toggle('active', child.textContent === name);
  });
  if (name === state.expression) el.classList.add('active');
  expressionRow.append(el);
}
performanceSection.append(expressionRow);
performanceSection.append(check('Speaking', state.speaking, (value) => { state.speaking = value; }));
performanceSection.append(check('Auto blink', state.autoBlink, (value) => { state.autoBlink = value; }));
controlsHost.append(performanceSection);

const rawSection = document.createElement('div');
const zeroRow = document.createElement('div');
zeroRow.className = 'btnrow';
zeroRow.append(button('Zero all', () => {
  for (const name of morphNames) {
    state.raw[name] = 0;
    const slider = rawSection.querySelector(`input[data-morph="${name}"]`);
    if (slider) { slider.value = 0; slider.nextElementSibling.value = '0.00'; }
  }
}));
zeroRow.append(button('Log values', () => {
  const active = Object.fromEntries(Object.entries(state.raw).filter(([, v]) => v > 0));
  console.log(JSON.stringify(active, null, 2));
}));
rawSection.append(zeroRow);
for (const name of morphNames) {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('label');
  label.textContent = name;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0; slider.max = 1; slider.step = 0.01; slider.value = 0;
  slider.dataset.morph = name;
  const readout = document.createElement('output');
  readout.value = '0.00';
  slider.addEventListener('input', () => {
    state.raw[name] = Number(slider.value);
    readout.value = Number(slider.value).toFixed(2);
  });
  row.append(label, slider, readout);
  rawSection.append(row);
}
controlsHost.append(rawSection);

const clipDetails = document.createElement('details');
clipDetails.open = true;
const clipSummary = document.createElement('summary');
clipSummary.textContent = 'Body clip';
clipDetails.append(clipSummary);
const clipRow = document.createElement('div');
clipRow.className = 'btnrow';
for (const clip of gltf.animations) {
  const el = button(clip.name, () => {
    state.clip = clip.name;
    const next = mixer.clipAction(clip);
    next.reset().play();
    if (action !== next) next.crossFadeFrom(action, 0.2, true);
    action = next;
    for (const child of clipRow.children) child.classList.toggle('active', child.textContent === clip.name);
  });
  if (clip.name === state.clip) el.classList.add('active');
  clipRow.append(el);
}
clipDetails.append(clipRow);
controlsHost.append(clipDetails);
setMode('performance');

/* ---- drive ---- */

let elapsed = 0;
const clock = new THREE.Clock();

function drive(delta) {
  elapsed += delta;
  const influences = faceMesh.morphTargetInfluences;
  const dictionary = faceMesh.morphTargetDictionary;
  if (state.mode === 'raw') {
    for (const name of morphNames) influences[dictionary[name]] = state.raw[name];
    return;
  }
  const weights = {};
  for (const [name, value] of Object.entries(FACIAL_EXPRESSION_RECIPES[state.expression] || {})) {
    weights[name] = value;
  }
  for (const [name, value] of Object.entries(FACIAL_GAZE_RECIPES.none || {})) weights[name] = value;
  if (state.autoBlink) {
    const blinkTime = elapsed % 4.6;
    if (blinkTime < 0.16) {
      const amount = Math.sin((blinkTime / 0.16) * Math.PI) * 0.92;
      weights.eyeBlinkLeft = Math.min(1, (weights.eyeBlinkLeft || 0) + amount);
      weights.eyeBlinkRight = Math.min(1, (weights.eyeBlinkRight || 0) + amount);
    }
  }
  if (state.speaking) weights.jawOpen = Math.min(1, (weights.jawOpen || 0) + speechJawWeight(elapsed, 7));
  for (const name of morphNames) {
    influences[dictionary[name]] = weights[name] ? safeFaceWeight(name, weights[name]) : 0;
  }
}

resize();
frameHead();
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  mixer.update(delta);
  drive(delta);
  hud.textContent = `${state.mode} · ${state.expression}${state.speaking ? ' · speaking' : ''}\n${state.clip}`;
  renderer.render(scene, camera);
});

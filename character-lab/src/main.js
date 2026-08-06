import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { findBones, createCostume } from './costume.js';
import { createIdle } from './idle.js';
import './style.css';

const [schema, initialPreset] = await Promise.all([
  fetch('/schema/character.schema.json').then((response) => response.json()),
  fetch('/presets/mrs-ostrander-1896.json').then((response) => response.json()),
]);
let preset = structuredClone(initialPreset);
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({ ...parameter, mode: parameter.mode || group.mode, group: group.id })));
const ui = {
  canvas: document.querySelector('#stage'), controls: document.querySelector('#controls'), status: document.querySelector('#model-status'),
  json: document.querySelector('#preset-json'), summary: document.querySelector('#subject-summary'), pipeline: document.querySelector('#pipeline-state'),
  command: document.querySelector('#generate-command'), fallback: document.querySelector('#fallback'), search: document.querySelector('#control-search'),
};

/* ids that require rebuilding costume geometry (vs material-only or animation values) */
const COSTUME_GEOMETRY_IDS = new Set(['bodiceFit', 'waistHeight', 'skirtFullness', 'skirtLength', 'skirtDrape',
  'bustleAmount', 'sleeveVolume', 'sleeveLength', 'collarHeight', 'collarSpread', 'buttonSpacing', 'buttonCount',
  'hairStyle', 'hairVolume', 'partWidth', 'bunSize', 'hairHeight', 'sideVolume', 'seated']);

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#15100c');
scene.fog = new THREE.FogExp2('#17110d', 0.065);
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
camera.position.set(2.45, 1.62, 3.35);
const orbit = new OrbitControls(camera, ui.canvas);
orbit.target.set(0, 1.1, 0);
orbit.enableDamping = true;
orbit.minDistance = 0.7;
orbit.maxDistance = 8;
orbit.maxPolarAngle = Math.PI * 0.55;

const world = new THREE.Group();
scene.add(world);
const characterRoot = new THREE.Group();
characterRoot.name = 'CharacterRoot';
world.add(characterRoot);
let model = null;
let grid = null;
let motionEnabled = true;
let mixer = null;
let animationAction = null;
let animationClips = [];
let bones = null;
let costume = null;
let idle = null;
let isFallback = false;
let costumeDirty = false;
let lastCostumeBuild = 0;
const named = new Map();
const materials = {};

function material(name, color, roughness = 0.75, metalness = 0) {
  const value = new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
  materials[name] = value;
  return value;
}

function makeClinic() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), material('ClinicFloor', '#241a12', 0.94));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), material('ClinicWall', '#2b2116', 0.98));
  back.position.set(0, 2, -1.3); world.add(back);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.66, 0.82), material('Desk', '#29170d', 0.65));
  desk.position.set(0, 0.48, 0.9); desk.castShadow = true; desk.receiveShadow = true; desk.name = 'ClinicDesk'; world.add(desk);
  const chairMat = material('Chair', '#24150f', 0.8);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.5), chairMat);
  seat.position.set(0, 0.31, -0.06); seat.castShadow = true; seat.receiveShadow = true; world.add(seat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.9, 0.07), chairMat);
  chairBack.position.set(0, 0.75, -0.32); chairBack.castShadow = true; world.add(chairBack);
  for (const [x, z] of [[-0.24, -0.27], [0.24, -0.27], [-0.24, 0.15], [0.24, 0.15]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), chairMat);
    leg.position.set(x, 0.15, z); world.add(leg);
  }
  const windowFrame = material('WindowFrame', '#17110c', 0.9);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.45), new THREE.MeshBasicMaterial({ color: '#6e8094' }));
  glass.position.set(1.75, 1.65, -1.28); world.add(glass);
  for (const [x, y, sx, sy] of [[1.75, 1.65, .06, 1.52], [1.75, 1.65, 1.32, .06]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, .05), windowFrame); bar.position.set(x, y, -1.23); world.add(bar);
  }
  grid = new THREE.GridHelper(5, 20, '#645335', '#33291d'); grid.visible = false; grid.position.y = 0.003; world.add(grid);
  const hemi = new THREE.HemisphereLight('#a9bfd5', '#2b1a10', 0.9); hemi.name = 'FillLight'; scene.add(hemi);
  const key = new THREE.SpotLight('#ffd8a0', 65, 9, Math.PI * 0.36, 0.92, 1.15);
  key.name = 'KeyLight'; key.position.set(-1.5, 3.2, 2.2); key.target.position.set(0, 1.1, 0); key.castShadow = true; key.shadow.radius = 7; key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target);
}

function addMesh(parent, name, geometry, mat, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.position.set(...position); mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

function makeFallbackHuman() {
  const group = new THREE.Group(); group.name = 'ProceduralFallback';
  const skin = material('Skin', preset.values.skinTone, preset.values.skinRoughness);
  const dress = material('Dress', preset.values.dressColor, preset.values.fabricRoughness);
  const trim = material('Trim', preset.values.trimColor, 0.72);
  const hair = material('Hair', preset.values.hairColor, 0.9);
  addMesh(group, 'HeadProxy', new THREE.SphereGeometry(.115, 32, 24), skin, [0, 1.57, 0], [.86, 1.14, .8]);
  addMesh(group, 'NeckProxy', new THREE.CylinderGeometry(.055, .064, .14, 20), skin, [0, 1.43, 0]);
  addMesh(group, 'Dress_Bodice', new THREE.SphereGeometry(.25, 32, 24), dress, [0, 1.22, 0], [1, 1.35, .66]);
  addMesh(group, 'Dress_Skirt', new THREE.CylinderGeometry(.19, .48, .93, 48, 8), dress, [0, .68, .02], [1, 1, .82]);
  for (const side of [-1, 1]) {
    addMesh(group, side < 0 ? 'Dress_Sleeve_L' : 'Dress_Sleeve_R', new THREE.CapsuleGeometry(.085, .43, 8, 20), dress, [side * .285, 1.18, 0], [.9, 1, .75]);
    addMesh(group, side < 0 ? 'Hand_L' : 'Hand_R', new THREE.SphereGeometry(.06, 20, 16), skin, [side * .24, .96, .18], [1.15, .55, .78]);
  }
  addMesh(group, 'Dress_Collar', new THREE.CylinderGeometry(.085, .095, .105, 28), trim, [0, 1.445, 0]);
  addMesh(group, 'Hair_Cap', new THREE.SphereGeometry(.12, 32, 20, 0, Math.PI * 2, 0, Math.PI * .6), hair, [0, 1.61, -.008], [.92, 1.05, .85]);
  addMesh(group, 'Hair_Bun', new THREE.SphereGeometry(.07, 24, 16), hair, [0, 1.595, -.09]);
  for (let i = 0; i < 6; i++) addMesh(group, `Button_${i}`, new THREE.SphereGeometry(.008, 12, 8), trim, [0, 1.36 - i * .05, .165]);
  return group;
}

function indexModel(root) {
  named.clear();
  root.traverse((object) => {
    named.set(object.name, object);
    if (object.isMesh) {
      object.castShadow = true; object.receiveShadow = true;
      if (object.material) object.material = object.material.clone();
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      if (object.name === 'Human_Body' || materialList.some((mat) => mat?.name?.toLowerCase().includes('.body'))) {
        for (const mat of materialList) {
          mat.transparent = false; mat.opacity = 1; mat.alphaTest = 0; mat.depthWrite = true; mat.side = THREE.FrontSide; mat.needsUpdate = true;
        }
      }
    }
  });
}

async function loadCharacter() {
  try {
    const gltf = await new GLTFLoader().loadAsync('/models/mrs-ostrander-1896.glb?v=5');
    model = gltf.scene; characterRoot.add(model); animationClips = gltf.animations;
    setupAnimations();
    ui.status.textContent = `GLB loaded · ${countTriangles(model).toLocaleString()} triangles · ${animationClips.length} clip${animationClips.length === 1 ? '' : 's'}`; ui.status.className = 'status ok';
  } catch (error) {
    model = makeFallbackHuman(); characterRoot.add(model); isFallback = true;
    ui.status.textContent = 'Live mannequin · run Blender generator for full model'; ui.status.className = 'status warn'; ui.fallback.hidden = false;
  }
  indexModel(model);
  if (!isFallback) {
    bones = findBones(model);
    if (bones.pelvis) {
      // hold the authored pose at frame 0, then treat it as the procedural rest pose
      if (mixer) mixer.update(0);
      model.updateMatrixWorld(true);
      idle = createIdle(bones);
      idle.captureRest();
      costume = createCostume(characterRoot, bones);
      costume.rebuild(preset.values);
    }
  }
  applyAll();
}

function setupAnimations() {
  const select = document.querySelector('#animation-select');
  select.replaceChildren();
  if (!animationClips.length) {
    select.append(new Option('No embedded clips', ''));
    select.disabled = true;
    return;
  }
  mixer = new THREE.AnimationMixer(model);
  for (const clip of animationClips) select.append(new Option(clip.name || 'Unnamed clip', clip.name));
  select.onchange = () => playClip(animationClips.find((clip) => clip.name === select.value) || animationClips[0]);
  playClip(animationClips[0]);
}

function playClip(clip) {
  animationAction?.stop();
  animationAction = mixer.clipAction(clip);
  // full weight immediately: a fade frozen by procedural pause would leave the
  // authored pose at zero influence and expose the standing bind pose
  animationAction.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
  syncIdleMode();
}

function syncIdleMode() {
  const mode = preset.values.idleMode || 'procedural';
  const select = document.querySelector('#animation-select');
  if (animationAction) {
    animationAction.setEffectiveWeight(1);
    if (mode === 'procedural') { animationAction.time = 0; animationAction.paused = true; mixer.update(0); }
    else animationAction.paused = !motionEnabled;
  }
  if (select) select.disabled = mode === 'procedural' || !animationClips.length;
}

function countTriangles(root) {
  let count = 0; root.traverse((object) => { if (object.geometry?.index) count += object.geometry.index.count / 3; }); return Math.round(count);
}

function objectsLike(term) { return [...named].filter(([name]) => name.toLowerCase().includes(term.toLowerCase())).map(([, object]) => object); }
function setMaterialLike(term, color, roughness) {
  for (const object of objectsLike(term)) if (object.isMesh) {
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const mat of list) { if (color && mat.color) mat.color.set(color); if (roughness != null && 'roughness' in mat) mat.roughness = roughness; }
  }
}

function rebuildCostumeNow() {
  if (!costume || !idle) return;
  idle.snapToRest();
  model.updateMatrixWorld(true);
  costume.rebuild(preset.values);
  lastCostumeBuild = performance.now();
  costumeDirty = false;
}

function applyAll(changedId = null) {
  const v = preset.values;
  if (isFallback) {
    setMaterialLike('dress', v.dressColor, v.fabricRoughness); setMaterialLike('trim', v.trimColor);
    setMaterialLike('hair', v.hairColor); setMaterialLike('skin', v.skinTone, v.skinRoughness);
    characterRoot.position.y = -0.2 * (v.seated >= 0.5 ? 1 : 0);
  } else {
    const skinTint = new THREE.Color('#ffffff').lerp(new THREE.Color(v.skinTone), 0.75);
    setMaterialLike('human', skinTint, v.skinRoughness); setMaterialLike('.body', skinTint, v.skinRoughness);
    setMaterialLike('garment', v.dressColor, v.fabricRoughness);
    setMaterialLike('bodice', v.dressColor, v.fabricRoughness);
    setMaterialLike('suit', v.dressColor, v.fabricRoughness);
    setMaterialLike('shoes', '#211713');
    if (costume) {
      costume.materials.dress.color.set(v.dressColor); costume.materials.dress.roughness = v.fabricRoughness;
      costume.materials.trim.color.set(v.trimColor); costume.materials.hair.color.set(v.hairColor);
    }
    applyMorphs(v);
    if (changedId === null || COSTUME_GEOMETRY_IDS.has(changedId)) costumeDirty = true;
  }
  const key = scene.getObjectByName('KeyLight'); const fill = scene.getObjectByName('FillLight');
  if (key) { key.intensity = 48 * v.keyIntensity; key.color.setHSL(0.105, .58, .62 + (1 - v.warmth) * .1); }
  if (fill) fill.intensity = 0.62 + v.fillIntensity * 0.9;
  renderer.toneMappingExposure = 2 ** v.exposure; camera.fov = v.cameraFov; camera.updateProjectionMatrix();
  if (changedId === 'idleMode') syncIdleMode();
  updateText();
}

function applyMorphs(v) {
  const aliases = { noseWidth: ['noseWidth'], noseLength: ['noseLength'], noseVolume: ['noseVolume'], jawWidth: ['jawWidth'], chinHeight: ['chinHeight'], eyeSize: ['eyeSize_L', 'eyeSize_R'], eyeSpacing: ['eyeSpacing_L', 'eyeSpacing_R'], browHeight: ['browHeight'], mouthWidth: ['mouthWidth'], cheekVolume: ['cheekVolume_L', 'cheekVolume_R'], shoulderWidth: ['shoulderWidth'], torsoLength: ['torsoLength'] };
  model.traverse((object) => {
    if (!object.morphTargetDictionary) return;
    for (const [id, names] of Object.entries(aliases)) for (const name of names) {
      const index = object.morphTargetDictionary[name]; if (index != null) object.morphTargetInfluences[index] = Math.max(0, Math.abs(v[id]));
    }
  });
}

function buildControls() {
  ui.controls.replaceChildren();
  for (const group of schema.groups) {
    const section = document.createElement('section'); section.className = 'control-group'; section.dataset.group = group.id;
    const heading = document.createElement('button'); heading.className = 'group-heading'; heading.textContent = group.label; heading.onclick = () => section.classList.toggle('closed');
    const body = document.createElement('div'); body.className = 'group-body';
    for (const parameter of group.parameters) body.append(makeControl({ ...parameter, mode: parameter.mode || group.mode }));
    section.append(heading, body); ui.controls.append(section);
  }
}

function makeControl(definition) {
  const row = document.createElement('div'); row.className = `control ${definition.mode === 'bake' ? 'bake' : 'live'}`; row.dataset.search = `${definition.label} ${definition.id}`.toLowerCase();
  const label = document.createElement('label'); label.textContent = definition.label; label.htmlFor = `control-${definition.id}`;
  const output = document.createElement('output'); const input = document.createElement(definition.type === 'select' ? 'select' : 'input'); input.id = `control-${definition.id}`;
  if (definition.type === 'select') for (const value of definition.options) { const option = document.createElement('option'); option.value = value; option.textContent = value.replaceAll('-', ' '); input.append(option); }
  else { input.type = definition.type; if (definition.type === 'range') for (const key of ['min', 'max', 'step']) input[key] = definition[key]; }
  input.value = preset.values[definition.id]; output.textContent = formatValue(definition, input.value);
  input.oninput = () => { preset.values[definition.id] = definition.type === 'range' ? Number(input.value) : input.value; output.textContent = formatValue(definition, input.value); applyAll(definition.id); };
  row.append(label, output, input); return row;
}

function formatValue(definition, value) { return definition.type === 'range' ? Number(value).toFixed(definition.step < .01 ? 3 : definition.step < 1 ? 2 : 0) : ''; }
function refreshControls() { for (const definition of definitions) { const input = document.querySelector(`#control-${definition.id}`); if (input) { input.value = preset.values[definition.id]; input.dispatchEvent(new Event('input')); } } }
function updateText() {
  ui.summary.textContent = preset.description;
  ui.json.value = JSON.stringify(preset, null, 2);
  ui.command.textContent = `npm run character:generate -- character-lab/public/presets/${preset.id}.json`;
  const baked = definitions.filter((d) => d.mode === 'bake').length; const live = definitions.length - baked;
  ui.pipeline.innerHTML = `<dt>Tunable values</dt><dd>${definitions.length}</dd><dt>Live controls</dt><dd>${live}</dd><dt>Blender controls</dt><dd>${baked}</dd><dt>Deterministic seed</dt><dd>${preset.values.seed}</dd><dt>Target runtime</dt><dd>Three.js / GLB</dd>`;
}

function randomize() {
  let seed = (Number(preset.values.seed) + 1) >>> 0; const random = () => ((seed = Math.imul(seed ^ seed >>> 15, 1 | seed), seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed), ((seed ^ seed >>> 14) >>> 0) / 4294967296));
  for (const definition of definitions) if (definition.type === 'range' && !['seated', 'cameraFov'].includes(definition.id)) {
    const span = definition.max - definition.min; const center = Number(definition.default); preset.values[definition.id] = Math.min(definition.max, Math.max(definition.min, center + (random() - .5) * span * .22));
  }
  const raceTotal = preset.values.african + preset.values.asian + preset.values.caucasian || 1;
  for (const id of ['african', 'asian', 'caucasian']) preset.values[id] /= raceTotal;
  preset.values.seed = seed % 9999 || 1; refreshControls();
}

const views = {
  clinic: [[2.45, 1.62, 3.35], [0, 1.1, 0]],
  full: [[2.15, 1.35, 3.6], [0, .86, 0]],
  portrait: [[.58, 1.42, 1.08], [0, 1.32, 0]],
  exam: [[2.75, 1.28, 0.9], [0, 0.9, 0.1]],
};
function setView(name) { camera.position.set(...views[name][0]); orbit.target.set(...views[name][1]); orbit.update(); document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name)); }

makeClinic(); buildControls(); await loadCharacter(); updateText(); setView('clinic');
document.querySelector('#randomize').onclick = randomize;
document.querySelector('#reset').onclick = () => { preset = structuredClone(initialPreset); refreshControls(); setView('clinic'); };
document.querySelector('#export').onclick = () => { const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })), download: `${preset.id}.json` }); link.click(); URL.revokeObjectURL(link.href); };
document.querySelector('#apply-json').onclick = () => { try { preset = JSON.parse(ui.json.value); refreshControls(); } catch { ui.json.setCustomValidity('Invalid JSON'); ui.json.reportValidity(); } };
document.querySelector('#copy-json').onclick = () => navigator.clipboard.writeText(ui.json.value);
document.querySelector('#toggle-grid').onclick = (event) => { grid.visible = !grid.visible; event.currentTarget.classList.toggle('active', grid.visible); };
document.querySelector('#toggle-motion').onclick = (event) => { motionEnabled = !motionEnabled; syncIdleMode(); event.currentTarget.classList.toggle('active', motionEnabled); };
document.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => setView(button.dataset.view));
document.querySelectorAll('[data-gesture]').forEach((button) => button.onclick = () => idle?.playGesture(button.dataset.gesture, preset.values.gestureSpeed || 1));
ui.canvas.ondblclick = () => setView('clinic');
ui.search.oninput = () => { const term = ui.search.value.toLowerCase(); document.querySelectorAll('.control').forEach((row) => row.hidden = !row.dataset.search.includes(term)); document.querySelectorAll('.control-group').forEach((group) => group.hidden = ![...group.querySelectorAll('.control')].some((row) => !row.hidden)); };

/* console access for calibration and debugging */
window.__lab = { scene, get bones() { return bones; }, get model() { return model; }, get preset() { return preset; }, get idle() { return idle; }, get costume() { return costume; }, THREE, applyAll, rebuildCostumeNow };

const clock = new THREE.Clock();
function frame() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (costumeDirty && performance.now() - lastCostumeBuild > 90) rebuildCostumeNow();
  if (motionEnabled && !isFallback) {
    const mode = preset.values.idleMode || 'procedural';
    if (mixer) mixer.update(mode === 'procedural' ? 0 : delta * (0.72 + preset.values.breathing * 0.9));
    if (idle) idle.update(delta, elapsed, preset.values, mode);
  }
  orbit.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() { const width = ui.canvas.clientWidth; const height = ui.canvas.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(ui.canvas); resize(); frame();

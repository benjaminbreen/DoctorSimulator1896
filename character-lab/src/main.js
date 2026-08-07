import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { findBones, createCostume } from './costume.js';
import { createIdle } from './idle.js';
import { createExpressions, createMhrExpressions } from './expressions.js';
import { createMhrFacialDetails } from './facial-details.js';
import {
  createMhrController, createMhrEyeDetails, MHR_IDENTITY_IDS, MHR_LIVE_IDENTITY_IDS, MHR_RIG_IDS,
} from './mhr.js';
import {
  faceIdentityDistance, generatePatient, generateRestingFaceSignature, nextSeed,
  patientToCharacterPreset, randomSeed,
} from './patients/index.js';
import { prepareSkinModel, refreshSkinGeometry, updateSkinModel } from './stylized.js';
import './style.css';

const [schema, initialPreset] = await Promise.all([
  fetch('/schema/character.schema.json').then((response) => response.json()),
  fetch('/presets/mrs-ostrander-1896.json').then((response) => response.json()),
]);
let preset = structuredClone(initialPreset);
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({ ...parameter, mode: parameter.mode || group.mode, group: group.id })));
for (const definition of definitions) if (preset.values[definition.id] == null) preset.values[definition.id] = structuredClone(definition.default);
const ui = {
  canvas: document.querySelector('#stage'), controls: document.querySelector('#controls'), status: document.querySelector('#model-status'),
  json: document.querySelector('#preset-json'), summary: document.querySelector('#subject-summary'), subjectName: document.querySelector('#subject-name'),
  patientRecord: document.querySelector('#patient-record'), patientSection: document.querySelector('#patient-record-section'), pipeline: document.querySelector('#pipeline-state'),
  command: document.querySelector('#generate-command'), fallback: document.querySelector('#fallback'), search: document.querySelector('#control-search'),
  regenerate: document.querySelector('#regenerate'), randomize: document.querySelector('#randomize'), newPatient: document.querySelector('#new-patient'),
  renderToggle: document.querySelector('#render-toggle'),
  poseToggle: document.querySelector('#pose-toggle'),
  expressionDriver: document.querySelector('#expression-driver'), faceUnitSelect: document.querySelector('#face-unit-select'),
  faceUnitValue: document.querySelector('#face-unit-value'), faceUnitOutput: document.querySelector('#face-unit-output'), faceUnitReset: document.querySelector('#face-unit-reset'),
  faceUnitSurprise: document.querySelector('#face-unit-surprise'),
};

/* ids that require rebuilding costume geometry (vs material-only or animation values) */
const COSTUME_GEOMETRY_IDS = new Set(['bodiceFit', 'waistHeight', 'skirtFullness', 'skirtLength', 'skirtDrape',
  'bustleAmount', 'sleeveVolume', 'sleeveLength', 'collarHeight', 'collarSpread', 'buttonSpacing', 'buttonCount',
  'outfitStyle', 'hairStyle', 'hairVolume', 'partWidth', 'bunSize', 'hairHeight', 'sideVolume',
  'hairlineHeight', 'templeRecession', 'wispAmount', 'waveAmount', 'flowSweep']);
const HERITAGE_IDS = ['african', 'asian', 'caucasian'];
const SKIN_APPEARANCE_IDS = new Set([
  'skinTone', 'skinRoughness', 'eyeColor',
  ...definitions.filter((definition) => definition.group === 'stylized' && definition.id !== 'stylizedLightSoftness')
    .map((definition) => definition.id),
]);
const COMPARISON_MATERIAL_IDS = new Set(['skinTone', 'skinRoughness']);
const COSTUME_MATERIAL_IDS = new Set([
  'dressColor', 'trimColor', 'fabricRoughness', 'hairShade', 'hairColor', 'strandContrast', 'greyAmount',
]);
const MHR_FACE_DETAIL_GEOMETRY_IDS = new Set([
  'browDensity', 'browThickness', 'browArch', 'browAsymmetry',
  'lashDensity', 'lashLength', 'lashCurl',
]);
const MHR_FACE_DETAIL_MATERIAL_IDS = new Set(['browColor', 'lashColor', 'hairColor']);
const MHR_EYE_DETAIL_IDS = new Set([
  'eyeColor', 'eyeSize', 'mhrEyeGlobeScale', 'mhrEyeDepth', 'mhrEyeVertical',
  'mhrScleraColor', 'mhrScleraBrightness', 'mhrIrisScale', 'mhrPupilScale', 'mhrCorneaGloss',
]);
const LIGHTING_IDS = new Set(['keyIntensity', 'fillIntensity', 'warmth', 'exposure', 'cameraFov', 'stylizedLightSoftness']);
const MHR_POSE_IDS = new Set([
  'seated', 'kneesTogether', 'posture', 'headTilt', 'headTurn',
  'armOpenness', 'elbowBend', 'armAsymmetry', 'wristAngle', 'handTension',
]);

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
let expressions = null;
let mhrController = null;
let mhrEyeDetails = null;
let mhrFacialDetails = null;
let isFallback = false;
let costumeDirty = false;
let lastCostumeBuild = 0;
let regenerationNeeded = false;
let regenerationBusy = false;
let renderSwitchBusy = false;
let poseCostumeRebuildPending = false;
let poseWasTransitioning = false;
let identityFitPending = false;
let pendingControlFrame = null;
let pendingControlId = null;
let pendingControlAppliesLive = false;
const RENDERER_MODES = Object.freeze({
  current: Object.freeze({ label: 'A · MPFB', path: '/models/mrs-ostrander-1896.glb', kind: 'mpfb' }),
  mhr: Object.freeze({ label: 'B · Meta MHR', path: '/models/comparison-mhr-lod1.glb', kind: 'mhr' }),
});
const RENDERER_ORDER = Object.keys(RENDERER_MODES);
const storedRenderer = sessionStorage.getItem('characterLabRenderStyle');
let renderStyle = RENDERER_MODES[storedRenderer] ? storedRenderer : 'mhr';
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
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.46, 0.72), material('Desk', '#29170d', 0.65));
  desk.position.set(0, 0.32, 0.9); desk.castShadow = true; desk.receiveShadow = true; desk.name = 'ClinicDesk'; world.add(desk);
  const chairMat = material('Chair', '#24150f', 0.8);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.5), chairMat);
  seat.position.set(0, 0.425, -0.06); seat.castShadow = true; seat.receiveShadow = true; world.add(seat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.0, 0.07), chairMat);
  chairBack.position.set(0, 0.95, -0.32); chairBack.castShadow = true; world.add(chairBack);
  for (const [x, z] of [[-0.24, -0.27], [0.24, -0.27], [-0.24, 0.15], [0.24, 0.15]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), chairMat);
    leg.position.set(x, 0.21, z); world.add(leg);
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
  key.name = 'KeyLight'; key.position.set(-1.5, 3.2, 2.2); key.target.position.set(0, 1.1, 0); key.castShadow = true;
  // Zero-bias, heavily blurred spotlight shadows produced contour-map bands
  // on the MHR proof. A modest normal offset and tighter blur preserve contact
  // shadows without self-shadow acne.
  key.shadow.bias = -0.00012; key.shadow.normalBias = 0.018; key.shadow.radius = 3;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 0.35; key.shadow.camera.far = 8;
  scene.add(key, key.target);
  const faceFill = new THREE.SpotLight('#d8c3aa', 3, 7, Math.PI * 0.48, 0.98, 1.2);
  faceFill.name = 'ComparisonFaceFill'; faceFill.position.set(1.25, 2.35, 3.1); faceFill.target.position.set(0, 1.48, 0); faceFill.visible = false; scene.add(faceFill, faceFill.target);
  const rim = new THREE.DirectionalLight('#8fa1b2', 0.3);
  rim.name = 'ComparisonRimLight'; rim.position.set(2.2, 2.5, -1.8); rim.visible = false; scene.add(rim);
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

function disposeLoadedCharacter() {
  animationAction?.stop();
  mixer?.stopAllAction();
  costume?.dispose();
  mhrEyeDetails?.dispose();
  mhrFacialDetails?.dispose();
  if (model) {
    characterRoot.remove(model);
    model.traverse((object) => {
      object.geometry?.dispose?.();
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      for (const item of materialList) {
        if (!item) continue;
        for (const value of Object.values(item)) {
          if (value?.isTexture) value.dispose();
        }
        item.dispose();
      }
    });
  }
  model = null; mixer = null; animationAction = null; animationClips = [];
  bones = null; costume = null; idle = null; expressions = null;
  mhrController = null; mhrEyeDetails = null; mhrFacialDetails = null;
  poseCostumeRebuildPending = false;
  poseWasTransitioning = false;
  identityFitPending = false;
  named.clear();
}

function updateComparisonMaterial(root, values) {
  const skin = new THREE.Color(values.skinTone);
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materials) {
      if (!item?.color) continue;
      const name = item.name.toLowerCase();
      const isMhrBody = renderStyle === 'mhr' && object.name === 'body_mesh' && !item.userData.excludeComparisonSkin;
      const isSkin = isMhrBody || name.includes('head_material') || name.includes('skin');
      if (!isSkin) continue;
      item.color.copy(skin);
      if ('roughness' in item) item.roughness = values.skinRoughness;
      item.needsUpdate = true;
    }
  });
}

function refreshFaceUnitDebugger() {
  const units = expressions?.availableUnits || [];
  ui.faceUnitSelect.replaceChildren();
  ui.faceUnitValue.min = '0';
  if (expressions?.mode === 'mpfb-faceunits' && units.length) {
    for (const unit of units) ui.faceUnitSelect.append(new Option(unit, unit));
    const restingCount = Object.keys(expressions.restingFace || {}).length;
    ui.expressionDriver.textContent = `MPFB named morphs · ${units.length} targets · ${restingCount} active resting offsets`;
    ui.faceUnitSelect.disabled = false;
    ui.faceUnitValue.disabled = false;
    ui.faceUnitReset.disabled = false;
    ui.faceUnitSurprise.disabled = false;
  } else if (expressions?.mode === 'mhr-semantic' && units.length) {
    for (const unit of units) ui.faceUnitSelect.append(new Option(unit, unit));
    ui.expressionDriver.textContent = `Meta MHR semantic projection · ${units.length} signed latent targets`;
    ui.faceUnitValue.min = '-1';
    ui.faceUnitSelect.disabled = false;
    ui.faceUnitValue.disabled = false;
    ui.faceUnitReset.disabled = false;
    ui.faceUnitSurprise.disabled = false;
  } else {
    ui.faceUnitSelect.append(new Option('Legacy procedural fallback', ''));
    ui.expressionDriver.textContent = 'Legacy procedural morphs · regenerate renderer A after installing faceunits01';
    ui.faceUnitSelect.disabled = true;
    ui.faceUnitValue.disabled = true;
    ui.faceUnitReset.disabled = true;
    ui.faceUnitSurprise.disabled = true;
  }
  ui.faceUnitValue.value = 0;
  ui.faceUnitOutput.textContent = '0.00';
}

function applyFaceUnitDebug() {
  const value = Number(ui.faceUnitValue.value);
  ui.faceUnitOutput.textContent = value.toFixed(2);
  if (!expressions || !['mpfb-faceunits', 'mhr-semantic'].includes(expressions.mode)) return;
  if (value === 0) expressions.clearDebug();
  else expressions.setDebugUnit(ui.faceUnitSelect.value, value);
}

function clearFaceUnitDebug() {
  expressions?.clearDebug?.();
  ui.faceUnitValue.value = 0;
  ui.faceUnitOutput.textContent = '0.00';
}

function applyPresetRestingFace() {
  expressions?.setRestingFace?.(preset.patient?.appearance?.restingFace || {});
}

function surpriseFace() {
  if (!expressions?.setRestingFace || !['mpfb-faceunits', 'mhr-semantic'].includes(expressions.mode)) return;
  const appearance = preset.patient?.appearance;
  if (!appearance) return;
  const faceSignatureSeed = nextSeed(appearance.faceSignatureSeed ?? preset.values.seed);
  appearance.faceSignatureSeed = faceSignatureSeed;
  appearance.restingFace = generateRestingFaceSignature(faceSignatureSeed, { dramatic: true });
  clearFaceUnitDebug();
  expressions.setRestingFace(appearance.restingFace);
  const driver = expressions.mode === 'mhr-semantic' ? 'Meta MHR semantic projection' : 'MPFB named morphs';
  ui.expressionDriver.textContent = `${driver} · ${expressions.availableUnits.length} targets · ${Object.values(expressions.restingFace).filter(Number).length} active resting offsets`;
  updateText();
  ui.status.textContent = `Resting-face signature ${faceSignatureSeed} applied`;
  ui.status.className = 'status ok';
}

function updateRenderToggle() {
  if (!ui.renderToggle) return;
  ui.renderToggle.textContent = `Renderer ${RENDERER_MODES[renderStyle].label}`;
  ui.renderToggle.classList.toggle('active', renderStyle !== 'current');
  ui.renderToggle.disabled = renderSwitchBusy;
}

function updatePoseToggle() {
  if (!ui.poseToggle) return;
  const supported = renderStyle === 'mhr' && mhrController && !isFallback;
  ui.poseToggle.hidden = !supported;
  if (!supported) return;
  const targetIsSeated = mhrController.targetSeated >= 0.5;
  const moving = mhrController.isPoseTransitioning;
  ui.poseToggle.textContent = moving
    ? `Reverse: ${targetIsSeated ? 'stand up' : 'sit down'}`
    : targetIsSeated ? 'Stand up' : 'Sit down';
  ui.poseToggle.classList.toggle('active', targetIsSeated);
  ui.poseToggle.setAttribute('aria-pressed', String(targetIsSeated));
  ui.poseToggle.title = moving
    ? 'Reverse the current Meta MHR pose transition'
    : `Animate the Meta MHR patient to ${targetIsSeated ? 'standing' : 'the chair'}`;
}

function updateControlModes() {
  document.querySelectorAll('.control-group[data-renderer]').forEach((group) => {
    group.hidden = group.dataset.renderer !== renderStyle;
  });
  for (const definition of definitions) {
    const row = document.querySelector(`.control[data-id="${definition.id}"]`);
    if (!row) continue;
    const mhrLive = renderStyle === 'mhr' && (MHR_LIVE_IDENTITY_IDS.has(definition.id) || definition.id === 'seated');
    const live = definition.mode === 'live' || mhrLive;
    row.classList.toggle('live', live);
    row.classList.toggle('bake', !live);
    row.title = mhrLive && definition.mode === 'bake'
      ? 'Live in Meta MHR; renderer A still requires regeneration'
      : '';
  }
}

async function loadCharacter() {
  disposeLoadedCharacter();
  isFallback = false;
  ui.fallback.hidden = true;
  const rendererMode = RENDERER_MODES[renderStyle];
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`${rendererMode.path}?v=${Date.now()}`);
    model = gltf.scene;
    characterRoot.add(model); animationClips = gltf.animations;
    setupAnimations();
    ui.status.textContent = `${rendererMode.label} · ${countTriangles(model).toLocaleString()} triangles · ${animationClips.length} clip${animationClips.length === 1 ? '' : 's'}`; ui.status.className = 'status ok';
  } catch (error) {
    model = makeFallbackHuman(); characterRoot.add(model); isFallback = true;
    ui.status.textContent = `${rendererMode.label} unavailable · ${error.message}`; ui.status.className = 'status warn'; ui.fallback.hidden = false;
  }
  indexModel(model);
  if (!isFallback) {
    if (renderStyle === 'current') {
      prepareSkinModel(model, preset.values);
      bones = findBones(model);
    }
    if (renderStyle === 'current' && bones.pelvis) {
      // hold the authored pose at frame 0, then treat it as the procedural rest pose
      if (mixer) mixer.update(0);
      model.updateMatrixWorld(true);
      idle = createIdle(bones);
      idle.captureRest();
      costume = createCostume(characterRoot, bones, model);
      costume.rebuild(preset.values);
      expressions = createExpressions(model, { restingFace: preset.patient?.appearance?.restingFace });
    } else if (renderStyle === 'mhr') {
      mhrController = createMhrController(model, preset.values);
      prepareSkinModel(model, preset.values);
      bones = findBones(model);
      mhrEyeDetails = createMhrEyeDetails(model, preset.values);
      mhrFacialDetails = createMhrFacialDetails(model, preset.values);
      model.updateMatrixWorld(true);
      if (bones.pelvis && bones.head) {
        costume = createCostume(characterRoot, bones, model);
        costume.rebuild(preset.values);
      }
      idle = mhrController;
      expressions = createMhrExpressions(model, { restingFace: preset.patient?.appearance?.restingFace });
    }
    refreshFaceUnitDebugger();
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
  let count = 0;
  root.traverse((object) => {
    if (object.geometry?.index) count += object.geometry.index.count / 3;
    else if (object.geometry?.attributes?.position) count += object.geometry.attributes.position.count / 3;
  });
  return Math.round(count);
}

function objectsLike(term) { return [...named].filter(([name]) => name.toLowerCase().includes(term.toLowerCase())).map(([, object]) => object); }
function setSurfaceFinish(mat, value, oldMaximum) {
  if (value == null || !('roughness' in mat)) return;
  mat.roughness = Math.min(1, value);
  const extra = THREE.MathUtils.clamp((value - oldMaximum) / (1.5 - oldMaximum), 0, 1);
  if (!mat.userData.matteFinishUniform) {
    const uniform = { value: 1 };
    const previousCompile = mat.onBeforeCompile;
    const previousCacheKey = mat.customProgramCacheKey.bind(mat);
    mat.userData.matteFinishUniform = uniform;
    mat.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(mat, shader, renderer);
      shader.uniforms.matteSpecularScale = uniform;
      shader.fragmentShader = `uniform float matteSpecularScale;\n${shader.fragmentShader}`.replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.directSpecular *= matteSpecularScale;\nreflectedLight.indirectSpecular *= matteSpecularScale;',
      );
    };
    mat.customProgramCacheKey = () => `${previousCacheKey()}|matte-finish-v1`;
    mat.needsUpdate = true;
  }
  // Values beyond the renderer's physical roughness limit reduce the residual
  // specular response, so the expanded part of the slider remains visible.
  mat.userData.matteFinishUniform.value = THREE.MathUtils.lerp(1, 0.28, extra);
}

function setMaterialLike(term, color, roughness, oldMaximum = 1) {
  for (const object of objectsLike(term)) if (object.isMesh) {
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const mat of list) { if (color && mat.color) mat.color.set(color); setSurfaceFinish(mat, roughness, oldMaximum); }
  }
}

function setEyeColor(color) {
  const eyes = named.get('Eyes');
  if (!eyes?.isMesh) return;
  const list = Array.isArray(eyes.material) ? eyes.material : [eyes.material];
  for (const mat of list) {
    if (!mat.map?.image) continue;
    if (!mat.userData.eyeTintSource) {
      const image = mat.map.image;
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      mat.userData.eyeTintSource = context.getImageData(0, 0, canvas.width, canvas.height);
      mat.userData.eyeTintCanvas = canvas;
      mat.map = mat.map.clone(); mat.map.image = canvas;
    }
    const source = mat.userData.eyeTintSource;
    const output = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    const target = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
    const targetLight = Math.max(1, target[0] * .299 + target[1] * .587 + target[2] * .114);
    for (let index = 0; index < output.data.length; index += 4) {
      const r = source.data[index], g = source.data[index + 1], b = source.data[index + 2];
      const high = Math.max(r, g, b), low = Math.min(r, g, b), chroma = high - low;
      const light = r * .299 + g * .587 + b * .114;
      // The source asset has brown irises on a nearly neutral sclera. Select
      // those chromatic midtones, preserving black pupils and white highlights.
      const brown = r > g * 1.06 && g > b * .82;
      const mask = brown ? Math.min(1, (chroma - 10) / 42) * Math.min(1, (218 - light) / 100) : 0;
      if (mask <= 0) continue;
      const contrast = THREE.MathUtils.clamp(light / targetLight, .42, 1.55);
      for (let channel = 0; channel < 3; channel++) {
        const tinted = THREE.MathUtils.clamp(target[channel] * contrast, 0, 255);
        output.data[index + channel] = THREE.MathUtils.lerp(source.data[index + channel], tinted, mask * .94);
      }
    }
    const context = mat.userData.eyeTintCanvas.getContext('2d'); context.putImageData(output, 0, 0);
    mat.map.needsUpdate = true;
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

function applyAll(changedId = null, { final = true } = {}) {
  const v = preset.values;
  const initial = changedId == null;
  if (isFallback) {
    setMaterialLike('dress', v.dressColor, v.fabricRoughness, 1); setMaterialLike('trim', v.trimColor);
    setMaterialLike('hair', v.hairColor); setMaterialLike('skin', v.skinTone, v.skinRoughness, .9);
    characterRoot.position.y = -0.2 * (v.seated >= 0.5 ? 1 : 0);
  } else {
    if (renderStyle === 'current') {
      if (initial || SKIN_APPEARANCE_IDS.has(changedId)) {
        const skinTint = new THREE.Color('#ffffff').lerp(new THREE.Color(v.skinTone), 0.75);
        setMaterialLike('human', skinTint, v.skinRoughness, .9); setMaterialLike('.body', skinTint, v.skinRoughness, .9);
        setEyeColor(v.eyeColor);
        updateSkinModel(model, v);
      }
      if (initial || COSTUME_MATERIAL_IDS.has(changedId) || COSTUME_GEOMETRY_IDS.has(changedId)) {
        setMaterialLike('garment', v.dressColor, v.fabricRoughness, 1);
        setMaterialLike('bodice', v.dressColor, v.fabricRoughness, 1);
        setMaterialLike('suit', v.dressColor, v.fabricRoughness, 1);
        setMaterialLike('shoes', '#211713');
      }
      if (costume && (initial || COSTUME_MATERIAL_IDS.has(changedId) || COSTUME_GEOMETRY_IDS.has(changedId))) {
        costume.materials.dress.color.set(v.dressColor); setSurfaceFinish(costume.materials.dress, v.fabricRoughness, 1);
        costume.materials.trim.color.set(v.trimColor); costume.updateHair(v);
      }
      if (final && COSTUME_GEOMETRY_IDS.has(changedId)) costumeDirty = true;
    } else if (renderStyle === 'mhr') {
      const identityControl = initial || MHR_IDENTITY_IDS.has(changedId);
      const rigControl = initial || MHR_RIG_IDS.has(changedId) || MHR_POSE_IDS.has(changedId);
      const identityChanged = (identityControl || rigControl) ? (mhrController?.applyValues(v) || false) : false;
      if (changedId === 'seated' && mhrController?.isPoseTransitioning) poseCostumeRebuildPending = true;
      if (identityChanged) {
        refreshSkinGeometry(model, v);
        mhrFacialDetails?.rebuild(v);
        identityFitPending = true;
      }
      if (initial || identityChanged || SKIN_APPEARANCE_IDS.has(changedId)) updateSkinModel(model, v);
      if (initial || identityChanged || MHR_EYE_DETAIL_IDS.has(changedId)) mhrEyeDetails?.update(v);
      if (initial || MHR_FACE_DETAIL_MATERIAL_IDS.has(changedId)) mhrFacialDetails?.update(v);
      if (final && MHR_FACE_DETAIL_GEOMETRY_IDS.has(changedId)) mhrFacialDetails?.rebuild(v);
      if (initial || COMPARISON_MATERIAL_IDS.has(changedId)) updateComparisonMaterial(model, v);
      if (costume) {
        if (initial || COSTUME_MATERIAL_IDS.has(changedId) || COSTUME_GEOMETRY_IDS.has(changedId)) {
          costume.materials.dress.color.set(v.dressColor); setSurfaceFinish(costume.materials.dress, v.fabricRoughness, 1);
          costume.materials.trim.color.set(v.trimColor); costume.updateHair(v);
        }
        if (final && identityControl && identityFitPending) {
          costume.invalidateFit?.();
          costumeDirty = true;
          identityFitPending = false;
        }
        if (final && COSTUME_GEOMETRY_IDS.has(changedId)) costumeDirty = true;
      }
    } else {
      if (initial || COMPARISON_MATERIAL_IDS.has(changedId)) updateComparisonMaterial(model, v);
    }
  }
  if (initial || LIGHTING_IDS.has(changedId)) {
    const key = scene.getObjectByName('KeyLight');
    const fill = scene.getObjectByName('FillLight');
    const faceFill = scene.getObjectByName('ComparisonFaceFill');
    const rim = scene.getObjectByName('ComparisonRimLight');
    const comparison = renderStyle !== 'current';
    const softness = THREE.MathUtils.clamp(v.stylizedLightSoftness ?? 0.78, 0, 1);
    if (key) {
      key.intensity = (comparison ? THREE.MathUtils.lerp(39, 29, softness) : 48) * v.keyIntensity;
      key.color.setHSL(0.105, comparison ? .42 : .58, (comparison ? .67 : .62) + (1 - v.warmth) * .1);
      key.penumbra = comparison ? THREE.MathUtils.lerp(.9, .995, softness) : .92;
      key.shadow.radius = comparison ? THREE.MathUtils.lerp(2, 4, softness) : 3;
      key.shadow.normalBias = comparison ? 0.018 : 0.012;
    }
    if (fill) fill.intensity = comparison ? 0.38 + v.fillIntensity * 0.55 : 0.62 + v.fillIntensity * 0.9;
    if (faceFill) {
      faceFill.visible = comparison;
      faceFill.intensity = (0.65 + softness * 1.75) * (0.65 + v.fillIntensity * 0.45);
    }
    if (rim) { rim.visible = comparison; rim.intensity = 0.14 + softness * 0.14; }
    renderer.toneMappingExposure = 2 ** (v.exposure + (comparison ? -0.08 : 0));
    camera.fov = v.cameraFov; camera.updateProjectionMatrix();
  }
  if (changedId === 'idleMode') syncIdleMode();
  updatePoseToggle();
  updateText();
}

function buildControls() {
  ui.controls.replaceChildren();
  for (const group of schema.groups) {
    const section = document.createElement('section'); section.className = 'control-group'; section.dataset.group = group.id;
    if (group.renderer) section.dataset.renderer = group.renderer;
    const heading = document.createElement('button'); heading.className = 'group-heading'; heading.textContent = group.label; heading.onclick = () => section.classList.toggle('closed');
    const body = document.createElement('div'); body.className = 'group-body';
    for (const parameter of group.parameters) body.append(makeControl({ ...parameter, mode: parameter.mode || group.mode }));
    section.append(heading, body); ui.controls.append(section);
  }
  updateControlModes();
}

function flushPendingControlUpdate({ final = false } = {}) {
  if (pendingControlFrame != null) cancelAnimationFrame(pendingControlFrame);
  pendingControlFrame = null;
  const changedId = pendingControlId;
  const appliesLive = pendingControlAppliesLive;
  pendingControlId = null;
  pendingControlAppliesLive = false;
  if (!changedId) return;
  if (appliesLive) applyAll(changedId, { final });
  else updateText();
}

function scheduleControlUpdate(changedId, appliesLive) {
  pendingControlId = changedId;
  pendingControlAppliesLive = appliesLive;
  if (pendingControlFrame != null) return;
  pendingControlFrame = requestAnimationFrame(() => flushPendingControlUpdate({ final: false }));
}

function makeControl(definition) {
  const row = document.createElement('div'); row.className = `control ${definition.mode === 'bake' ? 'bake' : 'live'}`; row.dataset.search = `${definition.label} ${definition.id}`.toLowerCase();
  row.dataset.id = definition.id;
  const label = document.createElement('label'); label.textContent = definition.label; label.htmlFor = `control-${definition.id}`;
  const output = document.createElement('output'); const input = document.createElement(definition.type === 'select' ? 'select' : 'input'); input.id = `control-${definition.id}`;
  if (definition.type === 'select') for (const value of definition.options) { const option = document.createElement('option'); option.value = value; option.textContent = value.replaceAll('-', ' '); input.append(option); }
  else { input.type = definition.type; if (definition.type === 'range') for (const key of ['min', 'max', 'step']) input[key] = definition[key]; }
  input.value = preset.values[definition.id]; output.textContent = formatValue(definition, input.value);
  const applyInput = (final = false) => {
    preset.values[definition.id] = definition.type === 'range' ? Number(input.value) : input.value;
    output.textContent = formatValue(definition, input.value);
    if (HERITAGE_IDS.includes(definition.id)) normalizeHeritageWeights(definition.id);
    if (definition.mode === 'bake') markRegenerationNeeded();
    // MHR identity changes are expensive enough to miss a frame, but pointer
    // events can arrive far faster than frames. Keep only the latest value and
    // never queue a backlog. The final change event commits one hair/costume
    // refit after dragging stops.
    const appliesLive = definition.mode === 'live'
      || (renderStyle === 'mhr' && (MHR_LIVE_IDENTITY_IDS.has(definition.id) || definition.id === 'seated'));
    if (final) {
      pendingControlId = definition.id;
      pendingControlAppliesLive = appliesLive;
      flushPendingControlUpdate({ final: true });
    } else scheduleControlUpdate(definition.id, appliesLive);
  };
  input.oninput = () => applyInput(false);
  input.onchange = () => applyInput(true);
  row.append(label, output, input); return row;
}

function formatValue(definition, value) { return definition.type === 'range' ? Number(value).toFixed(definition.step < .01 ? 3 : definition.step < 1 ? 2 : 0) : ''; }
function normalizeHeritageWeights(changedId) {
  const chosen = THREE.MathUtils.clamp(Number(preset.values[changedId]) || 0, 0, 1);
  const others = HERITAGE_IDS.filter((id) => id !== changedId);
  const otherTotal = others.reduce((sum, id) => sum + Math.max(0, Number(preset.values[id]) || 0), 0);
  const remainder = 1 - chosen;
  preset.values[changedId] = chosen;
  for (const id of others) {
    preset.values[id] = otherTotal > 0 ? remainder * Math.max(0, Number(preset.values[id]) || 0) / otherTotal : remainder / 2;
  }
  for (const id of HERITAGE_IDS) {
    const heritageInput = document.querySelector(`#control-${id}`);
    if (!heritageInput) continue;
    heritageInput.value = preset.values[id];
    const heritageDefinition = definitions.find((definition) => definition.id === id);
    const heritageOutput = heritageInput.parentElement?.querySelector('output');
    if (heritageOutput) heritageOutput.textContent = formatValue(heritageDefinition, preset.values[id]);
  }
}
function refreshControls(apply = true) {
  if (pendingControlFrame != null) cancelAnimationFrame(pendingControlFrame);
  pendingControlFrame = null; pendingControlId = null; pendingControlAppliesLive = false;
  for (const definition of definitions) {
    const input = document.querySelector(`#control-${definition.id}`);
    if (!input) continue;
    input.value = preset.values[definition.id];
    const output = input.parentElement?.querySelector('output');
    if (output) output.textContent = formatValue(definition, input.value);
  }
  if (apply) applyAll();
  else updateText();
}
function markRegenerationNeeded() {
  regenerationNeeded = true;
  ui.regenerate?.classList.add('needed');
  if (!regenerationBusy) {
    ui.status.textContent = renderStyle === 'mhr' ? 'Meta MHR updated live · renderer A rebuild pending' : 'Identity changes waiting for Blender';
    ui.status.className = 'status warn';
  }
}
function addRecordField(list, label, value) {
  const term = document.createElement('dt'); term.textContent = label;
  const description = document.createElement('dd'); description.textContent = value;
  list.append(term, description);
}
function renderPatientRecord(patient) {
  ui.patientSection.hidden = !patient;
  ui.patientRecord.replaceChildren();
  if (!patient) return;
  const wrapper = document.createElement('div'); wrapper.className = 'patient-record';
  const list = document.createElement('dl');
  addRecordField(list, 'Age', `${patient.identity.age} · born ${patient.identity.birthYear}`);
  addRecordField(list, 'Origin', `${patient.identity.origin.label} · ${patient.identity.origin.generationLabel}`);
  addRecordField(list, 'Language', patient.identity.language);
  addRecordField(list, 'Household', patient.social.householdPosition);
  addRecordField(list, 'Residence', patient.social.residence);
  addRecordField(list, 'Access', `${patient.social.payer} · ${patient.social.referralSource}`);
  const clinicalLabel = document.createElement('p'); clinicalLabel.className = 'clinical-label'; clinicalLabel.textContent = patient.clinical.periodCategory;
  const complaint = document.createElement('p'); complaint.className = 'complaint'; complaint.textContent = `“${patient.clinical.presentingComplaint}”`;
  const provenance = document.createElement('p'); provenance.className = 'provenance'; provenance.textContent = 'Fictional, seeded patient · clinic-weighted demographic model';
  wrapper.append(list, clinicalLabel, complaint, provenance); ui.patientRecord.append(wrapper);
}
function updateText() {
  ui.subjectName.textContent = preset.name;
  ui.summary.textContent = preset.description;
  renderPatientRecord(preset.patient);
  ui.json.value = JSON.stringify(preset, null, 2);
  ui.command.textContent = `npm run character:generate -- character-lab/public/presets/${preset.id}.json`;
  const live = definitions.filter((definition) => definition.mode === 'live'
    || (renderStyle === 'mhr' && (MHR_LIVE_IDENTITY_IDS.has(definition.id) || definition.id === 'seated'))).length;
  const baked = definitions.length - live;
  const expressionMode = expressions?.mode === 'mpfb-faceunits'
    ? `MPFB named · ${expressions.availableUnits.length}`
    : expressions?.mode === 'mhr-semantic' ? `MHR semantic · ${expressions.availableUnits.length} signed components` : 'baked / unavailable';
  ui.pipeline.innerHTML = `<dt>Tunable values</dt><dd>${definitions.length}</dd><dt>Live controls</dt><dd>${live}</dd><dt>Blender controls</dt><dd>${baked}</dd><dt>Renderer</dt><dd>${RENDERER_MODES[renderStyle].label}</dd><dt>Facial driver</dt><dd>${expressionMode}</dd><dt>Regeneration</dt><dd>${regenerationNeeded ? 'needed' : 'current'}</dd><dt>Patient seed</dt><dd>${preset.patient?.seed ?? 'legacy'}</dd><dt>Appearance seed</dt><dd>${preset.values.seed}</dd><dt>Face signature</dt><dd>${preset.patient?.appearance?.faceSignatureSeed ?? 'neutral'}</dd><dt>Target runtime</dt><dd>Three.js / GLB</dd>`;
}

function syncControlValue(id, value) {
  const input = document.querySelector(`#control-${id}`);
  if (!input) return;
  input.value = value;
  const definition = definitions.find((item) => item.id === id);
  const output = input.parentElement?.querySelector('output');
  if (definition && output) output.textContent = formatValue(definition, value);
}

function toggleMhrPose() {
  if (renderStyle !== 'mhr' || !mhrController || isFallback) return;
  const nextSeated = mhrController.targetSeated < 0.5 ? 1 : 0;
  preset.values.seated = nextSeated;
  syncControlValue('seated', nextSeated);
  mhrController.startSeatedTransition(nextSeated, 2.25, preset.values);
  poseCostumeRebuildPending = true;
  poseWasTransitioning = true;
  regenerationNeeded = true;
  ui.regenerate?.classList.add('needed');
  setView('full');
  ui.status.textContent = nextSeated ? 'Meta MHR patient sitting down…' : 'Meta MHR patient standing up…';
  ui.status.className = 'status ok';
  updatePoseToggle();
  updateText();
}

function appearanceVariation() {
  const patient = preset.patient ?? generatePatient({ seed: preset.values.seed });
  const appearanceSeed = nextSeed(preset.values.seed);
  preset = patientToCharacterPreset(patient, preset, definitions, { appearanceSeed });
  refreshControls(false);
  applyPresetRestingFace();
  if (renderStyle === 'mhr') {
    applyAll();
    ui.status.textContent = `Appearance variation ${appearanceSeed} applied live to Meta MHR · renderer A rebuild pending`;
  } else ui.status.textContent = `Appearance variation ${appearanceSeed} ready · regenerate for baked anatomy`;
  ui.status.className = 'status warn';
}

async function newRandomPatient() {
  const previousPreset = preset;
  const previousArchetype = previousPreset.patient?.appearance?.faceArchetype;
  const previousOrigin = previousPreset.patient?.identity?.origin?.id;
  const excludedSeeds = [previousPreset.patient?.seed, previousPreset.values.seed].filter(Boolean);
  let best = null;

  // "New random patient" should feel like casting a different person, not
  // merely accepting the next nearby draw. Sample a small slate and select the
  // face farthest from the one on screen, with modest bonuses for a different
  // broad archetype and ancestry macro. The winning seed is still recorded, so
  // the result remains exactly reproducible.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const patientSeed = randomSeed(excludedSeeds);
    excludedSeeds.push(patientSeed);
    const patient = generatePatient({ seed: patientSeed });
    const candidate = patientToCharacterPreset(patient, previousPreset, definitions);
    const anatomyDistance = faceIdentityDistance(previousPreset, candidate, definitions);
    const archetypeBonus = candidate.patient.appearance.faceArchetype !== previousArchetype ? 0.09 : 0;
    const originBonus = candidate.patient.identity.origin.id !== previousOrigin ? 0.025 : 0;
    const score = anatomyDistance + archetypeBonus + originBonus;
    if (!best || score > best.score) best = { candidate, score, anatomyDistance };
  }

  preset = best.candidate;
  refreshControls(false);
  applyPresetRestingFace();
  ui.status.textContent = `Casting a distinct patient · anatomy distance ${best.anatomyDistance.toFixed(2)}…`;
  ui.status.className = 'status warn';
  if (renderStyle === 'mhr') {
    applyAll();
    regenerationNeeded = true;
    ui.regenerate?.classList.add('needed');
    ui.status.textContent = `New Meta MHR patient applied live · caching runtime model…`;
    try {
      const response = await fetch('/api/generate-mhr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `MHR cache failed (${response.status})`);
      ui.status.textContent = `New Meta MHR patient applied · ${(result.bytes / 1_000_000).toFixed(1)} MB runtime ${result.cached ? 'restored from cache' : 'generated'} · renderer A rebuild pending`;
      ui.status.className = 'status ok';
    } catch (error) {
      ui.status.textContent = `Meta MHR applied live; runtime cache failed · ${error.message}`;
      ui.status.className = 'status warn';
    }
    return;
  }
  await regenerateCharacter();
}

async function regenerateCharacter() {
  if (regenerationBusy) return;
  regenerationBusy = true;
  ui.status.textContent = 'Blender is fitting a complete character…'; ui.status.className = 'status warn';
  for (const button of [ui.regenerate, ui.randomize, ui.newPatient]) if (button) button.disabled = true;
  document.querySelectorAll('#controls input, #controls select').forEach((control) => { control.disabled = true; });
  try {
    const response = await fetch('/api/regenerate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preset),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Regeneration failed (${response.status})`);
    regenerationNeeded = false;
    ui.status.textContent = `Character rebuilt in ${result.seconds.toFixed(1)}s · reloading…`; ui.status.className = 'status ok';
    window.location.reload();
  } catch (error) {
    ui.status.textContent = error.message; ui.status.className = 'status warn';
    regenerationBusy = false;
    for (const button of [ui.regenerate, ui.randomize, ui.newPatient]) if (button) button.disabled = false;
    document.querySelectorAll('#controls input, #controls select').forEach((control) => { control.disabled = false; });
  }
}

const views = {
  clinic: [[2.45, 1.62, 3.35], [0, 1.1, 0]],
  full: [[2.15, 1.35, 3.6], [0, .86, 0]],
  portrait: [[.58, 1.42, 1.08], [0, 1.32, 0]],
  exam: [[2.75, 1.28, 0.9], [0, 0.9, 0.1]],
};
function setView(name) {
  if (name === 'portrait' && bones?.head) {
    const target = bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.025, 0));
    orbit.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(0.38, 0.09, 0.72));
  } else if (name === 'full' && bones?.head && bones?.pelvis) {
    const head = bones.head.getWorldPosition(new THREE.Vector3());
    const pelvis = bones.pelvis.getWorldPosition(new THREE.Vector3());
    const target = pelvis.clone().lerp(head, 0.48).add(new THREE.Vector3(0, -0.06, 0));
    orbit.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(1.72, 0.48, 2.75));
  } else {
    camera.position.set(...views[name][0]);
    orbit.target.set(...views[name][1]);
  }
  orbit.update();
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
}

async function toggleRenderStyle() {
  if (renderSwitchBusy) return;
  renderSwitchBusy = true;
  renderStyle = RENDERER_ORDER[(RENDERER_ORDER.indexOf(renderStyle) + 1) % RENDERER_ORDER.length];
  sessionStorage.setItem('characterLabRenderStyle', renderStyle);
  updateRenderToggle();
  ui.status.textContent = `Loading renderer ${RENDERER_MODES[renderStyle].label}…`;
  ui.status.className = 'status';
  await loadCharacter();
  updateControlModes();
  if (renderStyle === 'mhr') setView('full');
  renderSwitchBusy = false;
  updateRenderToggle();
  updateText();
}

makeClinic(); buildControls(); updateRenderToggle(); await loadCharacter(); updateText(); setView('clinic');
ui.randomize.onclick = appearanceVariation;
ui.newPatient.onclick = newRandomPatient;
ui.regenerate.onclick = regenerateCharacter;
document.querySelector('#reset').onclick = () => { preset = structuredClone(initialPreset); refreshControls(); applyPresetRestingFace(); setView('clinic'); };
document.querySelector('#export').onclick = () => { const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })), download: `${preset.id}.json` }); link.click(); URL.revokeObjectURL(link.href); };
document.querySelector('#apply-json').onclick = () => { try { preset = JSON.parse(ui.json.value); refreshControls(); applyPresetRestingFace(); } catch { ui.json.setCustomValidity('Invalid JSON'); ui.json.reportValidity(); } };
document.querySelector('#copy-json').onclick = () => navigator.clipboard.writeText(ui.json.value);
document.querySelector('#toggle-grid').onclick = (event) => { grid.visible = !grid.visible; event.currentTarget.classList.toggle('active', grid.visible); };
document.querySelector('#toggle-motion').onclick = (event) => { motionEnabled = !motionEnabled; syncIdleMode(); event.currentTarget.classList.toggle('active', motionEnabled); };
ui.renderToggle.onclick = toggleRenderStyle;
ui.poseToggle.onclick = toggleMhrPose;
document.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => setView(button.dataset.view));
document.querySelectorAll('[data-gesture]').forEach((button) => button.onclick = () => idle?.playGesture(button.dataset.gesture, preset.values.gestureSpeed || 1));
document.querySelectorAll('[data-expression]').forEach((button) => button.onclick = () => { clearFaceUnitDebug(); expressions?.play(button.dataset.expression, preset.values.gestureSpeed || 1); });
ui.faceUnitSelect.onchange = applyFaceUnitDebug;
ui.faceUnitValue.oninput = applyFaceUnitDebug;
ui.faceUnitReset.onclick = clearFaceUnitDebug;
ui.faceUnitSurprise.onclick = surpriseFace;
ui.canvas.ondblclick = () => setView('clinic');
ui.search.oninput = () => { const term = ui.search.value.toLowerCase(); document.querySelectorAll('.control').forEach((row) => row.hidden = !row.dataset.search.includes(term)); document.querySelectorAll('.control-group').forEach((group) => { const rendererMismatch = group.dataset.renderer && group.dataset.renderer !== renderStyle; group.hidden = rendererMismatch || ![...group.querySelectorAll('.control')].some((row) => !row.hidden); }); };

/* console access for calibration and debugging */
window.__lab = { scene, get bones() { return bones; }, get model() { return model; }, get preset() { return preset; }, get idle() { return idle; }, get costume() { return costume; }, get facialDetails() { return mhrFacialDetails; }, get expressions() { return expressions; }, get renderStyle() { return renderStyle; }, THREE, applyAll, rebuildCostumeNow, toggleRenderStyle };

const clock = new THREE.Clock();
function frame() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (costumeDirty && !mhrController?.isPoseTransitioning && performance.now() - lastCostumeBuild > 90) rebuildCostumeNow();
  if (!isFallback) {
    const mode = preset.values.idleMode || 'procedural';
    if (motionEnabled && mixer) mixer.update(mode === 'procedural' ? 0 : delta * (0.72 + Math.min(preset.values.breathing, 1.2) * 0.9));
    if (idle && renderStyle === 'mhr') {
      idle.update(delta, elapsed, preset.values, mode, motionEnabled);
      const transitioning = idle.isPoseTransitioning;
      if (transitioning !== poseWasTransitioning) {
        poseWasTransitioning = transitioning;
        updatePoseToggle();
      }
      if (poseCostumeRebuildPending && !transitioning) {
        costume?.invalidateFit?.();
        costumeDirty = true;
        poseCostumeRebuildPending = false;
        ui.status.textContent = idle.targetSeated >= 0.5 ? 'Meta MHR patient seated' : 'Meta MHR patient standing';
        ui.status.className = 'status ok';
      }
    } else if (motionEnabled && idle) idle.update(delta, elapsed, preset.values, mode);
  }
  if (expressions && !isFallback) expressions.update(delta, elapsed, preset.values);
  if (mhrFacialDetails && renderStyle === 'mhr') mhrFacialDetails.update(preset.values);
  orbit.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() { const width = ui.canvas.clientWidth; const height = ui.canvas.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(ui.canvas); resize(); frame();

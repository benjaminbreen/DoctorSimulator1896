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
  applyRendererCCandidate, createRendererCController, generateRendererCCandidates,
  RENDERER_C_AGE_BANDS, RENDERER_C_ANCESTRIES, RENDERER_C_COHORTS, RENDERER_C_LIVE_IDS,
} from './renderer-c.js';
import {
  createRendererCMenswear, RENDERER_C_MENSWEAR_GEOMETRY_IDS, RENDERER_C_MENSWEAR_MATERIAL_IDS,
} from './renderer-c-menswear.js';
import {
  faceIdentityDistance, generatePatient, generateRestingFaceSignature, nextSeed,
  patientToCharacterPreset, randomSeed,
} from './patients/index.js';
import { prepareSkinModel, refreshSkinGeometry, updateSkinModel } from './stylized.js';
import './style.css';

const [schema, initialPreset, rendererCManifest] = await Promise.all([
  fetch('/schema/character.schema.json').then((response) => response.json()),
  fetch('/presets/mrs-ostrander-1896.json').then((response) => response.json()),
  fetch('/models/renderer-c-cohorts.json').then((response) => response.json()),
]);
let preset = structuredClone(initialPreset);
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({ ...parameter, mode: parameter.mode || group.mode, group: group.id })));
for (const definition of definitions) if (preset.values[definition.id] == null) preset.values[definition.id] = structuredClone(definition.default);
if (preset.values.rendererCAnchor == null) preset.values.rendererCAnchor = 0;
const ui = {
  canvas: document.querySelector('#stage'), controls: document.querySelector('#controls'), status: document.querySelector('#model-status'),
  json: document.querySelector('#preset-json'), summary: document.querySelector('#subject-summary'), subjectName: document.querySelector('#subject-name'),
  patientRecord: document.querySelector('#patient-record'), patientSection: document.querySelector('#patient-record-section'), pipeline: document.querySelector('#pipeline-state'),
  command: document.querySelector('#generate-command'), fallback: document.querySelector('#fallback'), search: document.querySelector('#control-search'),
  regenerate: document.querySelector('#regenerate'), randomize: document.querySelector('#randomize'), newPatient: document.querySelector('#new-patient'),
  renderToggle: document.querySelector('#render-toggle'),
  dressStudy: document.querySelector('#dress-study'),
  poseToggle: document.querySelector('#pose-toggle'),
  expressionDriver: document.querySelector('#expression-driver'), faceUnitSelect: document.querySelector('#face-unit-select'),
  faceUnitValue: document.querySelector('#face-unit-value'), faceUnitOutput: document.querySelector('#face-unit-output'), faceUnitReset: document.querySelector('#face-unit-reset'),
  faceUnitSurprise: document.querySelector('#face-unit-surprise'),
  rendererCPanel: document.querySelector('#renderer-c-lab'), rendererCCohort: document.querySelector('#renderer-c-cohort'),
  rendererCAge: document.querySelector('#renderer-c-age'), rendererCAncestry: document.querySelector('#renderer-c-ancestry'),
  rendererCSeed: document.querySelector('#renderer-c-seed'), rendererCGenerate: document.querySelector('#renderer-c-generate'),
  rendererCGrid: document.querySelector('#renderer-c-grid'), rendererCGridStatus: document.querySelector('#renderer-c-grid-status'),
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
const RENDERER_C_WOMEN_WARDROBE_IDS = new Set(['womenGarmentMode']);
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
  'armOpenness', 'elbowBend', 'armAsymmetry', 'wristAngle', 'seatedHandPose', 'handTension',
  'foldedHandHeight', 'foldedHandForward', 'foldedHandSpread',
]);
const RENDERER_C_MOTIONS = Object.freeze({
  ClinicIdle: Object.freeze({ seated: true, label: 'Renderer C · hands resting on knees' }),
  SittingTalking: Object.freeze({ seated: true, label: 'Renderer C · seated conversation' }),
  SittingTalkingLegsCrossed: Object.freeze({ seated: true, label: 'Renderer C · cross-legged conversation' }),
  SittingDejected: Object.freeze({ seated: true, label: 'Renderer C · seated and dejected' }),
  SittingKneeStrike: Object.freeze({ seated: true, next: 'ClinicIdle', label: 'Renderer C · striking knee…' }),
  SitDown: Object.freeze({ seated: false, next: 'ClinicIdle', label: 'Renderer C · sitting down…' }),
  StandUp: Object.freeze({ seated: false, next: 'StandingIdle', label: 'Renderer C · standing up…' }),
  StandingIdle: Object.freeze({ seated: false, label: 'Renderer C · standing idle' }),
  Walk: Object.freeze({ seated: false, label: 'Renderer C · standard walk cycle' }),
  RiseFromFloor: Object.freeze({ seated: false, next: 'StandingIdle', label: 'Renderer C · rising from the floor…' }),
});
const RENDERER_C_MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
]);
const rendererCMoveKeys = new Set();
const rendererCMoveDirection = new THREE.Vector3();
const rendererCMoveStep = new THREE.Vector3();
const rendererCCameraForward = new THREE.Vector3();
const rendererCCameraRight = new THREE.Vector3();
const rendererCUp = new THREE.Vector3(0, 1, 0);
let rendererCKeyboardWalking = false;

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
let animationFinishedHandler = null;
let bones = null;
let costume = null;
let idle = null;
let expressions = null;
let mhrController = null;
let mhrEyeDetails = null;
let mhrFacialDetails = null;
let rendererCController = null;
let rendererCCohort = preset.rendererC?.cohort || (preset.values.gender >= 0.5 ? 'men' : 'women');
let rendererCCandidates = [];
let rendererCGridBusy = false;
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
  rendererC: Object.freeze({ label: 'C · GNM + MPFB', kind: 'rendererC' }),
});
const RENDERER_ORDER = Object.keys(RENDERER_MODES);
const storedRenderer = sessionStorage.getItem('characterLabRenderStyle');
let renderStyle = RENDERER_MODES[storedRenderer] ? storedRenderer : 'rendererC';
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
  // The lab is a character and motion workspace, so the desk only blocked the
  // lower body. Keep one chair aligned to Renderer C's authored seated pose.
  const chairMat = material('Chair', '#24150f', 0.8);
  const chair = new THREE.Group();
  chair.name = 'ClinicChair';
  world.add(chair);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.5), chairMat);
  seat.position.set(0, 0.39, -0.10); seat.castShadow = true; seat.receiveShadow = true; chair.add(seat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.0, 0.07), chairMat);
  chairBack.position.set(0, 0.91, -0.35); chairBack.castShadow = true; chair.add(chairBack);
  for (const [x, z] of [[-0.24, -0.29], [0.24, -0.29], [-0.24, 0.09], [0.24, 0.09]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.39, 0.05), chairMat);
    leg.position.set(x, 0.195, z); chair.add(leg);
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
  if (animationFinishedHandler && mixer) mixer.removeEventListener('finished', animationFinishedHandler);
  animationFinishedHandler = null;
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
  rendererCController = null;
  rendererCMoveKeys.clear();
  rendererCKeyboardWalking = false;
  characterRoot.position.set(0, 0, 0);
  characterRoot.rotation.set(0, 0, 0);
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
      const isRendererCBody = renderStyle === 'rendererC' && object.name === 'Human_Body';
      const isSkin = isMhrBody || isRendererCBody || name.includes('head_material') || name.includes('skin');
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

function rendererCControlAppliesLive(definition) {
  if (RENDERER_C_LIVE_IDS.has(definition.id)) return true;
  if (rendererCCohort === 'men'
    && (RENDERER_C_MENSWEAR_GEOMETRY_IDS.has(definition.id) || RENDERER_C_MENSWEAR_MATERIAL_IDS.has(definition.id))) return true;
  if (rendererCCohort === 'women'
    && (COSTUME_GEOMETRY_IDS.has(definition.id) || COSTUME_MATERIAL_IDS.has(definition.id)
      || RENDERER_C_WOMEN_WARDROBE_IDS.has(definition.id))) return true;
  if (SKIN_APPEARANCE_IDS.has(definition.id) || LIGHTING_IDS.has(definition.id)) return true;
  if (['performance', 'pose'].includes(definition.group) && definition.id !== 'seated') return true;
  return ['hairColor', 'browColor', 'lashColor', 'dressColor', 'trimColor', 'fabricRoughness'].includes(definition.id);
}

function controlAppliesLive(definition) {
  if (renderStyle === 'rendererC') return rendererCControlAppliesLive(definition);
  if (renderStyle === 'mhr' && (MHR_LIVE_IDENTITY_IDS.has(definition.id) || definition.id === 'seated')) return true;
  return definition.mode === 'live';
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
    const rendererCLive = renderStyle === 'rendererC' && rendererCControlAppliesLive(definition);
    const live = controlAppliesLive(definition);
    row.classList.toggle('live', live);
    row.classList.toggle('bake', !live);
    row.title = (mhrLive || rendererCLive) && definition.mode === 'bake'
      ? `Live in Renderer ${renderStyle === 'rendererC' ? 'C' : 'B'}; Renderer A still requires regeneration`
      : renderStyle === 'rendererC' && definition.mode === 'live' && !rendererCLive
        ? 'Renderer C needs an asset swap or Blender rebuild for this control'
        : '';
  }
  if (ui.rendererCPanel) ui.rendererCPanel.hidden = renderStyle !== 'rendererC';
  if (ui.dressStudy) ui.dressStudy.hidden = renderStyle !== 'rendererC' || rendererCCohort !== 'women';
  updateRendererCMotionButtons();
}

async function loadCharacter() {
  disposeLoadedCharacter();
  isFallback = false;
  ui.fallback.hidden = true;
  const rendererMode = RENDERER_MODES[renderStyle];
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const modelPath = renderStyle === 'rendererC'
      ? rendererCManifest.cohorts[rendererCCohort].path
      : rendererMode.path;
    const gltf = await loader.loadAsync(`${modelPath}?v=${Date.now()}`);
    model = gltf.scene;
    characterRoot.add(model);
    animationClips = gltf.animations;
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
    } else if (renderStyle === 'rendererC') {
      const cohortManifest = rendererCManifest.cohorts[rendererCCohort];
      rendererCController = createRendererCController(model, cohortManifest, preset.values);
      bones = findBones(model);
      if (mixer) mixer.update(0);
      model.updateMatrixWorld(true);
      if (bones.pelvis) {
        idle = createIdle(bones);
        idle.captureRest();
        updateRendererCMotionButtons();
        if (rendererCCohort === 'men') {
          costume = createRendererCMenswear(characterRoot, bones, model);
          costume.rebuild(preset.values);
        } else if (bones.head) {
          stabilizeRendererCProductionSkirt();
          // The fitted MPFB garment is the skinned underlayer. The live outer
          // dress supplies the period silhouette while the carrier prevents
          // body exposure through broad Mixamo arm and torso poses.
          costume = createCostume(characterRoot, bones, model);
          costume.rebuild(preset.values);
        }
      }
      expressions = createExpressions(model, { restingFace: preset.patient?.appearance?.restingFace });
      // Renderer C's actual consultation rest pose is the Mixamo-authored
      // ClinicIdle clip. Starting in procedural mode froze it on frame zero
      // and then replaced it with the old, distorted seated approximation.
      const clinicIdle = animationClips.find((clip) => clip.name === 'ClinicIdle');
      if (clinicIdle && mixer) {
        preset.values.idleMode = 'clip+procedural';
        preset.values.seated = 1;
        syncControlValue('idleMode', preset.values.idleMode);
        syncControlValue('seated', preset.values.seated);
        playClip(clinicIdle, { transition: 0 });
        mixer.update(0);
        model.updateMatrixWorld(true);
      }
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
    updateRendererCMotionButtons();
    return;
  }
  mixer = new THREE.AnimationMixer(model);
  for (const clip of animationClips) select.append(new Option(clip.name || 'Unnamed clip', clip.name));
  select.onchange = () => {
    const clip = animationClips.find((item) => item.name === select.value) || animationClips[0];
    if (renderStyle === 'rendererC') playRendererCMotion(clip.name);
    else playClip(clip);
  };
  const initialClip = renderStyle === 'rendererC'
    ? animationClips.find((clip) => clip.name === 'ClinicIdle') || animationClips[0]
    : animationClips[0];
  select.value = initialClip.name;
  playClip(initialClip);
  updateRendererCMotionButtons();
}

function playClip(clip, { once = false, onFinished = null, transition = 0.18 } = {}) {
  if (!clip || !mixer) return;
  if (animationFinishedHandler) mixer.removeEventListener('finished', animationFinishedHandler);
  animationFinishedHandler = null;
  const previousAction = animationAction;
  const nextAction = mixer.clipAction(clip);
  if (previousAction === nextAction) previousAction.stop();
  animationAction = nextAction;
  // full weight immediately: a fade frozen by procedural pause would leave the
  // authored pose at zero influence and expose the standing bind pose
  animationAction.reset()
    .setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
    .setEffectiveWeight(1);
  animationAction.clampWhenFinished = once;
  animationAction.play();
  if (previousAction && previousAction !== animationAction) {
    if (transition > 0) animationAction.crossFadeFrom(previousAction, transition, false);
    else previousAction.stop();
  }
  if (onFinished) {
    const completedAction = animationAction;
    animationFinishedHandler = (event) => {
      if (event.action !== completedAction) return;
      mixer.removeEventListener('finished', animationFinishedHandler);
      animationFinishedHandler = null;
      onFinished();
    };
    mixer.addEventListener('finished', animationFinishedHandler);
  }
  syncIdleMode();
  updateRendererCMotionButtons(clip.name);
}

function updateRendererCMotionButtons(activeName = animationAction?.getClip?.()?.name || null) {
  const buttons = document.querySelectorAll('[data-renderer-c-motion]');
  const available = new Set(animationClips.map((clip) => clip.name));
  const supported = renderStyle === 'rendererC' && !isFallback;
  for (const button of buttons) {
    const hasClip = available.has(button.dataset.rendererCMotion);
    button.hidden = !supported || !hasClip;
    button.disabled = !supported || !hasClip;
    button.classList.toggle('active', supported && hasClip && button.dataset.rendererCMotion === activeName);
    button.setAttribute('aria-pressed', String(supported && hasClip && button.dataset.rendererCMotion === activeName));
  }
}

function playRendererCMotion(name, { preservePelvis = null } = {}) {
  if (renderStyle !== 'rendererC' || isFallback) return;
  const clip = animationClips.find((item) => item.name === name);
  if (!clip) return;
  preset.values.idleMode = 'clip+procedural';
  syncControlValue('idleMode', preset.values.idleMode);
  motionEnabled = true;
  document.querySelector('#toggle-motion')?.classList.add('active');
  const motion = RENDERER_C_MOTIONS[name] || { seated: false, label: `Renderer C · ${name}` };
  if (name !== 'Walk') rendererCKeyboardWalking = false;
  preset.values.seated = motion.seated ? 1 : 0;
  syncControlValue('seated', preset.values.seated);
  const select = document.querySelector('#animation-select');
  if (select) select.value = name;
  playClip(clip, {
    once: Boolean(motion.next),
    transition: preservePelvis ? 0 : 0.18,
    onFinished: motion.next ? () => {
      const pelvisPosition = bones?.pelvis?.getWorldPosition(new THREE.Vector3()) || null;
      playRendererCMotion(motion.next, { preservePelvis: pelvisPosition });
    } : null,
  });
  if (preservePelvis && bones?.pelvis) {
    mixer.update(0);
    model.updateMatrixWorld(true);
    const rigNode = model.getObjectByName('Patient_Rig');
    const currentPelvis = bones.pelvis.getWorldPosition(new THREE.Vector3());
    if (rigNode?.parent) {
      const targetLocal = rigNode.parent.worldToLocal(preservePelvis.clone());
      const currentLocal = rigNode.parent.worldToLocal(currentPelvis.clone());
      rigNode.position.add(targetLocal.sub(currentLocal));
      model.updateMatrixWorld(true);
    }
  }
  if (costume && rendererCCohort === 'women' && [
    'ClinicIdle', 'SittingTalking', 'SittingTalkingLegsCrossed',
    'SittingDejected', 'SittingKneeStrike', 'StandingIdle',
  ].includes(name)) {
    // Fit again only at stable endpoints. Rebuilding during the transition
    // would bake an arbitrary in-between frame into the dress form.
    model.updateMatrixWorld(true);
    rebuildCostumeNow({ preserveCurrentPose: true });
  }
  if (costume && rendererCCohort === 'women') updateRendererCWomenWardrobe(preset.values);
  setView('full');
  ui.status.textContent = motion.label;
  ui.status.className = 'status ok';
  updateRendererCMotionButtons(name);
  updateText();
}

function isEditableTarget(target) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable;
}

function rendererCStandingForMovement() {
  if (renderStyle !== 'rendererC' || isFallback || preset.values.seated >= 0.5) return false;
  const clipName = animationAction?.getClip?.()?.name;
  return !['StandUp', 'SitDown', 'RiseFromFloor'].includes(clipName);
}

function rendererCPreservePelvis() {
  return bones?.pelvis?.getWorldPosition(new THREE.Vector3()) || null;
}

function stopRendererCKeyboardWalk() {
  if (!rendererCKeyboardWalking) return;
  rendererCKeyboardWalking = false;
  if (rendererCStandingForMovement()) {
    playRendererCMotion('StandingIdle', { preservePelvis: rendererCPreservePelvis() });
  }
}

function updateRendererCLocomotion(delta) {
  const forwardInput = Number(rendererCMoveKeys.has('KeyW') || rendererCMoveKeys.has('ArrowUp'))
    - Number(rendererCMoveKeys.has('KeyS') || rendererCMoveKeys.has('ArrowDown'));
  const rightInput = Number(rendererCMoveKeys.has('KeyD') || rendererCMoveKeys.has('ArrowRight'))
    - Number(rendererCMoveKeys.has('KeyA') || rendererCMoveKeys.has('ArrowLeft'));
  if (!forwardInput && !rightInput) {
    stopRendererCKeyboardWalk();
    return;
  }
  if (!rendererCStandingForMovement()) return;

  if (!rendererCKeyboardWalking) {
    playRendererCMotion('Walk', { preservePelvis: rendererCPreservePelvis() });
    rendererCKeyboardWalking = true;
  }

  camera.getWorldDirection(rendererCCameraForward);
  rendererCCameraForward.y = 0;
  if (rendererCCameraForward.lengthSq() < 0.001) rendererCCameraForward.set(0, 0, -1);
  else rendererCCameraForward.normalize();
  rendererCCameraRight.crossVectors(rendererCCameraForward, rendererCUp).normalize();
  rendererCMoveDirection.copy(rendererCCameraForward).multiplyScalar(forwardInput)
    .addScaledVector(rendererCCameraRight, rightInput).normalize();

  const frameDelta = Math.min(delta, 1 / 15);
  const speed = rendererCMoveKeys.has('ShiftLeft') || rendererCMoveKeys.has('ShiftRight') ? 1.8 : 1.05;
  rendererCMoveStep.copy(rendererCMoveDirection).multiplyScalar(speed * frameDelta);
  const previousX = characterRoot.position.x;
  const previousZ = characterRoot.position.z;
  characterRoot.position.add(rendererCMoveStep);
  characterRoot.position.x = THREE.MathUtils.clamp(characterRoot.position.x, -4.5, 4.5);
  characterRoot.position.z = THREE.MathUtils.clamp(characterRoot.position.z, -4.5, 4.5);
  rendererCMoveStep.set(
    characterRoot.position.x - previousX,
    0,
    characterRoot.position.z - previousZ,
  );
  camera.position.add(rendererCMoveStep);
  orbit.target.add(rendererCMoveStep);

  // Renderer C faces local +Z. Ease toward the travel direction so turns do
  // not snap while the authored walk cycle continues to drive the skeleton.
  const targetYaw = Math.atan2(rendererCMoveDirection.x, rendererCMoveDirection.z);
  const yawDelta = Math.atan2(
    Math.sin(targetYaw - characterRoot.rotation.y),
    Math.cos(targetYaw - characterRoot.rotation.y),
  );
  characterRoot.rotation.y += yawDelta * (1 - Math.exp(-9 * frameDelta));
}

function applyRendererCStandingHandCorrection() {
  if (renderStyle !== 'rendererC' || !bones || !motionEnabled) return;
  const clipName = animationAction?.getClip?.()?.name;
  if (!['StandingIdle', 'Walk'].includes(clipName)) return;

  // The exact Mixamo rig preserves every finger track, but these two stock
  // standing clips hold the MPFB thumb too straight. A small post-animation
  // curl keeps the thumb and fingers relaxed without replacing wrist motion.
  for (const thumb of bones.thumbs || []) {
    const segment = Number(thumb.name.match(/Thumb(\d)/i)?.[1] || 1);
    thumb.rotateX([0, 0.10, 0.14, 0.08][segment] || 0.08);
  }
  for (const finger of bones.fingers || []) {
    const segment = Number(finger.name.match(/(?:Index|Middle|Ring|Pinky)(\d)/i)?.[1] || 1);
    finger.rotateX([0, 0.025, 0.04, 0.03][segment] || 0.025);
  }
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
  const eyeObjects = [named.get('Eyes'), ...objectsLike('RendererC_Eyes')].filter((object) => object?.isMesh);
  for (const eyes of eyeObjects) {
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
}

function rebuildCostumeNow({ preserveCurrentPose = false } = {}) {
  if (!costume || !idle) return;
  if (!preserveCurrentPose) idle.snapToRest();
  model.updateMatrixWorld(true);
  costume.rebuild(preset.values);
  if (renderStyle === 'rendererC' && rendererCCohort === 'women') updateRendererCWomenWardrobe(preset.values);
  lastCostumeBuild = performance.now();
  costumeDirty = false;
}

function stabilizeRendererCProductionSkirt() {
  const production = model?.getObjectByName?.('RendererC_VictorianDress');
  production?.traverse?.((object) => {
    if (!object.isSkinnedMesh) return;
    const hips = object.skeleton.bones.findIndex((bone) => bone.name.endsWith('Hips'));
    const joints = object.geometry.attributes.skinIndex;
    const weights = object.geometry.attributes.skinWeight;
    const position = object.geometry.attributes.position;
    if (hips < 0 || !joints || !weights || !position) return;
    for (let vertex = 0; vertex < joints.count; vertex += 1) {
      joints.setXYZW(vertex, hips, 0, 0, 0);
      weights.setXYZW(vertex, 1, 0, 0, 0);
      const fall = THREE.MathUtils.clamp((0.88 - position.getY(vertex)) / 0.88, 0, 1);
      const depthScale = 1 + 0.32 * (fall ** 1.3);
      position.setZ(vertex, position.getZ(vertex) * depthScale);
      for (const morph of object.geometry.morphAttributes.position || []) {
        morph.setZ(vertex, morph.getZ(vertex) * depthScale);
        morph.needsUpdate = true;
      }
    }
    joints.needsUpdate = true;
    weights.needsUpdate = true;
    position.needsUpdate = true;
  });
}

function updateRendererCWomenWardrobe(values) {
  if (rendererCCohort !== 'women') return;
  const mode = values.womenGarmentMode || 'production-dress';
  const activeClip = animationAction?.getClip?.()?.name;
  const fittedSeated = new Set([
    'ClinicIdle', 'SittingTalking', 'SittingTalkingLegsCrossed', 'SittingDejected', 'SittingKneeStrike',
  ]).has(activeClip);
  const useFittedSource = mode === 'production-dress' && fittedSeated;
  const production = model?.getObjectByName?.('RendererC_VictorianDress');
  const details = model?.getObjectByName?.('RendererC_VictorianDetails');
  const fitSource = model?.getObjectByName?.('RendererC_VictorianDressFitSource');
  const carrier = model?.getObjectByName?.('RendererC_BaseGarment');
  const shoes = model?.getObjectByName?.('RendererC_Shoes');
  if (production) production.visible = mode === 'production-dress' && !useFittedSource;
  if (details) {
    details.visible = mode === 'production-dress' && !useFittedSource;
    details.traverse?.((object) => {
      if (!object.isMesh) return;
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
      object.visible = mode === 'production-dress' && !useFittedSource
        && materials.some((material) => material.name.includes('Trim'));
    });
  }
  if (fitSource) fitSource.visible = useFittedSource;
  if (shoes) shoes.visible = mode !== 'production-dress';
  // The fitted carrier supplies long sleeves beneath the period overdress and
  // remains available as the isolated carrier comparison.
  if (carrier) carrier.visible = true;
  for (const { mesh } of costume?.pieces?.() || []) {
    mesh.visible = mode === 'concept-shell';
  }
}

function updateRendererCAppearance(values) {
  const skinTint = new THREE.Color('#ffffff').lerp(new THREE.Color(values.skinTone), 0.22);
  const body = named.get('Human_Body');
  if (body?.isMesh) {
    const bodyMaterials = Array.isArray(body.material) ? body.material : [body.material];
    for (const mat of bodyMaterials) {
      mat.color?.copy(skinTint);
      setSurfaceFinish(mat, values.skinRoughness, 0.9);
      mat.needsUpdate = true;
    }
  }
  setEyeColor(values.eyeColor);
  setMaterialLike('RendererC_Eyes', '#d9cec3', 0.42);
  setMaterialLike('RendererC_Hair', values.hairColor, 0.88);
  setMaterialLike('RendererC_Brows', values.browColor || values.hairColor, 0.9);
  setMaterialLike('RendererC_Lashes', values.lashColor || '#17100c', 0.92);
  if (costume && rendererCCohort === 'men') costume.updateMaterials?.(values);
  else if (costume && rendererCCohort === 'women') {
    costume.materials.dress.color.set(values.dressColor);
    setSurfaceFinish(costume.materials.dress, values.fabricRoughness, 1);
    costume.materials.trim.color.set(values.trimColor);
    costume.updateHair(values);
    setMaterialLike('RendererC_BaseGarment', values.dressColor, values.fabricRoughness, 1);
    const productionRoots = [
      model?.getObjectByName?.('RendererC_VictorianDress'),
      model?.getObjectByName?.('RendererC_VictorianDetails'),
      model?.getObjectByName?.('RendererC_VictorianDressFitSource'),
    ].filter(Boolean);
    const productionMaterials = [];
    for (const root of productionRoots) {
      root.traverse?.((object) => {
        if (!object.isMesh) return;
        productionMaterials.push(...(Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean));
      });
    }
    for (const material of productionMaterials) {
      const trim = material.name.includes('Trim');
      material.color?.set(trim ? values.trimColor : values.dressColor);
      material.side = THREE.DoubleSide;
      setSurfaceFinish(material, trim ? Math.max(0.45, values.fabricRoughness * 0.84) : values.fabricRoughness, 1);
      material.needsUpdate = true;
    }
    updateRendererCWomenWardrobe(values);
  }
  else setMaterialLike('RendererC_BaseGarment', values.dressColor, values.fabricRoughness, 1);
  setMaterialLike('RendererC_Shoes', '#211713', 0.82);
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
    } else if (renderStyle === 'rendererC') {
      const identityControl = initial || RENDERER_C_LIVE_IDS.has(changedId) || changedId === 'rendererCAnchor';
      const identityChanged = identityControl
        ? (rendererCController?.applyValues(v, { force: initial || changedId === 'rendererCAnchor' }) || false)
        : false;
      if (initial || identityControl || SKIN_APPEARANCE_IDS.has(changedId)
        || ['hairColor', 'browColor', 'lashColor'].includes(changedId)
        || (rendererCCohort === 'men' && RENDERER_C_MENSWEAR_MATERIAL_IDS.has(changedId))
        || (rendererCCohort === 'women' && (COSTUME_MATERIAL_IDS.has(changedId)
          || RENDERER_C_WOMEN_WARDROBE_IDS.has(changedId)))) {
        updateRendererCAppearance(v);
      }
      if (costume && final && (identityChanged
        || (rendererCCohort === 'men' && RENDERER_C_MENSWEAR_GEOMETRY_IDS.has(changedId))
        || (rendererCCohort === 'women' && COSTUME_GEOMETRY_IDS.has(changedId)))) costumeDirty = true;
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
    if (renderStyle === 'rendererC' && rendererCCohort === 'men' && ['dressColor', 'trimColor'].includes(definition.id)) {
      preset.values.menswearPalette = 'custom';
      syncControlValue('menswearPalette', 'custom');
    }
    if (renderStyle === 'rendererC' && rendererCCohort === 'men' && definition.id === 'outfitStyle') {
      const palette = {
        'mens-working-clothes': 'work-earth', 'mens-sack-suit': 'trade-charcoal',
        'mens-formal-suit': 'formal-black-grey', 'mens-mourning-suit': 'mourning',
      }[preset.values.outfitStyle];
      if (palette) {
        preset.values.menswearPalette = palette;
        syncControlValue('menswearPalette', palette);
      }
    }
    output.textContent = formatValue(definition, input.value);
    if (HERITAGE_IDS.includes(definition.id)) normalizeHeritageWeights(definition.id);
    const appliesLive = controlAppliesLive(definition);
    if (!appliesLive) markRegenerationNeeded();
    // MHR identity changes are expensive enough to miss a frame, but pointer
    // events can arrive far faster than frames. Keep only the latest value and
    // never queue a backlog. The final change event commits one hair/costume
    // refit after dragging stops.
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
    ui.status.textContent = renderStyle === 'mhr'
      ? 'Meta MHR updated live · Renderer A rebuild pending'
      : renderStyle === 'rendererC'
        ? 'This discrete Renderer C asset change needs a later asset-bank build'
        : 'Identity changes waiting for Blender';
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
  const live = definitions.filter(controlAppliesLive).length;
  const baked = definitions.length - live;
  const expressionMode = expressions?.mode === 'mpfb-faceunits'
    ? `MPFB named · ${expressions.availableUnits.length}`
    : expressions?.mode === 'mhr-semantic' ? `MHR semantic · ${expressions.availableUnits.length} signed components` : 'baked / unavailable';
  const rendererCState = renderStyle === 'rendererC'
    ? `<dt>Identity anchor</dt><dd>${rendererCController?.anchors[rendererCController.activeAnchor]?.label || 'neutral'}</dd><dt>Cohort master</dt><dd>${rendererCCohort}</dd>`
    : '';
  ui.pipeline.innerHTML = `<dt>Tunable values</dt><dd>${definitions.length}</dd><dt>Live controls</dt><dd>${live}</dd><dt>Blender controls</dt><dd>${baked}</dd><dt>Renderer</dt><dd>${RENDERER_MODES[renderStyle].label}</dd>${rendererCState}<dt>Facial driver</dt><dd>${expressionMode}</dd><dt>Regeneration</dt><dd>${regenerationNeeded ? 'needed' : 'current'}</dd><dt>Patient seed</dt><dd>${preset.patient?.seed ?? 'legacy'}</dd><dt>Appearance seed</dt><dd>${preset.values.seed}</dd><dt>Face signature</dt><dd>${preset.patient?.appearance?.faceSignatureSeed ?? 'neutral'}</dd><dt>Target runtime</dt><dd>Three.js / GLB</dd>`;
}

function populateRendererCCriteria() {
  const fill = (select, entries) => {
    select.replaceChildren(...Object.entries(entries).map(([value, definition]) => new Option(definition.label, value)));
  };
  fill(ui.rendererCCohort, RENDERER_C_COHORTS);
  fill(ui.rendererCAge, RENDERER_C_AGE_BANDS);
  fill(ui.rendererCAncestry, RENDERER_C_ANCESTRIES);
  ui.rendererCCohort.value = rendererCCohort;
  ui.rendererCAge.value = preset.rendererC?.ageBand || '30s';
  ui.rendererCAncestry.value = preset.rendererC?.ancestry || 'european';
  ui.rendererCSeed.value = preset.rendererC?.gridSeed || preset.values.seed || 1896;
}

function createRendererCGridCards(candidates) {
  ui.rendererCGrid.replaceChildren();
  return candidates.map((candidate) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'renderer-c-card';
    button.title = `Use ${candidate.label} as the live identity anchor`;
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 240;
    const label = document.createElement('span');
    label.textContent = `${candidate.number}. ${candidate.label}`;
    button.append(canvas, label);
    button.onclick = () => selectRendererCCandidate(candidate, button);
    ui.rendererCGrid.append(button);
    return { button, canvas };
  });
}

function drawRenderTarget(canvas, pixels, width, height) {
  const flipped = new Uint8ClampedArray(pixels.length);
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    flipped.set(pixels.subarray((height - y - 1) * stride, (height - y) * stride), y * stride);
  }
  canvas.getContext('2d').putImageData(new ImageData(flipped, width, height), 0, 0);
}

async function captureRendererCCandidates(cards, candidates) {
  if (!rendererCController || !bones?.head) return;
  const width = cards[0]?.canvas.width || 200;
  const height = cards[0]?.canvas.height || 240;
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const pixels = new Uint8Array(width * height * 4);
  const savedValues = structuredClone(preset.values);
  const savedCameraPosition = camera.position.clone();
  const savedOrbitTarget = orbit.target.clone();
  const savedFov = camera.fov;
  const savedAspect = camera.aspect;
  const savedRenderTarget = renderer.getRenderTarget();
  const savedRestingFace = preset.patient?.appearance?.restingFace || {};
  expressions?.setRestingFace?.({});
  try {
    camera.fov = 27;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (let index = 0; index < candidates.length; index += 1) {
      Object.assign(preset.values, candidates[index].values);
      rendererCController.applyValues(preset.values, { force: true });
      updateRendererCAppearance(preset.values);
      model.updateMatrixWorld(true);
      const head = bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.025, 0));
      orbit.target.copy(head);
      camera.position.copy(head).add(new THREE.Vector3(0.025, 0.025, 0.64));
      camera.lookAt(head);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      drawRenderTarget(cards[index].canvas, pixels, width, height);
      ui.rendererCGridStatus.textContent = `Rendering face ${index + 1} of ${candidates.length}…`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    preset.values = savedValues;
    rendererCController.applyValues(preset.values, { force: true });
    updateRendererCAppearance(preset.values);
    expressions?.setRestingFace?.(savedRestingFace);
    camera.position.copy(savedCameraPosition);
    orbit.target.copy(savedOrbitTarget);
    camera.fov = savedFov;
    camera.aspect = savedAspect;
    camera.updateProjectionMatrix();
    renderer.setRenderTarget(savedRenderTarget);
    target.dispose();
    orbit.update();
  }
}

function selectRendererCCandidate(candidate, button) {
  if (renderStyle !== 'rendererC' || rendererCGridBusy) return;
  applyRendererCCandidate(preset, candidate);
  preset.rendererC.gridSeed = Number(ui.rendererCSeed.value) || 1896;
  rendererCCohort = candidate.cohort;
  document.querySelectorAll('.renderer-c-card').forEach((card) => card.classList.toggle('selected', card === button));
  refreshControls(true);
  setView('portrait');
  ui.rendererCGridStatus.textContent = `${candidate.label} selected · anatomy sliders now tune this face live`;
  ui.status.textContent = `Renderer C identity ${candidate.number} selected · no Blender rebuild needed`;
  ui.status.className = 'status ok';
}

async function generateRendererCGrid() {
  if (rendererCGridBusy) return;
  rendererCGridBusy = true;
  ui.rendererCGenerate.disabled = true;
  ui.rendererCGridStatus.textContent = 'Preparing eight identities…';
  try {
    const requestedCohort = ui.rendererCCohort.value;
    if (requestedCohort !== rendererCCohort) {
      rendererCCohort = requestedCohort;
      preset.values.gender = RENDERER_C_COHORTS[rendererCCohort].gender;
      preset.values.rendererCAnchor = 0;
      const mensStyle = String(preset.values.outfitStyle || '').startsWith('mens-');
      if (rendererCCohort === 'women' && mensStyle) preset.values.outfitStyle = 'conservative-day';
      await loadCharacter();
      updateControlModes();
    }
    const cohortManifest = rendererCManifest.cohorts[rendererCCohort];
    rendererCCandidates = generateRendererCCandidates({
      cohort: rendererCCohort,
      ageBand: ui.rendererCAge.value,
      ancestry: ui.rendererCAncestry.value,
      seed: Number(ui.rendererCSeed.value) || 1896,
      count: 8,
      manifest: cohortManifest,
    });
    const cards = createRendererCGridCards(rendererCCandidates);
    await captureRendererCCandidates(cards, rendererCCandidates);
    if (rendererCCandidates[0]) {
      applyRendererCCandidate(preset, rendererCCandidates[0]);
      preset.rendererC.gridSeed = Number(ui.rendererCSeed.value) || 1896;
      cards[0].button.classList.add('selected');
      refreshControls(true);
    }
    ui.rendererCGridStatus.textContent = 'Eight deterministic identities ready · select one to tune';
  } catch (error) {
    ui.rendererCGridStatus.textContent = `Could not render identity grid: ${error.message}`;
  } finally {
    rendererCGridBusy = false;
    ui.rendererCGenerate.disabled = false;
  }
}

async function openRendererCDressStudy() {
  if (renderStyle !== 'rendererC' || rendererCCohort !== 'women' || rendererCGridBusy) return;
  Object.assign(preset.values, {
    outfitStyle: 'fashionable-1896',
    womenGarmentMode: 'production-dress',
    dressColor: '#4b263b',
    trimColor: '#c2a56f',
    skirtFullness: 1.12,
    sleeveVolume: 1.04,
  });
  refreshControls(true);
  setView('full');
  ui.status.textContent = 'Renderer C · production 1896 dress proof';
  ui.status.className = 'status ok';
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
  } else if (name === 'hands' && bones?.handL && bones?.handR) {
    const left = bones.handL.getWorldPosition(new THREE.Vector3());
    const right = bones.handR.getWorldPosition(new THREE.Vector3());
    const target = left.add(right).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.025, 0));
    orbit.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(0.70, 0.32, 1.20));
  } else if (name === 'full' && bones?.head && bones?.pelvis) {
    const head = bones.head.getWorldPosition(new THREE.Vector3());
    const pelvis = bones.pelvis.getWorldPosition(new THREE.Vector3());
    const activeClip = animationAction?.getClip?.()?.name;
    const anticipateStanding = renderStyle === 'rendererC'
      && ['StandUp', 'StandingIdle', 'Walk', 'RiseFromFloor'].includes(activeClip);
    const target = pelvis.clone().lerp(head, 0.48)
      .add(new THREE.Vector3(0, anticipateStanding ? 0.16 : -0.06, 0));
    orbit.target.copy(target);
    camera.position.copy(target).add(anticipateStanding
      ? new THREE.Vector3(1.92, 0.54, 3.08)
      : new THREE.Vector3(1.72, 0.48, 2.75));
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
  if (renderStyle === 'rendererC') {
    setView('portrait');
    await generateRendererCGrid();
  }
  renderSwitchBusy = false;
  updateRenderToggle();
  updateText();
}

populateRendererCCriteria();
makeClinic(); buildControls(); updateRenderToggle(); await loadCharacter(); updateText();
setView(renderStyle === 'rendererC' ? 'portrait' : 'clinic');
if (renderStyle === 'rendererC') await generateRendererCGrid();
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
document.querySelectorAll('[data-renderer-c-motion]').forEach((button) => {
  button.onclick = () => playRendererCMotion(button.dataset.rendererCMotion);
});
document.querySelectorAll('[data-gesture]').forEach((button) => button.onclick = () => idle?.playGesture(button.dataset.gesture, preset.values.gestureSpeed || 1));
document.querySelectorAll('[data-expression]').forEach((button) => button.onclick = () => { clearFaceUnitDebug(); expressions?.play(button.dataset.expression, preset.values.gestureSpeed || 1); });
ui.faceUnitSelect.onchange = applyFaceUnitDebug;
ui.faceUnitValue.oninput = applyFaceUnitDebug;
ui.faceUnitReset.onclick = clearFaceUnitDebug;
ui.faceUnitSurprise.onclick = surpriseFace;
ui.rendererCGenerate.onclick = generateRendererCGrid;
ui.dressStudy.onclick = openRendererCDressStudy;
ui.canvas.ondblclick = () => setView('clinic');
ui.search.oninput = () => { const term = ui.search.value.toLowerCase(); document.querySelectorAll('.control').forEach((row) => row.hidden = !row.dataset.search.includes(term)); document.querySelectorAll('.control-group').forEach((group) => { const rendererMismatch = group.dataset.renderer && group.dataset.renderer !== renderStyle; group.hidden = rendererMismatch || ![...group.querySelectorAll('.control')].some((row) => !row.hidden); }); };
window.addEventListener('keydown', (event) => {
  if (!RENDERER_C_MOVEMENT_KEYS.has(event.code) && !['ShiftLeft', 'ShiftRight'].includes(event.code)) return;
  if (isEditableTarget(event.target) || renderStyle !== 'rendererC') return;
  rendererCMoveKeys.add(event.code);
  if (RENDERER_C_MOVEMENT_KEYS.has(event.code) && rendererCStandingForMovement()) event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  rendererCMoveKeys.delete(event.code);
});
window.addEventListener('blur', () => {
  rendererCMoveKeys.clear();
});

/* console access for calibration and debugging */
window.__lab = {
  scene,
  get bones() { return bones; },
  get model() { return model; },
  get preset() { return preset; },
  get idle() { return idle; },
  get costume() { return costume; },
  get facialDetails() { return mhrFacialDetails; },
  get expressions() { return expressions; },
  get rendererC() { return rendererCController; },
  get animationAction() { return animationAction; },
  get rendererCCandidates() { return rendererCCandidates; },
  get rendererCKeyboardWalking() { return rendererCKeyboardWalking; },
  get rendererCMoveKeys() { return new Set(rendererCMoveKeys); },
  get characterRoot() { return characterRoot; },
  get renderStyle() { return renderStyle; },
  THREE, applyAll, rebuildCostumeNow, generateRendererCGrid, toggleRenderStyle,
};

const clock = new THREE.Clock();
function frame() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (costumeDirty && !mhrController?.isPoseTransitioning && performance.now() - lastCostumeBuild > 90) {
    rebuildCostumeNow({ preserveCurrentPose: renderStyle === 'rendererC' && rendererCCohort === 'women' });
  }
  if (!isFallback) {
    const mode = preset.values.idleMode || 'procedural';
    const activeClip = animationAction?.getClip?.()?.name;
    const movementRate = renderStyle === 'rendererC' && activeClip
      ? 1
      : 0.72 + Math.min(preset.values.breathing, 1.2) * 0.9;
    if (motionEnabled && mixer) {
      mixer.update(mode === 'procedural' ? 0 : delta * movementRate);
    }
    if (renderStyle === 'rendererC') {
      updateRendererCLocomotion(delta);
      applyRendererCStandingHandCorrection();
    }
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
    } else if (motionEnabled && idle && (renderStyle !== 'rendererC' || mode === 'procedural')) {
      // Renderer C's Mixamo clips include authored fingers, wrists and gaze.
      // The generic idle layer would overwrite those bones after every mixer
      // update, which is the source of the previously splayed, janky hands.
      idle.update(delta, elapsed, preset.values, mode);
    }
  }
  if (expressions && !isFallback) expressions.update(delta, elapsed, preset.values);
  if (mhrFacialDetails && renderStyle === 'mhr') mhrFacialDetails.update(preset.values);
  orbit.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() { const width = ui.canvas.clientWidth; const height = ui.canvas.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(ui.canvas); resize(); frame();

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { findBones, createCostume } from './costume.js';
import { createIdle } from './idle.js';
import { createExpressions, createMhrExpressions } from './expressions.js';
import { FACE_QA_STATES } from '../../shared/characters/facePerformance.js';
import { createMhrFacialDetails } from './facial-details.js';
import {
  createMhrController, createMhrEyeDetails, MHR_IDENTITY_IDS, MHR_LIVE_IDENTITY_IDS, MHR_RIG_IDS,
} from './mhr.js';
import {
  applyRendererCAppearance, applyRendererCCandidate, createRendererCController, generateRendererCCandidates,
  RENDERER_C_AGE_BANDS, RENDERER_C_ANCESTRIES, RENDERER_C_COHORTS, RENDERER_C_LIVE_IDS,
  rendererCWomenPalette, RENDERER_C_WOMEN_WARDROBE_IDS, setRendererCWomenWardrobeVisible,
} from './renderer-c.js';
import {
  rendererCAgeBandForPatient,
  rendererCAncestryForValues,
  rendererCCohortForPatient,
} from '../../shared/characters/rendererCRecipe.js';
import { closestEyeColor, closestSkinTone } from '../../shared/characters/appearancePalettes.js';
import {
  AGE_APPEARANCE_VALUE_IDS,
  deriveAgeAppearance,
  rendererCAgeValueToYears,
} from '../../shared/characters/ageAppearance.js';
import {
  createRendererCMenswear, RENDERER_C_MENSWEAR_GEOMETRY_IDS, RENDERER_C_MENSWEAR_MATERIAL_IDS,
} from './renderer-c-menswear.js';
import {
  activeWardrobeId, RENDERER_C_SOURCE_GARMENTS, wardrobeFor, wardrobePatch,
} from './wardrobe.js';
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
const missingAgeAppearanceIds = new Set(
  [...AGE_APPEARANCE_VALUE_IDS, 'greyPattern'].filter((id) => preset.values[id] == null),
);
for (const definition of definitions) if (preset.values[definition.id] == null) preset.values[definition.id] = structuredClone(definition.default);
const initialAgeAppearance = deriveAgeAppearance({
  ageYears: preset.patient?.identity?.age ?? rendererCAgeValueToYears(preset.values.age),
  seed: preset.patient?.appearance?.seed ?? preset.values.seed,
});
for (const id of missingAgeAppearanceIds) preset.values[id] = initialAgeAppearance[id];
normalizeAppearancePaletteValues(preset.values);
if (preset.values.rendererCAnchor == null) preset.values.rendererCAnchor = 0;
const ui = {
  canvas: document.querySelector('#stage'), controls: document.querySelector('#controls'), status: document.querySelector('#model-status'),
  json: document.querySelector('#preset-json'), summary: document.querySelector('#subject-summary'), subjectName: document.querySelector('#subject-name'),
  patientRecord: document.querySelector('#patient-record'), patientSection: document.querySelector('#patient-record-section'), pipeline: document.querySelector('#pipeline-state'),
  command: document.querySelector('#generate-command'), fallback: document.querySelector('#fallback'), search: document.querySelector('#control-search'),
  regenerate: document.querySelector('#regenerate'), randomize: document.querySelector('#randomize'), newPatient: document.querySelector('#new-patient'),
  renderToggle: document.querySelector('#render-toggle'),
  advancedToggle: document.querySelector('#advanced-toggle'), taskTabs: [...document.querySelectorAll('[data-lab-task]')],
  poseToggle: document.querySelector('#pose-toggle'),
  expressionDriver: document.querySelector('#expression-driver'), faceUnitSelect: document.querySelector('#face-unit-select'),
  faceUnitValue: document.querySelector('#face-unit-value'), faceUnitOutput: document.querySelector('#face-unit-output'), faceUnitReset: document.querySelector('#face-unit-reset'),
  faceUnitSurprise: document.querySelector('#face-unit-surprise'),
  faceQaStatus: document.querySelector('#face-qa-status'),
  rendererCPanel: document.querySelector('#renderer-c-lab'), rendererCCohort: document.querySelector('#renderer-c-cohort'),
  rendererCAge: document.querySelector('#renderer-c-age'), rendererCAncestry: document.querySelector('#renderer-c-ancestry'),
  rendererCSeed: document.querySelector('#renderer-c-seed'), rendererCGenerate: document.querySelector('#renderer-c-generate'),
  rendererCUnlock: document.querySelector('#renderer-c-unlock'), rendererCLockStatus: document.querySelector('#renderer-c-lock-status'),
  rendererCGrid: document.querySelector('#renderer-c-grid'), rendererCGridStatus: document.querySelector('#renderer-c-grid-status'),
  wardrobePanel: document.querySelector('#renderer-c-wardrobe'), wardrobeList: document.querySelector('#wardrobe-list'),
  wardrobeSourceList: document.querySelector('#wardrobe-source-list'),
  assetExaminer: document.querySelector('#asset-examiner'), assetExaminerList: document.querySelector('#asset-examiner-list'),
  assetExaminerCount: document.querySelector('#asset-examiner-count'), assetExaminerKind: document.querySelector('#asset-examiner-kind'),
  assetExaminerName: document.querySelector('#asset-examiner-name'), assetExaminerNote: document.querySelector('#asset-examiner-note'),
  assetExaminerSource: document.querySelector('#asset-examiner-source'), assetExaminerClose: document.querySelector('#asset-examiner-close'),
  assetExaminerResetView: document.querySelector('#asset-examiner-reset-view'),
};

/* ids that require rebuilding costume geometry (vs material-only or animation values) */
const COSTUME_GEOMETRY_IDS = new Set(['bodiceFit', 'waistHeight', 'skirtFullness', 'skirtLength', 'skirtDrape',
  'bustleAmount', 'sleeveVolume', 'sleeveLength', 'collarHeight', 'collarSpread', 'buttonSpacing', 'buttonCount',
  'frontFlatness', 'hemPleatCount', 'hemPleatDepth', 'trainLength', 'frontPointDepth',
  'puffLength', 'sleeveTaper', 'gatherDepth',
  'hemTrimRows', 'hemRuffle', 'seamLines', 'trimWidth', 'placketWidth',
  'cuffWidth', 'collarThickness', 'cuffThickness',
  'waistTaper', 'bustCurve', 'hipSpring', 'necklineHeight',
  'outfitStyle', 'hairStyle', 'hairVolume', 'partWidth', 'bunSize', 'hairHeight', 'sideVolume',
  'hairlineHeight', 'templeRecession', 'wispAmount', 'waveAmount', 'flowSweep']);
const HERITAGE_IDS = ['african', 'asian', 'caucasian'];
const SKIN_APPEARANCE_IDS = new Set([
  'skinTone', 'skinRoughness', 'eyeColor',
  ...definitions.filter((definition) => definition.group === 'stylized' && definition.id !== 'stylizedLightSoftness')
    .map((definition) => definition.id),
]);
const RENDERER_C_SURFACE_IDS = new Set([
  'skinTone', 'skinRoughness', 'eyeColor', 'greyPattern',
  ...AGE_APPEARANCE_VALUE_IDS,
]);
const COMPARISON_MATERIAL_IDS = new Set(['skinTone', 'skinRoughness']);
const COSTUME_MATERIAL_IDS = new Set([
  'dressColor', 'secondaryColor', 'trimColor', 'fabricType', 'fabricScale', 'fabricRelief', 'fabricSheen',
  'fabricRoughness', 'necklineHeight', 'cuffWidth', 'trimWidth', 'placketWidth', 'womenPalette',
  'dressDetailPattern', 'dressDetailAmount', 'dressDetailScale', 'collarThickness', 'cuffThickness',
  'hairShade', 'hairColor', 'strandContrast', 'greyAmount',
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
const LAB_TASK_GROUPS = Object.freeze({
  cast: new Set(['identity', 'rendererCIdentity', 'heritage']),
  appearance: new Set(['face', 'hair', 'heritage', 'rendererCSurface']),
  wardrobe: new Set(['dress', 'rendererCMenswear']),
  performance: new Set(['pose', 'performance']),
  qa: new Set(['render']),
});
const BASIC_CONTROL_IDS = new Set([
  'seed', 'gender', 'age', 'height', 'weight', 'muscle', 'proportions', 'rendererCAnchor',
  'african', 'asian', 'caucasian', 'skinTone', 'skinRoughness', 'eyeColor',
  'ageGeometry', 'wrinkleAmount', 'skinTexture', 'pigmentVariation', 'freckleAmount',
  'ageSpotAmount', 'underEyeDarkness',
  'headWidth', 'faceHeight', 'noseWidth', 'noseLength', 'jawWidth', 'eyeSize', 'eyeSpacing',
  'mouthWidth', 'lipFullness', 'cheekVolume', 'hairStyle', 'hairColor', 'greyAmount', 'greyPattern',
  'womenGarmentMode', 'outfitStyle', 'womenPalette', 'fabricType', 'dressColor', 'secondaryColor',
  'trimColor', 'fabricScale', 'fabricRelief', 'fabricSheen', 'fabricRoughness', 'necklineHeight',
  'cuffWidth', 'trimWidth', 'placketWidth', 'dressDetailPattern', 'dressDetailAmount', 'dressDetailScale',
  'collarThickness', 'cuffThickness',
  'skirtFullness', 'skirtLength', 'frontFlatness', 'hemPleatCount', 'hemPleatDepth', 'trainLength',
  'bustleAmount', 'frontPointDepth', 'sleeveVolume', 'puffLength', 'sleeveTaper', 'gatherDepth',
  'swayAmount', 'swayStiffness', 'swayDamping', 'hemTrimRows', 'hemRuffle', 'seamLines',
  'waistTaper', 'bustCurve', 'hipSpring',
  'menswearPalette', 'fabricPattern', 'seated', 'posture', 'headTilt', 'headTurn',
  'idleMode', 'breathing', 'fidget', 'tremor', 'smile', 'sadness', 'fatigueExpression',
  'keyIntensity', 'fillIntensity', 'exposure', 'cameraFov',
]);
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
const assetPreviewRoot = new THREE.Group();
assetPreviewRoot.name = 'WardrobeAssetPreview';
assetPreviewRoot.visible = false;
world.add(assetPreviewRoot);
const objLoader = new OBJLoader();
const sourceGltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
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
let faceQaPerformanceValues = null;
let mhrController = null;
let mhrEyeDetails = null;
let mhrFacialDetails = null;
let rendererCController = null;
let rendererCCohort = rendererCCohortForPatient(preset.patient);
let rendererCCandidates = [];
let rendererCDemographicsLocked = true;
let activeLabTask = localStorage.getItem('characterLabTask') || 'cast';
let advancedControlsVisible = localStorage.getItem('characterLabAdvanced') === 'true';
let rendererCGridBusy = false;
let wardrobeSwitchBusy = false;
let assetExaminerOpen = false;
let assetExaminerBusy = false;
let assetExaminerFilter = 'all';
let assetExaminerSelected = null;
let assetExaminerLoadTicket = 0;
let assetExaminerSavedView = null;
let assetExaminerSavedMotion = true;
let assetPreviewObject = null;
let isFallback = false;
let costumeDirty = false;
let lastCostumeBuild = 0;
let regenerationNeeded = false;
let regenerationBusy = false;
let renderSwitchBusy = false;
let poseCostumeRebuildPending = false;
let poseWasTransitioning = false;
let rendererCRefitAt = 0;
let identityFitPending = false;
let pendingControlFrame = null;
let pendingControlId = null;
let pendingControlAppliesLive = false;
const RENDERER_MODES = Object.freeze({
  rendererC: Object.freeze({ label: 'Renderer C', kind: 'rendererC' }),
});
const RENDERER_ORDER = Object.keys(RENDERER_MODES);
let renderStyle = 'rendererC';
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
  const hemi = new THREE.HemisphereLight('#c6d2de', '#6a4933', 1.1); hemi.name = 'FillLight'; scene.add(hemi);
  const key = new THREE.SpotLight('#f4d7b0', 22, 9, Math.PI * 0.44, 0.985, 1.15);
  key.name = 'KeyLight'; key.position.set(-1.65, 2.75, 2.45); key.target.position.set(0, 1.32, 0); key.castShadow = true;
  // A broad key and normal offset preserve facial planes without turning eye
  // sockets and wrinkles into hard black shapes.
  key.shadow.bias = -0.00008; key.shadow.normalBias = 0.022; key.shadow.radius = 5;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 0.35; key.shadow.camera.far = 8;
  scene.add(key, key.target);
  const faceFill = new THREE.SpotLight('#dce6ee', 9, 7, Math.PI * 0.49, 0.995, 1.2);
  faceFill.name = 'ComparisonFaceFill'; faceFill.position.set(1.15, 1.95, 3.15); faceFill.target.position.set(0, 1.38, 0); faceFill.visible = false; scene.add(faceFill, faceFill.target);
  const rim = new THREE.DirectionalLight('#9fb3c5', 0.55);
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
  document.querySelectorAll('[data-face-qa]').forEach((button) => {
    button.disabled = expressions?.mode !== 'mpfb-faceunits';
  });
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
  faceQaPerformanceValues = null;
  expressions?.setRestingFace?.(preset.patient?.appearance?.restingFace || {});
  if (ui.faceQaStatus) ui.faceQaStatus.textContent = 'Patient resting face';
}

function applyFaceQaState(id) {
  if (expressions?.mode !== 'mpfb-faceunits') return;
  if (id === 'preset') {
    clearFaceUnitDebug();
    applyPresetRestingFace();
    return;
  }
  const state = FACE_QA_STATES.find((candidate) => candidate.id === id);
  if (!state) return;
  clearFaceUnitDebug();
  faceQaPerformanceValues = {
    ...preset.values,
    smile: 0,
    sadness: 0,
    fatigueExpression: 0,
  };
  expressions.setRestingFace(state.weights);
  setView('portrait');
  if (ui.faceQaStatus) ui.faceQaStatus.textContent = `${state.label} · fixed close-up review state`;
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
  ui.renderToggle.textContent = 'Renderer C';
  ui.renderToggle.classList.add('active');
  ui.renderToggle.disabled = true;
}

function rendererCControlAppliesLive(definition) {
  if (RENDERER_C_LIVE_IDS.has(definition.id)) return true;
  if (rendererCCohort === 'men'
    && (RENDERER_C_MENSWEAR_GEOMETRY_IDS.has(definition.id) || RENDERER_C_MENSWEAR_MATERIAL_IDS.has(definition.id))) return true;
  if (rendererCCohort === 'women'
    && (COSTUME_GEOMETRY_IDS.has(definition.id) || COSTUME_MATERIAL_IDS.has(definition.id)
      || RENDERER_C_WOMEN_WARDROBE_IDS.has(definition.id))) return true;
  if (RENDERER_C_SURFACE_IDS.has(definition.id) || LIGHTING_IDS.has(definition.id)) return true;
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
  for (const definition of definitions) {
    const row = document.querySelector(`.control[data-id="${definition.id}"]`);
    if (!row) continue;
    const mhrLive = renderStyle === 'mhr' && (MHR_LIVE_IDENTITY_IDS.has(definition.id) || definition.id === 'seated');
    const rendererCLive = renderStyle === 'rendererC' && rendererCControlAppliesLive(definition);
    const live = controlAppliesLive(definition);
    row.classList.toggle('live', live);
    row.classList.toggle('bake', !live);
    row.title = (mhrLive || rendererCLive) && definition.mode === 'bake'
      ? 'Live in Renderer C'
      : renderStyle === 'rendererC' && definition.mode === 'live' && !rendererCLive
        ? 'Renderer C needs an asset swap or Blender rebuild for this control'
        : '';
  }
  updateLabWorkspaceVisibility();
  renderWardrobePanel();
  updateRendererCMotionButtons();
}

function savedGroupState() {
  try { return JSON.parse(localStorage.getItem('characterLabGroups') || '{}'); }
  catch { return {}; }
}

function updateLabWorkspaceVisibility() {
  const term = (ui.search?.value || '').trim().toLowerCase();
  const allowedGroups = LAB_TASK_GROUPS[activeLabTask] || LAB_TASK_GROUPS.cast;
  document.querySelectorAll('.control').forEach((row) => {
    const advancedHidden = !advancedControlsVisible && row.classList.contains('advanced-control');
    const searchHidden = term && !row.dataset.search.includes(term);
    row.hidden = Boolean(searchHidden || (!term && advancedHidden));
  });
  document.querySelectorAll('.control-group').forEach((group) => {
    const rendererMismatch = group.dataset.renderer && group.dataset.renderer !== renderStyle;
    const taskMismatch = !allowedGroups.has(group.dataset.group);
    const hasVisibleControl = [...group.querySelectorAll('.control')].some((row) => !row.hidden);
    group.hidden = rendererMismatch || taskMismatch || !hasVisibleControl;
  });
  document.querySelectorAll('[data-lab-panel]').forEach((panel) => {
    const tasks = panel.dataset.labPanel.split(/\s+/);
    panel.hidden = !tasks.includes('all') && !tasks.includes(activeLabTask);
  });
  ui.taskTabs.forEach((button) => {
    const selected = button.dataset.labTask === activeLabTask;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  if (ui.advancedToggle) {
    ui.advancedToggle.textContent = advancedControlsVisible ? 'Hide advanced' : 'Show advanced';
    ui.advancedToggle.setAttribute('aria-pressed', String(advancedControlsVisible));
  }
  const performanceBar = document.querySelector('.stage-perform');
  if (performanceBar) performanceBar.hidden = !['performance', 'qa'].includes(activeLabTask);
  document.body.dataset.labTask = activeLabTask;
}

function setLabTask(task) {
  if (!LAB_TASK_GROUPS[task]) return;
  activeLabTask = task;
  localStorage.setItem('characterLabTask', task);
  ui.search.value = '';
  updateLabWorkspaceVisibility();
  renderWardrobePanel();
}

function setAdvancedControls(visible) {
  advancedControlsVisible = Boolean(visible);
  localStorage.setItem('characterLabAdvanced', String(advancedControlsVisible));
  updateLabWorkspaceVisibility();
}

function updateWardrobeSelection() {
  const active = activeWardrobeId(rendererCCohort, preset.values);
  document.querySelectorAll('[data-wardrobe-id]').forEach((button) => {
    const selected = button.dataset.wardrobeId === active;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function renderWardrobePanel() {
  if (!ui.wardrobePanel || !ui.wardrobeList) return;
  if (activeLabTask !== 'wardrobe') return;

  document.querySelectorAll('[data-wardrobe-cohort]').forEach((button) => {
    const selected = button.dataset.wardrobeCohort === rendererCCohort;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = rendererCDemographicsLocked || wardrobeSwitchBusy || rendererCGridBusy;
  });

  ui.wardrobeList.replaceChildren();
  for (const item of wardrobeFor(rendererCCohort)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wardrobe-card';
    button.dataset.wardrobeId = item.id;
    button.disabled = wardrobeSwitchBusy;
    const heading = document.createElement('span');
    heading.className = 'wardrobe-card-heading';
    heading.textContent = item.label;
    const kind = document.createElement('span');
    kind.className = 'wardrobe-card-kind';
    kind.textContent = item.kind;
    const note = document.createElement('span');
    note.className = 'wardrobe-card-note';
    note.textContent = item.note;
    button.append(heading, kind, note);
    button.onclick = () => wearWardrobe(item.id);
    ui.wardrobeList.append(button);
  }

  if (ui.wardrobeSourceList) {
    ui.wardrobeSourceList.replaceChildren(...RENDERER_C_SOURCE_GARMENTS
      .filter((item) => item.cohort === rendererCCohort || item.cohort === 'all')
      .map((item) => {
        const row = document.createElement('li');
        row.textContent = `${item.label} · ${item.source}`;
        return row;
      }));
  }
  updateWardrobeSelection();
}

function normalizeRendererCWardrobe() {
  if (renderStyle !== 'rendererC') return;
  const wardrobe = wardrobeFor(rendererCCohort);
  const currentStyle = preset.values.outfitStyle;
  if (!wardrobe.some((item) => item.values.outfitStyle === currentStyle)) {
    Object.assign(preset.values, wardrobe[0].values);
  }
  preset.values.gender = RENDERER_C_COHORTS[rendererCCohort].gender;
  preset.rendererC = { ...(preset.rendererC || {}), cohort: rendererCCohort };
}

function assetExaminerAssets() {
  const wearable = ['women', 'men'].flatMap((cohort) => wardrobeFor(cohort).map((item) => ({
    ...item,
    key: `wearable:${cohort}:${item.id}`,
    cohort,
    type: 'wearable',
    source: 'Renderer C cohort master',
  })));
  const sources = RENDERER_C_SOURCE_GARMENTS.map((item) => ({
    ...item,
    key: `source:${item.id}`,
    type: 'source',
    kind: 'Source-only mesh',
    note: 'Movable geometry preview. This asset is not yet embedded, rigged or offered as wearable.',
  }));
  return [...wearable, ...sources];
}

function assetMatchesExaminerFilter(asset) {
  if (assetExaminerFilter === 'all') return true;
  if (assetExaminerFilter === 'source') return asset.type === 'source';
  return asset.cohort === assetExaminerFilter || asset.cohort === 'all';
}

function setAssetExaminerDetails(asset, overrideNote = null) {
  if (!asset) return;
  ui.assetExaminerKind.textContent = asset.type === 'wearable'
    ? `${asset.cohort} · wearable now`
    : `${asset.cohort === 'all' ? 'unisex' : asset.cohort} · source only`;
  ui.assetExaminerName.textContent = asset.label;
  ui.assetExaminerNote.textContent = overrideNote || asset.note;
  ui.assetExaminerSource.textContent = asset.type === 'source'
    ? `${asset.source} · ${asset.license}`
    : `${asset.kind} · Renderer C`;
}

function renderAssetExaminerList() {
  if (!ui.assetExaminerList) return;
  const all = assetExaminerAssets();
  const visible = all.filter(assetMatchesExaminerFilter);
  ui.assetExaminerCount.textContent = `${visible.length} of ${all.length} assets`;
  ui.assetExaminerList.replaceChildren();
  let previousGroup = '';
  for (const asset of visible) {
    const group = asset.type === 'source'
      ? 'Source-only meshes'
      : `${asset.cohort === 'women' ? 'Women' : 'Men'} · wearable now`;
    if (group !== previousGroup) {
      const heading = document.createElement('p');
      heading.className = 'asset-examiner-group';
      heading.textContent = group;
      ui.assetExaminerList.append(heading);
      previousGroup = group;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset-examiner-card';
    button.classList.toggle('selected', asset.key === assetExaminerSelected);
    button.disabled = assetExaminerBusy;
    const name = document.createElement('span');
    name.className = 'asset-examiner-card-name';
    name.textContent = asset.label;
    const badge = document.createElement('span');
    badge.className = 'asset-examiner-card-badge';
    badge.textContent = asset.type === 'wearable' ? asset.kind : 'source only';
    const source = document.createElement('span');
    source.className = 'asset-examiner-card-source';
    source.textContent = asset.type === 'wearable' ? asset.cohort : `${asset.source} · ${asset.license}`;
    button.append(name, badge, source);
    button.onclick = () => selectAssetExaminerAsset(asset);
    ui.assetExaminerList.append(button);
  }
}

function clearAssetPreview() {
  assetExaminerLoadTicket += 1;
  if (!assetPreviewObject) return;
  assetPreviewRoot.remove(assetPreviewObject);
  assetPreviewObject.traverse((object) => {
    object.geometry?.dispose?.();
    const materialList = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materialList) item?.dispose?.();
  });
  assetPreviewObject = null;
}

function setSourceAssetView() {
  if (!assetPreviewObject) return;
  const box = new THREE.Box3().setFromObject(assetPreviewObject);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const verticalFov = THREE.MathUtils.degToRad(34);
  // Leave generous room because the catalog occupies the right third of the
  // canvas and some MHCLO sources are offset far from their local origin.
  const distance = Math.max(2.2, sphere.radius / Math.sin(verticalFov / 2) * 3);
  const viewDirection = new THREE.Vector3(0.72, 0.26, 1).normalize();
  const target = center.clone().add(new THREE.Vector3(0, -size.y * 0.28, 0));
  orbit.target.copy(target);
  camera.position.copy(target).addScaledVector(viewDirection, distance);
  camera.fov = 34;
  camera.updateProjectionMatrix();
  orbit.update();
}

async function showSourceAsset(asset) {
  const ticket = assetExaminerLoadTicket + 1;
  clearAssetPreview();
  assetExaminerLoadTicket = ticket;
  characterRoot.visible = false;
  assetPreviewRoot.visible = true;
  const chair = world.getObjectByName('ClinicChair');
  if (chair) chair.visible = false;
  setAssetExaminerDetails(asset, 'Loading standalone mesh…');
  try {
    const object = asset.preview.endsWith('.glb')
      ? (await sourceGltfLoader.loadAsync(asset.preview)).scene
      : await objLoader.loadAsync(asset.preview);
    if (!assetExaminerOpen || ticket !== assetExaminerLoadTicket) {
      object.traverse((child) => child.geometry?.dispose?.());
      return;
    }
    const previewColor = asset.cohort === 'women' ? '#57435b' : asset.cohort === 'men' ? '#394956' : '#65563d';
    object.traverse((child) => {
      if (!child.isMesh) return;
      const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
      for (const sourceMaterial of sourceMaterials) {
        if (!sourceMaterial) continue;
        for (const value of Object.values(sourceMaterial)) if (value?.isTexture) value.dispose();
        sourceMaterial.dispose();
      }
      child.material = new THREE.MeshStandardMaterial({
        color: previewColor, roughness: 0.68, metalness: 0.03, side: THREE.DoubleSide,
      });
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals();
    });
    const originalBox = new THREE.Box3().setFromObject(object);
    const originalSize = originalBox.getSize(new THREE.Vector3());
    const longest = Math.max(originalSize.x, originalSize.y, originalSize.z);
    if (!Number.isFinite(longest) || longest <= 0) throw new Error('mesh has no measurable geometry');
    object.scale.setScalar(1.65 / longest);
    object.updateMatrixWorld(true);
    const scaledBox = new THREE.Box3().setFromObject(object);
    const center = scaledBox.getCenter(new THREE.Vector3());
    object.position.set(-center.x, 0.05 - scaledBox.min.y, -center.z);
    assetPreviewRoot.add(object);
    assetPreviewObject = object;
    setSourceAssetView();
    setAssetExaminerDetails(asset);
  } catch (error) {
    setAssetExaminerDetails(asset, `Preview failed: ${error.message}`);
  }
}

async function enterRendererCForAssetExaminer() {
  if (renderStyle === 'rendererC') return;
  renderSwitchBusy = true;
  renderStyle = 'rendererC';
  sessionStorage.setItem('characterLabRenderStyle', renderStyle);
  updateRenderToggle();
  ui.status.textContent = 'Loading Renderer C dressing inventory…';
  ui.status.className = 'status';
  try {
    await loadCharacter();
    updateControlModes();
  } finally {
    renderSwitchBusy = false;
    updateRenderToggle();
  }
}

async function selectAssetExaminerAsset(asset) {
  if (!assetExaminerOpen || assetExaminerBusy) return;
  assetExaminerBusy = true;
  assetExaminerSelected = asset.key;
  renderAssetExaminerList();
  setAssetExaminerDetails(asset, asset.type === 'wearable' ? 'Applying to the live figure…' : 'Loading standalone mesh…');
  try {
    if (asset.type === 'source') {
      await showSourceAsset(asset);
      return;
    }
    if (rendererCGridBusy) {
      setAssetExaminerDetails(asset, 'The identity contact sheet is still rendering. Try this outfit again in a moment.');
      return;
    }
    clearAssetPreview();
    assetPreviewRoot.visible = false;
    characterRoot.visible = true;
    const chair = world.getObjectByName('ClinicChair');
    if (chair) chair.visible = true;
    await enterRendererCForAssetExaminer();
    if (rendererCCohort !== asset.cohort) await switchWardrobeCohort(asset.cohort);
    wearWardrobe(asset.id);
    setAssetExaminerDetails(asset);
  } finally {
    assetExaminerBusy = false;
    renderAssetExaminerList();
  }
}

async function openAssetExaminer() {
  if (assetExaminerOpen) return;
  assetExaminerOpen = true;
  assetExaminerSavedMotion = motionEnabled;
  assetExaminerSavedView = {
    position: camera.position.clone(), target: orbit.target.clone(), fov: camera.fov,
  };
  motionEnabled = false;
  rendererCMoveKeys.clear();
  document.body.classList.add('asset-examiner-open');
  ui.assetExaminer.hidden = false;
  await enterRendererCForAssetExaminer();
  const currentId = activeWardrobeId(rendererCCohort, preset.values) || wardrobeFor(rendererCCohort)[0].id;
  const current = assetExaminerAssets().find((asset) => asset.type === 'wearable'
    && asset.cohort === rendererCCohort && asset.id === currentId);
  assetExaminerSelected = current?.key || null;
  characterRoot.visible = true;
  assetPreviewRoot.visible = false;
  renderAssetExaminerList();
  if (current) setAssetExaminerDetails(current);
  setView('full');
  ui.assetExaminerClose.focus();
}

function closeAssetExaminer() {
  if (!assetExaminerOpen) return;
  assetExaminerOpen = false;
  clearAssetPreview();
  assetPreviewRoot.visible = false;
  characterRoot.visible = true;
  const chair = world.getObjectByName('ClinicChair');
  if (chair) chair.visible = true;
  document.body.classList.remove('asset-examiner-open');
  ui.assetExaminer.hidden = true;
  motionEnabled = assetExaminerSavedMotion;
  if (assetExaminerSavedView) {
    camera.position.copy(assetExaminerSavedView.position);
    orbit.target.copy(assetExaminerSavedView.target);
    camera.fov = assetExaminerSavedView.fov;
    camera.updateProjectionMatrix();
    orbit.update();
  }
  assetExaminerSavedView = null;
  ui.canvas.focus();
}

function resetAssetExaminerView() {
  if (assetPreviewObject) setSourceAssetView();
  else setView('full');
}

function wearWardrobe(id) {
  if (renderStyle !== 'rendererC' || wardrobeSwitchBusy || rendererCGridBusy) return;
  const patch = wardrobePatch(rendererCCohort, id);
  if (!patch) return;
  Object.assign(preset.values, patch);
  refreshControls(false);
  if (costume && rendererCCohort === 'men') costume.rebuild(preset.values);
  else if (costume && rendererCCohort === 'women') rebuildCostumeNow({ preserveCurrentPose: true });
  updateRendererCAppearance(preset.values);
  setView('full');
  renderWardrobePanel();
  const selected = wardrobeFor(rendererCCohort).find((item) => item.id === id);
  ui.status.textContent = `${selected?.label || 'Outfit'} applied live · no Blender rebuild`;
  ui.status.className = 'status ok';
  updateText();
}

async function switchWardrobeCohort(cohort) {
  if (renderStyle !== 'rendererC' || wardrobeSwitchBusy || rendererCGridBusy) return;
  if (rendererCDemographicsLocked) {
    ui.status.textContent = 'Unlock casting controls before changing the patient cohort';
    ui.status.className = 'status warn';
    return;
  }
  if (!['women', 'men'].includes(cohort) || cohort === rendererCCohort) return;
  wardrobeSwitchBusy = true;
  renderWardrobePanel();
  try {
    rendererCCohort = cohort;
    preset.rendererC = { ...(preset.rendererC || {}), cohort };
    preset.values.gender = RENDERER_C_COHORTS[cohort].gender;
    preset.values.rendererCAnchor = 0;
    Object.assign(preset.values, wardrobeFor(cohort)[0].values);
    ui.rendererCCohort.value = cohort;
    rendererCCandidates = [];
    ui.rendererCGrid.replaceChildren();
    ui.rendererCGridStatus.textContent = 'Figure switched · generate eight when you want a new identity slate';
    ui.status.textContent = `Loading Renderer C ${cohort} wardrobe…`;
    ui.status.className = 'status';
    await loadCharacter();
    updateControlModes();
    refreshControls(false);
    setView('full');
    ui.status.textContent = `Renderer C ${cohort} figure ready · choose an outfit`;
    ui.status.className = 'status ok';
  } catch (error) {
    ui.status.textContent = `Could not switch figure · ${error.message}`;
    ui.status.className = 'status warn';
  } finally {
    wardrobeSwitchBusy = false;
    renderWardrobePanel();
    updateText();
  }
}

async function loadCharacter() {
  faceQaPerformanceValues = null;
  normalizeRendererCWardrobe();
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
        // The costume above was built (and skinned) against the pre-clip pose.
        // Rebind against the clip's actual pose or every panel drags apart.
        costumeDirty = true;
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
    // Fit again only at stable endpoints, and only after the crossfade has
    // settled: rebuilding at its start bakes the OLD pose into the bind, and
    // the skinned panels then drag apart as the new pose arrives.
    rendererCRefitAt = performance.now() + (preservePelvis ? 40 : 280);
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
  const goldenBodice = model?.getObjectByName?.('RendererC_GoldenDressBodice');
  const goldenSkirt = model?.getObjectByName?.('RendererC_GoldenDressSkirt');
  const goldenSeatedSkirt = model?.getObjectByName?.('RendererC_GoldenDressSeatedSkirt');
  const goldenDetails = model?.getObjectByName?.('RendererC_GoldenDressDetails');
  const carrier = model?.getObjectByName?.('RendererC_BaseGarment');
  const shoes = model?.getObjectByName?.('RendererC_Shoes');
  const useGoldenDress = mode === 'golden-dress';
  if (production) production.visible = mode === 'production-dress' && !useFittedSource;
  if (details) {
    details.visible = false;
  }
  if (fitSource) fitSource.visible = useFittedSource;
  if (goldenBodice) goldenBodice.visible = useGoldenDress;
  if (goldenDetails) goldenDetails.visible = useGoldenDress;
  if (goldenSeatedSkirt) goldenSeatedSkirt.visible = useGoldenDress && fittedSeated;
  if (goldenSkirt) {
    goldenSkirt.visible = useGoldenDress && !fittedSeated;
    const index = goldenSkirt.morphTargetDictionary?.rc_seated_lap;
    if (index !== undefined) goldenSkirt.morphTargetInfluences[index] = fittedSeated ? 1 : 0;
  }
  if (shoes) shoes.visible = mode !== 'production-dress' && !useGoldenDress;
  // The fitted carrier supplies long sleeves beneath the period overdress and
  // remains available as the isolated carrier comparison.
  if (carrier) carrier.visible = !useGoldenDress;
  setRendererCWomenWardrobeVisible(model, mode === 'production-dress');
  for (const { mesh } of costume?.pieces?.() || []) {
    mesh.visible = mode === 'concept-shell';
  }
}

function updateRendererCAppearance(values) {
  applyRendererCAppearance(model, {
    cohort: rendererCCohort,
    appearanceSeed: preset.patient?.appearance?.seed ?? values.seed,
    values,
    presentation: { dressColor: values.dressColor, trimColor: values.trimColor },
  });
  if (costume && rendererCCohort === 'men') costume.updateMaterials?.(values);
  else if (costume && rendererCCohort === 'women') {
    costume.materials.dress.color.set(values.dressColor);
    setSurfaceFinish(costume.materials.dress, values.fabricRoughness, 1);
    costume.materials.trim.color.set(values.trimColor);
    costume.updateHair(values);
    costume.updateMaterials?.(values);
    const productionRoots = [
      model?.getObjectByName?.('RendererC_VictorianDress'),
      model?.getObjectByName?.('RendererC_VictorianDetails'),
      model?.getObjectByName?.('RendererC_VictorianDressFitSource'),
      model?.getObjectByName?.('RendererC_GoldenDressBodice'),
      model?.getObjectByName?.('RendererC_GoldenDressSkirt'),
      model?.getObjectByName?.('RendererC_GoldenDressSeatedSkirt'),
      model?.getObjectByName?.('RendererC_GoldenDressDetails'),
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
      material.side = THREE.DoubleSide;
      setSurfaceFinish(material, trim ? Math.max(0.45, values.fabricRoughness * 0.84) : values.fabricRoughness, 1);
      material.needsUpdate = true;
    }
    updateRendererCWomenWardrobe(values);
  }
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
        costume.updateMaterials?.(v);
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
          costume.updateMaterials?.(v);
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
      if (initial || identityControl || RENDERER_C_SURFACE_IDS.has(changedId)
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
      key.intensity = (comparison ? THREE.MathUtils.lerp(18, 14, softness) : 24) * v.keyIntensity;
      key.color.setHSL(0.105, comparison ? .3 : .5, (comparison ? .73 : .65) + (1 - v.warmth) * .08);
      key.penumbra = comparison ? THREE.MathUtils.lerp(.965, .998, softness) : .95;
      key.shadow.radius = comparison ? THREE.MathUtils.lerp(4, 6, softness) : 4;
      key.shadow.normalBias = comparison ? 0.022 : 0.014;
    }
    if (fill) fill.intensity = comparison ? 0.75 + v.fillIntensity * 0.5 : 0.72 + v.fillIntensity * 0.8;
    if (faceFill) {
      faceFill.visible = comparison;
      faceFill.intensity = (4 + softness * 4) * (0.65 + v.fillIntensity * 0.45);
    }
    if (rim) { rim.visible = comparison; rim.intensity = comparison ? 0.35 + softness * 0.35 : 0.3; }
    renderer.toneMappingExposure = 2 ** (v.exposure + (comparison ? 0.12 : 0));
    camera.fov = v.cameraFov; camera.updateProjectionMatrix();
  }
  if (changedId === 'idleMode') syncIdleMode();
  updatePoseToggle();
  updateText();
}

function buildControls() {
  ui.controls.replaceChildren();
  const collapsed = savedGroupState();
  for (const group of schema.groups) {
    const section = document.createElement('section'); section.className = 'control-group'; section.dataset.group = group.id;
    if (group.renderer) section.dataset.renderer = group.renderer;
    const body = document.createElement('div'); body.className = 'group-body'; body.id = `control-group-${group.id}`;
    const closed = collapsed[group.id] ?? !['identity', 'face', 'dress', 'pose', 'render'].includes(group.id);
    section.classList.toggle('closed', closed);
    const heading = document.createElement('button');
    heading.type = 'button'; heading.className = 'group-heading'; heading.textContent = group.label;
    heading.setAttribute('aria-controls', body.id); heading.setAttribute('aria-expanded', String(!closed));
    heading.onclick = () => {
      section.classList.toggle('closed');
      heading.setAttribute('aria-expanded', String(!section.classList.contains('closed')));
      const state = savedGroupState();
      state[group.id] = section.classList.contains('closed');
      localStorage.setItem('characterLabGroups', JSON.stringify(state));
    };
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
  row.classList.toggle('advanced-control', !BASIC_CONTROL_IDS.has(definition.id));
  const label = document.createElement('label'); label.textContent = definition.label; label.htmlFor = `control-${definition.id}`;
  const output = document.createElement('output'); const input = document.createElement(definition.type === 'select' ? 'select' : 'input'); input.id = `control-${definition.id}`;
  if (definition.type === 'select') definition.options.forEach((value, index) => {
    const option = document.createElement('option'); option.value = value;
    option.textContent = definition.optionLabels?.[index] || value.replaceAll('-', ' ');
    input.append(option);
  });
  else { input.type = definition.type; if (definition.type === 'range') for (const key of ['min', 'max', 'step']) input[key] = definition[key]; }
  input.value = preset.values[definition.id]; updateControlOutput(definition, input.value, output);
  const applyInput = (final = false) => {
    preset.values[definition.id] = definition.type === 'range' ? Number(input.value) : input.value;
    if (renderStyle === 'rendererC' && definition.id === 'age') {
      const ageAppearance = deriveAgeAppearance({
        ageYears: rendererCAgeValueToYears(preset.values.age),
        seed: preset.patient?.appearance?.seed ?? preset.values.seed,
      });
      Object.assign(preset.values, ageAppearance);
      for (const id of [...AGE_APPEARANCE_VALUE_IDS, 'greyPattern']) syncControlValue(id, preset.values[id]);
    }
    if (renderStyle === 'rendererC' && rendererCCohort === 'men' && ['dressColor', 'trimColor'].includes(definition.id)) {
      preset.values.menswearPalette = 'custom';
      syncControlValue('menswearPalette', 'custom');
    }
    if (renderStyle === 'rendererC' && rendererCCohort === 'women'
      && ['dressColor', 'secondaryColor', 'trimColor'].includes(definition.id)) {
      preset.values.womenPalette = 'custom';
      syncControlValue('womenPalette', 'custom');
    }
    if (renderStyle === 'rendererC' && rendererCCohort === 'women' && definition.id === 'womenPalette') {
      const palette = rendererCWomenPalette(preset.values.womenPalette);
      if (palette) {
        preset.values.dressColor = palette.primary;
        preset.values.secondaryColor = palette.secondary;
        preset.values.trimColor = palette.accent;
        syncControlValue('dressColor', palette.primary);
        syncControlValue('secondaryColor', palette.secondary);
        syncControlValue('trimColor', palette.accent);
      }
    }
    if (renderStyle === 'rendererC' && rendererCCohort === 'men' && definition.id === 'outfitStyle') {
      const palette = {
        'mens-working-clothes': 'work-earth', 'mens-sack-suit': 'trade-charcoal',
        'mens-formal-suit': 'elite-charcoal-dove', 'mens-mourning-suit': 'mourning',
        'mens-victorian-sample': 'trade-charcoal',
        'mens-authored-victorian-set': 'formal-black-grey',
      }[preset.values.outfitStyle];
      if (palette) {
        preset.values.menswearPalette = palette;
        syncControlValue('menswearPalette', palette);
      }
    }
    updateControlOutput(definition, input.value, output);
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
function updateControlOutput(definition, value, output) {
  if (!definition || !output) return;
  output.textContent = formatValue(definition, value);
  const paletteControl = ['skinTone', 'eyeColor'].includes(definition.id);
  output.classList.toggle('palette-swatch', paletteControl);
  if (!paletteControl) return;
  output.style.backgroundColor = value;
  const index = definition.options?.indexOf(value) ?? -1;
  output.title = definition.optionLabels?.[index] || value;
}
function normalizeAppearancePaletteValues(values) {
  values.skinTone = closestSkinTone(values.skinTone);
  values.eyeColor = closestEyeColor(values.eyeColor);
  return values;
}
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
    updateControlOutput(heritageDefinition, preset.values[id], heritageOutput);
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
    updateControlOutput(definition, input.value, output);
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
  ui.patientSection.hidden = !patient || activeLabTask !== 'cast';
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
  updateWardrobeSelection();
}

function populateRendererCCriteria() {
  const fill = (select, entries) => {
    select.replaceChildren(...Object.entries(entries).map(([value, definition]) => new Option(definition.label, value)));
  };
  fill(ui.rendererCCohort, RENDERER_C_COHORTS);
  fill(ui.rendererCAge, RENDERER_C_AGE_BANDS);
  fill(ui.rendererCAncestry, RENDERER_C_ANCESTRIES);
  ui.rendererCSeed.value = preset.rendererC?.gridSeed || preset.values.seed || 1896;
  syncRendererCCriteriaFromPatient();
}

function syncRendererCCriteriaFromPatient() {
  const cohort = rendererCCohortForPatient(preset.patient);
  const ageBand = rendererCAgeBandForPatient(preset.patient);
  const ancestry = rendererCAncestryForValues(preset.values);
  if (rendererCDemographicsLocked) {
    rendererCCohort = cohort;
    preset.values.gender = RENDERER_C_COHORTS[cohort].gender;
    preset.rendererC = { ...(preset.rendererC || {}), cohort, ageBand, ancestry };
    if (ui.rendererCSeed) ui.rendererCSeed.value = preset.values.seed || preset.patient?.seed || 1896;
  }
  ui.rendererCCohort.value = rendererCDemographicsLocked ? cohort : rendererCCohort;
  ui.rendererCAge.value = rendererCDemographicsLocked ? ageBand : (preset.rendererC?.ageBand || ageBand);
  ui.rendererCAncestry.value = rendererCDemographicsLocked ? ancestry : (preset.rendererC?.ancestry || ancestry);
  for (const control of [ui.rendererCCohort, ui.rendererCAge, ui.rendererCAncestry]) {
    if (control) control.disabled = rendererCDemographicsLocked;
  }
  for (const id of ['gender', 'age', 'african', 'asian', 'caucasian']) {
    const control = document.querySelector(`#control-${id}`);
    if (!control) continue;
    control.disabled = rendererCDemographicsLocked;
    control.closest('.control')?.classList.toggle('derived-control', rendererCDemographicsLocked);
  }
  if (ui.rendererCUnlock) {
    ui.rendererCUnlock.textContent = rendererCDemographicsLocked ? 'Unlock casting controls' : 'Use patient record';
    ui.rendererCUnlock.setAttribute('aria-pressed', String(!rendererCDemographicsLocked));
  }
  if (ui.rendererCLockStatus) {
    ui.rendererCLockStatus.textContent = rendererCDemographicsLocked
      ? `Derived from ${preset.patient?.identity?.displayName || 'the patient'}: ${RENDERER_C_COHORTS[cohort].label.toLowerCase()}, ${RENDERER_C_AGE_BANDS[ageBand].label}, ${RENDERER_C_ANCESTRIES[ancestry].label}.`
      : 'Casting controls are unlocked. This can intentionally diverge from the patient record.';
  }
  return cohort;
}

function candidateForCurrentPatient(candidate) {
  if (!rendererCDemographicsLocked) return candidate;
  return {
    ...candidate,
    values: {
      ...candidate.values,
      gender: preset.values.gender,
      age: preset.values.age,
      african: preset.values.african,
      asian: preset.values.asian,
      caucasian: preset.values.caucasian,
    },
  };
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
  applyRendererCCandidate(preset, candidateForCurrentPatient(candidate));
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
  renderWardrobePanel();
  ui.rendererCGridStatus.textContent = 'Preparing eight identities…';
  try {
    const requestedCohort = ui.rendererCCohort.value;
    if (requestedCohort !== rendererCCohort) {
      rendererCCohort = requestedCohort;
      preset.values.gender = RENDERER_C_COHORTS[rendererCCohort].gender;
      preset.values.rendererCAnchor = 0;
      const mensStyle = String(preset.values.outfitStyle || '').startsWith('mens-');
      if (rendererCCohort === 'women' && mensStyle) preset.values.outfitStyle = 'conservative-day';
      if (rendererCCohort === 'men' && !mensStyle) preset.values.outfitStyle = 'mens-sack-suit';
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
      applyRendererCCandidate(preset, candidateForCurrentPatient(rendererCCandidates[0]));
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
    renderWardrobePanel();
  }
}

function syncControlValue(id, value) {
  const input = document.querySelector(`#control-${id}`);
  if (!input) return;
  input.value = value;
  const definition = definitions.find((item) => item.id === id);
  const output = input.parentElement?.querySelector('output');
  updateControlOutput(definition, value, output);
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
  if (renderStyle === 'rendererC') {
    syncRendererCCriteriaFromPatient();
    rendererCCandidates = [];
    ui.rendererCGrid.replaceChildren();
    ui.rendererCGridStatus.textContent = 'Patient appearance updated. Generate eight to audition alternate face anchors.';
    applyAll();
    ui.status.textContent = `Appearance variation ${appearanceSeed} applied to ${preset.name}`;
    ui.status.className = 'status ok';
    return;
  }
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

  const previousCohort = rendererCCohort;
  preset = best.candidate;
  refreshControls(false);
  applyPresetRestingFace();
  if (renderStyle === 'rendererC') {
    syncRendererCCriteriaFromPatient();
    rendererCCandidates = [];
    ui.rendererCGrid.replaceChildren();
    ui.rendererCGridStatus.textContent = 'The new patient record selected this figure. Generate eight to audition alternates within the same cohort.';
    if (rendererCCohort !== previousCohort) await loadCharacter();
    else applyAll();
    setView('portrait');
    ui.status.textContent = `${preset.name} cast from the patient record · anatomy distance ${best.anatomyDistance.toFixed(2)}`;
    ui.status.className = 'status ok';
    return;
  }
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
    camera.position.copy(target).add(new THREE.Vector3(0.25, 0.055, 0.52));
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
makeClinic(); buildControls(); syncRendererCCriteriaFromPatient(); updateRenderToggle(); await loadCharacter(); updateText();
setLabTask(LAB_TASK_GROUPS[activeLabTask] ? activeLabTask : 'cast');
setView('portrait');
ui.rendererCGridStatus.textContent = 'Current patient loaded. Generate eight to audition alternate face anchors.';
ui.randomize.onclick = appearanceVariation;
ui.newPatient.onclick = newRandomPatient;
if (ui.regenerate) ui.regenerate.onclick = regenerateCharacter;
document.querySelector('#reset').onclick = async () => {
  const previousCohort = rendererCCohort;
  preset = structuredClone(initialPreset);
  normalizeAppearancePaletteValues(preset.values);
  syncRendererCCriteriaFromPatient();
  refreshControls(false);
  applyPresetRestingFace();
  if (rendererCCohort !== previousCohort) await loadCharacter();
  else applyAll();
  setView('portrait');
};
document.querySelector('#export').onclick = () => { const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })), download: `${preset.id}.json` }); link.click(); URL.revokeObjectURL(link.href); };
document.querySelector('#apply-json').onclick = async () => {
  try {
    const previousCohort = rendererCCohort;
    preset = JSON.parse(ui.json.value);
    normalizeAppearancePaletteValues(preset.values);
    syncRendererCCriteriaFromPatient();
    refreshControls(false);
    applyPresetRestingFace();
    if (rendererCCohort !== previousCohort) await loadCharacter();
    else applyAll();
  } catch { ui.json.setCustomValidity('Invalid JSON'); ui.json.reportValidity(); }
};
document.querySelector('#copy-json').onclick = () => navigator.clipboard.writeText(ui.json.value);
document.querySelector('#toggle-grid').onclick = (event) => { grid.visible = !grid.visible; event.currentTarget.classList.toggle('active', grid.visible); };
document.querySelector('#toggle-motion').onclick = (event) => { motionEnabled = !motionEnabled; syncIdleMode(); event.currentTarget.classList.toggle('active', motionEnabled); };
if (ui.renderToggle) ui.renderToggle.onclick = toggleRenderStyle;
ui.poseToggle.onclick = toggleMhrPose;
ui.taskTabs.forEach((button) => { button.onclick = () => setLabTask(button.dataset.labTask); });
ui.advancedToggle.onclick = () => setAdvancedControls(!advancedControlsVisible);
ui.rendererCUnlock.onclick = async () => {
  const previousCohort = rendererCCohort;
  rendererCDemographicsLocked = !rendererCDemographicsLocked;
  syncRendererCCriteriaFromPatient();
  renderWardrobePanel();
  if (rendererCDemographicsLocked && rendererCCohort !== previousCohort) await loadCharacter();
  else updateText();
};
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
document.querySelectorAll('[data-face-qa]').forEach((button) => {
  button.onclick = () => applyFaceQaState(button.dataset.faceQa);
});
ui.rendererCGenerate.onclick = generateRendererCGrid;
document.querySelectorAll('[data-wardrobe-cohort]').forEach((button) => {
  button.onclick = () => switchWardrobeCohort(button.dataset.wardrobeCohort);
});
document.querySelectorAll('[data-asset-filter]').forEach((button) => {
  button.onclick = () => {
    assetExaminerFilter = button.dataset.assetFilter;
    document.querySelectorAll('[data-asset-filter]').forEach((item) => item.classList.toggle('active', item === button));
    renderAssetExaminerList();
  };
});
ui.assetExaminerClose.onclick = closeAssetExaminer;
ui.assetExaminerResetView.onclick = resetAssetExaminerView;
ui.canvas.ondblclick = () => assetExaminerOpen ? resetAssetExaminerView() : setView('clinic');
ui.search.oninput = updateLabWorkspaceVisibility;
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && assetExaminerOpen) {
    event.preventDefault();
    closeAssetExaminer();
    return;
  }
  if (event.code !== 'Digit2' || !event.shiftKey || event.repeat || isEditableTarget(event.target)) return;
  event.preventDefault();
  if (assetExaminerOpen) closeAssetExaminer();
  else openAssetExaminer();
});
window.addEventListener('keydown', (event) => {
  if (!RENDERER_C_MOVEMENT_KEYS.has(event.code) && !['ShiftLeft', 'ShiftRight'].includes(event.code)) return;
  if (isEditableTarget(event.target) || renderStyle !== 'rendererC' || assetExaminerOpen) return;
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
  get assetExaminerOpen() { return assetExaminerOpen; },
  get assetExaminerSelected() { return assetExaminerSelected; },
  THREE, applyAll, rebuildCostumeNow, generateRendererCGrid, toggleRenderStyle,
  openAssetExaminer, closeAssetExaminer,
};

const clock = new THREE.Clock();
function frame() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (rendererCRefitAt && performance.now() >= rendererCRefitAt) {
    rendererCRefitAt = 0;
    costumeDirty = true;
  }
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
  if (expressions && !isFallback) expressions.update(delta, elapsed, faceQaPerformanceValues || preset.values);
  if (mhrFacialDetails && renderStyle === 'mhr') mhrFacialDetails.update(preset.values);
  costume?.update?.(delta, preset.values);
  orbit.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() { const width = ui.canvas.clientWidth; const height = ui.canvas.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(ui.canvas); resize(); frame();

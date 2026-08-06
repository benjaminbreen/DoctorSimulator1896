import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { findBones, createCostume } from './costume.js';
import { createIdle } from './idle.js';
import { createExpressions } from './expressions.js';
import { generatePatient, nextSeed, patientToCharacterPreset } from './patients/index.js';
import { prepareStylizedModel, styleProceduralCostume, updateStylizedModel } from './stylized.js';
import './style.css';

const [schema, initialPreset] = await Promise.all([
  fetch('/schema/character.schema.json').then((response) => response.json()),
  fetch('/presets/mrs-ostrander-1896.json').then((response) => response.json()),
]);
let preset = structuredClone(initialPreset);
const definitions = schema.groups.flatMap((group) => group.parameters.map((parameter) => ({ ...parameter, mode: parameter.mode || group.mode, group: group.id })));
const ui = {
  canvas: document.querySelector('#stage'), controls: document.querySelector('#controls'), status: document.querySelector('#model-status'),
  json: document.querySelector('#preset-json'), summary: document.querySelector('#subject-summary'), subjectName: document.querySelector('#subject-name'),
  patientRecord: document.querySelector('#patient-record'), patientSection: document.querySelector('#patient-record-section'), pipeline: document.querySelector('#pipeline-state'),
  command: document.querySelector('#generate-command'), fallback: document.querySelector('#fallback'), search: document.querySelector('#control-search'),
  regenerate: document.querySelector('#regenerate'), randomize: document.querySelector('#randomize'), renderToggle: document.querySelector('#render-toggle'),
};

/* ids that require rebuilding costume geometry (vs material-only or animation values) */
const COSTUME_GEOMETRY_IDS = new Set(['bodiceFit', 'waistHeight', 'skirtFullness', 'skirtLength', 'skirtDrape',
  'bustleAmount', 'sleeveVolume', 'sleeveLength', 'collarHeight', 'collarSpread', 'buttonSpacing', 'buttonCount',
  'outfitStyle', 'hairStyle', 'hairVolume', 'partWidth', 'bunSize', 'hairHeight', 'sideVolume',
  'hairlineHeight', 'templeRecession', 'wispAmount', 'waveAmount']);

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
let isFallback = false;
let costumeDirty = false;
let lastCostumeBuild = 0;
let regenerationNeeded = false;
let regenerationBusy = false;
let renderSwitchBusy = false;
let renderStyle = sessionStorage.getItem('characterLabRenderStyle') === 'stylized' ? 'stylized' : 'current';
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

function disposeLoadedCharacter() {
  animationAction?.stop();
  mixer?.stopAllAction();
  costume?.dispose();
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
  named.clear();
}

function updateRenderToggle() {
  if (!ui.renderToggle) return;
  ui.renderToggle.textContent = renderStyle === 'stylized' ? 'Renderer B · Stylized' : 'Renderer A · Current';
  ui.renderToggle.classList.toggle('active', renderStyle === 'stylized');
  ui.renderToggle.disabled = renderSwitchBusy;
}

async function loadCharacter() {
  disposeLoadedCharacter();
  isFallback = false;
  ui.fallback.hidden = true;
  const suffix = renderStyle === 'stylized' ? '-stylized' : '';
  try {
    const gltf = await new GLTFLoader().loadAsync(`/models/mrs-ostrander-1896${suffix}.glb?v=${Date.now()}`);
    model = gltf.scene;
    if (renderStyle === 'stylized') prepareStylizedModel(model, preset.values);
    characterRoot.add(model); animationClips = gltf.animations;
    setupAnimations();
    const label = renderStyle === 'stylized' ? 'B stylized proxy' : 'A current mesh';
    ui.status.textContent = `${label} · ${countTriangles(model).toLocaleString()} triangles · ${animationClips.length} clip${animationClips.length === 1 ? '' : 's'}`; ui.status.className = 'status ok';
  } catch (error) {
    model = makeFallbackHuman(); characterRoot.add(model); isFallback = true;
    ui.status.textContent = `${renderStyle === 'stylized' ? 'Stylized proxy missing' : 'Model missing'} · run Blender generator`; ui.status.className = 'status warn'; ui.fallback.hidden = false;
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
      costume = createCostume(characterRoot, bones, model, { renderStyle });
      costume.rebuild(preset.values);
      if (renderStyle === 'stylized') styleProceduralCostume(costume, preset.values);
      expressions = createExpressions(model);
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

function applyAll(changedId = null) {
  const v = preset.values;
  if (isFallback) {
    setMaterialLike('dress', v.dressColor, v.fabricRoughness, 1); setMaterialLike('trim', v.trimColor);
    setMaterialLike('hair', v.hairColor); setMaterialLike('skin', v.skinTone, v.skinRoughness, .9);
    characterRoot.position.y = -0.2 * (v.seated >= 0.5 ? 1 : 0);
  } else {
    const skinTint = new THREE.Color('#ffffff').lerp(new THREE.Color(v.skinTone), 0.75);
    setMaterialLike('human', skinTint, v.skinRoughness, .9); setMaterialLike('.body', skinTint, v.skinRoughness, .9);
    setMaterialLike('garment', v.dressColor, v.fabricRoughness, 1);
    setMaterialLike('bodice', v.dressColor, v.fabricRoughness, 1);
    setMaterialLike('suit', v.dressColor, v.fabricRoughness, 1);
    setMaterialLike('shoes', '#211713');
    setEyeColor(v.eyeColor);
    if (costume) {
      costume.materials.dress.color.set(v.dressColor); setSurfaceFinish(costume.materials.dress, v.fabricRoughness, 1);
      costume.materials.trim.color.set(v.trimColor); costume.updateHair(v);
    }
    if (renderStyle === 'stylized') {
      updateStylizedModel(model, v);
      styleProceduralCostume(costume, v);
    }
    if (changedId === null || COSTUME_GEOMETRY_IDS.has(changedId)) costumeDirty = true;
  }
  const key = scene.getObjectByName('KeyLight'); const fill = scene.getObjectByName('FillLight');
  if (key) { key.intensity = 48 * v.keyIntensity; key.color.setHSL(0.105, .58, .62 + (1 - v.warmth) * .1); }
  if (fill) fill.intensity = 0.62 + v.fillIntensity * 0.9;
  renderer.toneMappingExposure = 2 ** v.exposure; camera.fov = v.cameraFov; camera.updateProjectionMatrix();
  if (changedId === 'idleMode') syncIdleMode();
  updateText();
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
  const applyInput = () => {
    preset.values[definition.id] = definition.type === 'range' ? Number(input.value) : input.value;
    output.textContent = formatValue(definition, input.value);
    if (definition.mode === 'bake') markRegenerationNeeded();
    else applyAll(definition.id);
    updateText();
  };
  input.oninput = applyInput;
  if (definition.type === 'select') input.onchange = applyInput;
  row.append(label, output, input); return row;
}

function formatValue(definition, value) { return definition.type === 'range' ? Number(value).toFixed(definition.step < .01 ? 3 : definition.step < 1 ? 2 : 0) : ''; }
function refreshControls() { for (const definition of definitions) { const input = document.querySelector(`#control-${definition.id}`); if (input) { input.value = preset.values[definition.id]; input.dispatchEvent(new Event('input')); } } }
function markRegenerationNeeded() {
  regenerationNeeded = true;
  ui.regenerate?.classList.add('needed');
  if (!regenerationBusy) { ui.status.textContent = 'Identity changes waiting for Blender'; ui.status.className = 'status warn'; }
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
  const baked = definitions.filter((d) => d.mode === 'bake').length; const live = definitions.length - baked;
  ui.pipeline.innerHTML = `<dt>Tunable values</dt><dd>${definitions.length}</dd><dt>Live controls</dt><dd>${live}</dd><dt>Blender controls</dt><dd>${baked}</dd><dt>Renderer</dt><dd>${renderStyle === 'stylized' ? 'B · stylized proxy' : 'A · current'}</dd><dt>Regeneration</dt><dd>${regenerationNeeded ? 'needed' : 'current'}</dd><dt>Deterministic seed</dt><dd>${preset.values.seed}</dd><dt>Target runtime</dt><dd>Three.js / GLB</dd>`;
}

async function randomize() {
  const patient = generatePatient({ seed: nextSeed(preset.values.seed) });
  preset = patientToCharacterPreset(patient, preset, definitions);
  refreshControls();
  await regenerateCharacter();
}

async function regenerateCharacter() {
  if (regenerationBusy) return;
  regenerationBusy = true;
  ui.status.textContent = 'Blender is fitting a complete character…'; ui.status.className = 'status warn';
  for (const button of [ui.regenerate, ui.randomize]) if (button) button.disabled = true;
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
    for (const button of [ui.regenerate, ui.randomize]) if (button) button.disabled = false;
    document.querySelectorAll('#controls input, #controls select').forEach((control) => { control.disabled = false; });
  }
}

const views = {
  clinic: [[2.45, 1.62, 3.35], [0, 1.1, 0]],
  full: [[2.15, 1.35, 3.6], [0, .86, 0]],
  portrait: [[.58, 1.42, 1.08], [0, 1.32, 0]],
  exam: [[2.75, 1.28, 0.9], [0, 0.9, 0.1]],
};
function setView(name) { camera.position.set(...views[name][0]); orbit.target.set(...views[name][1]); orbit.update(); document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name)); }

async function toggleRenderStyle() {
  if (renderSwitchBusy) return;
  renderSwitchBusy = true;
  renderStyle = renderStyle === 'current' ? 'stylized' : 'current';
  sessionStorage.setItem('characterLabRenderStyle', renderStyle);
  updateRenderToggle();
  ui.status.textContent = `Loading renderer ${renderStyle === 'stylized' ? 'B' : 'A'}…`;
  ui.status.className = 'status';
  await loadCharacter();
  renderSwitchBusy = false;
  updateRenderToggle();
  updateText();
}

makeClinic(); buildControls(); updateRenderToggle(); await loadCharacter(); updateText(); setView('clinic');
ui.randomize.onclick = randomize;
ui.regenerate.onclick = regenerateCharacter;
document.querySelector('#reset').onclick = () => { preset = structuredClone(initialPreset); refreshControls(); setView('clinic'); };
document.querySelector('#export').onclick = () => { const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })), download: `${preset.id}.json` }); link.click(); URL.revokeObjectURL(link.href); };
document.querySelector('#apply-json').onclick = () => { try { preset = JSON.parse(ui.json.value); refreshControls(); } catch { ui.json.setCustomValidity('Invalid JSON'); ui.json.reportValidity(); } };
document.querySelector('#copy-json').onclick = () => navigator.clipboard.writeText(ui.json.value);
document.querySelector('#toggle-grid').onclick = (event) => { grid.visible = !grid.visible; event.currentTarget.classList.toggle('active', grid.visible); };
document.querySelector('#toggle-motion').onclick = (event) => { motionEnabled = !motionEnabled; syncIdleMode(); event.currentTarget.classList.toggle('active', motionEnabled); };
ui.renderToggle.onclick = toggleRenderStyle;
document.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => setView(button.dataset.view));
document.querySelectorAll('[data-gesture]').forEach((button) => button.onclick = () => idle?.playGesture(button.dataset.gesture, preset.values.gestureSpeed || 1));
document.querySelectorAll('[data-expression]').forEach((button) => button.onclick = () => expressions?.play(button.dataset.expression, preset.values.gestureSpeed || 1));
ui.canvas.ondblclick = () => setView('clinic');
ui.search.oninput = () => { const term = ui.search.value.toLowerCase(); document.querySelectorAll('.control').forEach((row) => row.hidden = !row.dataset.search.includes(term)); document.querySelectorAll('.control-group').forEach((group) => group.hidden = ![...group.querySelectorAll('.control')].some((row) => !row.hidden)); };

/* console access for calibration and debugging */
window.__lab = { scene, get bones() { return bones; }, get model() { return model; }, get preset() { return preset; }, get idle() { return idle; }, get costume() { return costume; }, get expressions() { return expressions; }, get renderStyle() { return renderStyle; }, THREE, applyAll, rebuildCostumeNow, toggleRenderStyle };

const clock = new THREE.Clock();
function frame() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (costumeDirty && performance.now() - lastCostumeBuild > 90) rebuildCostumeNow();
  if (motionEnabled && !isFallback) {
    const mode = preset.values.idleMode || 'procedural';
    if (mixer) mixer.update(mode === 'procedural' ? 0 : delta * (0.72 + Math.min(preset.values.breathing, 1.2) * 0.9));
    if (idle) idle.update(delta, elapsed, preset.values, mode);
  }
  if (expressions && !isFallback) expressions.update(delta, elapsed, preset.values);
  orbit.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() { const width = ui.canvas.clientWidth; const height = ui.canvas.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(ui.canvas); resize(); frame();

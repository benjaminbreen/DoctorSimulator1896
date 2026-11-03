// Interactive review page for a baked expression shape set. Loads the
// authored character, plays its seated idle, and drives the morphs either
// the way the game does (recipes, caps, blink, speech jaw) or raw per-shape.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createModularFacialHair, MODULAR_SIDEBURNS, MODULAR_MOUSTACHES } from '../../shared/characters/modularFacialHair.js';
import { createModularBody, MODULAR_BODY_CONTROLS } from '../../shared/characters/modularBody.js';
import { createModularWardrobe } from '../../shared/characters/modularWardrobe.js';
import { createModularIdentity, MODULAR_IDENTITIES, MODULAR_FEATURES, MODULAR_FACE_STUDIES, MODULAR_NOSE_STUDIES } from '../../shared/characters/modularIdentity.js';
import { createModularAppearance, MODULAR_SKIN_TONES, MODULAR_HAIR_TONES, MODULAR_EYE_TONES } from '../../shared/characters/modularAppearance.js';
import { createModularVariation } from '../../shared/characters/modularVariants.js';
import { MODULAR_CAST_LOOKS } from '../../shared/characters/modularCast.js';
import { EXPANSION_TEMPLATES } from '../../shared/characters/patientExpansion.js';
import { HEADWEAR_STYLES, HEADWEAR_COLORS, headwearVariation } from '../../shared/characters/headwearGeometry.js';
import { createHeadwear } from '../../shared/characters/headwearPerformance.js';
import { loadHeadwearTextures } from '../../shared/characters/headwearMaterials.js';
import { createModularEyelashes,EYELASH_LEVELS,EYELASH_TONES } from '../../shared/characters/modularEyelashes.js';
import {createPeriodAccessories,ACCESSORY_DEFAULTS,ACCESSORY_CHOICES,accessoryVariation} from '../../shared/characters/periodAccessories.js';
import { createModularHair, MODULAR_HAIR_STYLES, MODULAR_HAIR_CONTROLS } from '../../shared/characters/modularHair.js';
import {
  FACIAL_EXPRESSION_RECIPES,
  expressionFaceWeights,
  FACIAL_GAZE_RECIPES,
  safeFaceWeight,
  speechJawWeight,
  speechFaceWeights,
  blinkFaceWeights, blinkEyelids, idleGazeWeights,
} from '../../shared/characters/facePerformance.js';

// Switching characters reloads the page: a dev tool has no state worth
// preserving, and it keeps the loader single-path.
const CHARACTERS = [
  { id: 'carmela-russo', label: 'Carmela Russo', path: '/models/characters/carmela-russo.glb', headOffset: 0.10, headDistance: .72 },
  { id: 'seamstress-prototype', label: 'Seamstress prototype', path: '/models/characters/seamstress-prototype.glb', headOffset: .10, headDistance: .72 },
  { id: 'male-lean-template', label: 'Male — lean template', path: '/models/characters/male-lean-template.glb', headOffset: .05, headDistance: .72 },
  { id: 'male-broad-template', label: 'Male — broad template', path: '/models/characters/male-broad-template.glb', headOffset: .05, headDistance: .72 },
  { id: 'male-worker-template', label: 'Male — complete worker', path: '/models/characters/male-worker-template.glb', headOffset: .05, headDistance: .72, outfit: 'work-shirt' },
  ...EXPANSION_TEMPLATES.map(template => ({ ...template, headOffset: .05, headDistance: .72 })),
  { id: 'samuel-taylor', label: 'Samuel Taylor', path: '/models/samuel-taylor.glb', bakedHat:true },
  { id: 'wine-merchant', label: 'Wine merchant', path: '/models/wine-merchant.glb' },
];
const requested = new URLSearchParams(window.location.search).get('model');
const CHARACTER = CHARACTERS.find((entry) => entry.id === requested) || CHARACTERS[0];
const defaultCast=CHARACTER.head?MODULAR_CAST_LOOKS.find(preset=>preset.id===CHARACTER.id):null;
const maleCharacter = CHARACTER.id.startsWith('male-') || ['samuel-taylor','wine-merchant'].includes(CHARACTER.id);
const MODEL = CHARACTER.path+(CHARACTER.head?'?v=20261102-expansion-3':CHARACTER.id.startsWith('male-')?'?v=20261102-grooms-1':'');
document.querySelector('#panel h1').textContent = `Face Lab — ${CHARACTER.label}`;
document.title = `Face Lab — ${CHARACTER.label}`;

const stage = document.getElementById('stage');
const hud = document.getElementById('hud');
const controlsHost = document.getElementById('controls');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#20242a');
// Cloth and metal need reflected light here as they already have in the game.
const studio=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(studio,.04).texture;scene.environmentIntensity=.35;
studio.dispose();pmrem.dispose();
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 20);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight('#e5eef7', '#34383d', 1.1));
const key = new THREE.DirectionalLight('#fff9f2', 2.0);
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
  ...ACCESSORY_DEFAULTS,
  mode: 'performance',
  expression: 'neutral',
  speaking: false,
  autoBlink: true,
  clip: 'ClinicIdle',
  raw: {},
  paused: false,
  outfit: CHARACTER.outfit || (CHARACTER.id.startsWith('male-') ? 'tailored-clothes' : 'day-dress'),
  palette: 'original',
  identityVariant: 0, sideburns:'short-sideburns', moustache:'none', bellySize: 0, waistWidth: 0,
  hairStyle: CHARACTER.id.startsWith('male-') ? 'short-side-part' : 'soft-side-waves', hairVolume: 0, hairWave: 0, hairBunHeight: 0, hairPartOffset: 0, hairEarCoverage: .3, hairlineHeight:0, hairlinePeak:0, hairlineRecession:0, hairlineAsymmetry:0, hairThinning:0,
  performanceSeed: 7,
  lashProminence:maleCharacter?2:3,lashSeed:7,lashTone:'auto',
  hatStyle:'none',hatHand:'left',hatSeed:1896,hatColor:null,hatBandColor:'black',hatCrownHeight:0,hatBrimWidth:0,hatTilt:0,hatDecoration:null,hatWear:0,
  // Keep the initial Carmela preview aligned with her authored game asset.
  features: CHARACTER.id === 'carmela-russo' ? { lowerFaceSize: -.6 } : {}, skinTone: 'original', hairTone: 'original', eyeTone: 'original',
};
let needsFrame = true;
const variationSeed = new URLSearchParams(location.search).get('variantSeed');
if (variationSeed !== null) Object.assign(state, createModularVariation(Number(variationSeed),CHARACTER.id.startsWith('male-')));
const selectedCast = MODULAR_CAST_LOOKS.find(preset => preset.id === new URLSearchParams(location.search).get('preset') && preset.model === CHARACTER.id)||defaultCast;
if (selectedCast) Object.assign(state,{...selectedCast.look,features:{...selectedCast.look.features}});
if (CHARACTER.bakedHat) state.hatStyle='none';

const loader = new GLTFLoader()
  .setMeshoptDecoder(MeshoptDecoder)
  .setKTX2Loader(new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer));

const [gltf] = await Promise.all([loader.loadAsync(MODEL),loadHeadwearTextures()]);
scene.add(gltf.scene);
const wardrobe = createModularWardrobe(gltf.scene);
const bodyShape = createModularBody(gltf.scene);
const facialHair = createModularFacialHair(gltf.scene);
const hair = createModularHair(gltf.scene);
const identity = createModularIdentity(gltf.scene);
const appearance = createModularAppearance(gltf.scene, identity.frame);
hair.update(state);
const mixer = new THREE.AnimationMixer(gltf.scene);
let action = mixer.clipAction(gltf.animations.find((clip) => clip.name === state.clip));
action.play();

const faceMeshes = [];
gltf.scene.traverse((object) => {
  // One review figure can move far outside its first sampled skin bounds.
  if (object.isSkinnedMesh) object.frustumCulled = false;
  if (object.isSkinnedMesh && object.morphTargetDictionary) faceMeshes.push(object);
});
const morphNames = [...new Set(faceMeshes.flatMap((mesh) => Object.keys(mesh.morphTargetDictionary)))].filter((name) => !name.startsWith('rc_'));
for (const name of morphNames) state.raw[name] = 0;

let head = null;
gltf.scene.traverse((object) => { if (object.name === 'mixamorigHead' && !head) head = object; });
const headwear = createHeadwear(gltf.scene,state);
const eyelashes=createModularEyelashes(gltf.scene,{cohort:maleCharacter?'men':'women',seed:7});
const accessories=createPeriodAccessories(gltf.scene,{cohort:maleCharacter?'men':'women',frame:identity.frame});

function frameHead(sample = true) {
  // Sample the pose first: the seated idle carries the head well below the
  // bind pose.
  if (sample) mixer.update(1 / 30);
  gltf.scene.updateMatrixWorld(true);
  const target = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, (CHARACTER.headOffset ?? 0.04)+(headwear.hat ? .07 : 0), 0));
  camera.position.copy(target).add(new THREE.Vector3(0.08, 0.03, headwear.hat?1.05:CHARACTER.headDistance ?? .5));
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
  box.dataset.control = label;
  box.checked = value;
  box.addEventListener('change', () => onChange(box.checked));
  wrap.append(box, label);
  return wrap;
}

const characterRow = document.createElement('div');
characterRow.className = 'row';
const characterLabel = document.createElement('label');
characterLabel.textContent = 'Character';
const characterSelect = document.createElement('select');
for (const entry of CHARACTERS) {
  const option = document.createElement('option');
  option.value = entry.id;
  option.textContent = entry.label;
  option.selected = entry.id === CHARACTER.id;
  characterSelect.append(option);
}
characterSelect.addEventListener('change', () => {
  window.location.search = `?model=${characterSelect.value}`;
});
characterRow.append(characterLabel, characterSelect);
controlsHost.append(characterRow);
const hatDetails=document.createElement('details');hatDetails.open=true;
const hatSummary=document.createElement('summary');hatSummary.textContent='Hats';hatDetails.append(hatSummary);
function hatSelect(name,label,entries,onChange){
  const row=document.createElement('label');row.className='row';row.textContent=label;
  const select=document.createElement('select');select.name=name;
  for(const [value,text] of entries){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
  select.value=state[name]??(name==='hatClass'?'working':'');select.addEventListener('change',()=>onChange(select.value));row.append(select);hatDetails.append(row);return select;
}
hatSelect('hatStyle','Style',[['none','No hat'],...Object.entries(HEADWEAR_STYLES).map(([id,d])=>[id,d.label])],id=>{
  state.hatStyle=id;state.hatColor=null;state.hatDecoration=HEADWEAR_STYLES[id]?.trim??0;
  headwear.updateLook(state);headwear.update(0);syncAppearanceControls();frameTorso();
});
let hatClass='working';
hatSelect('hatHand','Holding hand',[['left','Left'],['right','Right']],value=>{state.hatHand=value;});
hatSelect('hatClass','Variation range',[['working','Working / plain'],['middle','Middle / everyday'],['affluent','Affluent / dress']],value=>{hatClass=value;});
for(const [name,label] of [['hatColor','Hat colour'],['hatBandColor','Ribbon colour']])hatSelect(name,label,[...(name==='hatColor'?[['','Style default']]:[]),...Object.keys(HEADWEAR_COLORS).map(id=>[id,id])],value=>{state[name]=value||null;});
for(const [name,label,min] of [['hatCrownHeight','Crown height',-1],['hatBrimWidth','Brim width',-1],['hatTilt','Forward tilt',-1],['hatDecoration','Trimming',0],['hatWear','Wear',0]]){
  const row=document.createElement('label');row.className='row';row.textContent=label;
  const input=document.createElement('input');input.type='range';input.min=min;input.max=1;input.step=.01;input.name=name;input.value=state[name]??0;
  input.addEventListener('input',()=>{state[name]=Number(input.value);});row.append(input);hatDetails.append(row);
}
const hatButtons=document.createElement('div');hatButtons.className='btnrow';
hatButtons.append(button('Vary hat',()=>{Object.assign(state,headwearVariation(++state.hatSeed,maleCharacter?'men':'women',hatClass));headwear.updateLook(state);headwear.update(0);syncAppearanceControls();frameTorso();}),
  button('Take hat off',()=>headwear.request(false)),button('Put hat on',()=>headwear.request(true)));
hatDetails.append(hatButtons);controlsHost.append(hatDetails);
if(CHARACTER.bakedHat){
  for(const control of hatDetails.querySelectorAll('input,select,button'))control.disabled=true;
  const note=document.createElement('p');note.textContent='This older model has a built-in cap. Choose Male — complete worker to use removable hats.';hatDetails.append(note);
}
if (identity.available) {
  const row = document.createElement('label'); row.className = 'row'; row.textContent = 'Start from look';
  const select = document.createElement('select'); select.name = 'castPreset';
  const custom = document.createElement('option'); custom.value = ''; custom.textContent = 'Custom'; select.append(custom);
  for (const preset of MODULAR_CAST_LOOKS) {
    const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.label;
    option.selected = preset.id === selectedCast?.id; select.append(option);
  }
  select.addEventListener('change',() => {
    const preset = MODULAR_CAST_LOOKS.find(entry => entry.id === select.value);
    if (!preset) return;
    if (preset.model !== CHARACTER.id) { location.search = '?model='+preset.model+'&preset='+preset.id; return; }
    Object.assign(state,{...preset.look,features:{...preset.look.features}}); syncAppearanceControls();
  });
  row.append(select); controlsHost.append(row);
}
const featureInputs = new Map();
const hairInputs = new Map();
const studySelects = [];
function syncAppearanceControls() {
  for(const name of Object.keys(ACCESSORY_DEFAULTS)){const input=controlsHost.querySelector(`[name="${name}"]`);if(input){input.value=state[name];if(input.type==='range')input.nextElementSibling.value=Number(state[name]).toFixed(2);}}
  for(const name of ['hatStyle','hatHand','hatColor','hatBandColor','hatCrownHeight','hatBrimWidth','hatTilt','hatDecoration','hatWear']){
    const input=controlsHost.querySelector(`[name="${name}"]`);if(input)input.value=state[name]??(name==='hatDecoration'?HEADWEAR_STYLES[state.hatStyle]?.trim??0:name==='hatColor'?'':0);
  }
  for (const name of ['identityVariant', 'outfit', 'palette', 'skinTone', 'hairTone', 'eyeTone', 'hairStyle','sideburns','moustache','lashProminence','lashTone']) {
    const select = controlsHost.querySelector(`select[name="${name}"]`);
    if (select) select.value = state[name];
  }
  for (const [name, { input, output }] of featureInputs) {
    input.value = state.features[name] || 0;
    output.value = Number(input.value).toFixed(2);
  }
  for (const [name, { input, output }] of hairInputs) {
    input.value = state[name] || 0;
    output.value = Number(input.value).toFixed(2);
  }
  for (const { select, studies, nose } of studySelects) {
    const names = Object.keys(MODULAR_FEATURES).filter((name) => name.startsWith('nose') === nose);
    select.value = studies.findIndex((study) => names.every((name) => (state.features[name] || 0) === (study.features[name] || 0)));
  }
}
if (identity.available) {
  const row = document.createElement('label');
  row.className = 'row';
  row.textContent = 'Base proportions';
  const select = document.createElement('select');
  select.name = 'identityVariant';
  MODULAR_IDENTITIES.forEach((name, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = name;
    select.append(option);
  });
  select.addEventListener('change', () => { state.identityVariant = Number(select.value); });
  row.append(select);
  controlsHost.append(row);
  if (identity.frame) {
    for (const [label, studies, nose] of [['Face study', MODULAR_FACE_STUDIES, false], ['Nose study', MODULAR_NOSE_STUDIES, true]]) {
      const row = document.createElement('label'); row.className = 'row'; row.textContent = label;
      const select = document.createElement('select'); select.name = nose ? 'noseStudy' : 'faceStudy';
      for (const [index, study] of studies.entries()) {
        const option = document.createElement('option'); option.value = index; option.textContent = study.name; select.append(option);
      }
      const custom = document.createElement('option'); custom.value = -1; custom.textContent = 'Custom'; select.append(custom);
      select.addEventListener('change', () => {
        const study = studies[Number(select.value)]; if (!study) return;
        for (const name of Object.keys(MODULAR_FEATURES)) if (name.startsWith('nose') === nose) delete state.features[name];
        Object.assign(state.features, study.features);
        syncAppearanceControls();
      });
      row.append(select); controlsHost.append(row); studySelects.push({ select, studies, nose });
    }
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Feature controls'; details.append(summary);
    for (const [name, label] of Object.entries(MODULAR_FEATURES)) {
      const row = document.createElement('label'); row.className = 'row'; row.textContent = label;
      const input = document.createElement('input'); input.type = 'range'; input.min = -1; input.max = 1; input.step = .05; input.value = 0; input.name = name;
      const output = document.createElement('output'); output.value = '0.00';
      input.addEventListener('input', () => { state.features[name] = Number(input.value); syncAppearanceControls(); });
      featureInputs.set(name, { input, output }); row.append(input, output); details.append(row);
    }
    controlsHost.append(details);
  }
}

if(eyelashes.available){
  for(const [name,label,choices]of [['lashProminence','Eyelashes',EYELASH_LEVELS.map((d,i)=>[i,d.label])],['lashTone','Lash colour',Object.entries(EYELASH_TONES)]]){
    const row=document.createElement('label');row.className='row';row.textContent=label;
    const select=document.createElement('select');select.name=name;
    for(const [value,text]of choices){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    select.addEventListener('change',()=>{state[name]=name==='lashProminence'?Number(select.value):select.value;});row.append(select);controlsHost.append(row);
  }
}

if(accessories.available){
  const details=document.createElement('details');details.open=true;
  const summary=document.createElement('summary');summary.textContent='ACCESSORIES';details.append(summary);
  const labels={glassesStyle:'Spectacles',glassesMetal:'Frame metal',lensTint:'Lenses',neckwearStyle:'Neckwear',neckwearColor:'Cloth colour',neckwearPattern:'Cloth pattern',neckwearFabric:'Fabric finish',neckwearAccent:'Motif colour',broochStyle:'Brooch',earringStyle:'Earrings',locketStyle:'Locket',jewelryMetal:'Jewellery metal',jewelryStone:'Stone',tiePin:'Tie pin',collarStud:'Collar stud',watchChain:'Watch chain'};
  for(const [name,choices]of Object.entries(ACCESSORY_CHOICES)){
    const row=document.createElement('label');row.className='row';row.textContent=labels[name];const select=document.createElement('select');select.name=name;
    for(const [value,label]of Object.entries(choices)){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
    select.addEventListener('change',()=>{state[name]=select.value;});row.append(select);details.append(row);
  }
  const fit=document.createElement('details'),title=document.createElement('summary');title.textContent='FIT AND FABRIC';fit.append(title);
  for(const [name,label]of [['glassesSize','Lens size'],['glassesBridge','Bridge width'],['glassesHeight','Frame height'],['glassesDepth','Frame depth'],['glassesWeight','Wire thickness'],['neckwearScale','Neckwear size'],['neckwearPatternScale','Pattern size'],['neckwearWear','Cloth wear']]){
    const row=document.createElement('label');row.className='row';row.textContent=label;const input=document.createElement('input'),output=document.createElement('output');input.name=name;input.type='range';input.min=name==='neckwearWear'?0:-1;input.max=1;input.step=.05;input.value=state[name];output.value=Number(state[name]).toFixed(2);
    input.addEventListener('input',()=>{state[name]=Number(input.value);output.value=Number(input.value).toFixed(2);});row.append(input,output);fit.append(row);
  }
  details.append(fit);const row=document.createElement('div');row.className='btnrow';
  const range=document.createElement('select');range.setAttribute('aria-label','Accessory range');for(const value of ['plain','everyday','dress']){const option=document.createElement('option');option.value=value;option.textContent=value;range.append(option);}
  row.append(range,button('Vary accessories',()=>{Object.assign(state,accessoryVariation(++state.accessorySeed,maleCharacter?'men':'women',range.value,state.outfit));syncAppearanceControls();}));details.append(row);controlsHost.append(details);
}

if (appearance.available) {
  for (const [name, label, choices] of [['skinTone', 'Skin tone', MODULAR_SKIN_TONES], ['hairTone', 'Hair colour', MODULAR_HAIR_TONES], ['eyeTone', 'Eye colour', MODULAR_EYE_TONES]]) {
    const row = document.createElement('label'); row.className = 'row'; row.textContent = label;
    const select = document.createElement('select'); select.name = name;
    for (const [value, entry] of Object.entries(choices)) {
      const option = document.createElement('option'); option.value = value; option.textContent = entry.label; select.append(option);
    }
    select.addEventListener('change', () => { state[name] = select.value; }); row.append(select); controlsHost.append(row);
  }
  const row = document.createElement('div'); row.className = 'btnrow';
  const seed = document.createElement('input'); seed.type = 'number'; seed.min = 1; seed.value = variationSeed === null ? 1 : Number(variationSeed); seed.setAttribute('aria-label', 'Variation seed'); seed.style.width = '65px';
  const applySeed = () => { Object.assign(state, createModularVariation(Number(seed.value),CHARACTER.id.startsWith('male-'))); syncAppearanceControls(); };
  row.append(seed, button('Apply seed', applySeed), button('New variation', () => { seed.value = Number(seed.value)+1; applySeed(); }));
  controlsHost.append(row);
  controlsHost.append(button('Save character recipe', () => {
    const url=URL.createObjectURL(new Blob([JSON.stringify(characterRecipe(),null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=CHARACTER.id+'-recipe.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }));
}

if (hair.available) {
  const row = document.createElement('label'); row.className = 'row'; row.textContent = 'Hairstyle';
  const select = document.createElement('select'); select.name = 'hairStyle';
  for (const id of hair.styles) {
    const option = document.createElement('option'); option.value = id; option.textContent = MODULAR_HAIR_STYLES[id]; select.append(option);
  }
  select.addEventListener('change', () => { state.hairStyle = select.value; });
  row.append(select); controlsHost.append(row);
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'Hair grooming'; details.append(summary);
  for (const [name, control] of Object.entries(MODULAR_HAIR_CONTROLS).filter(([name])=>hair.controls.includes(name))) {
    const row = document.createElement('label'); row.className = 'row'; row.textContent = control.label;
    const input = document.createElement('input'); input.type = 'range'; input.name = name;
    input.min = control.min; input.max = control.max; input.step = .05; input.value = 0;
    const output = document.createElement('output'); output.value = '0.00';
    input.addEventListener('input', () => { state[name] = Number(input.value); output.value = Number(input.value).toFixed(2); });
    hairInputs.set(name, { input, output }); row.append(input, output); details.append(row);
  }
  controlsHost.append(details);
}

if (facialHair.available) {
  for (const [name, choices] of [['sideburns',MODULAR_SIDEBURNS],['moustache',MODULAR_MOUSTACHES]]) {
    const row=document.createElement('label'); row.className='row'; row.textContent=name==='sideburns'?'Sideburns':'Moustache';
    const select=document.createElement('select'); select.name=name;
    for(const [id,label] of Object.entries(choices)){const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option);}
    select.addEventListener('change',()=>{state[name]=select.value;});row.append(select);controlsHost.append(row);
  }
}
if (bodyShape.available) {
  const details = document.createElement('details'); details.open = true;
  const summary = document.createElement('summary'); summary.textContent = 'Body proportions'; details.append(summary);
  for (const [name,label] of Object.entries(MODULAR_BODY_CONTROLS)) {
    const row = document.createElement('label'); row.className = 'row'; row.textContent = label;
    const input = document.createElement('input'); input.type = 'range'; input.min = -1; input.max = 1; input.step = .05; input.value = state[name]; input.name = name;
    const output = document.createElement('output'); output.value = Number(input.value).toFixed(2);
    input.addEventListener('input', () => { state[name] = Number(input.value); output.value = Number(input.value).toFixed(2); });
    hairInputs.set(name,{input,output}); row.append(input,output); details.append(row);
  }
  controlsHost.append(details);
}

if (wardrobe.available) {
  for (const [name, choices] of [['outfit', wardrobe.outfits], ['palette', ['original', 'navy', 'forest', 'taupe']]]) {
    const row = document.createElement('label');
    row.className = 'row';
    row.textContent = name === 'outfit' ? 'Outfit' : 'Fabric';
    const select = document.createElement('select');
    select.name = name;
    for (const value of choices) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value.replaceAll('-', ' ');
      select.append(option);
    }
    select.addEventListener('change', () => { state[name] = select.value; });
    row.append(select);
    controlsHost.append(row);
  }
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
performanceSection.append(check('Pause motion', state.paused, (value) => { state.paused = value; }));
const viewRow = document.createElement('div');
viewRow.className = 'btnrow';
function frameBody() {
  camera.position.set(0.35, 1.05, headwear.hat?4.1:CHARACTER.id.startsWith('male-') ? 3.7 : 3.1);
  orbit.target.set(0, headwear.hat ? .9 : .78, 0);
  orbit.update();
}
function frameTorso() {
  gltf.scene.updateMatrixWorld(true);
  const target=head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,-.30,0));
  camera.position.copy(target).add(new THREE.Vector3(.10,.02,headwear.hat?2.8:1.9));orbit.target.copy(target);orbit.update();
}
function frameAccessories(){
  gltf.scene.updateMatrixWorld(true);
  const target=head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,-.17,.035));
  camera.position.copy(target).add(new THREE.Vector3(.06,.01,.65));orbit.target.copy(target);orbit.update();
}
function frameMouth(){
  gltf.scene.updateMatrixWorld(true);
  const lips=gltf.scene.getObjectByName('Carmela_Lips');if(!lips)return;
  const target=new THREE.Box3().setFromObject(lips,true).getCenter(new THREE.Vector3());
  camera.position.copy(target).add(new THREE.Vector3(.01,.005,.24));orbit.target.copy(target);orbit.update();
}
viewRow.append(button('Face', frameHead), button('Mouth',frameMouth), button('Accessories',frameAccessories), button('Torso', frameTorso), button('Whole figure', frameBody));
performanceSection.append(viewRow);
controlsHost.append(performanceSection);

const rawSection = document.createElement('div');
// Opposing shapes cancel when driven together (blink vs wide, smile vs
// frown), so judging a shape means seeing it alone. Solo zeroes the rest
// whenever a slider moves.
let solo = true;
const zeroAll = (except = null) => {
  for (const name of morphNames) {
    if (name === except) continue;
    state.raw[name] = 0;
    const slider = rawSection.querySelector(`input[data-morph="${name}"]`);
    if (slider) { slider.value = 0; slider.nextElementSibling.value = '0.00'; }
  }
};
const zeroRow = document.createElement('div');
zeroRow.className = 'btnrow';
zeroRow.append(button('Zero all', () => zeroAll()));
zeroRow.append(button('Log values', () => {
  const active = Object.fromEntries(Object.entries(state.raw).filter(([, v]) => v > 0));
  console.log(JSON.stringify(active, null, 2));
}));
rawSection.append(zeroRow);
rawSection.append(check('Solo (one shape at a time)', solo, (value) => { solo = value; }));
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
    if (solo) zeroAll(name);
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
  identity.update(state.identityVariant, state.features);
  appearance.update(state);
  hair.update(state);
  if(CHARACTER.bakedHat)state.hatStyle='none';
  headwear.updateLook(state);
  bodyShape.update(state);
  facialHair.update(state);
  eyelashes.updateLook(state);
  const seated = state.clip === 'ClinicIdle' || state.clip.startsWith('Sitting')
    || (state.clip === 'SitDown' && action.time / action.getClip().duration > .65)
    || (state.clip === 'StandUp' && action.time / action.getClip().duration < .35);
  wardrobe.update({ seated, apron: state.outfit === 'work-apron', outfit:state.outfit, palette: state.palette, dt:delta });
  accessories.updateLook(state);
  if (state.mode === 'raw') {
    for (const mesh of faceMeshes) {
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        if (name.startsWith('rc_')) continue;
        mesh.morphTargetInfluences[index] = state.raw[name] || 0;
      }
    }
    return;
  }
  const weights = {};
  const modular = morphNames.includes('speechOpen') && !state.legacyExpressions;
  for (const [name, value] of Object.entries(expressionFaceWeights(state.expression, modular, state.speaking))) {
    weights[name] = value;
  }
  for (const [name, value] of Object.entries(FACIAL_GAZE_RECIPES.none || {})) weights[name] = value;
  if (modular) Object.assign(weights,idleGazeWeights(elapsed,state.performanceSeed,'doctor',state.speaking));
  if (state.autoBlink && modular) {
    Object.assign(weights,blinkEyelids(weights,blinkFaceWeights(elapsed,state.performanceSeed)));
  } else if (state.autoBlink) {
    const blinkTime = elapsed % 4.6;
    if (blinkTime < 0.16) {
      const amount = Math.sin((blinkTime / 0.16) * Math.PI) * 0.92;
      weights.eyeBlinkLeft = Math.min(1, (weights.eyeBlinkLeft || 0) + amount);
      weights.eyeBlinkRight = Math.min(1, (weights.eyeBlinkRight || 0) + amount);
    }
  }
  if (state.speaking) Object.assign(weights, morphNames.includes('speechOpen')
    ? speechFaceWeights(elapsed, state.performanceSeed)
    : { jawOpen: speechJawWeight(elapsed, state.performanceSeed) });
  for (const mesh of faceMeshes) {
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      if (name.startsWith('rc_')) continue;
      mesh.morphTargetInfluences[index] = weights[name] ? safeFaceWeight(name, weights[name], modular) : 0;
    }
  }
}

// The capture runner uses the same meshes, clips, and controls as this page.
// Freeze a precise pose so review time cannot change a comparison image.
let surfaceVisibility=null;
let surfaceSelection=null;
function characterRecipe() {
  const keys=['identityVariant','features','skinTone','hairTone','eyeTone','outfit','palette','hairStyle',
    'hairVolume','hairWave','hairBunHeight','hairPartOffset','hairEarCoverage','hairlineHeight','hairlinePeak','hairlineRecession','hairlineAsymmetry','hairThinning','sideburns','moustache','bellySize','waistWidth'];
  keys.push('hatStyle','hatHand','hatSeed','hatColor','hatBandColor','hatCrownHeight','hatBrimWidth','hatTilt','hatDecoration','hatWear');
  keys.push('lashProminence','lashSeed','lashTone');
  keys.push(...Object.keys(ACCESSORY_DEFAULTS));
  return {model:CHARACTER.id,look:structuredClone(Object.fromEntries(keys.map(key=>[key,state[key]])))};
}

window.__faceLab = {
  recipe:characterRecipe,
  eyelashes:()=>eyelashes.describe(),
  accessories:()=>accessories.describe(),
  mouthFit(){
    gltf.scene.updateMatrixWorld(true);
    const lips=gltf.scene.getObjectByName('Carmela_Lips'),face=gltf.scene.getObjectByName('Carmela_Face');
    const points=mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
    const lp=points(lips),fp=points(face),index=lips.geometry.index,edges=new Map();
    for(let i=0;i<index.count;i+=3)for(const [a,b]of [[0,1],[1,2],[2,0]]){
      const pair=[index.getX(i+a),index.getX(i+b)].sort((a,b)=>a-b),key=pair.join('/');
      edges.set(key,(edges.get(key)||0)+1);
    }
    const adjacency=new Map();
    for(const [key,count]of edges)if(count===1){
      const [a,b]=key.split('/').map(Number);
      for(const [x,y]of [[a,b],[b,a]]){
        if(!adjacency.has(x))adjacency.set(x,[]);
        adjacency.get(x).push(y);
      }
    }
    const seen=new Set(),loops=[];
    for(const start of adjacency.keys()){
      if(seen.has(start))continue;
      const stack=[start],loop=[];
      while(stack.length){
        const id=stack.pop();if(seen.has(id))continue;
        seen.add(id);loop.push(id);
        stack.push(...adjacency.get(id).filter(i=>!seen.has(i)));
      }
      const box=new THREE.Box3().setFromPoints(loop.map(i=>lp[i]));
      let gap=0;
      for(const id of loop){
        let nearest=Infinity;
        for(const p of fp)nearest=Math.min(nearest,p.distanceTo(lp[id]));
        gap=Math.max(gap,nearest);
      }
      loops.push({vertices:loop.length,height:box.max.y-box.min.y,maxGap:gap});
    }
    return loops;
  },
  headwear(action,progress){
    needsFrame = true;
    if(action){if(progress===undefined)headwear.request(action==='replace'||action==='worn');else{headwear.restorePose();headwear.sample(action,progress);renderer.render(scene,camera);}}
    return headwear.describe();
  },
  pickSurface(x,y) {
    const rect=renderer.domElement.getBoundingClientRect();
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),camera);
    const hit=ray.intersectObject(gltf.scene,true).find(({object})=>{for(let p=object;p;p=p.parent)if(!p.visible)return false;return true;});
    if(!hit)return null;
    const mesh=hit.object,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    const skin=mesh.isSkinnedMesh&&hit.face?[hit.face.a,hit.face.b,hit.face.c].map(index=>({index,bones:[0,1,2,3].map(component=>({name:mesh.skeleton.bones[indices.getComponent(index,component)]?.name,weight:weights.getComponent(index,component)})).filter(bone=>bone.weight>.001)})):null;
    return {mesh:mesh.name,face:hit.faceIndex,point:hit.point.toArray(),material:mesh.material.name,skin};
  },
  inspectShading(mode = 'normal') {
    gltf.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (mode === 'original' && !mesh.userData.reviewMaterial) return;
      if (!mesh.userData.reviewMaterial) mesh.userData.reviewMaterial = mesh.material;
      const original = mesh.userData.reviewMaterial;
      if (mesh.material !== original) mesh.material.dispose();
      mesh.material = mode === 'mouth-fit'
        ? new THREE.MeshBasicMaterial({color:mesh.name.startsWith('Carmela_Teeth')?'#ff0000':'#404040',side:THREE.DoubleSide})
        : mode === 'eye-fit'
        ? new THREE.MeshBasicMaterial({color:mesh.name.startsWith('Carmela_Eye_')?'#ff0000':mesh.name.startsWith('Carmela_Lid_')?'#375b9b':'#242424',side:THREE.DoubleSide})
        : mode === 'original' ? original : mode === 'texture'
        ? new THREE.MeshBasicMaterial({ map: original.map, color: original.color, side: THREE.DoubleSide })
        : mode === 'front' ? Object.assign(original.clone(), { side: THREE.FrontSide })
        : new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
      if (mode === 'original') delete mesh.userData.reviewMaterial;
    });
    renderer.render(scene, camera);
  },
  inspectSurfaces(only=null) {
    const meshes=[];gltf.scene.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
    if(!surfaceVisibility)surfaceVisibility=new Map(meshes.map(mesh=>[mesh,mesh.visible]));
    surfaceSelection=only;
    for(const mesh of meshes)mesh.visible=surfaceVisibility.get(mesh)&&(!only||only.some(name=>mesh.name.startsWith(name)));
    renderer.render(scene,camera);
    return meshes.map(mesh=>({name:mesh.name,visible:mesh.visible,material:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.name)}));
  },
  show({ clip = 'ClinicIdle', time = 0, weights = {}, expression = null, speaking = false, faceTime = 1, legacyExpressions = false, view = 'face', angle = 0, outfit = CHARACTER.outfit || (CHARACTER.id.startsWith('male-') ? 'tailored-clothes' : 'day-dress'), palette = 'original', identityVariant = 0, features = {}, skinTone = 'original', hairTone = 'original', eyeTone = 'original', hairStyle = CHARACTER.id.startsWith('male-') ? 'short-side-part' : 'soft-side-waves', hairVolume = 0, hairWave = 0, hairBunHeight = 0, hairPartOffset = 0, hairEarCoverage = .3, hairlineHeight=0, hairlinePeak=0, hairlineRecession=0, hairlineAsymmetry=0, hairThinning=0, autoBlink = false, performanceSeed = 7, bellySize = 0, waistWidth = 0, sideburns = 'short-sideburns', moustache = 'none', lashProminence = maleCharacter?2:3, lashSeed = 7, lashTone = 'auto', headwearAction = 'worn', hatProgress = 0, ...headwearLook } = {}) {
    needsFrame = true;
    accessories.resetMotion?.();
    headwear.restorePose();
    window.__faceLab.inspectShading('original');
    if(surfaceVisibility){for(const [mesh,visible] of surfaceVisibility)mesh.visible=visible;surfaceVisibility=null;surfaceSelection=null;}
    const selected = gltf.animations.find((entry) => entry.name === clip);
    if (!selected) throw new Error(`Unknown body clip: ${clip}`);
    mixer.stopAllAction();
    action = mixer.clipAction(selected).reset().play();
    action.time = Math.max(0, Math.min(selected.duration, time));
    state.clip = clip;
    for (const child of clipRow.children) child.classList.toggle('active', child.textContent === clip);
    state.outfit = outfit;
    state.palette = palette;
    state.identityVariant = identityVariant;
    state.features = { ...features }; state.skinTone = skinTone; state.hairTone = hairTone; state.eyeTone = eyeTone;
    Object.assign(state, { sideburns, moustache, bellySize, waistWidth, hairStyle, hairVolume, hairWave, hairBunHeight, hairPartOffset, hairEarCoverage, hairlineHeight, hairlinePeak, hairlineRecession, hairlineAsymmetry, hairThinning });
    Object.assign(state,{...ACCESSORY_DEFAULTS,...Object.fromEntries(Object.keys(ACCESSORY_DEFAULTS).filter(name=>defaultCast?.look[name]!==undefined).map(name=>[name,defaultCast.look[name]])),lashProminence,lashSeed,lashTone,hatStyle:'none',hatHand:'left',hatColor:null,hatBandColor:'black',hatCrownHeight:0,hatBrimWidth:0,hatTilt:0,hatDecoration:null,hatWear:0,...headwearLook});
    syncAppearanceControls();
    for (const name of ['outfit', 'palette', 'identityVariant']) {
      const select = document.querySelector(`select[name="${name}"]`);
      if (select) select.value = state[name];
    }
    mixer.update(0);
    state.paused = true;
    state.autoBlink = autoBlink;
    state.performanceSeed = performanceSeed;
    state.legacyExpressions = legacyExpressions;
    state.speaking = expression !== null && speaking;
    setMode('raw');
    zeroAll();
    for (const [name, value] of Object.entries(weights)) {
      if (!morphNames.includes(name)) throw new Error(`Missing morph: ${name}`);
      state.raw[name] = Math.max(0, Math.min(1, value));
      const slider = rawSection.querySelector(`input[data-morph="${name}"]`);
      if (slider) { slider.value = state.raw[name]; slider.nextElementSibling.value = state.raw[name].toFixed(2); }
    }
    if (expression !== null) {
      state.expression = expression;
      elapsed = faceTime;
      setMode('performance');
    }
    for (const child of expressionRow.children) child.classList.toggle('active', child.textContent === expression);
    for (const [label, checked] of [['Speaking', state.speaking], ['Auto blink', autoBlink], ['Pause motion', true]]) {
      controlsHost.querySelector(`input[data-control="${label}"]`).checked = checked;
    }
    drive(0);
    headwear.sample(headwearAction,hatProgress);
    gltf.scene.updateMatrixWorld(true);
    if (view === 'body') frameBody();
    else if(view==='mouth')frameMouth();
    else if(view==='accessories')frameAccessories();
    else if (view === 'torso') frameTorso();
    else frameHead(false);
    camera.position.sub(orbit.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(orbit.target);
    orbit.update();
    eyelashes.update(camera,renderer.domElement.height);
    accessories.update();
    renderer.render(scene, camera);
    const apronMesh=gltf.scene.getObjectByName('Patient_WorkApronStanding');
    return {
      headwear:headwear.describe(),eyelashes:eyelashes.describe(),accessories:accessories.describe(),
      apronDrape:apronMesh?.morphTargetInfluences?.[apronMesh.morphTargetDictionary?.rc_workSeated]??null,
      apronFit:apronMesh?.material.userData.workLegFit??null,
      sideburns, moustache, bellySize, waistWidth, bodyAvailable: bodyShape.available,
      model: CHARACTER.id, clip, time: action.time, expression, speaking, faceTime, autoBlink, performanceSeed, weights: { ...weights }, outfit, palette, identityVariant, features: { ...features }, skinTone, hairTone, eyeTone, frame: identity.frame,
      hairStyle, hairControls:hair.controls, hairVolume, hairWave, hairBunHeight, hairPartOffset, hairEarCoverage, hairlineHeight, hairlinePeak, hairlineRecession, hairlineAsymmetry, hairThinning,
      hairMeshes: faceMeshes.filter(mesh => mesh.name.startsWith('Carmela_HairStyle_')).map(mesh => ({ name: mesh.name, visible: mesh.visible, material: mesh.material.name, alphaTest: mesh.material.alphaTest })),
      morphs: morphNames, faceMeshes: faceMeshes.map((mesh) => mesh.name),
      head: head.getWorldPosition(new THREE.Vector3()).toArray(),
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      appliedWeights: Object.fromEntries(morphNames.map(name => {
        const mesh = faceMeshes.find(mesh => mesh.morphTargetDictionary[name] !== undefined);
        return [name, mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]]];
      }).filter(([, value]) => value > .0001)),
    };
  },
};

resize();
syncAppearanceControls();
frameHead();
controls.addEventListener('change', () => { needsFrame = true; });
for (const event of ['input', 'change', 'click']) controlsHost.addEventListener(event, () => { needsFrame = true; });
window.addEventListener('resize', () => { needsFrame = true; });
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  if (state.paused && !needsFrame && !headwear.busy) return;
  needsFrame = false;
  headwear.restorePose();
  if (!state.paused) mixer.update(delta);
  drive(state.paused ? 0 : delta);
  headwear.update(delta);
  eyelashes.update(camera,renderer.domElement.height);
  accessories.update(state.paused?0:delta);
  const expression = state.mode === 'raw'
    ? Object.entries(state.raw).filter(([, value]) => value > 0).map(([name, value]) => `${name} ${value.toFixed(2)}`).join(', ') || 'neutral'
    : state.expression;
  hud.textContent = `${state.mode} · ${expression}${state.speaking ? ' · speaking' : ''}\n${state.clip}`;
  if(surfaceVisibility)for(const [mesh,visible] of surfaceVisibility)mesh.visible=visible&&(!surfaceSelection||surfaceSelection.some(name=>mesh.name.startsWith(name)));
  renderer.render(scene, camera);
});

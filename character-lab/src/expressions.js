import * as THREE from 'three';

/* Runtime facial performances for the identity-baked character mesh.

   A believable smile is not an upward translation of the whole mouth. AU12
   pulls the mouth corners superolaterally and slightly back while the lip
   centre stays comparatively quiet. In a stronger (Duchenne-like) smile, AU6
   raises the cheeks and lower lids while the upper lids descend a little. The
   eyeballs themselves never rotate upward; that exposes superior sclera and
   produces the familiar startled/uncanny look.

   Renderer A composes exported MPFB face units and broadcasts their weights to
   matching fitted facial meshes. Renderer B retains the older procedural
   body-mesh morphs until its final topology receives a deterministic transfer.
   Both paths share the same restrained-smile and delayed-eye performance model.
*/

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);
const gauss = (distance, sigma) => Math.exp(-(distance * distance) / (2 * sigma * sigma));
const smooth = (value) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

/* Semantic performances are deliberately data, not geometry. Renderer A gets
   these stable ARKit-compatible targets from MPFB's faceunits01 pack. The
   values are restrained maxima: expression intensity and timing are layered
   on top at runtime. */
export const EXPRESSION_RECIPES = Object.freeze({
  smileMouth: Object.freeze({
    mouthSmileLeft: 0.72,
    mouthSmileRight: 0.69,
    mouthDimpleLeft: 0.10,
    mouthDimpleRight: 0.12,
    mouthStretchLeft: 0.06,
    mouthStretchRight: 0.06,
  }),
  smileEyes: Object.freeze({
    cheekSquintLeft: 0.34,
    cheekSquintRight: 0.36,
    eyeSquintLeft: 0.12,
    eyeSquintRight: 0.13,
  }),
  sadness: Object.freeze({
    browInnerUp: 0.48,
    browDownLeft: 0.08,
    browDownRight: 0.08,
    mouthFrownLeft: 0.42,
    mouthFrownRight: 0.45,
    mouthShrugLower: 0.10,
  }),
  fatigue: Object.freeze({
    eyeBlinkLeft: 0.28,
    eyeBlinkRight: 0.31,
    eyeSquintLeft: 0.08,
    eyeSquintRight: 0.09,
    browInnerUp: 0.06,
    mouthFrownLeft: 0.07,
    mouthFrownRight: 0.08,
  }),
});

const REQUIRED_MPFB_UNITS = ['mouthSmileLeft', 'mouthSmileRight', 'browInnerUp', 'eyeBlinkLeft', 'eyeBlinkRight'];

function findFaceMeshes(model) {
  let body = null;
  let eyes = null;
  model.traverse((object) => {
    if (!object.isMesh) return;
    const name = object.name.toLowerCase();
    if (name === 'human_body') body = object;
    else if (!eyes && (name === 'eyes' || name.includes('eyeball'))) eyes = object;
    else if (!body && object.isSkinnedMesh && (object.geometry?.attributes?.position?.count || 0) > 5000) body = object;
  });
  return { body, eyes };
}

function eyeCentresInBodySpace(model, body, eyes) {
  if (!eyes?.geometry?.attributes?.position) return null;
  model.updateMatrixWorld(true);
  const toBody = body.matrixWorld.clone().invert().multiply(eyes.matrixWorld);
  const position = eyes.geometry.attributes.position;
  const sums = [new THREE.Vector3(), new THREE.Vector3()];
  const counts = [0, 0];
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(toBody);
    const side = point.x < 0 ? 0 : 1;
    sums[side].add(point);
    counts[side] += 1;
  }
  if (!counts[0] || !counts[1]) return null;
  return sums.map((sum, side) => sum.multiplyScalar(1 / counts[side]));
}

function faceSurfaceZ(position, eye) {
  let surfaceZ = -Infinity;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getX(i) - eye.x) > 0.025) continue;
    if (Math.abs(position.getY(i) - eye.y) > 0.020) continue;
    surfaceZ = Math.max(surfaceZ, position.getZ(i));
  }
  return Number.isFinite(surfaceZ) ? surfaceZ : eye.z + 0.008;
}

function appendRelativeMorph(body, delta, name) {
  const geometry = body.geometry;
  if (!geometry.morphAttributes.position) {
    geometry.morphAttributes.position = [];
    geometry.morphTargetsRelative = true;
  }
  // All morphs added by this module are relative. Avoid mixing them with an
  // authored absolute target, should the source GLB gain one in the future.
  if (!geometry.morphTargetsRelative) return null;
  const attribute = new THREE.Float32BufferAttribute(delta, 3);
  attribute.name = name;
  geometry.morphAttributes.position.push(attribute);
  return name;
}

function episodeEnvelope(episode, elapsed, delay = 0) {
  const t = elapsed - delay;
  if (t <= 0) return 0;
  const { attack, hold, release, peak } = episode;
  if (t < attack) return peak * smooth(t / attack);
  if (t < attack + hold) return peak;
  if (t < attack + hold + release) return peak * smooth(1 - (t - attack - hold) / release);
  return 0;
}

export function smileEyeIntensity(smile) {
  // AU6 usually joins after the oral smile is already legible. Suppressing it
  // at low values avoids turning every polite smile into a fixed squint.
  return 0.78 * smooth((clamp01(smile) - 0.16) / 0.84);
}

function createLegacyExpressions(model) {
  const { body, eyes } = findFaceMeshes(model);
  if (!body) return null;
  const geometry = body.geometry;
  const position = geometry.attributes.position;

  /* Landmarks in bind space (Y-up, face toward +Z). */
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i++) maxY = Math.max(maxY, position.getY(i));
  const bandMin = maxY - 0.17;

  let noseZ = -Infinity;
  let noseY = 0;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < bandMin) continue;
    const z = position.getZ(i);
    if (z > noseZ) {
      noseZ = z;
      noseY = y;
    }
  }

  // The widest front-facing points in the shallow lip band are stable across
  // the generated face shapes. The x cap prevents the cheek silhouette from
  // being mistaken for a mouth corner.
  let cornerR = null;
  let cornerL = null;
  let maxX = -Infinity;
  let minX = Infinity;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < noseY - 0.045 || y > noseY - 0.015) continue;
    const z = position.getZ(i);
    if (z < noseZ - 0.028) continue;
    const x = position.getX(i);
    if (Math.abs(x) > 0.042) continue;
    if (x > maxX) {
      maxX = x;
      cornerR = new THREE.Vector3(x, y, z);
    }
    if (x < minX) {
      minX = x;
      cornerL = new THREE.Vector3(x, y, z);
    }
  }
  if (!cornerL || !cornerR) return null;

  const mouthY = (cornerL.y + cornerR.y) / 2;
  const cornerZ = (cornerL.z + cornerR.z) / 2;
  const halfWidth = Math.max(0.018, (cornerR.x - cornerL.x) / 2);
  const fieldMin = maxY - 0.26;
  const eyeCentres = eyeCentresInBodySpace(model, body, eyes) || [
    cornerL.clone().add(new THREE.Vector3(-0.007, 0.061, -0.005)),
    cornerR.clone().add(new THREE.Vector3(0.007, 0.061, -0.005)),
  ];
  const eyeLandmarks = eyeCentres.map((centre) => ({
    centre,
    surfaceZ: faceSurfaceZ(position, centre),
  }));

  const mouthDelta = new Float32Array(position.count * 3);
  const eyeDelta = new Float32Array(position.count * 3);
  const sadMouthDelta = new Float32Array(position.count * 3);
  const sadBrowDelta = new Float32Array(position.count * 3);
  const fatigueDelta = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (y < fieldMin || z < noseZ - 0.1) continue;
    const sign = Math.sign(x) || 1;

    /* AU12: a pronounced corner pull, not a uniformly raised mouth. The lip
       compression term thins the vermilion toward its seam and prevents an
       inflated/rubber-mouth silhouette at full intensity. */
    const lateral = Math.min(1.25, Math.abs(x) / (halfWidth * 1.10));
    const lipWeight = gauss(y - mouthY, 0.0095) * gauss(z - cornerZ, 0.018);
    const cornerFactor = smooth((lateral - 0.24) / 0.76);
    const centreFactor = 1 - smooth(lateral / 0.58);
    let mouthDx = sign * 0.0044 * cornerFactor * lipWeight;
    let mouthDy = (0.0090 * cornerFactor - 0.00035 * centreFactor) * lipWeight;
    let mouthDz = -0.0021 * (0.30 + 0.70 * cornerFactor) * lipWeight;
    const lipSide = Math.tanh((y - mouthY) / 0.0032);
    mouthDy -= lipSide * 0.00115 * (0.45 + 0.55 * cornerFactor) * lipWeight;

    // Soft nasolabial/cheek recruitment accompanies the oral pull, but the
    // stronger orbital cheek mound remains in the independent AU6 target.
    for (const corner of [cornerL, cornerR]) {
      const cheekX = corner.x + Math.sign(corner.x) * 0.010;
      const cheekY = corner.y + 0.035;
      const w = gauss(x - cheekX, 0.022) * gauss(y - cheekY, 0.025)
        * gauss(z - (corner.z - 0.010), 0.025) * smooth((y - mouthY) / 0.012);
      mouthDy += 0.0017 * w;
      mouthDx += Math.sign(corner.x) * 0.0007 * w;
      mouthDz += 0.0005 * w;
    }
    mouthDelta[i * 3] = mouthDx;
    mouthDelta[i * 3 + 1] = mouthDy;
    mouthDelta[i * 3 + 2] = mouthDz;

    /* Sadness: AU15 depresses the corners while the central lip stays nearly
       still. Keeping this separate from the brow lets a generated patient be
       subdued rather than permanently theatrical. */
    sadMouthDelta[i * 3] = -sign * 0.0013 * cornerFactor * lipWeight;
    sadMouthDelta[i * 3 + 1] = (-0.0064 * cornerFactor + 0.0005 * centreFactor) * lipWeight;
    sadMouthDelta[i * 3 + 2] = -0.0008 * cornerFactor * lipWeight;

    /* AU6: lower lid rises, upper lid lowers slightly, and the malar cheek
       bulges. Moving both lids toward the iris narrows the palpebral aperture;
       it never exposes extra white above the iris. */
    let eyeDx = 0;
    let eyeDy = 0;
    let eyeDz = 0;
    let sadBrowDx = 0;
    let sadBrowDy = 0;
    let sadBrowDz = 0;
    let fatigueDx = 0;
    let fatigueDy = 0;
    let fatigueDz = 0;
    for (const eye of eyeLandmarks) {
      const { centre, surfaceZ } = eye;
      const xWeight = gauss(x - centre.x, 0.018);
      const zWeight = gauss(z - surfaceZ, 0.014);
      const lowerLid = xWeight * gauss(y - (centre.y - 0.0060), 0.0048) * zWeight;
      const upperLid = xWeight * gauss(y - (centre.y + 0.0062), 0.0045) * zWeight;
      eyeDy += 0.00135 * lowerLid;
      eyeDy -= 0.00080 * upperLid;
      eyeDz += 0.00040 * lowerLid;

      const cheekX = centre.x + Math.sign(centre.x) * 0.003;
      const cheekY = centre.y - 0.021;
      const cheek = gauss(x - cheekX, 0.025) * gauss(y - cheekY, 0.020)
        * gauss(z - (surfaceZ - 0.013), 0.027);
      eyeDy += 0.00245 * cheek;
      eyeDx += Math.sign(centre.x) * 0.00055 * cheek;
      eyeDz += 0.00075 * cheek;

      // AU1+AU4: lift and draw together the inner brow, with a restrained
      // outer-brow descent. The depth term keeps motion on the facial shell.
      const side = Math.sign(centre.x) || 1;
      const browZ = gauss(z - (surfaceZ - 0.005), 0.018);
      const innerBrow = gauss(x - (centre.x - side * 0.010), 0.012)
        * gauss(y - (centre.y + 0.019), 0.0075) * browZ;
      const outerBrow = gauss(x - (centre.x + side * 0.013), 0.014)
        * gauss(y - (centre.y + 0.018), 0.0085) * browZ;
      sadBrowDy += 0.0037 * innerBrow - 0.0010 * outerBrow;
      sadBrowDx -= side * 0.0008 * innerBrow;
      sadBrowDz += 0.0005 * innerBrow;

      // Fatigue is dominated by upper-lid droop and mild cheek descent, not
      // an eyeball rotation or a generic downward translation of the face.
      fatigueDy -= 0.0020 * upperLid;
      fatigueDy += 0.00035 * lowerLid;
      fatigueDy -= 0.00115 * cheek;
      fatigueDz -= 0.00030 * cheek;
    }
    eyeDelta[i * 3] = eyeDx;
    eyeDelta[i * 3 + 1] = eyeDy;
    eyeDelta[i * 3 + 2] = eyeDz;
    sadBrowDelta[i * 3] = sadBrowDx;
    sadBrowDelta[i * 3 + 1] = sadBrowDy;
    sadBrowDelta[i * 3 + 2] = sadBrowDz;
    const fatigueMouth = 0.0013 * cornerFactor * lipWeight;
    fatigueDelta[i * 3] = fatigueDx;
    fatigueDelta[i * 3 + 1] = fatigueDy - fatigueMouth;
    fatigueDelta[i * 3 + 2] = fatigueDz;
  }

  const mouthName = appendRelativeMorph(body, mouthDelta, 'expr_smile_mouth');
  const eyeName = appendRelativeMorph(body, eyeDelta, 'expr_smile_eyes');
  const sadMouthName = appendRelativeMorph(body, sadMouthDelta, 'expr_sad_mouth');
  const sadBrowName = appendRelativeMorph(body, sadBrowDelta, 'expr_sad_brow');
  const fatigueName = appendRelativeMorph(body, fatigueDelta, 'expr_fatigue');
  if (!mouthName || !eyeName || !sadMouthName || !sadBrowName || !fatigueName) return null;
  body.updateMorphTargets();
  const mouthIndex = body.morphTargetDictionary[mouthName];
  const eyeIndex = body.morphTargetDictionary[eyeName];
  const sadMouthIndex = body.morphTargetDictionary[sadMouthName];
  const sadBrowIndex = body.morphTargetDictionary[sadBrowName];
  const fatigueIndex = body.morphTargetDictionary[fatigueName];

  let episode = null;
  function play(name = 'smile', speed = 1, intensity = 1) {
    if (!['smile', 'sadness', 'fatigue'].includes(name)) return;
    const safeSpeed = Math.max(0.1, speed);
    episode = {
      name,
      t0: null,
      attack: (name === 'fatigue' ? 0.82 : 0.54) / safeSpeed,
      hold: (name === 'fatigue' ? 1.65 : 1.25) / safeSpeed,
      release: (name === 'fatigue' ? 1.05 : 0.72) / safeSpeed,
      peak: clamp01(intensity),
    };
  }

  function update(dt, t, values) {
    const sliderMouth = clamp01(values.smile ?? 0);
    let mouth = sliderMouth;
    let eye = smileEyeIntensity(sliderMouth);
    let sadness = clamp01(values.sadness ?? 0);
    let fatigue = clamp01(values.fatigueExpression ?? 0);
    if (episode) {
      if (episode.t0 == null) episode.t0 = t;
      const elapsed = t - episode.t0;
      const performance = episodeEnvelope(episode, elapsed);
      if (episode.name === 'smile') {
        mouth = Math.max(mouth, performance);
        // The eye smile follows the mouth by a few frames and peaks lower.
        eye = Math.max(eye, smileEyeIntensity(episodeEnvelope(episode, elapsed, 0.09)));
      } else if (episode.name === 'sadness') sadness = Math.max(sadness, performance);
      else if (episode.name === 'fatigue') fatigue = Math.max(fatigue, performance);
      if (elapsed > episode.attack + episode.hold + episode.release + 0.1) episode = null;
    }
    body.morphTargetInfluences[mouthIndex] = clamp01(mouth);
    body.morphTargetInfluences[eyeIndex] = clamp01(eye);
    body.morphTargetInfluences[sadMouthIndex] = sadness;
    body.morphTargetInfluences[sadBrowIndex] = sadness;
    body.morphTargetInfluences[fatigueIndex] = fatigue;
  }

  return {
    mode: 'legacy-procedural',
    play,
    update,
    availableUnits: [],
    setDebugUnit: () => false,
    clearDebug: () => {},
    landmarks: { cornerL, cornerR, noseY, noseZ, eyes: eyeLandmarks },
    morphs: { mouthIndex, eyeIndex, sadMouthIndex, sadBrowIndex, fatigueIndex },
  };
}

function collectNamedMorphs(model) {
  const { body } = findFaceMeshes(model);
  const bodyDictionary = body?.morphTargetDictionary;
  if (!bodyDictionary || !REQUIRED_MPFB_UNITS.every((name) => bodyDictionary[name] !== undefined)) return null;

  const availableUnits = Object.keys(bodyDictionary).sort();
  const availableSet = new Set(availableUnits);
  const bindings = new Map(availableUnits.map((name) => [name, []]));
  model.traverse((object) => {
    if (!object.isMesh || !object.morphTargetDictionary || !object.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
      if (availableSet.has(name)) bindings.get(name).push({ object, index });
    }
  });
  return { availableUnits, bindings };
}

function createNamedExpressions(model) {
  const named = collectNamedMorphs(model);
  if (!named) return null;
  const { availableUnits, bindings } = named;
  let episode = null;
  let debugUnit = null;
  const appliedUnits = new Set();

  function writeUnit(name, value) {
    const targets = bindings.get(name);
    if (!targets) return;
    const safeValue = clamp01(value);
    for (const { object, index } of targets) object.morphTargetInfluences[index] = safeValue;
  }

  function addRecipe(weights, recipe, intensity) {
    const scale = clamp01(intensity);
    if (scale <= 0) return;
    for (const [name, maximum] of Object.entries(recipe)) {
      if (!bindings.has(name)) continue;
      weights.set(name, clamp01((weights.get(name) || 0) + maximum * scale));
    }
  }

  function applyWeights(weights) {
    for (const name of appliedUnits) if (!weights.has(name)) writeUnit(name, 0);
    appliedUnits.clear();
    for (const [name, value] of weights) {
      writeUnit(name, value);
      appliedUnits.add(name);
    }
  }

  function play(name = 'smile', speed = 1, intensity = 1) {
    if (!['smile', 'sadness', 'fatigue'].includes(name)) return;
    debugUnit = null;
    const safeSpeed = Math.max(0.1, speed);
    episode = {
      name,
      t0: null,
      attack: (name === 'fatigue' ? 0.82 : 0.54) / safeSpeed,
      hold: (name === 'fatigue' ? 1.65 : 1.25) / safeSpeed,
      release: (name === 'fatigue' ? 1.05 : 0.72) / safeSpeed,
      peak: clamp01(intensity),
    };
  }

  function update(dt, t, values) {
    if (debugUnit) {
      applyWeights(new Map([[debugUnit.name, debugUnit.value]]));
      return;
    }

    let smile = clamp01(values.smile ?? 0);
    let smileEyes = smileEyeIntensity(smile);
    let sadness = clamp01(values.sadness ?? 0);
    let fatigue = clamp01(values.fatigueExpression ?? 0);
    if (episode) {
      if (episode.t0 == null) episode.t0 = t;
      const elapsed = t - episode.t0;
      const performance = episodeEnvelope(episode, elapsed);
      if (episode.name === 'smile') {
        smile = Math.max(smile, performance);
        smileEyes = Math.max(smileEyes, smileEyeIntensity(episodeEnvelope(episode, elapsed, 0.09)));
      } else if (episode.name === 'sadness') sadness = Math.max(sadness, performance);
      else if (episode.name === 'fatigue') fatigue = Math.max(fatigue, performance);
      if (elapsed > episode.attack + episode.hold + episode.release + 0.1) episode = null;
    }

    const weights = new Map();
    addRecipe(weights, EXPRESSION_RECIPES.smileMouth, smile);
    addRecipe(weights, EXPRESSION_RECIPES.smileEyes, smileEyes);
    addRecipe(weights, EXPRESSION_RECIPES.sadness, sadness);
    addRecipe(weights, EXPRESSION_RECIPES.fatigue, fatigue);
    applyWeights(weights);
  }

  function setDebugUnit(name, value = 1) {
    if (!bindings.has(name)) return false;
    episode = null;
    debugUnit = { name, value: clamp01(value) };
    return true;
  }

  function clearDebug() {
    debugUnit = null;
    applyWeights(new Map());
  }

  return {
    mode: 'mpfb-faceunits',
    play,
    update,
    availableUnits,
    setDebugUnit,
    clearDebug,
    get debugUnit() { return debugUnit ? { ...debugUnit } : null; },
  };
}

export function createExpressions(model) {
  return createNamedExpressions(model) || createLegacyExpressions(model);
}

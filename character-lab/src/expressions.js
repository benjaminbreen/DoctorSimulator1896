import * as THREE from 'three';

/* Animated facial expressions as runtime-computed morph targets.

   The GLB ships identity-baked with no face bones, so expressions are built
   here: mouth corners are located on the actual bind-pose head geometry
   (widest lip-band vertices), and a displacement field — corner lift, cheek
   mound, faint lower-lid raise, sealed lip centre — is written into a fresh
   morph target. Because the field is measured per face, the same code smiles
   correctly on every generated head, and iteration needs no Blender rebuild.

   Anatomy of the smile (closed-lip, Duchenne-leaning):
   - zygomaticus pull: corners travel up, outward, and slightly back
   - cheek mass rises and puffs a touch forward (nasolabial deepening)
   - lower lids rise faintly (the eye "smiles")
   - the lip centre is damped so the mouth stays sealed
*/

const gauss = (distance, sigma) => Math.exp(-(distance * distance) / (2 * sigma * sigma));
const smooth = (x) => x * x * (3 - 2 * x);

export function createExpressions(model) {
  let body = null;
  model.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    if (object.name === 'Human_Body') body = object;
    else if (!body && (object.geometry?.attributes?.position?.count || 0) > 5000) body = object;
  });
  if (!body) return null;
  const geometry = body.geometry;
  const position = geometry.attributes.position;

  /* --- landmarks in bind space (Y-up, face toward +Z) --- */
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i++) maxY = Math.max(maxY, position.getY(i));
  const bandMin = maxY - 0.17;

  let noseZ = -Infinity; let noseY = 0;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < bandMin) continue;
    const z = position.getZ(i);
    if (z > noseZ) { noseZ = z; noseY = y; }
  }

  // mouth corners: widest points of the lip band. The z window stays shallow
  // and |x| is capped, otherwise the cheek silhouette wins and the smile pulls
  // ~10 cm wide instead of ~5 cm (measured on generated heads).
  let cornerR = null; let cornerL = null; let maxX = -Infinity; let minX = Infinity;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < noseY - 0.045 || y > noseY - 0.015) continue;
    const z = position.getZ(i);
    if (z < noseZ - 0.028) continue;
    const x = position.getX(i);
    if (Math.abs(x) > 0.042) continue;
    if (x > maxX) { maxX = x; cornerR = new THREE.Vector3(x, y, z); }
    if (x < minX) { minX = x; cornerL = new THREE.Vector3(x, y, z); }
  }
  if (!cornerL || !cornerR) return null;
  const mouthY = (cornerL.y + cornerR.y) / 2;

  /* --- smile displacement field ---
     The mouth is treated as a sealed lip LINE: displacement depends on lateral
     position along that line and is symmetric above/below the seam, so upper
     and lower lip always travel together and the mouth cannot open. (The first
     version used radial gaussians whose cheek term reached the upper lip only
     — the seam split and produced a rictus.) */
  const delta = new Float32Array(position.count * 3);
  const vertex = new THREE.Vector3();
  // wider than the landmark band: crown-to-mouth is ~17-19 cm, and a 0.17 cutoff
  // silently excluded the lips on some heads (frozen mouth, moving cheeks)
  const fieldMin = maxY - 0.26;
  const halfWidth = Math.max(0.018, (cornerR.x - cornerL.x) / 2);
  const cornerZ = (cornerL.z + cornerR.z) / 2;
  const cheeks = [
    { sign: 1, at: cornerR.clone().add(new THREE.Vector3(0.010, 0.042, -0.010)) },
    { sign: -1, at: cornerL.clone().add(new THREE.Vector3(-0.010, 0.042, -0.010)) },
  ];
  const lids = [
    cornerR.clone().add(new THREE.Vector3(0.007, 0.058, -0.004)),
    cornerL.clone().add(new THREE.Vector3(-0.007, 0.058, -0.004)),
  ];
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < fieldMin) continue;
    vertex.set(position.getX(i), y, position.getZ(i));
    if (vertex.z < noseZ - 0.1) continue; // front half of the head only
    let dx = 0; let dy = 0; let dz = 0;
    const sign = Math.sign(vertex.x) || 1;

    // sealed lip line: bend the whole closed mouth upward toward the corners
    const lateral = Math.min(1.3, Math.abs(vertex.x) / (halfWidth * 1.12));
    const lipWeight = gauss(y - mouthY, 0.011) * gauss(vertex.z - cornerZ, 0.02);
    const curve = lateral ** 1.7;
    dy += 0.0058 * curve * lipWeight;
    dx += sign * 0.0026 * curve * lipWeight;
    dz -= 0.0015 * curve * lipWeight;
    dy += 0.0008 * (1 - Math.min(1, lateral)) * lipWeight; // faint centre press

    // cheek mound, masked strictly above the lip line
    const aboveLips = smooth(THREE.MathUtils.clamp((y - (mouthY + 0.006)) / 0.014, 0, 1));
    for (const cheek of cheeks) {
      const wCheek = gauss(vertex.distanceTo(cheek.at), 0.024) * aboveLips;
      dy += 0.0034 * wCheek;
      dx += cheek.sign * 0.0012 * wCheek;
      dz += 0.0010 * wCheek;
    }
    for (const lid of lids) dy += 0.0024 * gauss(vertex.distanceTo(lid), 0.013); // lower-lid rise: the eye "smiles"

    delta[i * 3] = dx;
    delta[i * 3 + 1] = dy;
    delta[i * 3 + 2] = dz;
  }

  const attribute = new THREE.Float32BufferAttribute(delta, 3);
  attribute.name = 'expr_smile';
  if (!geometry.morphAttributes.position) {
    geometry.morphAttributes.position = [];
    geometry.morphTargetsRelative = true;
  }
  geometry.morphAttributes.position.push(attribute);
  body.updateMorphTargets();
  const index = body.morphTargetDictionary['expr_smile'];

  /* --- performance --- */
  let episode = null;
  function play(name = 'smile', speed = 1, intensity = 1) {
    if (name !== 'smile') return;
    episode = { t0: null, attack: 0.38 / speed, hold: 1.4 / speed, release: 0.85 / speed, peak: intensity };
  }
  function update(dt, t, values) {
    let value = values.smile ?? 0;
    if (episode) {
      if (episode.t0 == null) episode.t0 = t;
      const e = t - episode.t0;
      const { attack, hold, release, peak } = episode;
      if (e < attack) value = Math.max(value, peak * smooth(e / attack));
      else if (e < attack + hold) value = Math.max(value, peak);
      else if (e < attack + hold + release) value = Math.max(value, peak * smooth(1 - (e - attack - hold) / release));
      else episode = null;
    }
    if (value > 0.03) value *= 1 + Math.sin(t * 0.9) * 0.02; // held smiles breathe a little
    body.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
  }
  return { play, update, landmarks: { cornerL, cornerR, noseY, noseZ } };
}

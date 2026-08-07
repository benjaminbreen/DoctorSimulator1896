import * as THREE from 'three';

/* Surface-bound eyebrows and eyelashes for Meta MHR.

   MHR ships brows and lashes as neither geometry nor textures. These details
   are generated against the identity-baked face and remember the nearest
   facial vertex plus a tiny local offset. At runtime those anchors are sampled
   from body_mesh after morphing and skinning. This avoids duplicating the rig's
   bind transform while still following every blink, expression and head pose.

   The meshes are very small (hundreds of vertices), so the CPU surface bind is
   both inexpensive and considerably more robust than manufacturing a second
   SkinnedMesh with inferred weights. */

const clamp01 = (value) => THREE.MathUtils.clamp(value, 0, 1);

function seeded(seed, index) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function bodyMesh(root) {
  return root?.getObjectByName?.('body_mesh') || null;
}

function frontSurfaceSampler(body, landmarks) {
  const position = body.geometry.attributes.position;
  const frontLimit = landmarks.frontZ - landmarks.eyeSpan * 0.52;
  const candidates = [];
  for (let index = 0; index < position.count; index += 1) {
    const z = position.getZ(index);
    if (z < frontLimit) continue;
    const y = position.getY(index);
    if (y < landmarks.mouthY || y > landmarks.eyeY + landmarks.eyeSpan * 0.72) continue;
    candidates.push(index);
  }
  return (x, y, preferredZ = landmarks.frontZ) => {
    let best = -1;
    let bestScore = Infinity;
    for (const index of candidates) {
      const dx = position.getX(index) - x;
      const dy = position.getY(index) - y;
      const dz = position.getZ(index) - preferredZ;
      // X/Y locate the feature; a small Z term rejects the rear eyelid and
      // interior eye surface without letting a projecting eyeball dominate.
      const score = dx * dx + dy * dy * 1.35 + dz * dz * 0.08;
      if (score < bestScore) { best = index; bestScore = score; }
    }
    if (best < 0) return null;
    return {
      index: best,
      point: new THREE.Vector3(position.getX(best), position.getY(best), position.getZ(best)),
    };
  };
}

function pushVertex(target, point, sourceIndex) {
  target.positions.push(point.x, point.y, point.z);
  target.sources.push(sourceIndex);
  return target.sources.length - 1;
}

function addTaperedRibbon(target, centres, widths, sourceIndices, lift = 0.0013) {
  const base = target.sources.length;
  for (let index = 0; index < centres.length; index += 1) {
    const previous = centres[Math.max(0, index - 1)];
    const next = centres[Math.min(centres.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const normal = new THREE.Vector3(0, 0, 1);
    const across = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    const progress = index / Math.max(1, centres.length - 1);
    const taper = Math.sin(progress * Math.PI) ** 0.28;
    const halfWidth = widths[index] * taper;
    const lifted = centres[index].clone().addScaledVector(normal, lift);
    pushVertex(target, lifted.clone().addScaledVector(across, halfWidth), sourceIndices[index]);
    pushVertex(target, lifted.clone().addScaledVector(across, -halfWidth), sourceIndices[index]);
  }
  for (let index = 0; index < centres.length - 1; index += 1) {
    const a = base + index * 2;
    target.indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
}

function browGeometry(body, landmarks, values, sampleSurface) {
  const target = { positions: [], sources: [], indices: [] };
  const seed = Number(values.seed) || 1;
  const density = clamp01(values.browDensity ?? 0.72);
  const thickness = THREE.MathUtils.clamp(values.browThickness ?? 0.95, 0.45, 1.55);
  const arch = THREE.MathUtils.clamp(values.browArch ?? values.browAngle ?? 0, -1, 1);
  const asymmetry = THREE.MathUtils.clamp(values.browAsymmetry ?? values.faceAsymmetry ?? 0.06, 0, 0.35);
  const browLength = landmarks.eyeSpan * 0.38;
  const browBaseY = landmarks.eyeY + landmarks.eyeSpan * (0.155 + (values.browHeight ?? 0) * 0.025);
  const lanes = Math.round(2 + density * 2);
  const hairsPerLane = Math.round(9 + density * 5);

  for (const side of [-1, 1]) {
    const eyeX = landmarks.centerX + side * landmarks.eyeHalfSeparation;
    for (let laneIndex = 0; laneIndex < lanes; laneIndex += 1) {
      const lane = lanes === 1 ? 0 : laneIndex / (lanes - 1) - 0.5;
      for (let hair = 0; hair < hairsPerLane; hair += 1) {
        const jitter = (seeded(seed + side * 31 + laneIndex * 19, hair) - 0.5) / hairsPerLane * 0.72;
        const t = THREE.MathUtils.clamp((hair + 0.5) / hairsPerLane + jitter, 0.02, 0.98);
        const fromInner = side < 0 ? 1 - t : t;
        const x = eyeX + side * (fromInner - 0.48) * browLength;
        const seededLift = (seeded(seed + side * 47 + laneIndex * 13, hair * 17) - 0.5) * landmarks.eyeSpan * 0.005;
        const archLift = Math.sin(t * Math.PI) * landmarks.eyeSpan * (0.035 + arch * 0.018);
        const tailTilt = (t - 0.5) * side * (values.browAngle ?? 0) * landmarks.eyeSpan * 0.035;
        const sideOffset = side > 0 ? asymmetry * landmarks.eyeSpan * 0.014 : 0;
        const y = browBaseY + archLift + tailTilt + sideOffset
          + lane * landmarks.eyeSpan * 0.025 * thickness + seededLift;
        const surface = sampleSurface(x, y);
        if (!surface) continue;

        // Real eyebrow fibres grow as overlapping short hairs rather than as
        // continuous ribbons. Inner hairs rise more vertically; outer hairs
        // sweep laterally and slightly down toward the temple.
        const inner = 1 - fromInner;
        const hairLength = THREE.MathUtils.lerp(0.0043, 0.0064, density)
          * THREE.MathUtils.lerp(0.92, 1.08, seeded(seed + side * 73, hair + laneIndex * 29));
        const sweep = THREE.MathUtils.lerp(0.34, 0.78, fromInner);
        const rise = THREE.MathUtils.lerp(0.82, 0.22, fromInner) + lane * 0.08;
        const base = new THREE.Vector3(x, y, surface.point.z + 0.00056 + laneIndex * 0.000025);
        addCurvedLash(target, base, surface.index, {
          lateral: side * hairLength * sweep,
          vertical: hairLength * (rise - inner * 0.05),
          forward: hairLength * THREE.MathUtils.lerp(0.20, 0.10, fromInner),
          width: THREE.MathUtils.lerp(0.00011, 0.00015, thickness / 1.55),
          curl: 0.18,
        });
      }
    }
  }
  return finishBoundGeometry(body, target);
}

function distributedAnchors(indices, count, position, centerX, radiusX) {
  const candidates = indices
    .filter((index) => Math.abs(position.getX(index) - centerX) < radiusX * 0.94)
    .sort((a, b) => position.getX(a) - position.getX(b));
  if (!candidates.length) return [];
  const anchors = [];
  const used = new Set();
  for (let slot = 0; slot < count; slot += 1) {
    const progress = count === 1 ? 0.5 : slot / (count - 1);
    const index = candidates[Math.round(progress * (candidates.length - 1))];
    if (!used.has(index)) { used.add(index); anchors.push(index); }
  }
  return anchors;
}

function addCurvedLash(target, base, sourceIndex, options) {
  const { lateral, vertical, forward, width, curl } = options;
  const rings = 5;
  const centres = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const t = ring / (rings - 1);
    centres.push(base.clone().add(new THREE.Vector3(
      lateral * t,
      vertical * (t * (0.78 + curl * 0.22)),
      forward * Math.sin(t * Math.PI * 0.5),
    )));
  }
  const firstVertex = target.sources.length;
  for (let ring = 0; ring < rings; ring += 1) {
    const previous = centres[Math.max(0, ring - 1)];
    const next = centres[Math.min(rings - 1, ring + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const across = new THREE.Vector3(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
    const around = new THREE.Vector3().crossVectors(tangent, across).normalize();
    const taper = Math.max(0.08, 1 - ring / (rings - 1));
    const radius = width * taper;
    pushVertex(target, centres[ring].clone().addScaledVector(across, radius), sourceIndex);
    pushVertex(target, centres[ring].clone().addScaledVector(around, radius), sourceIndex);
    pushVertex(target, centres[ring].clone().addScaledVector(across, -radius), sourceIndex);
    pushVertex(target, centres[ring].clone().addScaledVector(around, -radius), sourceIndex);
  }
  for (let ring = 0; ring < rings - 1; ring += 1) {
    const current = firstVertex + ring * 4;
    const next = current + 4;
    for (let side = 0; side < 4; side += 1) {
      const adjacent = (side + 1) % 4;
      target.indices.push(current + side, current + adjacent, next + adjacent);
      target.indices.push(current + side, next + adjacent, next + side);
    }
  }
}

function apertureLashGeometry(body, landmarks, values, apertures) {
  const target = { positions: [], sources: [], indices: [] };
  const position = body.geometry.attributes.position;
  const density = clamp01(values.lashDensity ?? 0.68);
  const lengthScale = THREE.MathUtils.clamp(values.lashLength ?? 0.92, 0.45, 1.55);
  const curl = clamp01(values.lashCurl ?? 0.48);
  const seed = Number(values.seed) || 1;
  for (const aperture of apertures) {
    const upper = distributedAnchors(
      aperture.upper,
      Math.round(9 + density * 7),
      position,
      aperture.centerX,
      aperture.radiusX,
    );
    const lower = distributedAnchors(
      aperture.lower,
      Math.round(3 + density * 3),
      position,
      aperture.centerX,
      aperture.radiusX,
    );
    const addAnchors = (anchors, upperLid) => {
      for (let serial = 0; serial < anchors.length; serial += 1) {
        const source = anchors[serial];
        const x = position.getX(source);
        const t = THREE.MathUtils.clamp((x - aperture.centerX) / aperture.radiusX, -1, 1);
        const randomLength = 0.88 + seeded(seed + aperture.side * 101 + (upperLid ? 0 : 211), serial) * 0.24;
        const length = (upperLid ? 0.00735 : 0.00345) * lengthScale * randomLength * (0.82 + (1 - Math.abs(t)) * 0.18);
        const base = new THREE.Vector3(
          x,
          position.getY(source),
          position.getZ(source) + (upperLid ? 0.00062 : 0.00048),
        );
        addCurvedLash(target, base, source, {
          lateral: t * length * 0.16,
          vertical: (upperLid ? 1 : -0.42) * length * (0.24 + curl * 0.22),
          forward: length * (upperLid ? 1.02 : 0.72),
          width: upperLid ? 0.00018 : 0.00011,
          curl,
        });
      }
    };
    addAnchors(upper, true);
    addAnchors(lower, false);
  }
  return finishBoundGeometry(body, target);
}

function lashGeometry(body, landmarks, values, sampleSurface) {
  const apertures = body.geometry.userData.mhrEyeApertures;
  if (Array.isArray(apertures) && apertures.some((aperture) => aperture.upper?.length)) {
    return apertureLashGeometry(body, landmarks, values, apertures);
  }
  const target = { positions: [], sources: [], indices: [] };
  const seed = Number(values.seed) || 1;
  const density = clamp01(values.lashDensity ?? 0.68);
  const lengthScale = THREE.MathUtils.clamp(values.lashLength ?? 0.92, 0.45, 1.55);
  const curl = clamp01(values.lashCurl ?? 0.48);
  const upperCount = Math.round(11 + density * 9);
  const lowerCount = Math.round(3 + density * 4);
  const halfWidth = landmarks.eyeSpan * 0.145;
  const lidHeight = landmarks.eyeSpan * 0.050;

  const addLash = (side, t, upper, serial) => {
    const eyeX = landmarks.centerX + side * landmarks.eyeHalfSeparation;
    const x = eyeX + t * halfWidth;
    const ellipse = Math.sqrt(Math.max(0, 1 - (t * t)));
    const y = landmarks.eyeY + (upper ? 1 : -1) * lidHeight * ellipse;
    const surface = sampleSurface(x, y, landmarks.eyeZ + landmarks.eyeSpan * 0.015);
    if (!surface) return;
    const randomLength = 0.82 + seeded(seed + side * 101, serial) * 0.30;
    const centreBias = 0.72 + ellipse * 0.28;
    const length = landmarks.eyeSpan * (upper ? 0.052 : 0.024) * lengthScale * randomLength * centreBias;
    const base = new THREE.Vector3(x, y, surface.point.z + 0.0008);
    const lateral = t * landmarks.eyeSpan * 0.007;
    const tip = base.clone().add(new THREE.Vector3(
      lateral,
      (upper ? 1 : -0.55) * length * (0.22 + curl * 0.48),
      length * (0.80 - curl * 0.18),
    ));
    const width = landmarks.eyeSpan * (upper ? 0.0018 : 0.0012);
    const a = pushVertex(target, base.clone().add(new THREE.Vector3(-width, 0, 0)), surface.index);
    const b = pushVertex(target, base.clone().add(new THREE.Vector3(width, 0, 0)), surface.index);
    const c = pushVertex(target, tip, surface.index);
    target.indices.push(a, b, c);
  };

  for (const side of [-1, 1]) {
    for (let index = 0; index < upperCount; index += 1) {
      const t = THREE.MathUtils.lerp(-0.92, 0.92, upperCount === 1 ? 0.5 : index / (upperCount - 1));
      addLash(side, t, true, index);
    }
    for (let index = 0; index < lowerCount; index += 1) {
      const t = THREE.MathUtils.lerp(-0.72, 0.72, lowerCount === 1 ? 0.5 : index / (lowerCount - 1));
      addLash(side, t, false, 100 + index);
    }
  }
  return finishBoundGeometry(body, target);
}

function finishBoundGeometry(body, target) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setIndex(target.indices);
  geometry.computeVertexNormals();
  const sourcePosition = body.geometry.attributes.position;
  const offsets = new Float32Array(target.sources.length * 3);
  for (let vertex = 0; vertex < target.sources.length; vertex += 1) {
    const source = target.sources[vertex];
    offsets[vertex * 3] = target.positions[vertex * 3] - sourcePosition.getX(source);
    offsets[vertex * 3 + 1] = target.positions[vertex * 3 + 1] - sourcePosition.getY(source);
    offsets[vertex * 3 + 2] = target.positions[vertex * 3 + 2] - sourcePosition.getZ(source);
  }
  geometry.userData.surfaceSources = Uint32Array.from(target.sources);
  geometry.userData.surfaceOffsets = offsets;
  geometry.computeBoundingSphere();
  return geometry;
}

function boundMesh(body, name, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  body.parent.add(mesh);
  return mesh;
}

const _surfacePoint = new THREE.Vector3();
const _surfaceOffset = new THREE.Vector3();
const _bodyToWorld = new THREE.Matrix3();
const _worldToParent = new THREE.Matrix4();

function updateSurfaceBinding(body, mesh) {
  const position = mesh.geometry.attributes.position;
  const sources = mesh.geometry.userData.surfaceSources;
  const offsets = mesh.geometry.userData.surfaceOffsets;
  if (!position || !sources || !offsets || !mesh.parent) return;

  body.updateWorldMatrix(true, false);
  mesh.parent.updateWorldMatrix(true, false);
  _bodyToWorld.setFromMatrix4(body.matrixWorld);
  _worldToParent.copy(mesh.parent.matrixWorld).invert();

  for (let vertex = 0; vertex < sources.length; vertex += 1) {
    body.getVertexPosition(sources[vertex], _surfacePoint).applyMatrix4(body.matrixWorld);
    _surfaceOffset.set(offsets[vertex * 3], offsets[vertex * 3 + 1], offsets[vertex * 3 + 2]);
    _surfaceOffset.applyMatrix3(_bodyToWorld);
    _surfacePoint.add(_surfaceOffset).applyMatrix4(_worldToParent);
    position.setXYZ(vertex, _surfacePoint.x, _surfacePoint.y, _surfacePoint.z);
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

export function createMhrFacialDetails(root, values) {
  const body = bodyMesh(root);
  if (!body?.isSkinnedMesh || !body.geometry.userData.faceLandmarks) return null;
  const browMaterial = new THREE.MeshBasicMaterial({
    name: 'MHR_Brows', color: values.browColor || values.hairColor || '#2a1a12',
    side: THREE.DoubleSide,
  });
  // Lashes are narrow, strongly light-absorbing fibres. An unlit material
  // preserves their silhouette under the Character Lab's very warm, low-key
  // portrait lighting without turning them into glossy eyeliner.
  const lashMaterial = new THREE.MeshBasicMaterial({
    name: 'MHR_Lashes', color: values.lashColor || '#211610', side: THREE.DoubleSide,
  });
  for (const material of [browMaterial, lashMaterial]) material.userData.excludeComparisonSkin = true;
  let meshes = [];

  function disposeMeshes() {
    for (const mesh of meshes) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
    }
    meshes = [];
  }

  function rebuild(nextValues) {
    disposeMeshes();
    const landmarks = body.geometry.userData.faceLandmarks;
    if (!landmarks) return;
    const sampleSurface = frontSurfaceSampler(body, landmarks);
    meshes.push(
      boundMesh(body, 'MHR_ProceduralBrows', browGeometry(body, landmarks, nextValues, sampleSurface), browMaterial),
      boundMesh(body, 'MHR_ProceduralLashes', lashGeometry(body, landmarks, nextValues, sampleSurface), lashMaterial),
    );
    update(nextValues);
  }

  function update(nextValues) {
    browMaterial.color.set(nextValues.browColor || nextValues.hairColor || '#2a1a12');
    lashMaterial.color.set(nextValues.lashColor || '#211610');
    for (const mesh of meshes) updateSurfaceBinding(body, mesh);
  }

  function dispose() {
    disposeMeshes();
    browMaterial.dispose();
    lashMaterial.dispose();
  }

  rebuild(values);
  return { get meshes() { return meshes; }, materials: { brow: browMaterial, lash: lashMaterial }, rebuild, update, dispose };
}

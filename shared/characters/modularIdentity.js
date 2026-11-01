import * as THREE from 'three';

export const MODULAR_IDENTITIES = ['Base', 'Broad face', 'Narrow face', 'Short jaw', 'Long jaw', 'High forehead', 'Low forehead'];

export const MODULAR_FEATURES = {
  lowerFaceSize: 'Whole lower-face size', jawWidth: 'Jaw width', chinWidth: 'Chin width', chinLength: 'Chin length',
  chinProjection: 'Chin projection', jawSoftness: 'Jaw softness', cheekFullness: 'Cheek fullness',
  noseWidth: 'Nose width', noseLength: 'Nose length', noseProjection: 'Nose projection',
  noseBridge: 'Nose bridge', noseTipLift: 'Nose tip lift', earProminence: 'Ear prominence',
  browProminence: 'Brow prominence',
  eyeSpacing: 'Eye spacing', eyeSize: 'Eye size',
};

export const MODULAR_FACE_STUDIES = [
  { name: 'Original', features: {} },
  { name: 'Lower face −10%', features: { lowerFaceSize: -.4 } },
  { name: 'Lower face −15%', features: { lowerFaceSize: -.6 } },
  { name: 'Lower face −20%', features: { lowerFaceSize: -.8 } },
  { name: 'Compact soft', features: { lowerFaceSize: -.65, jawSoftness: .3, cheekFullness: .15, browProminence: -.25 } },
  { name: 'Compact angular', features: { lowerFaceSize: -.55, cheekFullness: -.15, browProminence: -.1 } },
  { name: 'Compact full cheeks', features: { lowerFaceSize: -.55, jawSoftness: .25, cheekFullness: .45 } },
];

export const MODULAR_NOSE_STUDIES = [
  { name: 'Original nose', features: {} },
  { name: 'Fine straight', features: { noseWidth: -.55, noseLength: -.1, noseProjection: -.15, noseBridge: -.55 } },
  { name: 'Short lifted', features: { noseWidth: .15, noseLength: -.6, noseProjection: -.3, noseBridge: -.25, noseTipLift: .45 } },
  { name: 'Long convex', features: { noseWidth: -.15, noseLength: .5, noseProjection: .35, noseBridge: .55, noseTipLift: -.15 } },
  { name: 'Broad rounded', features: { noseWidth: .75, noseLength: -.15, noseProjection: -.2, noseTipLift: .15 } },
];

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x-a)/(b-a))); return t*t*(3-2*t); };

export function deformModularPoint(point, values, frame) {
  const { x, y } = point;
  const depthOffset = frame.depthOffset || 0, z = point.z-depthOffset;
  const s = frame.scale, mouth = frame.mouthY, eyes = frame.eyeY;
  const g = (value) => Math.exp(-2*value*value);
  let dx = 0, dy = 0, dz = 0;
  const front = smooth(.025*s, .075*s, z);
  const faceFront = smooth(.015*s,.055*s,z);
  const faceSides = smooth(.035*s,.065*s,Math.abs(x))*smooth(mouth-.060*s,mouth-.015*s,y);
  const lowerVolume = (1-smooth(mouth+.005*s,mouth+.040*s,y))
    *Math.max(faceFront,faceSides)*smooth(mouth-.085*s,mouth-.060*s,y);
  const reduction = .25*values.lowerFaceSize*lowerVolume;
  dx += x*reduction;
  dy += (y-mouth-.020*s)*reduction;
  dz += (z-.040*s)*reduction*.65;
  const lower = Math.exp(-Math.pow((y-mouth+.015)/(.045*s), 4))*smooth(mouth-.055*s, mouth-.025*s, y)
    *(1-front*.9*smooth(mouth-.030*s,mouth-.006*s,y));
  dx += x*.30*values.jawWidth*lower;
  const chin = g(x/(.048*s))*g((y-mouth+.034*s)/(.029*s))*front;
  dx += x*.45*values.chinWidth*chin;
  dy -= .018*s*values.chinLength*chin;
  dz += .020*s*values.chinProjection*chin;
  const corner = g((Math.abs(x)-.064*s)/(.032*s))*g((y-mouth+.014*s)/(.026*s))*g((z-.020*s)/(.065*s));
  dx -= Math.sign(x)*.007*s*values.jawSoftness*corner;
  dy += .007*s*values.jawSoftness*corner;
  const cheek = g((Math.abs(x)-.055*s)/(.030*s))*g((y-eyes+.027*s)/(.026*s))*front;
  dx += Math.sign(x)*.008*s*values.cheekFullness*cheek;
  dz += .006*s*values.cheekFullness*cheek;
  const noseY = mouth+.043*s;
  const noseFront = smooth(.075*s, .110*s, z);
  const tip = g(x/(.029*s))*g((y-noseY)/(.025*s))*noseFront;
  dx += x*.45*values.noseWidth*tip;
  dy -= .011*s*values.noseLength*tip;
  dy += .006*s*values.noseTipLift*tip;
  dz += .016*s*values.noseProjection*tip;
  dz += .011*s*values.noseBridge*g(x/(.019*s))*g((y-eyes+.009*s)/(.023*s))*noseFront;
  const ear = smooth(.065*s, .088*s, Math.abs(x))*g((y-eyes+.010*s)/(.043*s))*g(z/(.055*s));
  dx += Math.sign(x)*.012*s*values.earProminence*ear;
  dz += .004*s*values.earProminence*ear;
  dz += .008*s*values.browProminence*g((y-eyes-.023*s)/(.015*s))*g((Math.abs(x)-.035*s)/(.032*s))*front;
  if (values.eyeSpacing || values.eyeSize) {
    const eyeX=frame.eyeX || .035*s, eyeZ=(frame.eyeZ ?? (.08*s+depthOffset))-depthOffset;
    const distance=Math.hypot((Math.abs(x)-eyeX)/(.028*s),(y-eyes)/(.028*s),(z-eyeZ)/(.035*s));
    const socket=(1-smooth(1,2,distance))*smooth(.002*s,.010*s,Math.abs(x));
    const size=.08*values.eyeSize*socket;
    dx+=Math.sign(x)*.006*s*values.eyeSpacing*socket+(x-Math.sign(x)*eyeX)*size;
    dy+=(y-eyes)*size;dz+=(z-eyeZ)*size;
  }
  if (frame.neckGuard) {
    const neck=(1-smooth(mouth-.055*s,mouth-.025*s,y))*(1-smooth(.055*s,.085*s,z))
      *(1-smooth(.045*s,.065*s,Math.abs(x)));
    dx*=1-neck;dy*=1-neck;dz*=1-neck;
  }
  return point.set(x+dx, y+dy, z+dz+depthOffset);
}

export function createModularIdentity(root) {
  const names = ['rc_headWidth', 'rc_noseWidth', 'rc_jawLength', 'rc_foreheadHeight'];
  const presets = [
    [0, 0, 0, 0], [.65, -.4, .3, -.2], [-.65, .5, .2, .1],
    [.3, .4, -.6, -.1], [-.3, -.5, .65, .2], [.5, -.1, -.3, .65], [-.5, .2, .4, -.6],
  ];
  const bindings = [];
  const heads = [];
  root.updateMatrixWorld?.(true);
  const eye = root.getObjectByName?.('Carmela_Eye_Left');
  const lips = root.getObjectByName?.('Carmela_Lips');
  const center = (mesh) => {
    const box = new THREE.Box3(), point = new THREE.Vector3(), position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, point);
      box.expandByPoint(point.applyMatrix4(mesh.matrixWorld));
    }
    return box.getCenter(new THREE.Vector3());
  };
  const eyeCenter = eye?.geometry ? center(eye) : null;
  const mouthY = lips?.geometry ? center(lips).y : null;
  const referenceSpan = Number(eye?.userData?.modularReferenceSpan);
  const frame = eyeCenter && mouthY !== null ? { eyeY: eyeCenter.y, mouthY,
    scale: referenceSpan > 0 ? Math.abs(eyeCenter.y-mouthY)/referenceSpan : Math.abs(eyeCenter.x)/.034188,
    eyeX: Math.abs(eyeCenter.x), eyeZ:eyeCenter.z, depthOffset: Number(eye.userData.modularDepthOffset) || 0,
    neckGuard:Boolean(eye.userData.modularNeckGuard) } : null;
  const namesOfFeatures = Object.keys(MODULAR_FEATURES);
  const lastFeatures = namesOfFeatures.map(() => NaN);
  const values = Object.fromEntries(namesOfFeatures.map((name) => [name, 0]));
  const unpack = (attribute) => {
    const data = new Float32Array(attribute.count*3);
    for (let i = 0; i < attribute.count; i++) {
      data[i*3] = attribute.getX(i); data[i*3+1] = attribute.getY(i); data[i*3+2] = attribute.getZ(i);
    }
    return data;
  };
  root.traverse((mesh) => {
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    for (const [column, name] of names.entries()) {
      const index = mesh.morphTargetDictionary[name];
      if (index !== undefined) bindings.push({ mesh, index, column });
    }
    if (!frame || !(mesh.name.startsWith('Carmela_') || mesh.name.startsWith('Patient_FacialHair_')) || !mesh.geometry?.morphAttributes.position?.length) return;
    const geometry = mesh.geometry.clone();
    mesh.geometry = geometry;
    geometry.userData.modularIdentity = true;
    const base = unpack(geometry.attributes.position);
    const targets = geometry.morphAttributes.position.map(unpack);
    const normals = geometry.attributes.normal ? unpack(geometry.attributes.normal) : null;
    const targetNormals = (geometry.morphAttributes.normal || []).map(unpack);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(base.slice(), 3));
    if (normals) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals.slice(), 3));
    geometry.morphAttributes.position = targets.map((data) => new THREE.Float32BufferAttribute(data.slice(), 3));
    if (targetNormals.length) geometry.morphAttributes.normal = targetNormals.map(data => new THREE.Float32BufferAttribute(data.slice(),3));
    const frames = [], matrices = new Map();
    const indices = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
    for (let i = 0; i < base.length/3; i++) {
      const joints = indices ? [indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i)] : [];
      const blend = weights ? [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)] : [];
      const key = joints.concat(blend).join('/');
      if (!matrices.has(key)) {
        const into = mesh.matrixWorld.clone();
        if (mesh.isSkinnedMesh) {
          const skin = new THREE.Matrix4(); skin.elements.fill(0);
          for (let j = 0; j < 4; j++) {
            const bone = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.bones[joints[j]].matrixWorld, mesh.skeleton.boneInverses[joints[j]]);
            for (let k = 0; k < 16; k++) skin.elements[k] += bone.elements[k]*blend[j];
          }
          into.multiply(mesh.bindMatrixInverse).multiply(skin).multiply(mesh.bindMatrix);
        }
        const from = into.clone().invert();
        matrices.set(key, { into, from, normalInto: new THREE.Matrix3().getNormalMatrix(into), normalFrom: new THREE.Matrix3().getNormalMatrix(from) });
      }
      frames.push(matrices.get(key));
    }
    heads.push({ mesh, geometry, base, targets, frames, normals, targetNormals });
  });
  return {
    available: bindings.length > 0,
    frame,
    update(variant = 0, featureValues = {}) {
      let changed = false;
      namesOfFeatures.forEach((name, i) => {
        values[name] = Math.max(-1, Math.min(1, Number(featureValues[name]) || 0));
        if (values[name] !== lastFeatures[i]) changed = true;
      });
      if (changed && frame) {
        const active = Object.values(values).some((value) => value !== 0);
        const point = new THREE.Vector3(), neutral = new THREE.Vector3(), fitted = new THREE.Vector3();
        const canonical = new THREE.Vector3(), warped = new THREE.Vector3(), dx = new THREE.Vector3(), dy = new THREE.Vector3(), dz = new THREE.Vector3(), normal = new THREE.Vector3();
        const posed = new THREE.Vector3(), posedWarp = new THREE.Vector3(), fittedNormal = new THREE.Vector3();
        const jacobian = new THREE.Matrix3();
        const normalJacobian = (at,warpedAt) => {
          const epsilon = .0001;
          dx.copy(at); dx.x += epsilon; deformModularPoint(dx,values,frame).sub(warpedAt).divideScalar(epsilon);
          dy.copy(at); dy.y += epsilon; deformModularPoint(dy,values,frame).sub(warpedAt).divideScalar(epsilon);
          dz.copy(at); dz.z += epsilon; deformModularPoint(dz,values,frame).sub(warpedAt).divideScalar(epsilon);
          return jacobian.set(dx.x,dy.x,dz.x,dx.y,dy.y,dz.y,dx.z,dy.z,dz.z).invert().transpose();
        };
        for (const { geometry, base, targets, frames, normals, targetNormals } of heads) {
          // Three packs morphs into a texture on first use. Dispose its cached
          // buffers when a new identity changes those expression offsets.
          geometry.dispose();
          const position = geometry.attributes.position;
          if (!active) {
            position.array.set(base);
            geometry.morphAttributes.position.forEach((target, i) => { target.array.set(targets[i]); target.needsUpdate = true; });
            geometry.morphAttributes.normal?.forEach((target,i) => {target.array.set(targetNormals[i]);target.needsUpdate=true;});
            if (normals) { geometry.attributes.normal.array.set(normals); geometry.attributes.normal.needsUpdate = true; }
          } else {
            for (let i = 0; i < position.count; i++) {
              const { into: intoHead, from: fromHead, normalInto, normalFrom } = frames[i];
              neutral.fromArray(base, i*3);
              canonical.copy(neutral).applyMatrix4(intoHead);
              warped.copy(canonical); deformModularPoint(warped, values, frame);
              point.copy(warped).applyMatrix4(fromHead);
              fitted.copy(point);
              position.setXYZ(i, point.x, point.y, point.z);
              if (normals) {
                // Preserve the artist's smooth normals across duplicated UV
                // vertices; recalculating each chart creates visible panels.
                normal.fromArray(normals,i*3).applyMatrix3(normalInto).applyMatrix3(normalJacobian(canonical,warped)).applyMatrix3(normalFrom).normalize();
                fittedNormal.copy(normal);
                geometry.attributes.normal.setXYZ(i,normal.x,normal.y,normal.z);
              }
              for (let t = 0; t < targets.length; t++) {
                point.fromArray(targets[t], i*3);
                if (geometry.morphTargetsRelative) point.add(neutral);
                posed.copy(point).applyMatrix4(intoHead);
                posedWarp.copy(posed); deformModularPoint(posedWarp,values,frame);
                point.copy(posedWarp).applyMatrix4(fromHead);
                if (geometry.morphTargetsRelative) point.sub(fitted);
                geometry.morphAttributes.position[t].setXYZ(i, point.x, point.y, point.z);
                if (normals && targetNormals[t]) {
                  normal.fromArray(targetNormals[t],i*3);
                  if (geometry.morphTargetsRelative) {
                    normal.x += normals[i*3]; normal.y += normals[i*3+1]; normal.z += normals[i*3+2];
                  }
                  normal.applyMatrix3(normalInto).applyMatrix3(normalJacobian(posed,posedWarp)).applyMatrix3(normalFrom).normalize();
                  if (geometry.morphTargetsRelative) normal.sub(fittedNormal);
                  geometry.morphAttributes.normal[t].setXYZ(i,normal.x,normal.y,normal.z);
                }
              }
            }
            geometry.morphAttributes.position.forEach((target) => { target.needsUpdate = true; });
            geometry.morphAttributes.normal?.forEach(target => {target.needsUpdate=true;});
            if (normals) geometry.attributes.normal.needsUpdate = true;
            else geometry.computeVertexNormals();
          }
          position.needsUpdate = true;
          geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        }
        namesOfFeatures.forEach((name, i) => { lastFeatures[i] = values[name]; });
      }
      const selected = Math.max(0, Math.min(presets.length-1, Math.trunc(Number(variant) || 0)));
      for (const { mesh, index, column } of bindings) mesh.morphTargetInfluences[index] = presets[selected][column];
    },
  };
}

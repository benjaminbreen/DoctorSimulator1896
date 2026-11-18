import * as THREE from 'three';
import { instanced } from './lib/instances.js';
import { seats, tables } from '../world/daneHall.js';

const oak = '#926b45';
const walnut = '#60422f';
const ebony = '#352e29';
const brass = '#b3965f';
const ivory = '#e1cfab';

function turned(profile) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  );
}

// Shallow sinuous sulci break up the hemispheres on the plaster teaching casts.
function brainGeometry() {
  const g = new THREE.SphereGeometry(0.5, 52, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const fold = Math.sin(29 * z + 3.4 * Math.sin(9 * x + 4 * y) + 2 * Math.sin(14 * y - 3 * z));
    const depth = 1 - 0.065 * Math.exp(-13 * fold * fold) - 0.05 * Math.exp(-1600 * x * x);
    p.setXYZ(i, x * depth, y * depth, z * depth);
  }
  g.computeVertexNormals();
  return g;
}

export function buildDaneCollection(grain, grainNormal) {
  const root = new THREE.Group(),
    colliders = [],
    batches = new Map();
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(0.5, 24, 18),
    ring: new THREE.TorusGeometry(0.47, 0.03, 10, 48),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
    leg: turned([
      [0.2, 0],
      [0.23, 0.04],
      [0.17, 0.1],
      [0.31, 0.59],
      [0.28, 0.65],
      [0.44, 0.68],
      [0.47, 0.73],
      [0.33, 0.75],
      [0.44, 0.83],
      [0.45, 1],
    ]),
    shade: turned([
      [0.12, 0],
      [0.49, 0.07],
      [0.5, 0.15],
      [0.37, 0.36],
      [0.2, 0.7],
      [0.12, 1],
    ]),
    brain: brainGeometry(),
    halfEye: new THREE.SphereGeometry(0.5, 56, 36, Math.PI, Math.PI),
  };
  const materials = {
    wood: new THREE.MeshStandardMaterial({
      map: grain,
      normalMap: grainNormal,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.48,
    }),
    paint: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ metalness: 0.68, roughness: 0.32 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#c6e0d9',
      metalness: 0.18,
      roughness: 0.09,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
  };
  function part(shape, material, p, s, color, r) {
    const key = shape + '/' + material;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push({ p, s, color: color ? new THREE.Color(color).toArray() : undefined, r });
  }
  const wood = (p, s, col = oak, r) => part('box', 'wood', p, s, col, r);
  const block = (p, s, col, r) => part('box', 'paint', p, s, col, r);
  const oval = (p, s, col, r) => part('ball', 'paint', p, s, col, r);
  const metal = (p, s, col = brass, r) => part('cylinder', 'metal', p, s, col, r);
  const collide = (p, size, yaw = 0) => colliders.push({ type: 'box', p, size, yaw });
  function rod(a, b, radius, col, material = 'wood') {
    const v = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    part(
      'cylinder',
      material,
      a.map((x, i) => (x + b[i]) / 2),
      [2 * radius, v.length(), 2 * radius],
      col,
      new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3),
    );
  }
  function table(x, z, w, d, h, col) {
    wood([x, h - 0.035, z], [w, 0.07, d], col);
    for (const side of [-1, 1]) {
      wood([x, h - 0.12, z + side * (d / 2 - 0.1)], [w - 0.18, 0.14, 0.045], col);
      wood([x + side * (w / 2 - 0.1), h - 0.12, z], [0.045, 0.14, d - 0.14], col);
      for (const end of [-1, 1])
        part(
          'leg',
          'wood',
          [x + side * (w / 2 - 0.12), 0, z + end * (d / 2 - 0.11)],
          [0.12, h - 0.07, 0.12],
          col,
        );
    }
    collide([x, h / 2, z], [w, h, d]);
  }
  for (const { x, z } of tables) table(x, z, 2.76, 0.94, 0.79, oak);
  table(-5.85, -1.54, 0.88, 3.58, 0.9, walnut);
  table(-1.24, -4.02, 2.12, 0.9, 0.89, walnut);
  // Folding reading stands keep the demonstration figures in sight over a notebook.
  for (const [x, z] of [
    [-3.32, -1.65],
    [0.68, 1.12],
  ]) {
    wood([x, 0.829, z - 0.19], [0.41, 0.055, 0.29], walnut);
    wood([x, 1.03, z - 0.18], [0.38, 0.38, 0.022], walnut, [-0.23, 0, 0]);
    wood([x, 0.852, z - 0.108], [0.42, 0.034, 0.09], oak);
    rod([x, 1.12, z - 0.2], [x, 0.848, z - 0.32], 0.012, brass, 'metal');
  }
  for (const [i, seat] of seats.entries()) {
    const { x, z, yaw } = seat,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const at = (u, h, v) => [x + u * c + v * s, h, z - u * s + v * c];
    const col = i % 3 === 1 ? '#7d5936' : '#543c2d';
    oval(at(0, 0.465, 0), [0.5, 0.09, 0.47], col, [0, yaw, 0]);
    for (const u of [-1, 1]) {
      for (const v of [-1, 1])
        rod(at(u * 0.213, 0.02, v * 0.207), at(u * 0.165, 0.44, v * 0.158), 0.021, col);
      rod(at(u * 0.2, 0.19, -0.195), at(u * 0.2, 0.19, 0.195), 0.012, col);
    }
    rod(at(-0.19, 0.21, 0.18), at(0.19, 0.21, 0.18), 0.014, col);
    for (let k = -2; k <= 2; k++)
      rod(
        at(k * 0.083, 0.48, -0.16 + 0.018 * Math.abs(k)),
        at(k * 0.104, 0.89, -0.243 + 0.019 * Math.abs(k)),
        k % 2 === 0 ? 0.015 : 0.011,
        col,
      );
    for (let k = -4; k < 4; k++) {
      const crest = (j) => at(j * 0.058, 0.94 - 0.055 * (j / 4) ** 2, -0.25 + 0.051 * (j / 4) ** 2);
      rod(crest(k), crest(k + 1), 0.026, col);
    }
    collide(at(0, 0.45, 0), [0.49, 0.9, 0.48], yaw);
    const row = tables[Math.floor(i / 2)];
    const nx = x + 0.06,
      nz = row.z + 0.11;
    block([nx, 0.802, nz], [0.39, 0.024, 0.259], i % 2 ? '#564036' : '#3b514a');
    block([nx, 0.817, nz], [0.375, 0.013, 0.247], '#d4c5a6');
    rod([nx + 0.226, 0.804, nz - 0.08], [nx + 0.27, 0.804, nz + 0.075], 0.004, '#804a27');
    block([nx + 0.29, 0.82, nz - 0.241], [0.052, 0.063, 0.052], '#23312f');
    metal([nx + 0.29, 0.857, nz - 0.241], [0.036, 0.015, 0.036], '#7a6040');
  }

  // The original casework is freestanding: plinth and cupboards below,
  // shallow glazed doors above, with specimen tickets on the shelf lips.
  for (const [caseIndex, x] of [-4.04, 1.63, 4.68].entries()) {
    const w = caseIndex === 0 ? 3.5 : 2.81,
      z = -5.4,
      front = z + 0.32;
    wood([x, 0.11, z], [w + 0.12, 0.22, 0.74], walnut);
    wood([x, 0.53, z], [w, 0.74, 0.61], walnut);
    wood([x, 1.92, z - 0.28], [w, 2.28, 0.055], '#765c40');
    for (const side of [-1, 1]) {
      wood([x + side * (w / 2 - 0.048), 1.9, z], [0.096, 2.38, 0.62], walnut);
      const panel = x + side * w * 0.245;
      wood([panel, 0.53, front], [w * 0.455, 0.58, 0.035], oak);
      wood([panel, 0.53, front + 0.022], [w * 0.4, 0.48, 0.018], walnut);
      oval([x + side * 0.13, 0.7, front + 0.055], [0.045, 0.045, 0.05], brass);
    }
    for (const y of [0.92, 1.55, 2.17, 2.82, 3.1]) wood([x, y, z], [w + 0.04, 0.056, 0.66], oak);
    for (const [y, h, add] of [
      [3.1, 0.1, 0.12],
      [3.18, 0.07, 0.18],
      [3.23, 0.035, 0.23],
    ])
      wood([x, y, z], [w + add, h, 0.67 + add * 0.6], walnut);
    for (const side of [-1, 1]) {
      const px = x + side * w * 0.245;
      part('box', 'glass', [px, 2.02, front], [w * 0.46, 2.08, 0.009]);
      for (const edge of [-1, 1])
        wood([px + edge * w * 0.231, 2.02, front + 0.013], [0.043, 2.13, 0.05], walnut);
      for (const y of [0.96, 3.07]) wood([px, y, front + 0.012], [w * 0.475, 0.046, 0.048], walnut);
    }
    collide([x, 1.62, z], [w + 0.1, 3.25, 0.71]);
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = [0.95, 1.58, 2.2][shelf];
      if (caseIndex === 0) {
        let bx = x - w * 0.46;
        for (let k = 0; bx < x + w * 0.43; k++) {
          const width = 0.075 + 0.046 * (1 + Math.sin(k * 7 + shelf));
          const h = 0.31 + (0.13 * (1 + Math.cos(k * 0.77 + shelf))) / 2;
          wood(
            [bx + width / 2, y + h / 2, z + 0.08],
            [width - 0.012, h, 0.26],
            ['#66372a', '#39463b', '#76543f', '#41403c'][k % 4],
          );
          for (const band of [0.12, 0.83])
            block([bx + width / 2, y + h * band, z + 0.214], [width * 0.82, 0.009, 0.006], '#b7a070');
          bx += width;
        }
      } else
        for (let k = 0; k < 4; k++) {
          const px = x + (k - 1.5) * 0.637,
            py = y + 0.116;
          wood([px, y + 0.023, z], [0.415, 0.042, 0.32], ebony);
          metal([px, y + 0.08, z], [0.05, 0.11, 0.05], brass);
          if ((caseIndex === 1 && shelf === 1) || (caseIndex === 2 && shelf === 0)) {
            // Wet preparations under bell jars. The turned foot and stopper catch side light.
            part('cylinder', 'glass', [px, py + 0.143, z], [0.26, 0.32, 0.26]);
            oval([px, py + 0.115, z], [0.16, 0.23, 0.13], k % 2 ? '#bc9d76' : '#caa98b', [0.2, k, 0.21]);
            metal([px, py + 0.31, z], [0.23, 0.026, 0.23], '#9c8d69');
            oval([px, py + 0.35, z], [0.063, 0.066, 0.063], ivory);
          } else if (shelf === 2 && k % 2 === 0) {
            metal([px, py + 0.12, z], [0.029, 0.25, 0.029]);
            part('ring', 'metal', [px, py + 0.23, z], [0.37, 0.37, 0.15], brass, [0, 0.18 * k, 0]);
            for (const dx of [-0.074, 0.074])
              rod([px + dx, py + 0.21, z], [px + dx, py + 0.35, z], 0.008, brass, 'metal');
          } else if ((shelf + k + caseIndex) % 3 === 0) {
            oval([px, py + 0.14, z], [0.25, 0.29, 0.235], ivory);
            oval([px, py + 0.055, z + 0.075], [0.17, 0.14, 0.135], ivory);
            for (const side of [-1, 1])
              oval([px + side * 0.052, py + 0.12, z + 0.103], [0.063, 0.057, 0.023], '#5b5143');
            oval([px, py + 0.083, z + 0.135], [0.032, 0.039, 0.014], '#746554');
            for (let tooth = -2; tooth <= 2; tooth++)
              block([px + tooth * 0.017, py + 0.038, z + 0.139], [0.015, 0.024, 0.011], '#d5c49f');
          } else {
            part(
              'brain',
              'paint',
              [px, py + 0.105, z],
              [0.36, 0.236, 0.286],
              ['#d8b9a1', '#d7c7a7', '#bc927e'][(shelf + k) % 3],
              [0, k * 0.68, 0.16],
            );
          }
          block([px, y + 0.045, z + 0.216], [0.148, 0.061, 0.015], '#e3d6b7', [-0.23, 0, 0]);
        }
    }
  }

  // White projection blind and interrupted-line stimulus on the rear wall.
  block([-0.84, 2.07, -5.67], [2.15, 2.55, 0.035], '#dad5bb');
  wood([-0.84, 3.4, -5.59], [2.32, 0.085, 0.105], walnut);
  wood([-0.84, 0.79, -5.61], [2.17, 0.044, 0.04], walnut);
  block([-0.84, 2.06, -5.639], [1.3, 1.05, 0.016], '#2d302b');
  for (let i = -3; i <= 3; i++)
    block([-0.84 + i * 0.15, 2.07, -5.625], [0.016, 0.35 - 0.055 * Math.abs(i), 0.004], '#e7e3cd');

  // A cutaway of the eye. The flat section faces the class; the coats,
  // vitreous, cornea and lens each have a distinct profile.
  const ex = -1.65,
    ez = -4.0;
  wood([ex, 0.93, ez], [0.6, 0.08, 0.42], ebony);
  metal([ex, 1.12, ez], [0.065, 0.35, 0.065]);
  part('halfEye', 'paint', [ex, 1.47, ez], [0.6, 0.6, 0.55], ivory);
  oval([ex + 0.255, 1.47, ez - 0.045], [0.13, 0.23, 0.105], '#8caaa1');
  rod([ex - 0.25, 1.47, ez - 0.036], [ex - 0.42, 1.38, ez - 0.096], 0.045, '#d7b978', 'paint');

  wood([-6.4, 1.3, -1.48], [0.19, 0.055, 4.3], walnut);
  for (let i = 0; i < 4; i++)
    block([-6.38, 1.344, -1.1 + i * 0.17], [0.027, 0.024, 0.085], '#dfdacc', [0, i * 0.42, 0]);
  // A pair of brackets light the slate from above. A second elbow allows
  // each reflector to swing clear when the board is lifted off its hooks.
  for (const z of [-3.0, 0.06]) {
    metal([-6.49, 3.44, z], [0.115, 0.045, 0.115], brass, [0, 0, Math.PI / 2]);
    rod([-6.47, 3.44, z], [-6.26, 3.44, z], 0.012, brass, 'metal');
    rod([-6.26, 3.44, z], [-6.2, 3.61, z], 0.012, brass, 'metal');
    rod([-6.2, 3.61, z], [-6.04, 3.61, z], 0.011, brass, 'metal');
    oval([-6.04, 3.51, z], [0.055, 0.1, 0.055], '#eee0bb');
    part('shade', 'metal', [-6.04, 3.51, z], [0.26, 0.116, 0.26], brass);
  }
  // A cloth-backed teaching sheet hangs from two beech rollers opposite the board.
  for (const y of [1.43, 2.96]) rod([-0.65, y, 3.54], [1.19, y, 3.54], 0.022, oak);
  rod([-0.58, 2.98, 3.54], [0.27, 3.27, 3.58], 0.006, ebony, 'paint');
  rod([0.27, 3.27, 3.58], [1.12, 2.98, 3.54], 0.006, ebony, 'paint');
  // Two-arm gas drops and the thin supply line visible above the class.
  for (const z of [-3.12, 0.25]) {
    metal([0, 4.03, z], [0.024, 0.91, 0.024]);
    metal([0, 3.57, z], [0.089, 0.105, 0.089]);
    rod([-0.89, 3.58, z], [0.89, 3.58, z], 0.018, brass, 'metal');
    for (const x of [-0.89, 0.89]) {
      metal([x, 3.63, z], [0.045, 0.15, 0.045]);
      part('shade', 'paint', [x, 3.68, z], [0.34, 0.19, 0.34], '#e4dcc4', [Math.PI, 0, 0]);
    }
  }
  for (const z of [-3.85, -1.65, 0.55, 2.75]) {
    for (const h of [1.63, 2.14, 2.6])
      wood([6.66, h, z], [0.047, h === 2.14 ? 0.064 : 0.031, 1.48], '#b3a488');
    wood([6.66, 2.12, z], [0.047, 2.62, 0.037], '#baae95');
    wood([6.45, 3.48, z], [0.09, 0.09, 1.6], walnut);
    block([6.44, 3.32, z], [0.04, 0.28, 1.49], '#c5b693');
  }
  // A narrow peg rail on the landing gives the entry a different use and scale.
  wood([-0.55, 1.63, 5.7], [5.9, 0.16, 0.08], walnut);
  for (let x = -3.1; x < 2.2; x += 0.53) rod([x, 1.64, 5.65], [x, 1.7, 5.53], 0.017, brass, 'metal');
  table(-2.5, 4.9, 2.7, 0.41, 0.48, walnut);

  for (const [key, entries] of batches) {
    const [geometry, material] = key.split('/');
    root.add(
      instanced(geometries[geometry], materials[material], entries, {
        cast: material !== 'glass',
        receive: material !== 'glass',
      }),
    );
  }
  return {
    root,
    colliders,
    dispose() {
      root.children.forEach((mesh) => mesh.dispose());
      Object.values(geometries).forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}

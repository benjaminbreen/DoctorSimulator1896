import * as THREE from 'three';

function mirrorX([x, y, z]) {
  return [-x, y, z];
}

// One compact pigeon shared by every instance. Local +z is forward; the
// wing-side attribute lets the vertex shader flap both wings independently.
export function buildPigeonGeometry() {
  const positions = [];
  const wingSides = [];
  const triangle = (a, b, c, wingSide = 0) => {
    positions.push(...a, ...b, ...c);
    wingSides.push(wingSide, wingSide, wingSide);
  };

  const nose = [0, 0.025, 0.27];
  const upper = [0, 0.075, 0.08];
  const left = [-0.075, 0, 0.06];
  const right = [0.075, 0, 0.06];
  const lower = [0, -0.045, 0.04];
  const tail = [0, 0, -0.25];
  triangle(nose, left, upper);
  triangle(nose, upper, right);
  triangle(nose, right, lower);
  triangle(nose, lower, left);
  triangle(tail, upper, left);
  triangle(tail, right, upper);
  triangle(tail, lower, right);
  triangle(tail, left, lower);

  const headFront = [0, 0.045, 0.35];
  const headTop = [0, 0.115, 0.24];
  const headLeft = [-0.06, 0.055, 0.22];
  const headRight = [0.06, 0.055, 0.22];
  triangle(headFront, headLeft, headTop);
  triangle(headFront, headTop, headRight);
  triangle(headFront, headRight, headLeft);
  triangle(headLeft, headRight, headTop);

  triangle([-0.05, 0, -0.16], [0.05, 0, -0.16], [-0.12, 0, -0.37]);
  triangle([0.05, 0, -0.16], [0.12, 0, -0.37], [-0.12, 0, -0.37]);

  const wingRoot = [0.045, 0.015, 0.12];
  const wingElbow = [0.23, 0.012, 0.08];
  const wingTip = [0.43, 0, -0.025];
  const wingRear = [0.13, 0, -0.16];
  triangle(wingRoot, wingElbow, wingRear, 1);
  triangle(wingElbow, wingTip, wingRear, 1);
  triangle(mirrorX(wingRoot), mirrorX(wingRear), mirrorX(wingElbow), -1);
  triangle(mirrorX(wingElbow), mirrorX(wingRear), mirrorX(wingTip), -1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aWingSide', new THREE.Float32BufferAttribute(wingSides, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}


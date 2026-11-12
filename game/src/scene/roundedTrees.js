import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The park's simple trees: a trunk and a few rounded lobes, one outline per
// species. ParkShell draws them. With the 'rounded' tree style they are the
// only trees; with 'detailed' they stand in until the leaf models load.
//
// spread: crown radius as a fraction of height. trunk: bare trunk, same unit.
// lobes: [x, height, z, width, depth]; x, z and width in crown radii, height
// and depth as fractions of the tree's height.
// Outlines and colours are drawn by eye from the general habit of each kind.
const SHAPES = {
  broadleaf: { spread: .28, trunk: .54, leaf: '#55703a', bark: '#534734',
    lobes: [[0, .73, 0, 1, .26], [.57, .65, -.24, .69, .18], [-.49, .67, .32, .71, .185]] },
  // Vase-shaped: a long trunk opening into a wide, flat-topped crown.
  elm: { spread: .36, trunk: .62, leaf: '#4f6a36', bark: '#4f4638',
    lobes: [[0, .82, 0, .8, .17], [.6, .75, .1, .66, .15], [-.55, .76, -.25, .68, .15], [.05, .73, .62, .6, .14], [-.1, .74, -.6, .58, .14]] },
  // Tiers thinning to a point, the trunk showing between them.
  pine: { spread: .22, trunk: .9, leaf: '#33523d', bark: '#5c4234',
    lobes: [[0, .44, 0, 1, .09], [.08, .6, .05, .8, .09], [-.05, .76, -.04, .55, .09], [0, .91, 0, .28, .09]] },
  cypress: { spread: .17, trunk: .5, leaf: '#6c8a4c', bark: '#6a5140',
    lobes: [[0, .4, 0, 1, .17], [0, .62, 0, .72, .17], [0, .83, 0, .4, .16]] },
  poplar: { spread: .11, trunk: .4, leaf: '#58763a', bark: '#676152',
    lobes: [[0, .45, 0, 1, .22], [0, .7, 0, .85, .22], [0, .88, 0, .5, .12]] },
  cottonwood: { spread: .25, trunk: .5, leaf: '#5f7c3c', bark: '#5d5647',
    lobes: [[0, .64, 0, .95, .27], [.35, .82, .1, .6, .17], [-.42, .52, -.15, .62, .16]] },
  // A low dome with long lobes hanging round its edge.
  willow: { spread: .44, trunk: .5, leaf: '#7f9145', bark: '#4a4234',
    lobes: [[0, .7, 0, .72, .2], [.6, .5, .1, .4, .31], [-.52, .5, -.3, .4, .31], [.1, .5, .62, .38, .31], [-.15, .5, -.62, .38, .31]] },
  // Honey locust and its like: thin, open, flat layers.
  compound: { spread: .32, trunk: .6, leaf: '#728a42', bark: '#4c4338',
    lobes: [[0, .8, 0, .78, .12], [.6, .69, .2, .58, .1], [-.6, .71, -.1, .6, .1], [.1, .62, -.6, .5, .09]] },
  beech: { spread: .32, trunk: .34, leaf: '#5c333a', bark: '#77746a',
    lobes: [[0, .6, 0, 1, .3], [.4, .76, .2, .6, .18], [-.42, .46, -.2, .7, .2]] },
  ailanthus: { spread: .34, trunk: .6, leaf: '#64823e', bark: '#5f5a4c',
    lobes: [[0, .8, 0, .9, .14], [.5, .7, .3, .6, .12], [-.5, .72, -.3, .6, .12]] },
};
SHAPES['old-elm'] = { ...SHAPES.elm, spread: .4 };

// Several park trees share one outline; the leaf colour tells them apart.
const LEAF_BY_NAME = {
  'silver maple': '#75886a',
  'red maple': '#4d6b36',
  catalpa: '#6b8b40',
  buckeye: '#405c33',
  alder: '#4a6436',
  'Osage orange': '#5b7d33',
  'Japanese pagoda tree': '#5c7a45',
  'white pine': '#3c5c4b',
  'Austrian pine': '#2b4636',
  'Scotch pine': '#47614a',
};

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const paint = new THREE.Color();

// Instance entries (see lib/instances.js) for one tree item.
export function roundedTree(item) {
  const shape = SHAPES[item.tree.species] ?? SHAPES.broadleaf;
  const [x, y, z] = item.position;
  const height = item.tree.height;
  const base = y - item.size[1] / 2;
  const radius = Math.min(height * shape.spread, 6);
  const seed = x * 3.7 + z * 1.3;
  const turn = hash01(seed) * Math.PI * 2;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  paint.set(LEAF_BY_NAME[item.tree.name] ?? shape.leaf).offsetHSL((hash01(seed + 2) - .5) * .025, 0, (hash01(seed + 1) - .5) * .06);
  const color = [paint.r, paint.g, paint.b];
  paint.set(shape.bark);
  const trunk = {
    p: [x, base + height * shape.trunk / 2, z], s: [item.size[0], height * shape.trunk, item.size[0]],
    color: [paint.r, paint.g, paint.b],
  };
  const crowns = shape.lobes.map(([ox, oy, oz, width, depth], index) => {
    const size = .92 + hash01(seed + index * 5.1) * .16;
    return {
      p: [x + (ox * cos - oz * sin) * radius, base + oy * height, z + (ox * sin + oz * cos) * radius],
      s: [radius * width * size, height * depth * size, radius * width * size], color, r: [0, turn + index, 0],
    };
  });
  return { trunk, crowns };
}

// Crowns are lit from above and dark underneath, which gives each lobe its
// volume without a texture. Lobes only turn about the vertical, so the
// geometry's own normal says which way is up.
export function crownMaterial() {
  const material = new THREE.MeshStandardMaterial({ roughness: 1 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying float vCrownUp;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n  vCrownUp = normal.y;');
    shader.fragmentShader = 'varying float vCrownUp;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(0.55, 1.12, smoothstep(-0.7, 0.6, vCrownUp));');
  };
  material.customProgramCacheKey = () => 'rounded-crown-v1';
  return material;
}

// A ball with a few broad swellings, so a crown is not a perfect sphere and
// each lobe looks different once it is turned.
export function crownGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i).normalize();
    const swell = Math.sin(point.x * 3.1 + 1.3) * Math.sin(point.y * 2.7 + .4) * Math.sin(point.z * 3.4 + 2.1);
    point.multiplyScalar(1 + swell * .22);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  // Icosahedron triangles do not share vertices, so join them first or each
  // face would get its own normal and the crown would look cut from facets.
  const joined = mergeVertices(geometry.deleteAttribute('normal').deleteAttribute('uv'));
  joined.computeVertexNormals();
  return joined;
}

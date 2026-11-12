import { Uniform, Vector2 } from 'three';
import { Pass } from 'postprocessing';
import { FigureMaskPass, LAB, halfTarget, material } from './hopperPaint.js';

// "Seurat" paint style, after tone mapping. Three steps:
//   1 (quarter res): the picture averaged and stored as OKLab;
//   2 (1/16 res): the same, blurred wide, for the halo at light/dark edges;
//   3 (full res): three layers of dabs on turned, jittered screen grids.
// Each dab takes the picture's colour at its own centre and shifts it by a
// rule, so that neighbouring dabs mix by eye back to roughly that colour:
//   layer 1, large: the local colour;
//   layer 2: the colour split into its two neighbouring hues;
//   layer 3, sparse: orange where the sun falls, blue-violet in shade, and
//   a few complements.
// A new style after his park pictures, not a copy of any one of them.

// Four taps, each a 2x2 average: a 4x4 box of the source per output pixel.
const AVERAGE = /* glsl */ `
uniform sampler2D source;
uniform vec2 texel; // one source texel
uniform float toLabSpace;
varying vec2 vUv;
${LAB}
void main() {
  vec3 c = (texture2D(source, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(source, vUv + texel * vec2(1.0, -1.0)).rgb
    + texture2D(source, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(source, vUv + texel * vec2(1.0, 1.0)).rgb) * 0.25;
  gl_FragColor = vec4(toLabSpace > 0.5 ? toLab(clamp(c, 0.0, 1.0)) : c, 1.0);
}
`;

const DOTS = /* glsl */ `
uniform sampler2D inputBuffer;
uniform sampler2D softBuffer;
uniform sampler2D glowBuffer;
uniform sampler2D figureBuffer;
uniform vec2 resolution;
uniform float pixelRatio;
uniform float dotSize;
uniform float hueSpread;
uniform float chroma;
uniform float lightDots;
uniform float complement;
uniform float halo;
uniform float highKey;
uniform float canvas;
uniform float figureDetail;
uniform float border;
varying vec2 vUv;
${LAB}

vec3 hash3(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

vec2 turn(vec2 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// The colour a dab laid at this point should mix to.
vec3 pictureLab(vec2 uv) {
  vec3 lab = texture2D(softBuffer, uv).rgb;
  // Light looks lighter and dark darker where they meet.
  lab.x += (lab.x - texture2D(glowBuffer, uv).r) * halo;
  // His darks are never black: they are lifted and carried by colour.
  lab.x = mix(lab.x, 0.26 + 0.72 * lab.x, highKey);
  lab.yz += vec2(0.004, -0.028) * (1.0 - smoothstep(0.3, 0.62, lab.x)) * lightDots;
  // The painted border: dark, and coloured against the picture beside it.
  vec2 edge = min(uv, 1.0 - uv) * resolution / pixelRatio;
  if (border > 0.0 && min(edge.x, edge.y) < border) lab = vec3(0.3 + 0.15 * (1.0 - lab.x), -lab.yz * 0.7 + vec2(-0.004, -0.085));
  return lab;
}

// rule 0: local colour. 1: split into neighbouring hues. 2: light, shade and complement.
vec4 dabs(vec2 css, float size, float angle, float seed, int rule) {
  vec2 p = turn(css, angle) / size;
  vec2 cell = floor(p);
  float best = -1.0;
  float bestInside = 0.0;
  vec2 bestCentre = vec2(0.0);
  vec3 bestHash = vec3(0.0);
  // 3x3 is exact: a dab reaches under 0.8 of a cell and sits within 0.35 of its cell's middle.
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = cell + vec2(i, j);
      vec3 h = hash3(id + seed);
      vec2 centre = id + 0.5 + (h.xy - 0.5) * 0.7;
      vec2 d = p - centre;
      d.x *= 0.8; // slightly long, all leaning one way within a layer
      float inside = 1.0 - length(d) / (0.44 + 0.18 * h.z);
      float priority = fract(h.x * 57.31 + h.z * 13.7);
      if (inside > 0.0 && priority > best) {
        best = priority;
        bestInside = inside;
        bestCentre = centre;
        bestHash = h;
      }
    }
  }
  if (best < 0.0) return vec4(0.0);
  vec3 lab = pictureLab(turn(bestCentre * size, -angle) * pixelRatio / resolution);
  vec3 h = bestHash;
  float C = length(lab.yz);
  if (rule == 0) {
    lab.yz = turn(lab.yz, (h.z - 0.5) * 0.5 * hueSpread) * chroma * (0.9 + 0.2 * h.y);
    lab.x += (h.x - 0.5) * 0.035;
  } else if (rule == 1) {
    float side = h.z < 0.5 ? -1.0 : 1.0;
    float theta = side * (0.4 + 0.5 * h.y) * hueSpread;
    lab.yz = turn(lab.yz, theta) * chroma * 1.1 / cos(theta);
    // Greys are built from colour too: a touch of any hue, cancelling over many dabs.
    lab.yz += turn(vec2(0.035, 0.0), best * 6.2832) * (1.0 - smoothstep(0.02, 0.06, C)) * hueSpread;
    lab.x += (h.x - 0.5) * 0.03;
  } else {
    float lit = smoothstep(0.5, 0.78, lab.x);
    if (h.z < lightDots * 0.7) {
      // Orange on what the sun warms. On sky and water it would only grey
      // the blue, so those take a pale rose instead.
      float warmGround = smoothstep(-0.02, 0.04, lab.z);
      vec2 sun = mix(lab.yz * 0.6 + vec2(0.012, 0.004), vec2(0.05, 0.105), warmGround);
      lab.yz = mix(lab.yz, mix(vec2(0.012, -0.11), sun, lit), 0.7);
      lab.x += mix(-0.02, 0.03, lit);
    } else if (h.z > 1.0 - complement * 0.35 * (1.0 - smoothstep(0.35, 0.55, lab.x))) {
      // Complements sit in the shade; in light, and in the sky, they only dull the colour.
      lab.yz = -lab.yz * 0.9 - vec2(0.0, 0.02) * (1.0 - lit);
      lab.x -= 0.02;
    } else {
      return vec4(0.0);
    }
  }
  return vec4(lab, smoothstep(0.0, 0.3, bestInside));
}

void main() {
  vec2 css = gl_FragCoord.xy / pixelRatio;
  vec3 lab = pictureLab(vUv);
  // What shows between dabs: the underpainting, thinned toward primed canvas.
  lab = mix(lab, vec3(0.93, 0.002, 0.03), canvas * 0.4);
  vec4 d;
  d = dabs(css, dotSize * 1.5, 0.35, 11.0, 0); lab = mix(lab, d.rgb, d.a);
  d = dabs(css, dotSize, 1.25, 47.0, 1); lab = mix(lab, d.rgb, d.a);
  d = dabs(css, dotSize * 0.85, 2.3, 83.0, 2); lab = mix(lab, d.rgb, d.a);
  vec3 c = max(fromLab(lab), 0.0);
  // Faces need to stay readable in a consultation.
  float fig = texture2D(figureBuffer, vUv).r;
  c = mix(c, texture2D(inputBuffer, vUv).rgb, fig * figureDetail);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

// Dots uniform name -> tuning id (settingsSchema.js, Seurat group).
const SETTINGS = {
  dotSize: 'seuratDotSize',
  hueSpread: 'seuratHueSpread',
  chroma: 'seuratChroma',
  lightDots: 'seuratLight',
  complement: 'seuratComplement',
  halo: 'seuratHalo',
  highKey: 'seuratHighKey',
  canvas: 'seuratCanvas',
  figureDetail: 'seuratFigureDetail',
  border: 'seuratBorder',
};

export class SeuratPaintPass extends Pass {
  constructor(runtime) {
    super('SeuratPaintPass');
    this.runtime = runtime;
    this.soft = halfTarget();
    this.glow = halfTarget();
    this.figures = halfTarget();
    // Effects.jsx mounts this first in the chain, as for Hopper.
    this.maskPass = new FigureMaskPass(this.figures);
    this.averageMaterial = material(AVERAGE, {
      source: new Uniform(null), texel: new Uniform(new Vector2()), toLabSpace: new Uniform(0),
    });
    this.dotsMaterial = material(DOTS, {
      inputBuffer: new Uniform(null),
      softBuffer: new Uniform(this.soft.texture),
      glowBuffer: new Uniform(this.glow.texture),
      figureBuffer: new Uniform(this.figures.texture),
      resolution: new Uniform(new Vector2()),
      pixelRatio: new Uniform(1),
      ...Object.fromEntries(Object.keys(SETTINGS).map((name) => [name, new Uniform(0)])),
    });
    this.fullscreenMaterial = this.dotsMaterial;
    this.size = [1, 1];
  }

  setSize(width, height) {
    this.size = [width, height];
    this.soft.setSize(Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 4)));
    this.glow.setSize(Math.max(1, Math.round(width / 16)), Math.max(1, Math.round(height / 16)));
    this.figures.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
    this.dotsMaterial.uniforms.resolution.value.set(width, height);
  }

  draw(renderer, drawMaterial, target) {
    this.fullscreenMaterial = drawMaterial;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  render(renderer, inputBuffer, outputBuffer) {
    const [width, height] = this.size;
    const average = this.averageMaterial.uniforms;
    average.source.value = inputBuffer.texture;
    average.texel.value.set(1 / width, 1 / height);
    average.toLabSpace.value = 1;
    this.draw(renderer, this.averageMaterial, this.soft);
    average.source.value = this.soft.texture;
    average.texel.value.set(4 / width, 4 / height);
    average.toLabSpace.value = 0;
    this.draw(renderer, this.averageMaterial, this.glow);
    const dots = this.dotsMaterial.uniforms;
    dots.inputBuffer.value = inputBuffer.texture;
    dots.pixelRatio.value = renderer.getPixelRatio();
    for (const [name, id] of Object.entries(SETTINGS)) dots[name].value = this.runtime.values[id];
    this.draw(renderer, this.dotsMaterial, this.renderToScreen ? null : outputBuffer);
  }

  dispose() {
    for (const target of [this.soft, this.glow, this.figures]) target.dispose();
    this.maskPass.dispose();
    this.averageMaterial.dispose();
    this.dotsMaterial.dispose();
  }
}

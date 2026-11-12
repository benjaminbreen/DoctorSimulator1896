import {
  Color, HalfFloatType, LinearFilter, ShaderMaterial, Uniform, Vector2, Vector3, WebGLRenderTarget,
} from 'three';
import { Pass } from 'postprocessing';
import { hopperFigure, hopperSurface } from './hopperShading.js';

// "Hopper" paint style, after tone mapping. Five steps:
//   1-3 (half res): which way detail runs at each pixel, smoothed;
//   4   (half res): an anisotropic Kuwahara filter, so strokes follow edges
//       and the brush widens with distance;
//   5   (full res): Hopper palette, value steps, light shaping, stroke grain,
//       canvas weave, and a slight hand wobble at colour edges.
// Figures (skinned meshes, see hopperShading.js) get a finer brush and their own
// grade: crisp edges, smooth planes, broad lit and shaded tones.
// The filter follows Kyprianidis et al., "Image and Video Abstraction by
// Anisotropic Kuwahara Filtering" (2009), with polynomial sector weights.

// Picked by eye from his street and interior paintings. A new style, not a
// historical claim. Matched on hue; each pixel keeps its own lightness.
const PALETTE = [
  '#efe6cf', '#e3cf9a', '#e6c65c', '#c9a24a', '#b8613f', '#9c4530',
  '#7a8a46', '#3f7a5f', '#2f4d3a', '#56687a', '#6f9fc8', '#2f4f7a',
  '#c9c4b8', '#9a9284', '#7d858c', '#3a2e25',
];

function oklab(hex) {
  const c = new Color(hex); // three converts hex to linear sRGB
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return new Vector3(
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  );
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

// Sobel on the full-res image at each half-res pixel. Square roots first, so
// dark detail counts as much as bright.
const TENSOR = /* glsl */ `
uniform sampler2D inputBuffer;
uniform vec2 texel;
varying vec2 vUv;
vec3 at(float x, float y) {
  return sqrt(clamp(texture2D(inputBuffer, vUv + vec2(x, y) * texel).rgb, 0.0, 1.0));
}
void main() {
  vec3 gx = (at(-1.0, -1.0) + 2.0 * at(-1.0, 0.0) + at(-1.0, 1.0)
    - at(1.0, -1.0) - 2.0 * at(1.0, 0.0) - at(1.0, 1.0)) * 0.25;
  vec3 gy = (at(-1.0, -1.0) + 2.0 * at(0.0, -1.0) + at(1.0, -1.0)
    - at(-1.0, 1.0) - 2.0 * at(0.0, 1.0) - at(1.0, 1.0)) * 0.25;
  gl_FragColor = vec4(dot(gx, gx), dot(gy, gy), dot(gx, gy), 1.0);
}
`;

// Alpha 0.5 marks a figure; sky and scenery write 1. Read before bloom, whose
// blend overwrites alpha.
const MASK = /* glsl */ `
uniform sampler2D inputBuffer;
varying vec2 vUv;
void main() {
  float a = texture2D(inputBuffer, vUv).a;
  gl_FragColor = vec4(clamp(1.0 - abs(a - 0.5) * 4.0, 0.0, 1.0));
}
`;

// Smoothing the tensor is what makes stroke direction flow instead of flicker.
const BLUR = /* glsl */ `
uniform sampler2D source;
uniform vec2 direction;
varying vec2 vUv;
void main() {
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int k = -4; k <= 4; k++) {
    float w = exp(-float(k * k) / 8.0);
    sum += texture2D(source, vUv + direction * float(k)) * w;
    total += w;
  }
  gl_FragColor = sum / total;
}
`;

// Shared: stroke tangent and anisotropy from a smoothed structure tensor.
const ORIENTATION = /* glsl */ `
void strokeFrame(vec3 g, out vec2 tangent, out float anisotropy) {
  float root = sqrt(max(g.y * g.y - 2.0 * g.x * g.y + g.x * g.x + 4.0 * g.z * g.z, 0.0));
  float l1 = 0.5 * (g.y + g.x + root);
  float l2 = 0.5 * (g.y + g.x - root);
  vec2 v = vec2(l1 - g.x, -g.z);
  tangent = length(v) > 1e-8 ? normalize(v) : vec2(0.0, 1.0);
  anisotropy = l1 + l2 > 1e-8 ? (l1 - l2) / (l1 + l2) : 0.0;
}
`;

const KUWAHARA = /* glsl */ `
#include <packing>
uniform sampler2D inputBuffer;
uniform sampler2D tensorBuffer;
uniform sampler2D depthBuffer;
uniform sampler2D figureBuffer;
uniform float figureAmount;
uniform float figureBrush;
uniform vec2 halfTexel;
uniform vec2 brush; // grid spacing in half-res pixels: near, far
uniform float farDistance;
uniform float radius; // kernel radius in grid steps
uniform float stretch;
uniform float hardness;
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;
${ORIENTATION}
void main() {
  vec2 t;
  float A;
  strokeFrame(texture2D(tensorBuffer, vUv).xyz, t, A);
  float phi = -atan(t.y, t.x);
  float a = radius * clamp(1.0 + A * stretch, 0.5, 1.0 + stretch);
  float b = radius * clamp(1.0 / (1.0 + A * stretch), 1.0 / (1.0 + stretch), 1.0);
  float cp = cos(phi);
  float sp = sin(phi);
  mat2 SR = mat2(0.5 / a, 0.0, 0.0, 0.5 / b) * mat2(cp, sp, -sp, cp);
  int maxX = int(sqrt(a * a * cp * cp + b * b * sp * sp));
  int maxY = int(sqrt(a * a * sp * sp + b * b * cp * cp));

  // Wider strokes with distance: Hopper leaves the far field nearly blank.
  float viewZ = perspectiveDepthToViewZ(texture2D(depthBuffer, vUv).r, cameraNear, cameraFar);
  float spacing = mix(brush.x, brush.y, smoothstep(10.0, farDistance, -viewZ))
    * mix(1.0, figureBrush, texture2D(figureBuffer, vUv).r * figureAmount);
  vec2 stepUv = halfTexel * spacing;

  // Sector weights; 0.58 is the zero crossing from the paper.
  float ZETA = 2.0 / (radius * 0.5);
  float ETA = (ZETA + cos(0.58)) / (sin(0.58) * sin(0.58));
  vec4 m[8];
  vec3 s[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
  for (int y = -maxY; y <= maxY; y++) {
    for (int x = -maxX; x <= maxX; x++) {
      vec2 v = SR * vec2(x, y);
      if (dot(v, v) > 0.25) continue;
      vec3 c = sqrt(clamp(texture2D(inputBuffer, vUv + vec2(x, y) * stepUv).rgb, 0.0, 1.0));
      float w[8];
      float vxx = ZETA - ETA * v.x * v.x;
      float vyy = ZETA - ETA * v.y * v.y;
      float z;
      z = max(0.0, v.y + vxx); w[0] = z * z;
      z = max(0.0, -v.x + vyy); w[2] = z * z;
      z = max(0.0, -v.y + vxx); w[4] = z * z;
      z = max(0.0, v.x + vyy); w[6] = z * z;
      vec2 r = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
      vxx = ZETA - ETA * r.x * r.x;
      vyy = ZETA - ETA * r.y * r.y;
      z = max(0.0, r.y + vxx); w[1] = z * z;
      z = max(0.0, -r.x + vyy); w[3] = z * z;
      z = max(0.0, -r.y + vxx); w[5] = z * z;
      z = max(0.0, r.x + vyy); w[7] = z * z;
      float sum = w[0] + w[1] + w[2] + w[3] + w[4] + w[5] + w[6] + w[7];
      float g = exp(-3.125 * dot(v, v)) / max(sum, 1e-6);
      for (int k = 0; k < 8; k++) {
        float wk = w[k] * g;
        m[k] += vec4(c * wk, wk);
        s[k] += c * c * wk;
      }
    }
  }
  vec4 result = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    if (m[k].w <= 0.0) continue;
    vec3 mean = m[k].rgb / m[k].w;
    vec3 variance = abs(s[k] / m[k].w - mean * mean);
    // Higher hardness: the flattest sector wins outright and edges stay crisp.
    float w = 1.0 / (1.0 + pow(hardness * 1000.0 * (variance.r + variance.g + variance.b), 4.0));
    result += vec4(mean * w, w);
  }
  vec3 c = result.w > 0.0 ? result.rgb / result.w : sqrt(clamp(texture2D(inputBuffer, vUv).rgb, 0.0, 1.0));
  gl_FragColor = vec4(c * c, 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D paintBuffer;
uniform sampler2D tensorBuffer;
uniform sampler2D inputBuffer;
uniform vec2 resolution;
uniform float pixelRatio;
uniform float paintMix;
uniform float detail;
uniform float grainAmount;
uniform float weaveAmount;
uniform float wobbleAmount;
uniform float lightContrast;
uniform float lightLift;
uniform float steps;
uniform float stepStrength;
uniform float warm;
uniform float cool;
uniform vec2 snap; // colours, greys
uniform float snapSoftness;
uniform sampler2D figureBuffer;
uniform vec2 figureTexel;
uniform float figureAmount;
uniform float figureDetail;
uniform float figureGrain;
uniform float figureContrast;
uniform float figureSteps;
uniform float figureStepStrength;
uniform float figureSaturation;
uniform float figurePull;
uniform float figureEdge;
uniform float figureMix;
uniform vec3 palette[${PALETTE.length}];
varying vec2 vUv;
${ORIENTATION}

// Arithmetic hash (Hoskins, "Hash without Sine"): sin is slow and this runs
// about thirty times a pixel.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec3 toLab(vec3 c) {
  vec3 lms = vec3(
    dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
    dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
    dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)));
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return vec3(
    dot(lms, vec3(0.2104542553, 0.793617785, -0.0040720468)),
    dot(lms, vec3(1.9779984951, -2.428592205, 0.4505937099)),
    dot(lms, vec3(0.0259040371, 0.7827717662, -0.808675766)));
}
vec3 fromLab(vec3 lab) {
  vec3 lms = vec3(
    lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z,
    lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z,
    lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z);
  lms = lms * lms * lms;
  return vec3(
    dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
    dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
    dot(lms, vec3(-0.0041960863, -0.7034186147, 1.707614701)));
}

void main() {
  // Screen-fixed, in CSS pixels, so it reads as the canvas and not the scene.
  vec2 css = gl_FragCoord.xy / pixelRatio;
  // A slight unevenness along colour edges, as if laid in by hand.
  float fig = texture2D(figureBuffer, vUv).r * figureAmount;
  // Figures keep a clean silhouette: no wobble, and a slight edge from the mask.
  vec2 fx = vec2(figureTexel.x, 0.0);
  vec2 fy = vec2(0.0, figureTexel.y);
  float edge = length(vec2(
    texture2D(figureBuffer, vUv + fx).r - texture2D(figureBuffer, vUv - fx).r,
    texture2D(figureBuffer, vUv + fy).r - texture2D(figureBuffer, vUv - fy).r)) * figureAmount;
  vec2 wobble = (vec2(noise(css / 9.0), noise(css / 9.0 + 17.3)) - 0.5) * (1.0 - fig);
  vec3 c = texture2D(paintBuffer, vUv + wobble * wobbleAmount * pixelRatio / resolution).rgb;
  vec3 original = texture2D(inputBuffer, vUv).rgb;

  vec2 t;
  float A;
  strokeFrame(texture2D(tensorBuffer, vUv).xyz, t, A);
  // Grain streaked along the stroke direction where there is one.
  float streak = 0.0;
  for (int k = -2; k <= 2; k++) streak += noise(css / 1.6 + t * float(k) * 1.6);
  float grain = mix(noise(css / 2.5), streak / 5.0, smoothstep(0.1, 0.5, A)) - 0.5;
  float weave = sin(css.x * 2.1) * sin(css.y * 2.1);

  vec3 lab = toLab(max(c, 0.0));
  // Detail: the original picture's fine lightness changes laid back over the paint.
  float L = lab.x + (toLab(max(original, 0.0)).x - lab.x) * mix(detail, figureDetail, fig);
  float mid = smoothstep(0.12, 0.45, L) * (1.0 - smoothstep(0.78, 0.98, L));
  L += (grain * grainAmount * mix(1.0, figureGrain, fig) + weave * weaveAmount) * mid;
  // Hard light: lift what the sun reaches, then lay value in soft steps.
  float lit = smoothstep(0.42, 0.72, L);
  L = mix(L, smoothstep(0.08, 0.95, L), mix(lightContrast, figureContrast, fig)) + lightLift * lit;
  // Figures: fewer, broader tones, a lit side and a shaded side, as on a doll.
  float bands = mix(steps, figureSteps, fig);
  float n = L * bands;
  L = mix(L, (floor(n) + smoothstep(0.3, 0.7, fract(n))) / bands, mix(stepStrength, figureStepStrength, fig));
  L -= edge * figureEdge * 0.35;

  // Light toward warm, shade toward cool, then onto the palette's hues.
  vec2 ab = lab.yz * mix(1.0, figureSaturation, fig)
    + mix(vec2(-0.006, -0.014) * cool, vec2(0.008, 0.026) * warm, lit);
  // Distances stay under about 0.15, so at default softness exp stays above zero.
  vec2 target = vec2(0.0);
  float total = 1e-30;
  for (int i = 0; i < ${PALETTE.length}; i++) {
    vec3 q = vec3((L - palette[i].x) * 0.6, ab - palette[i].yz);
    float w = exp(-dot(q, q) / snapSoftness);
    target += palette[i].yz * w;
    total += w;
  }
  // Greys keep most of their own cast; coloured surfaces take the palette.
  float pull = mix(snap.y, snap.x, smoothstep(0.015, 0.07, length(lab.yz)));
  ab = mix(ab, target / total, mix(pull, figurePull, fig));

  // Figures take their own mix: the photo texture blended back reads as real
  // skin, which works against the smooth, doll-like faces.
  gl_FragColor = vec4(mix(original, max(fromLab(vec3(L, ab)), 0.0), mix(paintMix, figureMix, fig)), 1.0);
  #include <colorspace_fragment>
}
`;

// Composite uniform name -> tuning id (settingsSchema.js, Hopper group).
const COMPOSITE_SETTINGS = {
  paintMix: 'hopperMix',
  detail: 'hopperDetail',
  grainAmount: 'hopperGrain',
  weaveAmount: 'hopperWeave',
  wobbleAmount: 'hopperWobble',
  lightContrast: 'hopperContrast',
  lightLift: 'hopperLift',
  steps: 'hopperSteps',
  stepStrength: 'hopperStepStrength',
  warm: 'hopperWarm',
  cool: 'hopperCool',
  snapSoftness: 'hopperSnapSoftness',
  figureAmount: 'hopperFigureAmount',
  figureDetail: 'hopperFigureDetail',
  figureGrain: 'hopperFigureGrain',
  figureContrast: 'hopperFigureContrast',
  figureSteps: 'hopperFigureSteps',
  figureStepStrength: 'hopperFigureStepStrength',
  figureSaturation: 'hopperFigureSaturation',
  figurePull: 'hopperFigurePull',
  figureEdge: 'hopperFigureEdge',
  figureMix: 'hopperFigureMix',
};

// Runs straight after the scene render, before bloom: copies the figure mark
// out of alpha into a half-res mask, then turns the Hopper shading off for
// the rest of the frame.
class FigureMaskPass extends Pass {
  constructor(target) {
    super('FigureMaskPass');
    this.needsSwap = false;
    this.target = target;
    this.fullscreenMaterial = material(MASK, { inputBuffer: new Uniform(null) });
  }

  render(renderer, inputBuffer) {
    hopperSurface.value.fill(0);
    hopperFigure.value.fill(0);
    this.fullscreenMaterial.uniforms.inputBuffer.value = inputBuffer.texture;
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.fullscreenMaterial.dispose();
  }
}

function material(fragmentShader, uniforms) {
  return new ShaderMaterial({
    vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false,
  });
}

function halfTarget() {
  return new WebGLRenderTarget(1, 1, {
    type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false,
  });
}

export class HopperPaintPass extends Pass {
  constructor(viewCamera, runtime) {
    super('HopperPaintPass');
    this.needsDepthTexture = true;
    this.viewCamera = viewCamera;
    this.runtime = runtime;
    this.halfSize = [1, 1];
    this.tensorA = halfTarget();
    this.tensorB = halfTarget();
    this.paint = halfTarget();
    this.figures = halfTarget();
    // Effects.jsx mounts this first in the chain; it must see the raw scene.
    this.maskPass = new FigureMaskPass(this.figures);
    this.tensorMaterial = material(TENSOR, {
      inputBuffer: new Uniform(null), texel: new Uniform(new Vector2()),
    });
    this.blurMaterial = material(BLUR, {
      source: new Uniform(null), direction: new Uniform(new Vector2()),
    });
    this.kuwaharaMaterial = material(KUWAHARA, {
      inputBuffer: new Uniform(null),
      tensorBuffer: new Uniform(null),
      depthBuffer: new Uniform(null),
      figureBuffer: new Uniform(this.figures.texture),
      figureAmount: new Uniform(1),
      figureBrush: new Uniform(0.35),
      halfTexel: new Uniform(new Vector2()),
      brush: new Uniform(new Vector2()),
      farDistance: new Uniform(90),
      radius: new Uniform(4),
      stretch: new Uniform(0.7),
      hardness: new Uniform(8),
      cameraNear: new Uniform(0.1),
      cameraFar: new Uniform(1000),
    });
    this.compositeMaterial = material(COMPOSITE, {
      paintBuffer: new Uniform(this.paint.texture),
      tensorBuffer: new Uniform(null),
      inputBuffer: new Uniform(null),
      resolution: new Uniform(new Vector2()),
      pixelRatio: new Uniform(1),
      palette: new Uniform(PALETTE.map(oklab)),
      snap: new Uniform(new Vector2()),
      figureBuffer: new Uniform(this.figures.texture),
      figureTexel: new Uniform(new Vector2()),
      ...Object.fromEntries(Object.keys(COMPOSITE_SETTINGS).map((name) => [name, new Uniform(0)])),
    });
    this.fullscreenMaterial = this.compositeMaterial;
  }

  setDepthTexture(depthTexture) {
    this.kuwaharaMaterial.uniforms.depthBuffer.value = depthTexture;
  }

  setSize(width, height) {
    const w = Math.max(1, Math.round(width / 2));
    const h = Math.max(1, Math.round(height / 2));
    for (const target of [this.tensorA, this.tensorB, this.paint, this.figures]) target.setSize(w, h);
    this.compositeMaterial.uniforms.figureTexel.value.set(1 / w, 1 / h);
    this.tensorMaterial.uniforms.texel.value.set(1.5 / width, 1.5 / height);
    this.kuwaharaMaterial.uniforms.halfTexel.value.set(1 / w, 1 / h);
    this.compositeMaterial.uniforms.resolution.value.set(width, height);
    this.halfSize = [w, h];
  }

  draw(renderer, material, target) {
    this.fullscreenMaterial = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  render(renderer, inputBuffer, outputBuffer) {
    const [w, h] = this.halfSize;
    const values = this.runtime.values;
    const pixelRatio = renderer.getPixelRatio();
    // One half-res pixel is 2 / pixelRatio CSS pixels. Brush sizes are radii
    // in CSS pixels, so more samples means denser, not wider, strokes.
    const perStep = pixelRatio / 2 / values.hopperKernel;
    this.tensorMaterial.uniforms.inputBuffer.value = inputBuffer.texture;
    this.draw(renderer, this.tensorMaterial, this.tensorA);
    const blur = this.blurMaterial.uniforms;
    blur.source.value = this.tensorA.texture;
    blur.direction.value.set(1 / w, 0);
    this.draw(renderer, this.blurMaterial, this.tensorB);
    blur.source.value = this.tensorB.texture;
    blur.direction.value.set(0, 1 / h);
    this.draw(renderer, this.blurMaterial, this.tensorA);
    // The smoothed tensor ends in A; the brush and the grain both read it.
    const kuwahara = this.kuwaharaMaterial.uniforms;
    kuwahara.inputBuffer.value = inputBuffer.texture;
    kuwahara.tensorBuffer.value = this.tensorA.texture;
    kuwahara.brush.value.set(values.hopperBrushNear * perStep, values.hopperBrushFar * perStep);
    kuwahara.farDistance.value = values.hopperFarDistance;
    kuwahara.radius.value = values.hopperKernel;
    kuwahara.stretch.value = values.hopperAnisotropy;
    kuwahara.hardness.value = values.hopperSharpness;
    kuwahara.figureAmount.value = values.hopperFigureAmount;
    kuwahara.figureBrush.value = values.hopperFigureBrush;
    kuwahara.cameraNear.value = this.viewCamera.near;
    kuwahara.cameraFar.value = this.viewCamera.far;
    this.draw(renderer, this.kuwaharaMaterial, this.paint);
    const composite = this.compositeMaterial.uniforms;
    composite.tensorBuffer.value = this.tensorA.texture;
    composite.inputBuffer.value = inputBuffer.texture;
    composite.pixelRatio.value = pixelRatio;
    composite.snap.value.set(values.hopperSnap, values.hopperSnapGrey);
    for (const [name, id] of Object.entries(COMPOSITE_SETTINGS)) composite[name].value = values[id];
    this.draw(renderer, this.compositeMaterial, this.renderToScreen ? null : outputBuffer);
  }

  dispose() {
    for (const target of [this.tensorA, this.tensorB, this.paint, this.figures]) target.dispose();
    this.maskPass.dispose();
    for (const m of [this.tensorMaterial, this.blurMaterial, this.kuwaharaMaterial, this.compositeMaterial]) m.dispose();
  }
}

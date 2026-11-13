// Expanded neurasthenia: as the nerves give way the world stops looking real.
// The sky goes out, distant buildings become flat painted scenery, the street
// falls dark, and a follow spot picks out the physician. One full-screen pass
// that rebuilds world positions from depth, so no scene object changes.
import { Matrix4, Uniform, Vector3 } from 'three';
import { Effect, EffectAttribute } from 'postprocessing';
import { gameDebug } from '../debug.js';
import { getPlayer } from '../world/player.js';
import { playSfx } from '../audio/sound.js';

// The effect is absent below MOUNT, and complete from FULL upward. The crisis
// threshold is 90 (world/player.js), so the last of the world drains away just
// as the crisis card arrives.
const MOUNT_NERVES = 80;
const START_NERVES = 82;
const FULL_NERVES = 92;

const smooth = (value) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

// 0 to 1: how far the world should be drained right now.
export function stageSetTarget(values, nerves = getPlayer().neurasthenia) {
  const fromNerves = values.expandedNeurasthenia
    ? smooth((nerves - START_NERVES) / (FULL_NERVES - START_NERVES)) : 0;
  return Math.max(fromNerves, values.stageSetPreview);
}

export function stageSetMounted(values, nerves = getPlayer().neurasthenia) {
  return values.stageSetPreview > 0 || (values.expandedNeurasthenia && nerves > MOUNT_NERVES);
}

const FRAGMENT = /* glsl */ `
uniform mat4 stageInvProjection;
uniform mat4 stageInvView;
uniform vec3 stageCamera;
uniform vec3 stageLamp;
uniform vec3 stageTarget;
uniform float stageFloor;
uniform float stageCeiling;
uniform float stageDrain;
uniform float stageSpot;

const float TAN_HALF = 0.062;
const float RIG_HEIGHT = 46.0;
const float RIG_CELL = 14.0;

float stageHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 0 outside the beam, 1 on its axis side of the edge. Per channel, so the
// edge carries the colour fringe of a real follow spot's lens.
vec3 stageBeam(vec3 point) {
  vec3 axis = normalize(stageTarget - stageLamp);
  vec3 offset = point - stageLamp;
  float along = dot(offset, axis);
  float radial = length(offset - axis * along);
  float edge = radial / max(along * TAN_HALF, 1e-3);
  vec3 inside = 1.0 - smoothstep(vec3(0.88, 0.9, 0.93), vec3(0.985, 1.0, 1.03), vec3(edge));
  // Indoors the lamp hangs above the ceiling, which must not catch the beam.
  return inside * step(0.0, along) * step(point.y, stageCeiling);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec4 viewPoint = stageInvProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  viewPoint /= viewPoint.w;
  vec3 world = (stageInvView * viewPoint).xyz;
  vec3 ray = world - stageCamera;
  float range = length(ray);
  vec3 dir = ray / range;
  bool sky = depth > 0.99999 || range > 1000.0;

  vec3 base = inputColor.rgb;
  float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));

  // The unlit set: nearly black, cold, with only lamps and windows surviving.
  // Square-root response, so a night street does not vanish altogether.
  vec3 unlit = mix(vec3(luma), base, 0.3) / max(luma, 1e-4) * sqrt(luma) * vec3(0.075, 0.08, 0.125);
  unlit += base * smoothstep(0.9, 1.0, luma) * 0.75;

  // Scenery flats. Anything distant that stands above the floor is repainted
  // as one flat tone per depth layer, paler the further back it hangs.
  float standing = smoothstep(1.0, 3.5, world.y - stageFloor);
  float flats = sky ? 0.0 : smoothstep(52.0, 60.0, range) * standing;
  float layer = floor(smoothstep(70.0, 300.0, range) * 3.0 + 0.5) / 3.0;
  vec3 paint = mix(vec3(0.3, 0.34, 0.43), vec3(0.66, 0.71, 0.79), layer);
  // Two values only, like scene paint: a window is a darker patch.
  paint *= 0.9 + 0.1 * step(0.3, luma);
  // Canvas panels, each a slightly different batch of paint, with a seam.
  float panel = (world.x + world.z) / 9.0;
  paint *= 0.97 + 0.05 * stageHash(vec2(floor(panel), layer));
  paint *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.035, abs(fract(panel) - 0.5) - 0.465 + 0.035));

  vec3 set = mix(unlit, paint, flats);

  // Above the flats there is no sky, only the dark of the rigging loft:
  // a grid of pipe and a few lamps left burning.
  if (sky) {
    set = vec3(0.0);
    float rise = stageFloor + RIG_HEIGHT - stageCamera.y;
    if (dir.y > 0.03) {
      float reach = rise / dir.y;
      vec2 grid = (stageCamera.xz + dir.xz * reach) / RIG_CELL;
      vec2 cell = floor(grid + 0.5);
      vec2 near = abs(grid - cell);
      float fade = exp(-reach / 170.0);
      // Past the point where a pipe is thinner than a pixel it is dimmed by
      // its coverage, or the far grid fills in as a grey net.
      vec2 pixel = fwidth(grid);
      vec2 width = pixel * 1.5 + 0.008;
      vec2 line = (1.0 - smoothstep(vec2(0.0), width, near)) * min(vec2(1.0), 0.008 / pixel);
      set += vec3(0.026, 0.027, 0.032) * max(line.x, line.y) * fade;
      float lit = step(0.86, stageHash(cell));
      float lens = 1.0 - smoothstep(0.02, 0.07, length(grid - cell));
      float halo = exp(-length(grid - cell) * 9.0);
      set += vec3(1.0, 0.86, 0.6) * lit * fade * (lens * 0.9 + halo * 0.12);
    }
    // The follow spot itself, looking back.
    vec3 toLamp = normalize(stageLamp - stageCamera);
    float facing = max(dot(dir, toLamp), 0.0);
    set += vec3(1.0, 0.95, 0.85) * stageSpot * (pow(facing, 9000.0) * 3.0 + pow(facing, 220.0) * 0.22);
  }

  // The pool of light: the picture as it was, a little bleached.
  vec3 beam = sky ? vec3(0.0) : stageBeam(world);
  vec3 lit = mix(vec3(luma), base, 0.6) * vec3(1.3, 1.2, 1.04) + vec3(0.02);
  set = mix(set, max(set, lit), beam * stageSpot);

  // Dust in the beam, so the shaft itself can be seen from outside it.
  float reachEnd = min(range, 70.0);
  // Interleaved gradient noise: a fixed fine dither, so the shaft does not boil.
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float shaft = 0.0;
  for (int i = 0; i < 16; i++) {
    vec3 at = stageCamera + dir * reachEnd * ((float(i) + jitter) / 16.0);
    // Thin close to the eye, or first person is a walk through fog.
    shaft += stageBeam(at).g * smoothstep(1.0, 7.0, length(at - stageCamera));
  }
  set += vec3(1.0, 0.94, 0.82) * shaft * (reachEnd / 16.0) * 0.0045 * stageSpot;

  outputColor = vec4(mix(base, set, stageDrain), inputColor.a);
}
`;

// Where the lamp hangs, relative to the point it follows.
const LAMP_OFFSET = new Vector3(-11, 30, -15);

export class StageSetEffect extends Effect {
  constructor() {
    super('StageSetEffect', FRAGMENT, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['stageInvProjection', new Uniform(new Matrix4())],
        ['stageInvView', new Uniform(new Matrix4())],
        ['stageCamera', new Uniform(new Vector3())],
        ['stageLamp', new Uniform(new Vector3())],
        ['stageTarget', new Uniform(new Vector3())],
        ['stageFloor', new Uniform(0)],
        ['stageCeiling', new Uniform(1e5)],
        ['stageDrain', new Uniform(0)],
        ['stageSpot', new Uniform(0)],
      ]),
    });
    this.level = 0;
    this.spot = 0;
    this.struck = -1;
    this.clock = 0;
    this.follow = null;
  }

  // Called every frame by Effects.jsx with the current target from
  // stageSetTarget.
  advance(camera, delta, target, indoors) {
    const step = Math.min(delta, 0.1);
    this.clock += step;
    const uniforms = this.uniforms;

    // The house lights go down over about two seconds; they come up faster.
    const rate = target > this.level ? 0.55 : 0.9;
    this.level += Math.sign(target - this.level) * Math.min(Math.abs(target - this.level), rate * step);

    // The spot strikes once the street is mostly dark, with a lamp's stutter.
    const spotOn = this.level > 0.6;
    if (spotOn && this.struck < 0) {
      this.struck = this.clock;
      playSfx('stage-lamp');
    }
    if (!spotOn) this.struck = -1;
    const sinceStrike = this.clock - this.struck;
    const stutter = spotOn && sinceStrike < 0.55 && Math.sin(sinceStrike * 71) * Math.sin(sinceStrike * 23) < -0.1;
    this.spot += ((spotOn && !stutter ? 1 : 0) - this.spot) * Math.min(1, step * 22);

    // The operator follows by hand: a little late, and never perfectly still.
    const [x, y, z] = gameDebug.player.position;
    if (!this.follow) this.follow = new Vector3(x, y, z);
    // A fast-travel or teleport jump is a cut, not something to chase.
    if (this.follow.distanceToSquared({ x, y, z }) > 400) this.follow.set(x, y, z);
    const catchUp = 1 - Math.exp(-step * 2.6);
    this.follow.x += (x - this.follow.x) * catchUp;
    this.follow.y += (y - this.follow.y) * catchUp;
    this.follow.z += (z - this.follow.z) * catchUp;
    const sway = this.clock * 0.7;
    uniforms.get('stageTarget').value.set(
      this.follow.x + Math.sin(sway) * 0.09 + Math.sin(sway * 2.7) * 0.04,
      this.follow.y + 1.0,
      this.follow.z + Math.cos(sway * 1.3) * 0.09,
    );
    uniforms.get('stageLamp').value.copy(this.follow).add(LAMP_OFFSET);
    uniforms.get('stageFloor').value = this.follow.y;
    uniforms.get('stageCeiling').value = indoors ? this.follow.y + 2.3 : 1e5;

    uniforms.get('stageInvProjection').value.copy(camera.projectionMatrixInverse);
    uniforms.get('stageInvView').value.copy(camera.matrixWorld);
    uniforms.get('stageCamera').value.setFromMatrixPosition(camera.matrixWorld);
    uniforms.get('stageDrain').value = smooth(this.level);
    uniforms.get('stageSpot').value = this.spot;
  }
}

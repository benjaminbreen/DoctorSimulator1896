import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from 'three/addons/objects/Sky.js';
import { solarRamps } from '../world/solar.js';
import { moonState } from '../world/moon.js';
import { environmentPalette } from '../world/skyPalette.js';
import { gameDebug } from '../debug.js';
import { windUniforms } from './foliageWind.js';

// Darwin's outdoor palette: sun and sky ramps keyed off solar altitude.
const SUN_NIGHT = new THREE.Color('#41618f');
const MOON_LIGHT = new THREE.Color('#9cbce8');
const SUN_DAY = new THREE.Color('#ffe6b8');
const SUN_GOLDEN = new THREE.Color('#ff9b4d');
const HEMI_SKY = { night: new THREE.Color('#243b61'), day: new THREE.Color('#b9dfef'), golden: new THREE.Color('#9cc4ea') };
// Day ground is sunlit grass, the main source of bounce light into shade.
const HEMI_GROUND = { night: new THREE.Color('#111a29'), day: new THREE.Color('#93986b'), golden: new THREE.Color('#c2915d') };
const AMBIENT_NIGHT = new THREE.Color('#526b91');
const AMBIENT_DAY = new THREE.Color('#e4e7de');
const scratch = new THREE.Color();
export default function SkyRig({ config, runtime }) {
  const scene = useThree((state) => state.scene);
  const sunRef = useRef();
  const ambientRef = useRef();
  const hemisphereRef = useRef();
  const shadowExtentRef = useRef(0);
  // The sun's map covers 50m against an interior light's few metres, so it
  // needs the extra rank to resolve thin casters. A bench is slats and iron
  // bars: below about 3cm per texel it writes nothing and casts no shadow.
  const shadowMapSize = Math.min(Number(runtime.values.shadowMapSize) * 2, 4096);

  // Grade uniforms live on the compiled program, so hold them for useFrame.
  const grade = useMemo(
    () => ({
      uSkyGain: { value: 1 },
      uSkySaturation: { value: 1 },
      uNightBlend: { value: 0 },
      uNightZenith: { value: new THREE.Vector3(0.012, 0.024, 0.065) },
      uNightHorizon: { value: new THREE.Vector3(0.035, 0.05, 0.085) },
      uCityGlow: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonLight: { value: 0 },
    }),
    [],
  );

  const sky = useMemo(() => {
    const dome = new Sky();
    dome.scale.setScalar(1000);
    // Preetham's shader ends on pow(radiance, 1/2.4) — a display-gamma curve
    // that squeezes a 7:1 blue-to-red ratio down to 2.2:1, so the sky reads
    // grey whatever the uniforms say. Undo it and rescale, then let the scene
    // tone mapper roll off the highlights. Never clamp per channel: a ceiling
    // on each of r, g, b separately is what turned the sky flat white.
    //
    // 2.4 is exact: vSunfade is 1 for any unit-length sun vector, so the
    // shader's exponent is always 1/(1.2 + 1.2). Its radiance runs 1 to 14
    // over a daylit sky; /8 puts the zenith near 1 and the horizon above it.
    dome.material.onBeforeCompile = (shader) => {
      shader.uniforms.uSkyGain = grade.uSkyGain;
      shader.uniforms.uSkySaturation = grade.uSkySaturation;
      shader.uniforms.uNightBlend = grade.uNightBlend;
      shader.uniforms.uNightZenith = grade.uNightZenith;
      shader.uniforms.uNightHorizon = grade.uNightHorizon;
      shader.uniforms.uCityGlow = grade.uCityGlow;
      shader.uniforms.uMoonDir = grade.uMoonDir;
      shader.uniforms.uMoonLight = grade.uMoonLight;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform float uSkyGain;
uniform float uSkySaturation;
uniform float uNightBlend;
uniform vec3 uNightZenith;
uniform vec3 uNightHorizon;
uniform float uCityGlow;
uniform vec3 uMoonDir;
uniform float uMoonLight;
void main() {`,
        )
        .replace(
          '#include <tonemapping_fragment>',
          `{
          vec3 linear = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.4)) * uSkyGain * 0.125;
          float skyHeight = max(direction.y, 0.0);
          vec3 nightLinear = mix(uNightHorizon, uNightZenith, smoothstep(0.02, 0.72, skyHeight));
          float horizonGlow = pow(1.0 - smoothstep(0.0, 0.38, skyHeight), 3.0);
          nightLinear += vec3(0.028, 0.014, 0.006) * horizonGlow * uCityGlow;
          float moonHalo = pow(max(dot(direction, normalize(uMoonDir)), 0.0), 28.0);
          nightLinear += vec3(0.07, 0.10, 0.17) * moonHalo * uMoonLight;
          linear = mix(linear, nightLinear, uNightBlend);
          float luma = dot(linear, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor.rgb = max(mix(vec3(luma), linear, uSkySaturation), vec3(0.0));
        }
        #include <tonemapping_fragment>`,
        );
    };
    return dome;
  }, [grade]);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const fog = new THREE.FogExp2(config.fog?.color ?? '#cdd6e4', runtime.values.fogDensity);
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, config, runtime]);

  useFrame((_, delta) => {
    const values = runtime.values;
    const ramps = solarRamps(values.timeOfDay, values.dayOfYear);
    const { direction, daylight, golden } = ramps;
    const moon = moonState(values.timeOfDay, values.dayOfYear);
    const moonLight = moon.light * ramps.night * values.moonlightIntensity;
    gameDebug.stats.sunDir = direction;
    gameDebug.stats.moon = moon;

    // Foliage wind. The clock runs here because this is the one component
    // mounted for exactly as long as there is outdoor planting to move.
    windUniforms.uWindTime.value += Math.min(delta, 0.1) * values.windSpeed;
    windUniforms.uWindStrength.value = values.windStrength;
    gameDebug.stats.windTime = windUniforms.uWindTime.value;

    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = values.skyTurbidity + golden * 0.8;
    uniforms.rayleigh.value = values.skyRayleigh + golden * 0.2;
    uniforms.mieCoefficient.value = values.skyMie + golden * 0.0005;
    uniforms.mieDirectionalG.value = 0.58;
    uniforms.sunPosition.value.set(direction[0], direction[1], direction[2]);
    grade.uSkyGain.value = values.skyGain * (0.12 + 0.88 * daylight);
    grade.uSkySaturation.value = values.skySaturation;
    grade.uNightBlend.value = ramps.nauticalDark;
    grade.uNightZenith.value.set(0.012, 0.024, 0.065).multiplyScalar(values.nightSkyBrightness);
    grade.uNightHorizon.value.set(0.035, 0.05, 0.085).multiplyScalar(values.nightSkyBrightness);
    grade.uCityGlow.value = values.citySkyGlow * ramps.night;
    grade.uMoonDir.value.fromArray(moon.direction);
    grade.uMoonLight.value = moonLight;

    // Sun and shadow frustum follow the player, snapped to the shadow texel
    // grid so the shadow edges do not crawl as the player walks.
    const player = gameDebug.player.position;
    const sun = sunRef.current;
    if (sun) {
      // The distance slider is the half-width of the player-centred shadow
      // box. Changing it live also changes texel density, so nearby shadows
      // get softer as the range grows.
      const shadowExtent = values.outdoorShadowDistance;
      if (shadowExtentRef.current !== shadowExtent) {
        shadowExtentRef.current = shadowExtent;
        const camera = sun.shadow.camera;
        camera.left = -shadowExtent;
        camera.right = shadowExtent;
        camera.top = shadowExtent;
        camera.bottom = -shadowExtent;
        camera.updateProjectionMatrix();
      }
      const texel = (shadowExtent * 2) / shadowMapSize;
      const anchorX = Math.round(player[0] / texel) * texel;
      const anchorZ = Math.round(player[2] / texel) * texel;
      const daylightStrength = config.sun.intensity * values.sunIntensity * daylight;
      const moonStrength = config.sun.intensity * 0.14 * moonLight;
      const keyDirection = daylightStrength >= moonStrength ? direction : moon.direction;
      sun.position.set(
        anchorX + keyDirection[0] * 70,
        Math.max(keyDirection[1], 0.02) * 70,
        anchorZ + keyDirection[2] * 70,
      );
      sunTarget.position.set(anchorX, 0, anchorZ);
      sun.intensity = daylightStrength + moonStrength;
      sun.castShadow = values.shadowsEnabled && daylight > 0.02;
      sun.shadow.radius = values.sunShadowRadius;
      scratch.copy(MOON_LIGHT).lerp(SUN_NIGHT, daylight * 0.2).lerp(SUN_DAY, daylight).lerp(SUN_GOLDEN, golden * 0.95);
      sun.color.copy(scratch);
    }
    // Golden hour trades fill for key: ambient and hemisphere drop as the
    // sun warms, which is what makes a low sun read as contrast. The flat
    // ambient runs at 0.15 of the slider: the hemisphere and env probe carry
    // the fill instead, so shade varies with surface direction.
    if (ambientRef.current) {
      ambientRef.current.intensity = values.ambientIntensity * 0.15
        * (0.72 + 0.28 * daylight + moonLight * 0.18)
        * (daylight + (1 - daylight) * values.nightSkyBrightness)
        * (1 - golden * 0.35);
      ambientRef.current.color.copy(scratch.copy(AMBIENT_NIGHT).lerp(AMBIENT_DAY, daylight));
    }
    if (hemisphereRef.current) {
      const hemisphere = hemisphereRef.current;
      hemisphere.intensity =
        config.hemisphere.intensity * values.skyFill
        * (0.48 + 0.52 * daylight + moonLight * 0.12)
        * (daylight + (1 - daylight) * values.nightSkyBrightness)
        * (1 - golden * 0.25);
      hemisphere.color.copy(scratch.copy(HEMI_SKY.night).lerp(HEMI_SKY.day, daylight).lerp(HEMI_SKY.golden, golden * 0.6));
      // Ground bounce scales with daylight: only a sunlit lawn throws light up.
      const bounce = 1 + (values.groundBounce - 1) * daylight;
      hemisphere.groundColor
        .copy(scratch.copy(HEMI_GROUND.night).lerp(HEMI_GROUND.day, daylight).lerp(HEMI_GROUND.golden, golden * 0.6))
        .multiplyScalar(bounce);
    }
    if (scene.fog) {
      // Fog takes the sky palette's horizon colour, so dusk haze warms with
      // the sky instead of holding the daytime grey-blue.
      const horizon = environmentPalette(values.timeOfDay, values.dayOfYear, values).horizon;
      scene.fog.color.setRGB(horizon[0], horizon[1], horizon[2]);
      // Fade fog out as the camera climbs, so a zoomed-out overhead reads
      // like a map instead of a haze. Untouched below 45m.
      const camDistance = gameDebug.stats.cameraDistance || 0;
      const fade = Math.min(1, Math.max(0, 1 - (camDistance - 45) / 70));
      scene.fog.density = values.fogDensity * fade;
    }
    // environmentIntensity belongs to SkyEnvironment, which owns the probe.
  });

  return (
    <group>
      <primitive object={sky} />
      <ambientLight ref={ambientRef} color={config.ambient.color} intensity={config.ambient.intensity} />
      <hemisphereLight
        ref={hemisphereRef}
        color={config.hemisphere.skyColor}
        groundColor={config.hemisphere.groundColor}
        intensity={config.hemisphere.intensity}
      />
      <primitive object={sunTarget} />
      <directionalLight
        ref={sunRef}
        color={config.sun.color}
        target={sunTarget}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-camera-left={-runtime.values.outdoorShadowDistance}
        shadow-camera-right={runtime.values.outdoorShadowDistance}
        shadow-camera-top={runtime.values.outdoorShadowDistance}
        shadow-camera-bottom={-runtime.values.outdoorShadowDistance}
        shadow-bias={-0.0001}
        shadow-normalBias={0.012}
      />
    </group>
  );
}

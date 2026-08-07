import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { solarRamps } from '../world/solar.js';
import { gameDebug } from '../debug.js';

// Darwin's outdoor palette: sun and sky ramps keyed off solar altitude.
const SUN_NIGHT = new THREE.Color('#41618f');
const SUN_DAY = new THREE.Color('#ffe6b8');
const SUN_GOLDEN = new THREE.Color('#ff9b4d');
const HEMI_SKY = { night: new THREE.Color('#0b1a33'), day: new THREE.Color('#b9dfef'), golden: new THREE.Color('#9cc4ea') };
const HEMI_GROUND = { night: new THREE.Color('#0a0d12'), day: new THREE.Color('#987d5c'), golden: new THREE.Color('#c2915d') };
const AMBIENT_NIGHT = new THREE.Color('#2a3a5c');
const AMBIENT_DAY = new THREE.Color('#e4e7de');
const scratch = new THREE.Color();

export default function SkyRig({ config, runtime }) {
  const scene = useThree((state) => state.scene);
  const sunRef = useRef();
  const ambientRef = useRef();
  const hemisphereRef = useRef();
  const shadowMapSize = Number(runtime.values.shadowMapSize);

  const sky = useMemo(() => {
    const dome = new Sky();
    dome.scale.setScalar(1000);
    // Darwin's grade: ceiling clamp + blue-selective saturation, or the Sky
    // shader washes to white under ACES no matter how the uniforms are set.
    dome.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        `{
          vec3 graded = min(gl_FragColor.rgb, vec3(0.82, 0.92, 1.0));
          float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
          float blueMask = clamp(graded.b - max(graded.r, graded.g) + 0.25, 0.0, 1.0);
          graded = mix(graded, mix(vec3(luma), graded, 1.45), blueMask * 0.55);
          gl_FragColor.rgb = graded;
        }
        #include <tonemapping_fragment>`,
      );
    };
    return dome;
  }, []);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const fog = new THREE.FogExp2(config.fog?.color ?? '#cdd6e4', runtime.values.fogDensity);
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, config, runtime]);

  // HDRI environment (image-based light) grounds the materials outdoors.
  useEffect(() => {
    let disposed = false;
    let environment = null;
    new RGBELoader().loadAsync('/textures/sky.hdr').then((texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.mapping = THREE.EquirectangularReflectionMapping;
      environment = texture;
      scene.environment = texture;
    });
    return () => {
      disposed = true;
      scene.environment = null;
      environment?.dispose();
    };
  }, [scene]);

  useFrame(() => {
    const values = runtime.values;
    const { direction, daylight, golden } = solarRamps(values.timeOfDay);
    gameDebug.stats.sunDir = direction;

    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = values.skyTurbidity + golden * 0.8;
    uniforms.rayleigh.value = values.skyRayleigh + golden * 0.2;
    uniforms.mieCoefficient.value = values.skyMie + golden * 0.0005;
    uniforms.mieDirectionalG.value = 0.58;
    uniforms.sunPosition.value.set(direction[0], direction[1], direction[2]);

    // Sun and shadow frustum follow the player, snapped to the shadow texel
    // grid so the shadow edges do not crawl as the player walks.
    const player = gameDebug.player.position;
    const sun = sunRef.current;
    if (sun) {
      const texel = Math.max(0.03, 72 / shadowMapSize);
      const anchorX = Math.round(player[0] / texel) * texel;
      const anchorZ = Math.round(player[2] / texel) * texel;
      sun.position.set(anchorX + direction[0] * 70, Math.max(direction[1], 0.02) * 70, anchorZ + direction[2] * 70);
      sunTarget.position.set(anchorX, 0, anchorZ);
      sun.intensity = config.sun.intensity * values.sunIntensity * daylight;
      sun.castShadow = values.shadowsEnabled && daylight > 0.02;
      sun.shadow.radius = values.shadowRadius;
      scratch.copy(SUN_NIGHT).lerp(SUN_DAY, daylight).lerp(SUN_GOLDEN, golden * 0.95);
      sun.color.copy(scratch);
    }
    // Golden hour trades fill for key: ambient and hemisphere drop as the
    // sun warms, which is what makes a low sun read as contrast.
    if (ambientRef.current) {
      ambientRef.current.intensity = values.ambientIntensity * (0.3 + 0.7 * daylight) * (1 - golden * 0.35);
      ambientRef.current.color.copy(scratch.copy(AMBIENT_NIGHT).lerp(AMBIENT_DAY, daylight));
    }
    if (hemisphereRef.current) {
      const hemisphere = hemisphereRef.current;
      hemisphere.intensity = config.hemisphere.intensity * (0.35 + 0.65 * daylight) * (1 - golden * 0.25);
      hemisphere.color.copy(scratch.copy(HEMI_SKY.night).lerp(HEMI_SKY.day, daylight).lerp(HEMI_SKY.golden, golden * 0.6));
      hemisphere.groundColor.copy(
        scratch.copy(HEMI_GROUND.night).lerp(HEMI_GROUND.day, daylight).lerp(HEMI_GROUND.golden, golden * 0.6),
      );
    }
    if (scene.fog) scene.fog.density = values.fogDensity;
    scene.environmentIntensity = values.envIntensity * (0.35 + 0.65 * daylight);
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
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
        shadow-bias={-0.0001}
        shadow-normalBias={0.012}
      />
    </group>
  );
}

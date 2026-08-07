import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import Room from './Room.jsx';
import Furniture from './Furniture.jsx';
import LightingRig from './LightingRig.jsx';
import PlayerRig from './PlayerRig.jsx';
import CameraRig from './CameraRig.jsx';
import ColliderDebug from './ColliderDebug.jsx';
import PlayerAvatar from './PlayerAvatar.jsx';
import SkyRig from './SkyRig.jsx';
import CloudDome from './CloudDome.jsx';
import Terrain from './Terrain.jsx';
import TreeField from './TreeField.jsx';
import WindowField from './WindowField.jsx';
import Pedestrians from './Pedestrians.jsx';
import Water from './Water.jsx';
import Effects from './Effects.jsx';
import { zones } from '../world/zones.js';
import { takeArrival } from '../world/travel.js';
import { terrainHeight } from '../world/terrain.js';
import { deriveRoom, validateBlueprint } from '../world/blueprint.js';
import { damp } from '../movement/mathUtils.js';
import { gameDebug } from '../debug.js';

// Frozen with stable identity: a fresh object here makes R3F re-assert the
// shadow type on every re-render (Darwin's hard-won gotcha).
const SHADOW_CONFIG = Object.freeze({ enabled: true, type: THREE.PCFShadowMap });

const TONE_MAPPINGS = {
  ACESFilmic: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
  Linear: THREE.LinearToneMapping,
};

// Applies live renderer params each frame and wires mouse look to the canvas.
function FrameSettings({ runtime, look, exposureBase }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const setDpr = useThree((state) => state.setDpr);

  useEffect(() => {
    look.attach(gl.domElement);
    return () => look.detach();
  }, [gl, look]);

  useFrame((_, delta) => {
    const values = runtime.values;
    const exposure = exposureBase * values.exposure;
    if (gl.toneMappingExposure !== exposure) gl.toneMappingExposure = exposure;
    if (camera.fov !== values.fov) {
      camera.fov = values.fov;
      camera.updateProjectionMatrix();
    }
    const dpr = Math.min(window.devicePixelRatio, values.pixelRatioCap);
    if (Math.abs(gl.getPixelRatio() - dpr) > 0.01) setDpr(dpr);
    gameDebug.stats.fps = damp(gameDebug.stats.fps, 1 / Math.max(delta, 1e-4), 3.5, delta);
  });
  return null;
}

export default function GameCanvas({ runtime, keyboard, look }) {
  // Rebuild params (zone included) are read once per mount; App remounts this
  // canvas on change.
  const values = runtime.values;
  const zone = zones[values.zone] ?? zones['consulting-office'];
  const { blueprint, lighting } = zone;
  const room = useMemo(() => {
    const errors = validateBlueprint(blueprint);
    if (errors.length > 0) throw new Error(`Blueprint invalid: ${errors.join('; ')}`);
    const derived = deriveRoom(blueprint);
    if (!derived.exterior) return derived;
    // Exterior zones merge authored layout items; props sit on the terrain
    // unless they opt into absolute placement (bridges, walls, backdrop).
    const items = [...derived.furnitureBoxes, ...(zone.extraItems ?? [])];
    return {
      ...derived,
      furnitureBoxes: items.map((item) =>
        item.absoluteY
          ? item
          : {
              ...item,
              position: [
                item.position[0],
                item.position[1] + terrainHeight(item.position[0], item.position[2]),
                item.position[2],
              ],
            },
      ),
    };
  }, [blueprint, zone]);

  // Door travel and pose preservation hand over spawn and facing; the zone
  // select falls back to blueprint defaults.
  const [arrival] = useState(() => takeArrival(values.zone));
  const spawn = arrival?.spawn ?? room.spawn;
  const facing = arrival?.facing ?? blueprint.navigation.defaultFacing;
  const spawnYaw = arrival?.yaw ?? Math.atan2(-facing[0], -(facing.length === 2 ? facing[1] : facing[2]));

  useEffect(() => {
    gameDebug.zoneLabel = blueprint.label;
  }, [blueprint]);

  return (
    <Canvas
      shadows={SHADOW_CONFIG}
      gl={{ antialias: values.antialias, powerPreference: 'high-performance' }}
      camera={{ fov: values.fov, near: 0.1, far: 1500, position: [2, 2.4, 5.5] }}
      onCreated={({ gl }) => {
        gl.toneMapping = TONE_MAPPINGS[values.toneMapping] ?? THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        // Darwin's lesson: PCFSoft silently loses filtering in recent three,
        // and PCF is the only type that honors shadow.radius.
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
    >
      <FrameSettings runtime={runtime} look={look} exposureBase={lighting.exposureBase ?? 1} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          <Room room={room} lighting={lighting} />
          <Furniture items={room.furnitureBoxes} />
          {room.exterior ? (
            <>
              <SkyRig config={lighting} runtime={runtime} />
              <CloudDome config={lighting} runtime={runtime} />
              <Terrain />
              <TreeField items={room.furnitureBoxes.filter((item) => item.kind === 'tree')} />
              <WindowField items={room.furnitureBoxes.filter((item) => item.kind === 'backdrop')} runtime={runtime} />
              {values.zone === 'central-park' && <Pedestrians />}
              {zone.water && <Water runtime={runtime} outline={zone.water.outline} level={zone.water.level} />}
            </>
          ) : (
            <LightingRig room={room} config={lighting} runtime={runtime} />
          )}
          <PlayerRig room={room} runtime={runtime} keyboard={keyboard} look={look} spawn={spawn} spawnYaw={spawnYaw} />
          {values.showAvatarGlb && <PlayerAvatar />}
          <CameraRig room={room} runtime={runtime} look={look} keyboard={keyboard} heightAt={room.exterior ? terrainHeight : null} />
          <ColliderDebug room={room} runtime={runtime} />
        </Physics>
        {values.postEnabled && <Effects runtime={runtime} />}
      </Suspense>
    </Canvas>
  );
}

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import PlayerRig from './PlayerRig.jsx';
import CameraRig from './CameraRig.jsx';
import SkyRig from './SkyRig.jsx';
import SunDisc from './SunDisc.jsx';
import CloudDome from './CloudDome.jsx';
import Terrain from './Terrain.jsx';
import PlayerStateStep from './PlayerStateStep.jsx';
import WorldClockStep from './WorldClockStep.jsx';
import { zones, getZone } from '../world/zones.js';
import { takeArrival } from '../world/travel.js';
import { terrainHeight } from '../world/terrain.js';
import { deriveRoom, validateBlueprint } from '../world/blueprint.js';
import { dressWindows } from '../world/windowDressing.js';
import { damp } from '../movement/mathUtils.js';
import { solarRamps } from '../world/solar.js';
import { gameDebug } from '../debug.js';
import { getInteraction } from '../world/interaction.js';
import { consultationSeatFraming } from '../consultation/seatFraming.js';

const Room = lazy(() => import('./Room.jsx'));
const Furniture = lazy(() => import('./Furniture.jsx'));
const PropModels = lazy(() => import('./PropModels.jsx'));
const PlayerAvatar = lazy(() => import('./PlayerAvatar.jsx'));
const SkyEnvironment = lazy(() => import('./SkyEnvironment.jsx'));
const TreeField = lazy(() => import('./TreeField.jsx'));
const WindowField = lazy(() => import('./WindowField.jsx'));
const Water = lazy(() => import('./Water.jsx'));
const ZoneFeatures = lazy(() => import('./ZoneFeatures.jsx'));
const Effects = lazy(() => import('./Effects.jsx'));
const ColliderDebug = lazy(() => import('./ColliderDebug.jsx'));

// Interior and consultation code does not belong on the park boot path.
const LightingRig = lazy(() => import('./LightingRig.jsx'));
const Curtains = lazy(() => import('./Curtains.jsx'));
const Portiere = lazy(() => import('./Portiere.jsx'));
const OpiumRitual = lazy(() => import('./OpiumRitual.jsx'));
const WindowView = lazy(() => import('./WindowView.jsx'));
const WindowSky = lazy(() => import('./WindowSky.jsx'));
const WindowGlass = lazy(() => import('./WindowGlass.jsx'));
const InteriorEnvironment = lazy(() => import('./InteriorEnvironment.jsx'));
const SootStains = lazy(() => import('./SootStains.jsx'));
const CeilingRose = lazy(() => import('./CeilingRose.jsx'));
const WallArt = lazy(() => import('./WallArt.jsx'));
const InstrumentStage = lazy(() => import('./InstrumentStage.jsx'));
const LightShafts = lazy(() => import('./LightShafts.jsx'));
const ActorLayer = lazy(() => import('./characters/ActorLayer.jsx'));

// Frozen with stable identity: a fresh object here makes R3F re-assert the
// shadow type on every re-render (Darwin's hard-won gotcha).
const SHADOW_CONFIG = Object.freeze({ enabled: true, type: THREE.PCFShadowMap });

const TONE_MAPPINGS = {
  ACESFilmic: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
  Linear: THREE.LinearToneMapping,
};

const PARK_STAGE_LABELS = [
  'core',
  'structure',
  'props',
  'trees',
  'ground-cover',
  'water-and-windows',
  'landmarks',
  'people-and-traffic',
];
const PARK_FINAL_STAGE = PARK_STAGE_LABELS.length - 1;
const PARK_LIFE_FEATURES = new Set([
  'pedestrians',
  'horseless-carriage',
  'pigeon-flock',
  'bees',
  'butterflies',
  'fireflies',
]);

function RenderedStage({ stage, onRendered }) {
  const reported = useRef(false);
  const frameRequest = useRef(null);
  useFrame(() => {
    if (reported.current) return;
    reported.current = true;
    // useFrame runs before the renderer. Report from the following animation
    // callback, after this stage has actually reached the screen.
    frameRequest.current = requestAnimationFrame(() => onRendered(stage));
  });
  useEffect(() => () => {
    if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
  }, []);
  return null;
}

// Start the browser's parallel shader compilation while the previous stage
// remains visible. The group is revealed only after compilation completes.
function CompiledStage({ stage, onRendered, children }) {
  const group = useRef(null);
  const [compiled, setCompiled] = useState(false);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const object = group.current;
    if (!object) return undefined;
    let cancelled = false;
    let compilation;
    try {
      // compileAsync walks visible objects when called. Hide the new group
      // immediately afterwards so ordinary frames keep showing the last stage.
      compilation = gl.compileAsync?.(scene, camera) ?? Promise.resolve();
      object.visible = false;
    } catch (error) {
      compilation = Promise.reject(error);
    }
    const finish = () => {
      if (cancelled) return;
      object.visible = true;
      setCompiled(true);
      invalidate();
    };
    Promise.resolve(compilation).then(finish, finish);
    return () => {
      cancelled = true;
    };
  }, [camera, gl, invalidate, scene]);

  return (
    <group ref={group}>
      {children}
      {compiled && <RenderedStage stage={stage} onRendered={onRendered} />}
    </group>
  );
}

function ParkStage({ active, stage, onRendered, children }) {
  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <CompiledStage stage={stage} onRendered={onRendered}>
        {children}
      </CompiledStage>
    </Suspense>
  );
}

function isGroundCover(item) {
  return item.id?.startsWith('cover-') || item.id?.startsWith('tuft-');
}

// Applies live renderer params each frame and wires mouse look to the canvas.
function FrameSettings({ runtime, look, exposureBase, exterior }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const setDpr = useThree((state) => state.setDpr);
  useEffect(() => {
    look.attach(gl.domElement);
    return () => look.detach();
  }, [gl, look]);

  useFrame((_, delta) => {
    const values = runtime.values;
    // Outdoors the stop follows the sun, so noon and dusk are not graded the
    // same. Interiors are gaslit and keep whatever the zone asked for.
    const { daylight, golden } = exterior
      ? solarRamps(values.timeOfDay, values.dayOfYear)
      : { daylight: 0, golden: 0 };
    const grade = exterior ? 1 + daylight * 0.19 + golden * 0.05 : 1;
    const exposure = exposureBase * values.exposure * grade;
    if (gl.toneMappingExposure !== exposure) gl.toneMappingExposure = exposure;
    // Hero mode owns a speed-responsive FOV, and a framing (instrument or
    // consultation seat) owns its own. Avoid resetting either here only for
    // CameraRig to set it again later in the same frame — with the seat's
    // damped fov that tug-of-war reads as a rapid zoom pulse. A free shot
    // still uses the ordinary tuning value.
    const heroOwnsFov = values.cameraMode === 'hero' && !gameDebug.freeCamera;
    const framingOwnsFov = Boolean(getInteraction().using?.framing || consultationSeatFraming());
    if (!heroOwnsFov && !framingOwnsFov && camera.fov !== values.fov) {
      camera.fov = values.fov;
      camera.updateProjectionMatrix();
    }
    const dpr = Math.min(window.devicePixelRatio, values.pixelRatioCap);
    if (Math.abs(gl.getPixelRatio() - dpr) > 0.01) setDpr(dpr);
    gameDebug.stats.fps = damp(gameDebug.stats.fps, 1 / Math.max(delta, 1e-4), 3.5, delta);
  });
  return null;
}

// The Canvas (and its WebGL context) outlives zone travel: compiled shader
// programs and uploaded GPU resources survive, so revisiting a zone skips
// most of its first-visit cost. Only params that genuinely need a new
// context (antialias mode) remount the Canvas itself; everything
// zone-dependent lives in SceneContents, remounted per rebuild.
export default function GameCanvas({
  runtime,
  worldClock,
  keyboard,
  look,
  actors = [],
  rebuildVersion = 0,
  onReadyForReveal,
}) {
  const values = runtime.values;
  const contextKey = `${values.antialias}-${values.postEnabled}`;
  return (
    <Canvas
      key={contextKey}
      shadows={SHADOW_CONFIG}
      // With post on, the scene renders into the composer's own buffer and the
      // default framebuffer's MSAA is allocated but never resolved; the
      // composer does the antialiasing instead.
      gl={{ antialias: values.antialias && !values.postEnabled, powerPreference: 'high-performance' }}
      camera={{ fov: values.fov, near: 0.1, far: 1500, position: [2, 2.4, 5.5] }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        // Darwin's lesson: PCFSoft silently loses filtering in recent three,
        // and PCF is the only type that honors shadow.radius.
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
    >
      <SceneContents
        key={rebuildVersion}
        runtime={runtime}
        worldClock={worldClock}
        keyboard={keyboard}
        look={look}
        actors={actors}
        onReadyForReveal={onReadyForReveal}
      />
    </Canvas>
  );
}

// Applies rebuild-mode renderer params on each zone mount; the context
// itself persists, so this replaces what onCreated used to do.
function RendererZoneSettings({ runtime }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMapping = TONE_MAPPINGS[runtime.values.toneMapping] ?? THREE.ACESFilmicToneMapping;
  }, [gl, runtime]);
  return null;
}

function SceneContents({ runtime, worldClock, keyboard, look, actors, onReadyForReveal }) {
  // Rebuild params (zone included) are read once per mount; App remounts
  // these contents on change.
  const values = runtime.values;
  const zone = getZone(values.zone, values) ?? zones['consulting-office'];
  const { blueprint, lighting } = zone;
  const room = useMemo(() => {
    const errors = validateBlueprint(blueprint);
    if (errors.length > 0) throw new Error(`Blueprint invalid: ${errors.join('; ')}`);
    const derived = deriveRoom(blueprint);
    // Zone entries may add transitions beyond the blueprint's own (interior
    // entry triggers on the street).
    const transitions = [...derived.transitions, ...(zone.extraTransitions ?? [])];
    if (!derived.exterior) {
      // Interiors take their extra items as authored: floors are flat, so
      // there is no terrain height to add.
      return {
        ...derived,
        transitions,
        furnitureBoxes: [...derived.furnitureBoxes, ...(zone.extraItems ?? [])],
      };
    }
    // Exterior zones merge authored layout items; props sit on the terrain
    // unless they opt into absolute placement (bridges, walls, backdrop).
    const items = [...derived.furnitureBoxes, ...(zone.extraItems ?? [])];
    return {
      ...derived,
      transitions,
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

  // One dressing plan per room, shared by the curtains, the beams and the
  // portal lights so all three agree about which windows are shut.
  const dressing = useMemo(
    () => (zone.interior ? dressWindows(room.windowHoles, zone.interior) : null),
    [zone, room],
  );

  // Door travel and pose preservation hand over spawn and facing; the zone
  // select falls back to blueprint defaults.
  const [arrival] = useState(() => takeArrival(values.zone));
  const spawn = arrival?.spawn ?? room.spawn;
  const facing = arrival?.facing ?? blueprint.navigation.defaultFacing;
  const spawnYaw = arrival?.yaw ?? Math.atan2(-facing[0], -(facing.length === 2 ? facing[1] : facing[2]));

  const parkModelGroups = useMemo(() => {
    const models = room.furnitureBoxes.filter((item) => item.model);
    return {
      structural: models.filter((item) => !isGroundCover(item)),
      cover: models.filter(isGroundCover),
    };
  }, [room]);
  const parkTrees = useMemo(
    () => room.furnitureBoxes.filter((item) => item.kind === 'tree'),
    [room],
  );
  const parkBackdrops = useMemo(
    () => room.furnitureBoxes.filter((item) => item.kind === 'backdrop'),
    [room],
  );
  const staticFeatures = useMemo(
    () => (zone.features ?? []).filter((id) => !PARK_LIFE_FEATURES.has(id)),
    [zone],
  );
  const lifeFeatures = useMemo(
    () => (zone.features ?? []).filter((id) => PARK_LIFE_FEATURES.has(id)),
    [zone],
  );

  const [parkStage, setParkStage] = useState(0);
  const [coreReady, setCoreReady] = useState(false);
  const [avatarReady, setAvatarReady] = useState(() => !values.showAvatarGlb);
  const bootStartedAt = useRef(globalThis.performance?.now?.() ?? Date.now());
  const advanceTimer = useRef(null);
  const revealReported = useRef(false);

  useEffect(() => {
    if (!room.exterior) return undefined;
    bootStartedAt.current = globalThis.performance?.now?.() ?? Date.now();
    gameDebug.stats.boot = {
      zone: blueprint.id,
      stage: 'loading',
      elapsedMs: 0,
      complete: false,
    };
    globalThis.performance?.mark?.('park:boot:start');
    console.info('[park-boot] loading 0ms');
    return () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    };
  }, [blueprint.id, room.exterior]);

  useEffect(() => {
    if (!room.exterior || !coreReady || !avatarReady || revealReported.current) return;
    revealReported.current = true;
    const now = globalThis.performance?.now?.() ?? Date.now();
    const elapsedMs = Math.round(now - bootStartedAt.current);
    globalThis.performance?.mark?.('park:boot:reveal-ready');
    console.info(`[park-boot] reveal-ready ${elapsedMs}ms`);
    onReadyForReveal?.(true);
  }, [avatarReady, coreReady, onReadyForReveal, room.exterior]);

  const onAvatarReady = useCallback(() => setAvatarReady(true), []);

  const onParkStageRendered = useCallback((stage) => {
    if (!room.exterior) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    const elapsedMs = Math.round(now - bootStartedAt.current);
    const label = PARK_STAGE_LABELS[stage] ?? `stage-${stage}`;
    const complete = stage >= PARK_FINAL_STAGE;
    gameDebug.stats.boot = { zone: blueprint.id, stage: label, elapsedMs, complete };
    globalThis.performance?.mark?.(`park:boot:${label}`);
    console.info(`[park-boot] ${label} ${elapsedMs}ms`);
    if (stage === 0) setCoreReady(true);
    if (complete) return;
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    // A short quiet frame between batches makes the progress visible and
    // stops React, model parsing, Rapier, and shader work piling up at once.
    advanceTimer.current = setTimeout(() => {
      setParkStage((current) => (current === stage ? stage + 1 : current));
    }, 120);
  }, [blueprint.id, room.exterior]);

  useEffect(() => {
    gameDebug.zoneLabel = blueprint.label;
    gameDebug.room = room;
  }, [blueprint, room]);

  return (
    <>
      <RendererZoneSettings runtime={runtime} />
      <WorldClockStep clock={worldClock} runtime={runtime} />
      <FrameSettings
        runtime={runtime}
        look={look}
        exposureBase={lighting.exposureBase ?? 1}
        exterior={room.exterior}
      />
      <PlayerStateStep />
      {room.exterior ? (
        <>
          <Suspense fallback={null}>
            <Physics gravity={[0, -9.81, 0]}>
              <ParkStage active stage={0} onRendered={onParkStageRendered}>
              <SkyRig config={lighting} runtime={runtime} />
              <SunDisc runtime={runtime} />
              <CloudDome config={lighting} runtime={runtime} />
              <Terrain />
              <PlayerRig
                room={room}
                runtime={runtime}
                keyboard={keyboard}
                look={look}
                spawn={spawn}
                spawnYaw={spawnYaw}
                forcePlaceholder={values.showAvatarGlb && !avatarReady}
              />
              <CameraRig
                room={room}
                runtime={runtime}
                look={look}
                keyboard={keyboard}
                heightAt={terrainHeight}
              />
              </ParkStage>

              <ParkStage active={parkStage >= 1} stage={1} onRendered={onParkStageRendered}>
                <Room room={room} lighting={lighting} />
                <Furniture items={room.furnitureBoxes} />
                <SkyEnvironment runtime={runtime} />
              </ParkStage>

              <ParkStage active={parkStage >= 2} stage={2} onRendered={onParkStageRendered}>
                <PropModels items={parkModelGroups.structural} />
              </ParkStage>

              <ParkStage active={parkStage >= 3} stage={3} onRendered={onParkStageRendered}>
                <TreeField items={parkTrees} />
              </ParkStage>

              <ParkStage active={parkStage >= 4} stage={4} onRendered={onParkStageRendered}>
                <PropModels items={parkModelGroups.cover} />
              </ParkStage>

              <ParkStage active={parkStage >= 5} stage={5} onRendered={onParkStageRendered}>
                <WindowField items={parkBackdrops} runtime={runtime} />
                {zone.water && (
                  <Water runtime={runtime} outline={zone.water.outline} level={zone.water.level} />
                )}
              </ParkStage>

              <ParkStage active={parkStage >= 6} stage={6} onRendered={onParkStageRendered}>
                <ZoneFeatures
                  zone={zone}
                  runtime={runtime}
                  ids={staticFeatures}
                  suspendTogether
                />
              </ParkStage>

              <ParkStage active={parkStage >= 7} stage={7} onRendered={onParkStageRendered}>
                <ZoneFeatures
                  zone={zone}
                  runtime={runtime}
                  ids={lifeFeatures}
                  suspendTogether
                />
                <ColliderDebug room={room} runtime={runtime} />
              </ParkStage>
            </Physics>
          </Suspense>
          {values.showAvatarGlb && (
            <Suspense fallback={null}>
              <PlayerAvatar runtime={runtime} onReady={onAvatarReady} />
            </Suspense>
          )}
          {values.postEnabled && parkStage >= 6 && (
            <Suspense fallback={null}>
              <Effects runtime={runtime} indoors={false} />
            </Suspense>
          )}
        </>
      ) : (
        <>
          <Suspense fallback={null}>
            <Physics gravity={[0, -9.81, 0]}>
            <Room room={room} lighting={lighting} />
            <Furniture items={room.furnitureBoxes} />
            <PropModels items={room.furnitureBoxes.filter((item) => item.model)} />
            <>
              <LightingRig room={room} config={lighting} runtime={runtime} dressing={dressing} />
              <InteriorEnvironment lighting={lighting} runtime={runtime} />
              <CeilingRose room={room} lighting={lighting} />
              <WallArt items={room.furnitureBoxes} />
              <SootStains room={room} />
              {/* A room placed in the built world sees the real thing; a
                  standalone one gets a procedural sky and skyline. */}
              {!zone.interior?.building && (
                <WindowSky holes={room.windowHoles} room={room} runtime={runtime} />
              )}
              {zone.interior?.building && (
                <WindowView
                  holes={room.windowHoles}
                  building={zone.interior.building}
                  runtime={runtime}
                  anchor={zone.interior.viewAnchor}
                />
              )}
              {/* Glass over the view, curtains over the glass. */}
              <WindowGlass holes={room.windowHoles} runtime={runtime} />
              {dressing && <Curtains holes={room.windowHoles} dressing={dressing} />}
              <Portiere holes={room.openingHoles} />

              <LightShafts room={room} runtime={runtime} dressing={dressing} />
            </>
            <PlayerRig
              room={room}
              runtime={runtime}
              keyboard={keyboard}
              look={look}
              spawn={spawn}
              spawnYaw={spawnYaw}
            />
            {values.showAvatarGlb && <PlayerAvatar runtime={runtime} />}
            <CameraRig room={room} runtime={runtime} look={look} keyboard={keyboard} heightAt={null} />
            <ColliderDebug room={room} runtime={runtime} />
            <InstrumentStage />
            {blueprint.id === 'CONSULTING_OFFICE' && <OpiumRitual />}
            {blueprint.id === 'CONSULTING_OFFICE' && actors.length > 0 && (
              <ActorLayer actors={actors} />
            )}
            </Physics>
          </Suspense>
          {values.postEnabled && (
            <Suspense fallback={null}>
              <Effects runtime={runtime} indoors />
            </Suspense>
          )}
        </>
      )}
    </>
  );
}

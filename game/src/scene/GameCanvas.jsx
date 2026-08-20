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
import MoonDisc from './MoonDisc.jsx';
import StarField from './StarField.jsx';
import CloudDome from './CloudDome.jsx';
import Terrain from './Terrain.jsx';
import PlayerStateStep from './PlayerStateStep.jsx';
import AnnouncementAnchor from './AnnouncementAnchor.jsx';
import NpcInspect from './NpcInspect.jsx';
import PlayerMeterEffects from './PlayerMeterEffects.jsx';
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
import {
  graphicsSettingsForDevice,
  MOBILE_CONTEXT_RECYCLE_DELAY_MS,
  shouldRecycleWebGLContextOnTravel,
  webGLContextKey,
} from './mobileGraphics.js';
import { createAdaptiveDprController } from './adaptiveDpr.js';
import { warmInteriorAssets, warmParkAssets } from './parkPreload.js';

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
const Firebox = lazy(() => import('./Firebox.jsx'));
const InstrumentStage = lazy(() => import('./InstrumentStage.jsx'));
const ExaminePicker = lazy(() => import('./ExaminePicker.jsx'));
const LightShafts = lazy(() => import('./LightShafts.jsx'));
const ActorLayer = lazy(() => import('./characters/ActorLayer.jsx'));
const ShotWoman = lazy(() => import('./ShotWoman.jsx'));

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
// A consulting room is smaller than a park but arrives the same way: shell
// first so the player can see and move, then dressing, then the loose props
// and instruments, then whoever is waiting in it.
const INTERIOR_STAGE_LABELS = ['core', 'dressing', 'props', 'cast'];
const PARK_LIFE_FEATURES = new Set([
  'pedestrians',
  'dandies',
  'street-speaker',
  'park-gardener',
  'hotel-doormen',
  'street-police',
  'posted-npcs',
  'horseless-carriage',
  'horse-drawn-traffic',
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
      // three reads the first argument as the new object to compile and the
      // third as the scene it is joining, so this initializes only this
      // stage's materials against the live lighting. Passing the whole scene
      // as both — which is what omitting the third argument does — made every
      // stage walk everything already compiled.
      //
      // Lights are gathered with traverseVisible, so the group has to still be
      // visible here; materials are not, so hiding it straight afterwards is
      // safe and keeps ordinary frames showing the previous stage.
      compilation = gl.compileAsync?.(object, camera, scene) ?? Promise.resolve();
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

// One batch of a zone's arrival: suspends on its own assets, compiles its own
// shaders, then reports so the next batch can start. Interiors and exteriors
// both use it — a consulting room built in one go froze for as long as a park.
function Stage({ active, stage, onRendered, children }) {
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
function FrameSettings({ runtime, look, exposureBase, exterior, graphicsQuality, pixelRatioCap }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const setDpr = useThree((state) => state.setDpr);
  const adaptiveDpr = useRef(createAdaptiveDprController(
    Math.min(globalThis.devicePixelRatio ?? 1, pixelRatioCap),
  ));
  useEffect(() => {
    look.attach(gl.domElement);
    return () => look.detach();
  }, [gl, look]);

  // three clears info.render at the start of every render() call, and a frame
  // is many of those: the shadow maps, the scene, then one per post pass. Left
  // on, whatever samples it last reads the final full-screen quad — which is
  // why the readout said "1 draws". Take the reset over and do it once a frame
  // so the counters cover the whole frame, shadows and post included.
  useEffect(() => {
    gl.info.autoReset = false;
    return () => { gl.info.autoReset = true; };
  }, [gl]);

  useFrame((_, delta) => {
    // Read before the reset: these are the previous frame's completed totals.
    gameDebug.stats.draws = gl.info.render.calls;
    gameDebug.stats.triangles = gl.info.render.triangles;
    gameDebug.stats.programs = gl.info.programs?.length ?? 0;
    gameDebug.stats.textures = gl.info.memory.textures;
    gameDebug.stats.geometries = gl.info.memory.geometries;
    gl.info.reset();

    const values = runtime.values;
    // Outdoors the stop follows the sun, so noon and dusk are not graded the
    // same. Interiors are gaslit and keep whatever the zone asked for.
    const { daylight, golden, night, astronomicalNight } = exterior
      ? solarRamps(values.timeOfDay, values.dayOfYear)
      : { daylight: 0, golden: 0, night: 0, astronomicalNight: 0 };
    // A modest night-adaptation lift reveals moonlit and city-lit surfaces
    // without making midnight read like day-for-night photography.
    const grade = exterior
      ? 1 + daylight * 0.19 + golden * 0.05 + night * 0.3 + astronomicalNight * 0.1
      : 1;
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
    gameDebug.stats.fps = damp(gameDebug.stats.fps, 1 / Math.max(delta, 1e-4), 3.5, delta);
    const maxDpr = Math.min(globalThis.devicePixelRatio ?? 1, pixelRatioCap);
    if (graphicsQuality === 'auto') {
      adaptiveDpr.current.sample(
        gameDebug.stats.fps,
        delta,
        maxDpr,
        Boolean(gameDebug.stats.boot.complete) && globalThis.document?.visibilityState !== 'hidden',
      );
    } else if (adaptiveDpr.current.dpr !== maxDpr) {
      adaptiveDpr.current.reset(maxDpr);
    }
    const dpr = graphicsQuality === 'auto' ? adaptiveDpr.current.dpr : maxDpr;
    if (Math.abs(gl.getPixelRatio() - dpr) > 0.01) setDpr(dpr);
    gameDebug.stats.pixelRatio = dpr;
    gameDebug.stats.graphicsQuality = graphicsQuality;
  });
  return null;
}

// On desktop the Canvas (and its WebGL context) outlives zone travel: compiled
// shaders and uploaded GPU resources survive, so revisiting a zone skips most
// of its first-visit cost. Memory-constrained touch devices briefly unmount it
// between zones instead; otherwise the park and consulting-room resources can
// coexist long enough for iOS WebKit to terminate the page.
export default function GameCanvas({
  runtime,
  worldClock,
  keyboard,
  look,
  actors = [],
  consultationActive = false,
  shotMode = false,
  rebuildVersion = 0,
  onReadyForReveal,
}) {
  const values = runtime.values;
  const recycleOnTravel = useMemo(shouldRecycleWebGLContextOnTravel, []);
  const graphics = useMemo(
    () => graphicsSettingsForDevice(values, recycleOnTravel),
    [recycleOnTravel, values.antialias, values.graphicsQuality, values.pixelRatioCap, values.postEnabled],
  );
  const [canvasZone, setCanvasZone] = useState(values.zone);
  useEffect(() => {
    if (!recycleOnTravel || canvasZone === values.zone) return undefined;
    const nextZone = values.zone;
    const timer = setTimeout(() => {
      setCanvasZone(nextZone);
    }, MOBILE_CONTEXT_RECYCLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canvasZone, recycleOnTravel, values.zone]);

  // Returning no Canvas starts its teardown immediately. The effect above
  // mounts the destination only after R3F has forced the old context closed.
  if (recycleOnTravel && canvasZone !== values.zone) return null;

  const contextKey = webGLContextKey(values, recycleOnTravel);
  return (
    <Canvas
      key={contextKey}
      shadows={SHADOW_CONFIG}
      dpr={Math.min(globalThis.devicePixelRatio ?? 1, graphics.pixelRatioCap)}
      // With post on, the scene renders into the composer's own buffer and the
      // default framebuffer's MSAA is allocated but never resolved; the
      // composer does the antialiasing instead.
      gl={{ antialias: graphics.antialias && !graphics.postEnabled, powerPreference: 'high-performance' }}
      camera={{ fov: values.fov, near: 0.1, far: 1500, position: [2, 2.4, 5.5] }}
      onCreated={({ gl }) => {
        gameDebug.renderer = gl;
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
        consultationActive={consultationActive}
        shotMode={shotMode}
        graphics={graphics}
        onReadyForReveal={onReadyForReveal}
      />
    </Canvas>
  );
}

// Applies rebuild-mode renderer params on each zone mount; the context usually
// persists on desktop, so this replaces what onCreated used to do there.
function RendererZoneSettings({ runtime }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gameDebug.renderer = gl;
    gl.toneMapping = TONE_MAPPINGS[runtime.values.toneMapping] ?? THREE.ACESFilmicToneMapping;
  }, [gl, runtime]);
  return null;
}

function SceneContents({
  runtime,
  worldClock,
  keyboard,
  look,
  actors,
  consultationActive,
  shotMode,
  graphics,
  onReadyForReveal,
}) {
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

  const [stage, setStage] = useState(0);
  const [coreReady, setCoreReady] = useState(false);
  const [avatarReady, setAvatarReady] = useState(() => !values.showAvatarGlb);
  const bootStartedAt = useRef(globalThis.performance?.now?.() ?? Date.now());
  const advanceTimer = useRef(null);
  const revealReported = useRef(false);
  const stageLabels = room.exterior ? PARK_STAGE_LABELS : INTERIOR_STAGE_LABELS;
  const bootTag = room.exterior ? 'park' : 'room';

  // Downloads for the later stages start as soon as the first one is on
  // screen; the stages themselves still mount one at a time below. Waiting for
  // the first stage keeps 20MB of set dressing off the reveal's critical path
  // on a slow connection.
  useEffect(() => {
    if (!room.exterior || !coreReady) return undefined;
    return warmParkAssets(parkModelGroups);
  }, [coreReady, parkModelGroups, room.exterior]);

  // Once the park's own stages are all mounted, spend the idle pipe on where
  // the day goes next: the interiors and the patient cohort models.
  useEffect(() => {
    if (!room.exterior || stage < PARK_STAGE_LABELS.length - 1) return undefined;
    return warmInteriorAssets();
  }, [room.exterior, stage]);

  // Upload every texture at idle once the stages are in. Left to first sight,
  // each upload lands mid-play as a hitch when the player walks somewhere new.
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    if (stage < stageLabels.length - 1) return undefined;
    const textures = new Set();
    scene.traverse((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value?.isTexture) textures.add(value);
        }
        for (const uniform of Object.values(material.uniforms ?? {})) {
          if (uniform?.value?.isTexture) textures.add(uniform.value);
        }
      }
    });
    const queue = [...textures].filter((texture) => texture.image);
    let cancelled = false;
    const schedule = globalThis.requestIdleCallback ?? ((fn) => setTimeout(() => fn({ timeRemaining: () => 6 }), 50));
    const cancel = globalThis.cancelIdleCallback ?? clearTimeout;
    let handle = null;
    const step = () => {
      // One per callback: a single large upload can eat a whole frame, so
      // batching more into one idle slice would recreate the hitch this
      // warm-up exists to remove.
      if (queue.length > 0) gl.initTexture(queue.pop());
      if (queue.length > 0 && !cancelled) handle = schedule(step);
    };
    handle = schedule(step);
    return () => {
      cancelled = true;
      if (handle !== null) cancel(handle);
    };
  }, [stage, stageLabels.length, gl, scene]);

  useEffect(() => {
    bootStartedAt.current = globalThis.performance?.now?.() ?? Date.now();
    gameDebug.stats.boot = {
      zone: blueprint.id,
      stage: 'loading',
      elapsedMs: 0,
      complete: false,
    };
    globalThis.performance?.mark?.(`${bootTag}:boot:start`);
    console.info(`[${bootTag}-boot] loading 0ms`);
    return () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    };
  }, [blueprint.id, bootTag]);

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

  const onStageRendered = useCallback((rendered) => {
    const now = globalThis.performance?.now?.() ?? Date.now();
    const elapsedMs = Math.round(now - bootStartedAt.current);
    const label = stageLabels[rendered] ?? `stage-${rendered}`;
    const complete = rendered >= stageLabels.length - 1;
    gameDebug.stats.boot = { zone: blueprint.id, stage: label, elapsedMs, complete };
    globalThis.performance?.mark?.(`${bootTag}:boot:${label}`);
    console.info(`[${bootTag}-boot] ${label} ${elapsedMs}ms`);
    if (rendered === 0) setCoreReady(true);
    if (complete) return;
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    // A short quiet frame between batches makes the progress visible and
    // stops React, model parsing, Rapier, and shader work piling up at once.
    advanceTimer.current = setTimeout(() => {
      setStage((current) => (current === rendered ? rendered + 1 : current));
    }, 120);
  }, [blueprint.id, bootTag, stageLabels]);

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
        graphicsQuality={graphics.graphicsQuality}
        pixelRatioCap={graphics.pixelRatioCap}
      />
      <PlayerStateStep />
      <PlayerMeterEffects />
      <AnnouncementAnchor exterior={room.exterior} />
      <NpcInspect />
      {room.exterior ? (
        <>
          <Suspense fallback={null}>
            {/* timeStep="vary": the fixed 1/60 accumulator skips whole steps
                above 60fps, which stalls the kinematic player every other
                frame on 120Hz displays. */}
            <Physics timeStep="vary" gravity={[0, -9.81, 0]}>
              <Stage active stage={0} onRendered={onStageRendered}>
              <SkyRig
                config={lighting}
                runtime={runtime}
                maxShadowMapSize={graphics.maxShadowMapSize}
                maxShadowDistance={graphics.maxOutdoorShadowDistance}
                shadowUpdateInterval={graphics.shadowUpdateInterval}
              />
              {/* In stage 0 so every later stage's shader compile sees
                  scene.environment; compiled without it, each material
                  recompiles at first sight, which hitches mid-walk. */}
              <SkyEnvironment runtime={runtime} />
              <StarField runtime={runtime} />
              <SunDisc runtime={runtime} />
              <MoonDisc runtime={runtime} />
              <CloudDome config={lighting} runtime={runtime} />
              <Terrain />
              <PlayerRig
                room={room}
                runtime={runtime}
                keyboard={keyboard}
                look={look}
                spawn={spawn}
                spawnYaw={spawnYaw}
                water={zone.water}
                motionAffordances={zone.motionAffordances}
                forcePlaceholder={values.showAvatarGlb && !avatarReady}
              />
              {shotMode && <ShotWoman />}
              <CameraRig
                room={room}
                runtime={runtime}
                look={look}
                keyboard={keyboard}
                heightAt={terrainHeight}
              />
              </Stage>

              <Stage active={stage >= 1} stage={1} onRendered={onStageRendered}>
                <Room room={room} lighting={lighting} />
                <Furniture items={room.furnitureBoxes} runtime={runtime} propsReady={stage >= 3} />
              </Stage>

              <Stage active={stage >= 2} stage={2} onRendered={onStageRendered}>
                <PropModels items={parkModelGroups.structural} />
                <ExaminePicker room={room} zone={zone} />
              </Stage>

              <Stage active={stage >= 3} stage={3} onRendered={onStageRendered}>
                <TreeField items={parkTrees} />
              </Stage>

              <Stage active={stage >= 4} stage={4} onRendered={onStageRendered}>
                <PropModels items={parkModelGroups.cover} />
              </Stage>

              <Stage active={stage >= 5} stage={5} onRendered={onStageRendered}>
                <WindowField items={parkBackdrops} runtime={runtime} />
                {zone.water && (
                  <Water
                    runtime={runtime}
                    outline={zone.water.outline}
                    level={zone.water.level}
                    reflectionEnabled={graphics.waterReflectionEnabled}
                    reflectionSize={graphics.waterReflectionSize}
                    reflectionInterval={graphics.waterReflectionInterval}
                  />
                )}
              </Stage>

              <Stage active={stage >= 6} stage={6} onRendered={onStageRendered}>
                <ZoneFeatures
                  zone={zone}
                  runtime={runtime}
                  graphics={graphics}
                  ids={staticFeatures}
                  suspendTogether
                />
              </Stage>

              <Stage active={stage >= 7} stage={7} onRendered={onStageRendered}>
                <ZoneFeatures
                  zone={zone}
                  runtime={runtime}
                  graphics={graphics}
                  ids={lifeFeatures}
                  suspendTogether
                />
                <ColliderDebug room={room} runtime={runtime} />
              </Stage>
            </Physics>
          </Suspense>
          {values.showAvatarGlb && (
            <Suspense fallback={null}>
              <PlayerAvatar runtime={runtime} onReady={onAvatarReady} />
            </Suspense>
          )}
          {graphics.postEnabled && stage >= 6 && (
            <Suspense fallback={null}>
              <Effects runtime={runtime} indoors={false} />
            </Suspense>
          )}
        </>
      ) : (
        <>
          {/* Each stage carries its own boundary; this one is only for
              Physics, which suspends on the Rapier module itself. */}
          <Suspense fallback={null}>
          {/* timeStep="vary" for the same reason as the exterior Physics. */}
          <Physics timeStep="vary" gravity={[0, -9.81, 0]}>
            {/* The shell: walls, floor, gaslight, and a player who can stand
                on it. Everything else arrives on top of a room already up. */}
            <Stage active stage={0} onRendered={onStageRendered}>
              <Room room={room} lighting={lighting} />
              <LightingRig
                room={room}
                config={lighting}
                runtime={runtime}
                dressing={dressing}
                maxShadowMapSize={graphics.maxShadowMapSize}
              />
              <InteriorEnvironment lighting={lighting} runtime={runtime} />
              <PlayerRig
                room={room}
                runtime={runtime}
                keyboard={keyboard}
                look={look}
                spawn={spawn}
                spawnYaw={spawnYaw}
                motionAffordances={zone.motionAffordances}
              />
              <CameraRig room={room} runtime={runtime} look={look} keyboard={keyboard} heightAt={null} />
            </Stage>

            <Stage active={stage >= 1} stage={1} onRendered={onStageRendered}>
              <Furniture items={room.furnitureBoxes} runtime={runtime} propsReady={stage >= 3} />
              <CeilingRose room={room} lighting={lighting} />
              <WallArt items={room.furnitureBoxes} />
              <SootStains room={room} />
              {/* A room placed in the built world sees the real thing; a
                  standalone one gets a procedural sky and skyline. */}
              {!zone.interior?.building && (
                <WindowSky holes={room.openingHoles} room={room} runtime={runtime} />
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
            </Stage>

            <Stage active={stage >= 2} stage={2} onRendered={onStageRendered}>
              <PropModels items={room.furnitureBoxes.filter((item) => item.model)} />
              <Firebox items={room.furnitureBoxes} />
              <InstrumentStage />
              <ExaminePicker room={room} zone={zone} />
              <ZoneFeatures zone={zone} runtime={runtime} graphics={graphics} />
              <ColliderDebug room={room} runtime={runtime} />
              {blueprint.id === 'CONSULTING_OFFICE' && <OpiumRitual />}
            </Stage>

            <Stage active={stage >= 3} stage={3} onRendered={onStageRendered}>
              {blueprint.id === 'CONSULTING_OFFICE'
                && actors.length > 0
                && (!graphics.deferIdleActors || consultationActive) && (
                <ActorLayer actors={actors} />
              )}
            </Stage>

            {/* Outside the stages: a 3.6MB figure, and nothing in the room
                waits on it. */}
            {values.showAvatarGlb && (
              <Suspense fallback={null}>
                <PlayerAvatar runtime={runtime} />
              </Suspense>
            )}
            {shotMode && (
              <Suspense fallback={null}>
                <ShotWoman />
              </Suspense>
            )}
          </Physics>
          </Suspense>
          {graphics.postEnabled && stage >= 2 && (
            <Suspense fallback={null}>
              <Effects runtime={runtime} indoors />
            </Suspense>
          )}
        </>
      )}
    </>
  );
}

import GroundContacts from './GroundContacts.jsx';
import {
  lazy,
  startTransition,
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
import HotelLampLights from './HotelLampLights.jsx';
import SunDisc from './SunDisc.jsx';
import MoonDisc from './MoonDisc.jsx';
import StarField from './StarField.jsx';
import CloudDome from './CloudDome.jsx';
import TreeField, { preloadOpeningTrees } from './TreeField.jsx';
import Terrain, { preloadTerrain } from './Terrain.jsx';
import FurnitureColliders from './FurnitureColliders.jsx';
import ParkShell from './ParkShell.jsx';
import ParkStream from './ParkStream.jsx';
import PostedNpcs, { preloadOpeningPeople } from './PostedNpcs.jsx';
import PlayerStateStep from './PlayerStateStep.jsx';
import AnnouncementAnchor from './AnnouncementAnchor.jsx';
import NpcInspect from './NpcInspect.jsx';
import PlayerMeterEffects from './PlayerMeterEffects.jsx';
import WorldClockStep from './WorldClockStep.jsx';
import { zones, getZone } from '../world/zones.js';
import { takeArrival } from '../world/travel.js';
import { PARK_DISTRICTS, parkDistrictFor, isGroundCover } from '../world/parkDistricts.js';
import { parkStreetChunks } from '../world/parkStreetChunks.js';
import { GAPSTOW } from '../world/gapstow.js';
import { SHELTERS } from '../world/rusticwork.js';
import { SAILOR_BOY_ROUTE } from '../world/sailorBoy.js';
import { terrainHeight } from '../world/terrain.js';
import { deriveRoom, validateBlueprint } from '../world/blueprint.js';
import { dressWindows } from '../world/windowDressing.js';
import { solarRamps } from '../world/solar.js';
import { gameDebug } from '../debug.js';
import { getInteraction } from '../world/interaction.js';
import { consultationSeatFraming } from '../consultation/seatFraming.js';
import {
  graphicsSettingsForDevice,
  MOBILE_CONTEXT_RECYCLE_DELAY_MS,
  MOBILE_TEXTURE_SIZE_CAP,
  shouldRecycleWebGLContextOnTravel,
  webGLContextKey,
} from './mobileGraphics.js';
import { createAdaptiveDprController } from './adaptiveDpr.js';
import { warmPatient } from './parkPreload.js';
import { prepareStage } from './prepareStage.js';
import { createFrameTiming } from './frameTiming.js';

const Pushcarts = lazy(() => import('./Pushcarts.jsx'));
const Room = lazy(() => import('./Room.jsx'));
const Furniture = lazy(() => import('./Furniture.jsx'));
const PropModels = lazy(() => import('./PropModels.jsx'));
const PlayerAvatar = lazy(() => import('./PlayerAvatar.jsx'));
const SkyEnvironment = lazy(() => import('./SkyEnvironment.jsx'));
const StreetBuildings = lazy(() => import('./StreetBuildings.jsx'));
const Landmark = lazy(() => import('./StreetBuildings.jsx').then(module => ({ default: module.Landmark })));
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

// Landmark assets load near their sites. Traffic follows the adjacent
// streets, while pond and menagerie models stay off the opening path.
const PARK_FEATURE_DISTRICT = {
  'schist-outcrops': 'pond', bees: 'pond', butterflies: 'pond', fireflies: 'pond',
};
const INTERIOR_STAGE_LABELS = ['core', 'dressing', 'props', 'cast'];
const OFFICE_STAGE_LABELS = ['core', 'essentials', 'dressing', 'props', 'study', 'study-props', 'cast'];
const OFFICE_ESSENTIALS = new Set(['desk', 'desk-chair', 'patient-chair-e', 'desk-lamp', 'hearth', 'gasolier',
  'sconce-mantel-n', 'sconce-mantel-s']);

const HEAVY_FEATURES = new Set(['pedestrians', 'horse-drawn-traffic', 'horseless-carriage',
  'hotel-doormen', 'street-police', 'street-wear', 'street-dressing',
  'ground-grime', 'pushcarts']);
const STREET_DETAIL_SITES = [{ bounds: [-100, 230, 83, 186] }, { bounds: [96, 230, -85, 83] }];
const STREET_DETAIL = new Set(['ground-grime', 'pushcarts', 'street-wear', 'street-dressing']);

const PARK_FEATURE_SITES = {
  'gapstow-bridge': [[GAPSTOW.x, GAPSTOW.z]],
  'sailor-boy': SAILOR_BOY_ROUTE,
  'rustic-shelters': SHELTERS.map(({ x, z }) => [x, z]),
  'park-gardener': [[32, -48], [62, -8], [-29, 69]],
  'street-speaker': [[-34, 73]],
  'swan-boat': [[0, 59]],
  'pond-ducks': [[5, 44]],
  'dairy-cottage': [[32, -48]],
  arsenal: [[87, -44]],
  menagerie: [[86, -66]],
  carousel: [[6, -54]],
  'sheep-flock': [[-30, -52]],
  'checkers-tables': [[43, -55]],
};
function groupParkItems(items, keyOf) {
  const groups = Object.create(null);
  for (const item of items) (groups[keyOf(item)] ??= []).push(item);
  return groups;
}

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
function CompiledStage({ stage, onRendered, children, streaming }) {
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
    object.userData.preparing = true;
    object.updateWorldMatrix(true, true);
    const compilation = prepareStage(gl, object, camera, scene, () => cancelled, streaming);
    object.visible = false;
    const finish = () => {
      if (cancelled) return;
      delete object.userData.preparing;
      object.visible = true;
      setCompiled(true);
      invalidate();
    };
    Promise.resolve(compilation).then(finish, (error) => {
      console.error('Scene preparation failed', error);
      finish();
    });
    return () => {
      delete object.userData.preparing;
      cancelled = true;
    };
  }, [camera, gl, invalidate, scene, streaming]);

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
function Stage({ active, stage, onRendered, children, streaming = false }) {
  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <CompiledStage stage={stage} onRendered={onRendered} streaming={streaming}>
        {children}
      </CompiledStage>
    </Suspense>
  );
}

// Applies live renderer params each frame and wires mouse look to the canvas.
function FrameSettings({ runtime, look, exposureBase, exterior, graphicsQuality, pixelRatioCap }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const setDpr = useThree((state) => state.setDpr);
  const frameTiming = useRef(createFrameTiming());
  const wasMeasuring = useRef(false);
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
    const measuring = Boolean(gameDebug.stats.boot.playable) && globalThis.document?.visibilityState !== 'hidden';
    if (measuring) {
      if (!wasMeasuring.current) frameTiming.current.reset();
      const timing = frameTiming.current.sample(delta);
      Object.assign(gameDebug.stats, {
        fps: timing.fps, frameP95: timing.p95, frameP99: timing.p99,
        frameWorst: timing.worst, longFrames: timing.longFrames,
      });
    }
    wasMeasuring.current = measuring;
    // Hopper flattens fine detail anyway, so it renders at reduced
    // resolution and costs about what the plain picture does.
    const painted = values.paintStyle !== 'off';
    const fullDpr = Math.min(globalThis.devicePixelRatio ?? 1, pixelRatioCap);
    // Seurat's dots are drawn in the final pass and go soft below one device
    // pixel per CSS pixel, so that style is not scaled under it.
    const floor = painted && values.paintMethod === 'dots' ? Math.min(1, fullDpr) : 0;
    const maxDpr = Math.max(floor, fullDpr * (painted ? values.hopperRenderScale : 1));
    if (graphicsQuality === 'auto') {
      adaptiveDpr.current.sample(
        gameDebug.stats.fps,
        delta,
        maxDpr,
        measuring,
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
  nextPatientRecipe,
  consultationActive = false,
  shotMode = false,
  rebuildVersion = 0,
  onPlayable,
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
        // The shadow map read this limit when the renderer was built, so only
        // image textures are affected. Compressed (KTX2) textures are skipped.
        if (recycleOnTravel) {
          gl.capabilities.maxTextureSize = Math.min(gl.capabilities.maxTextureSize, MOBILE_TEXTURE_SIZE_CAP);
        }
      }}
    >
      <SceneContents
        key={rebuildVersion}
        runtime={runtime}
        worldClock={worldClock}
        keyboard={keyboard}
        look={look}
        actors={actors}
        nextPatientRecipe={nextPatientRecipe}
        consultationActive={consultationActive}
        shotMode={shotMode}
        graphics={graphics}
        onPlayable={onPlayable}
      />
    </Canvas>
  );
}

// Applies rebuild-mode renderer params on each zone mount; the context usually
// persists on desktop, so this replaces what onCreated used to do there.
function RendererZoneSettings({ runtime, postEnabled }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gameDebug.renderer = gl;
    gl.toneMapping = postEnabled ? THREE.NoToneMapping : (TONE_MAPPINGS[runtime.values.toneMapping] ?? THREE.ACESFilmicToneMapping);
  }, [gl, runtime, postEnabled]);
  return null;
}

function SceneContents({
  runtime,
  worldClock,
  keyboard,
  look,
  actors,
  nextPatientRecipe,
  consultationActive,
  shotMode,
  graphics,
  onPlayable,
}) {
  // Rebuild params (zone included) are read once per mount; App remounts
  // these contents on change.
  const values = runtime.values;
  const zoneId = values.zone;
  const zone = getZone(zoneId, values) ?? zones['consulting-office'];
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

  const fullPark = shotMode || new URLSearchParams(location.search).has('fullPark');
  const eagerPark = new URLSearchParams(location.search).has('parkNear');
  const parkDistricts = useMemo(() => {
    if (!room.exterior) return [];
    const groups = new Map(PARK_DISTRICTS.map(district => [district.id, []]));
    for (const item of room.furnitureBoxes) groups.get(parkDistrictFor(item.position).id).push(item);
    return PARK_DISTRICTS.map(district => {
      const items = groups.get(district.id);
      const models = items.filter(item => item.model);
      const trees = items.filter(item => item.kind === 'tree');
      const buildings = items.filter(item => item.kind === 'backdrop');
      // Street buildings are built once at load (StreetBuildings.jsx). The
      // landmarks beside the opening view load with them; the rest follow
      // straight after the reveal, behind a plain stand-in.
      const opening = district.id === 'plaza';
      return { ...district, items, trees,
        street: items.filter(item => item.kind === 'block-infill' || (item.kind === 'backdrop' && !item.landmarkModel)),
        openingLandmarks: opening ? buildings.filter(item => item.landmarkModel) : [],
        landmarks: opening ? [] : buildings.filter(item => item.landmarkModel),
        structure: items.filter(item => item.kind !== 'backdrop' && item.kind !== 'block-infill'),
        propGroups: groupParkItems(models.filter(item => !isGroundCover(item)), item => item.model),
        treeGroups: groupParkItems(trees, item => item.tree.species ?? 'broadleaf'),
        cover: models.filter(isGroundCover) };
    });
  }, [room]);
  const street = useMemo(() => ({
    items: parkDistricts.flatMap(district => district.street),
    groups: parkDistricts.map(district => district.street).filter(group => group.length),
    landmarks: parkDistricts.flatMap(district => district.openingLandmarks),
  }), [parkDistricts]);
  const parkColliders = useMemo(() => room.exterior
    ? [...room.furnitureBoxes, ...room.blockerBoxes, ...room.wallBoxes]
    : [], [room]);
  const [coreReady, setCoreReady] = useState(false);
  const parkJobs = useMemo(() => {
    if (!room.exterior || !coreReady) return [];
    const jobs = [];
    const byId = new Map(parkDistricts.map(district => [district.id, district]));
    for (const district of parkDistricts) {
      const { id, structure, propGroups, trees, treeGroups, cover, landmarks } = district;
      const add = (part, node, range, priority, options = {}) => jobs.push({
        id: id + ':' + part, district, node, range, priority,
        movement: id === 'plaza' ? 7 : 3, ...options,
      });
      if (structure.length) {
        add('structure', <Furniture items={structure} runtime={runtime} fixedColliders={false} />,
          26, id === 'plaza' ? 14 : 20);
      }
      // No range or movement rule: these start at the reveal, nearest first.
      for (const item of landmarks) {
        const [x, , z] = item.position;
        const [width, , depth] = item.size;
        add('landmark:' + item.id, <Landmark item={item} runtime={runtime} />, Infinity, -40, {
          movement: 0, sites: [{ bounds: [x - width / 2, x + width / 2, z - depth / 2, z + depth / 2] }],
        });
      }
      // Rounded trees are drawn by ParkShell and never swapped for leaf models.
      if (runtime.values.treeStyle !== 'detailed') {
        // Nothing to load.
      } else if (id === 'plaza') {
        add('trees', <TreeField items={trees} />, 8, 12, { stationary: true });
      } else {
        for (const [species, grove] of Object.entries(treeGroups)) {
          add('trees:' + species, <TreeField items={grove} />, 30, 7);
        }
      }
      for (const [model, props] of Object.entries(propGroups)) {
        add('props:' + model, <PropModels items={props} />, 26, 10);
      }
      if (cover.length) add('cover', <PropModels items={cover} />, 23, 45);
      if (id !== 'plaza') add('posted', <PostedNpcs runtime={runtime} district={id} />, 30, 12);
    }
    const pond = byId.get('pond');
    if (zone.water) jobs.push({
      id: 'pond:water', district: pond, range: 30, movement: 3, priority: 3,
      node: <Water runtime={runtime} outline={zone.water.outline} level={zone.water.level}
        reflectionEnabled={graphics.waterReflectionEnabled} reflectionSize={graphics.waterReflectionSize}
        reflectionInterval={graphics.waterReflectionInterval} />,
    });
    for (const streetChunk of parkStreetChunks()) {
      const { type, id, apron, rails } = streetChunk;
      if (!zone.features?.includes(type)) continue;
      const pavement = type === 'street-surfaces';
      jobs.push({
        id, sites: [streetChunk], range: pavement ? 17 : 12, movement: 4,
        priority: apron ? 8 : pavement && !rails ? 15 : 32,
        warmKey: type,
        preload: pavement
          ? () => import('./StreetSurfaces.jsx').then(module => module.preloadStreetSurfaces())
          : () => import('./StreetIronwork.jsx').then(module => module.preloadStreetIronwork()),
        node: <ZoneFeatures zone={zone} runtime={runtime} graphics={graphics} ids={[type]} streetChunk={streetChunk} suspendTogether />,
      });
    }
    for (const id of zone.features ?? []) {
      if (id === 'posted-npcs' || id === 'street-surfaces' || id === 'street-ironwork') continue;
      const sites = PARK_FEATURE_SITES[id]?.map(([x, z]) => ({ bounds: [x, x, z, z] }));
      const district = byId.get(PARK_FEATURE_DISTRICT[id]);
      const heavy = HEAVY_FEATURES.has(id);
      const streetDetail = STREET_DETAIL.has(id);
      jobs.push({ id, district, sites: streetDetail ? STREET_DETAIL_SITES : sites,
        range: streetDetail ? 10 : id === 'rustic-shelters' ? 18 : id === 'gapstow-bridge' ? 26 : 23,
        movement: heavy ? 19 : 4, priority: heavy ? 52 : 24, stationary: heavy,
        node: id === 'pushcarts' ? <Pushcarts remaining /> :
          <ZoneFeatures zone={zone} runtime={runtime} graphics={graphics} ids={[id]} suspendTogether /> });
    }
    return jobs;
  }, [coreReady, graphics, parkDistricts, room.exterior, runtime, zone]);

  const consultingOffice = values.zone === 'consulting-office';
  const office = useMemo(() => {
    if (!consultingOffice) return null;
    const study = room.furnitureBoxes.filter(item => item.id.startsWith('study-') || item.id === 'bookcase-study');
    const front = room.furnitureBoxes.filter(item => !study.includes(item));
    const models = front.filter(item => item.model);
    return {
      front, study,
      essentials: models.filter(item => OFFICE_ESSENTIALS.has(item.id)),
      dressing: models.filter(item => !OFFICE_ESSENTIALS.has(item.id)),
      studyModels: study.filter(item => item.model),
    };
  }, [consultingOffice, room]);
  const interiorStageLabels = office ? OFFICE_STAGE_LABELS : INTERIOR_STAGE_LABELS;

  const gl = useThree((state) => state.gl);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!coreReady || !office) return undefined;
    let cancel;
    let left = false;
    import('./PropModels.jsx').then(module => {
      if (!left) cancel = module.warmPropModels([...office.essentials, ...office.dressing, ...office.studyModels], gl);
    }).catch(() => {});
    return () => { left = true; cancel?.(); };
  }, [coreReady, gl, office]);
  const [bootComplete, setBootComplete] = useState(false);
  // A patient model is 6–10 MB. Fetched during boot it competes with the
  // room's own assets, so wait until the room is up.
  useEffect(() => {
    if (room.exterior || !bootComplete || !nextPatientRecipe) return undefined;
    return warmPatient(nextPatientRecipe, gl);
  }, [room.exterior, bootComplete, nextPatientRecipe, gl]);
  // Low-memory phones skip the hidden next patient; it holds a second figure.
  const warmActor = !room.exterior && bootComplete && !graphics.deferIdleActors ? nextPatientRecipe : null;
  const [avatarReady, setAvatarReady] = useState(() => !values.showAvatarGlb);
  const bootStartedAt = useRef(globalThis.performance?.now?.() ?? Date.now());
  const advanceTimer = useRef(null);
  const revealReported = useRef(false);
  const [parkParts, setParkParts] = useState(() => new Set());
  const plazaHotel = street.landmarks.find(item => item.landmarkModel === 'new-netherland-hotel');
  const bootTag = room.exterior ? 'park' : 'room';

  useLayoutEffect(() => {
    if (!room.exterior) return;
    preloadTerrain(fullPark);
    preloadOpeningPeople();
    if (runtime.values.treeStyle === 'detailed') preloadOpeningTrees(gl);
  }, [fullPark, gl, room.exterior, runtime]);

  useLayoutEffect(() => {
    bootStartedAt.current = globalThis.performance?.now?.() ?? Date.now();
    gameDebug.stats.boot = {
      zone: blueprint.id,
      stage: 'loading',
      elapsedMs: 0,
      playable: false,
      complete: false,
    };
    gameDebug.stats.parkStream = room.exterior ? { active: null, ready: [], idle: false } : null;
    globalThis.performance?.mark?.(`${bootTag}:boot:start`);
    console.info(`[${bootTag}-boot] loading 0ms`);
    return () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    };
  }, [blueprint.id, bootTag, room.exterior]);

  useEffect(() => {
    if (!room.exterior || !coreReady || !avatarReady || revealReported.current) return;
    revealReported.current = true;
    const now = globalThis.performance?.now?.() ?? Date.now();
    const elapsedMs = Math.round(now - bootStartedAt.current);
    globalThis.performance?.mark?.('park:boot:reveal-ready');
    console.info(`[park-boot] reveal-ready ${elapsedMs}ms`);
    gameDebug.stats.boot = { zone: blueprint.id, stage: 'playable', elapsedMs, playable: true, complete: !fullPark };
    onPlayable?.(zoneId);
  }, [avatarReady, blueprint.id, coreReady, fullPark, onPlayable, room.exterior, zoneId]);

  const onAvatarReady = useCallback(() => setAvatarReady(true), []);
  const [loadAvatarDetail, setLoadAvatarDetail] = useState(false);
  useEffect(() => {
    if (!coreReady || (room.exterior && !avatarReady)) return undefined;
    const timer = setTimeout(() => setLoadAvatarDetail(true), shotMode ? 0 : 1400);
    return () => clearTimeout(timer);
  }, [avatarReady, coreReady, room.exterior, shotMode]);

  const onStageRendered = useCallback((rendered) => {
    const now = globalThis.performance?.now?.() ?? Date.now();
    const elapsedMs = Math.round(now - bootStartedAt.current);
    const label = room.exterior ? 'core' : interiorStageLabels[rendered];
    const complete = !room.exterior && rendered >= interiorStageLabels.length - 1;
    // The flashback needs its teacher and board, which both arrive in the prop stage.
    const playableStage = zoneId === 'dane-hall' ? 2 : 0;
    gameDebug.stats.boot = { zone: blueprint.id, stage: label, elapsedMs, playable: !room.exterior && rendered >= playableStage, complete };
    globalThis.performance?.mark?.(`${bootTag}:boot:${label}`);
    console.info(`[${bootTag}-boot] ${label} ${elapsedMs}ms`);
    if (rendered === 0) setCoreReady(true);
    if (room.exterior) return;
    if (rendered === playableStage) {
      performance.mark('room:boot:playable');
      onPlayable?.(zoneId);
    }
    if (complete) { setBootComplete(true); return; }
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    // A short quiet frame between batches makes the progress visible and
    // stops React, model parsing, Rapier, and shader work piling up at once.
    advanceTimer.current = setTimeout(() => {
      const advance = () => setStage(current => current === rendered ? rendered + 1 : current);
      if (consultingOffice) startTransition(advance);
      else advance();
    }, 120);
  }, [blueprint.id, bootTag, consultingOffice, interiorStageLabels, onPlayable, room.exterior, zoneId]);

  const onParkJobReady = useCallback(id => {
    if (/:(structure|trees|props|landmark)(:|$)/.test(id)) setParkParts(previous => new Set([...previous, id]));
  }, []);
  const onParkJobUnload = useCallback(id => {
    setParkParts(previous => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  }, []);
  const onParkStreamComplete = useCallback(() => {
    const elapsedMs = Math.round(performance.now() - bootStartedAt.current);
    gameDebug.stats.boot = { zone: blueprint.id, stage: 'park-streamed', elapsedMs, playable: true, complete: true };
    setBootComplete(true);
  }, [blueprint.id]);

  useEffect(() => {
    gameDebug.zoneLabel = blueprint.label;
    gameDebug.room = room;
    gameDebug.loadedZone = values.zone;
    return () => {
      gameDebug.room = null;
      gameDebug.loadedZone = null;
    };
  }, [blueprint, room]);

  return (
    <>
      <RendererZoneSettings runtime={runtime} postEnabled={graphics.postEnabled} />
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
              {plazaHotel && <HotelLampLights hotel={plazaHotel} runtime={runtime} ready />}
              {/* In stage 0 so every later stage's shader compile sees
                  scene.environment; compiled without it, each material
                  recompiles at first sight, which hitches mid-walk. */}
              <SkyEnvironment runtime={runtime} />
              <StarField runtime={runtime} />
              <SunDisc runtime={runtime} />
              <MoonDisc runtime={runtime} />
              <CloudDome config={lighting} runtime={runtime} />
              <Terrain fullDetail={fullPark} />
              <FurnitureColliders items={parkColliders} />
              <ParkShell districts={parkDistricts} ready={parkParts} runtime={runtime} />
              <StreetBuildings items={street.items} groups={street.groups} runtime={runtime}
                simple={values.buildingDetail !== 'full'} />
              {street.landmarks.map(item => <Landmark key={item.id} item={item} runtime={runtime} />)}
              <PostedNpcs runtime={runtime} opening motionReady={parkParts.has('plaza:props:small_park_bench')} />
              <Pushcarts opening />
              <ExaminePicker room={room} zone={zone} />
              <GroundContacts />
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

              <ParkStream jobs={parkJobs} full={fullPark} eager={eagerPark} enabled={coreReady && avatarReady}
                // deferIdleActors is true only on constrained phones.
                unloadMargin={graphics.deferIdleActors ? 25 : null}
                Stage={Stage} onReady={onParkJobReady} onUnload={onParkJobUnload} onComplete={onParkStreamComplete} />
              <Suspense fallback={null}><ColliderDebug room={room} runtime={runtime} /></Suspense>
            </Physics>
          </Suspense>
          {values.showAvatarGlb && (
            <Suspense fallback={null}>
              <PlayerAvatar runtime={runtime} onReady={onAvatarReady} loadDetail={loadAvatarDetail} shotMode={shotMode} />
            </Suspense>
          )}
          {graphics.postEnabled && (
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
              {office && <>
                <FurnitureColliders items={room.furnitureBoxes} />
                <ExaminePicker room={room} zone={zone} />
                <InstrumentStage />
                <Firebox items={room.furnitureBoxes} lightsOnly lit={stage >= 2} />
              </>}
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
                forcePlaceholder={values.showAvatarGlb && !avatarReady}
              />
              <CameraRig room={room} runtime={runtime} look={look} keyboard={keyboard} heightAt={null} />
            </Stage>

            <Stage active={stage >= (office ? 2 : 1)} stage={office ? 2 : 1} onRendered={onStageRendered} streaming={office ? 24 : false}>
              <Furniture items={office?.front ?? room.furnitureBoxes} runtime={runtime}
                fixedColliders={!office} propsReady={stage >= 3} />
              <CeilingRose room={room} lighting={lighting} />
              <WallArt items={office?.front ?? room.furnitureBoxes} />
              <SootStains room={room} />
              {/* A room placed in the built world sees the real thing; a
                  standalone one gets a procedural sky and skyline. */}
              {!zone.interior?.building && zoneId !== 'dane-hall' && (
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
              {zoneId !== 'dane-hall' && <LightShafts room={room} runtime={runtime} dressing={dressing} />}
            </Stage>

            <Stage active={stage >= (office ? 1 : 2)} stage={office ? 1 : 2} onRendered={onStageRendered} streaming={office ? 24 : false}>
              <PropModels items={office?.essentials ?? room.furnitureBoxes.filter((item) => item.model)} />
              <Firebox items={room.furnitureBoxes} visualsOnly={Boolean(office)} />
              {!office && <><InstrumentStage /><ExaminePicker room={room} zone={zone} /></>}
              <ZoneFeatures zone={zone} runtime={runtime} graphics={graphics} suspendTogether={zoneId === 'dane-hall'} />
              <ColliderDebug room={room} runtime={runtime} />
              {office && <OpiumRitual />}
            </Stage>

            {office && <>
              <Stage active={stage >= 3} stage={3} onRendered={onStageRendered} streaming={24}>
                <PropModels items={office.dressing} />
              </Stage>
              <Stage active={stage >= 4} stage={4} onRendered={onStageRendered} streaming={24}>
                <Furniture items={office.study} runtime={runtime} fixedColliders={false} deferBottleDetail />
                <WallArt items={office.study} />
              </Stage>
              <Stage active={stage >= 5} stage={5} onRendered={onStageRendered} streaming={24}>
                <PropModels items={office.studyModels} />
              </Stage>
            </>}
            <Stage active={stage >= interiorStageLabels.length - 1} stage={interiorStageLabels.length - 1} onRendered={onStageRendered} />

            <Suspense fallback={null}>
              {blueprint.id === 'CONSULTING_OFFICE' && (actors.length > 0 || warmActor)
                && (!graphics.deferIdleActors || consultationActive)
                && <ActorLayer actors={actors} warm={warmActor} />}
            </Suspense>

            {/* Outside the stages: a 3.6MB figure, and nothing in the room
                waits on it. */}
            {values.showAvatarGlb && (
              <Suspense fallback={null}>
                <PlayerAvatar runtime={runtime} onReady={onAvatarReady} loadDetail={loadAvatarDetail} shotMode={shotMode} />
              </Suspense>
            )}
            {shotMode && (
              <Suspense fallback={null}>
                <ShotWoman />
              </Suspense>
            )}
          </Physics>
          </Suspense>
          {graphics.postEnabled && (
            <Suspense fallback={null}>
              <Effects runtime={runtime} indoors />
            </Suspense>
          )}
        </>
      )}
    </>
  );
}

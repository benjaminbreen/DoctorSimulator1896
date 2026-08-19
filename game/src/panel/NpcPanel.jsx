import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  CHARACTER_BODY_CUES,
  CHARACTER_EXPRESSIONS,
} from '../../../shared/characters/recipe.js';
import RendererCActor from '../scene/characters/RendererCActor.jsx';
import { getKTX2Loader } from '../scene/ktx2.js';
import { buildPeriodStroller } from '../scene/strollerModel.js';
import { buildWalkingStick, findMixamoBone } from '../scene/walkingStick.js';
import {
  currentPedestrianCast,
  PEDESTRIAN_ARCHETYPES,
} from '../world/pedestrianCatalog.js';
import { figureHeight } from '../world/figureHeights.js';

const MANIFEST_PATH = '/models/characters/renderer-c-cohorts.json';
const GRID_COLUMNS = 4;
const CELL_WIDTH = 2.2;
const CELL_HEIGHT = 2.55;

function titleCase(value) {
  return String(value).replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function patientRows(patients) {
  return patients.map((patient) => ({
    id: `patient-${patient.id}`,
    kind: 'patient',
    label: patient.label,
    role: 'Patient',
    animation: patient.actor.recipe.animation.body,
    expression: patient.actor.recipe.animation.expression,
    location: 'Consulting office',
    patient,
  }));
}

function pedestrianRows() {
  return currentPedestrianCast().map((entry) => ({
    ...entry,
    label: entry.labelOverride ?? PEDESTRIAN_ARCHETYPES[entry.archetype].label,
  }));
}

// The figure models carry KTX2 textures, so the loader needs this panel's
// renderer for transcoder support detection.
function useConfiguredLoader() {
  const gl = useThree((state) => state.gl);
  return useCallback((loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(getKTX2Loader(gl));
  }, [gl]);
}

function clipsCompatibleWith(root, clips) {
  const names = new Set();
  root.traverse((node) => {
    if (node.name) names.add(node.name);
  });
  return clips.map((clip) => {
    const copy = clip.clone();
    copy.tracks = copy.tracks.filter((track) => names.has(track.name.split('.')[0]));
    return copy;
  });
}

function PatientFigure({ entry, body, expression, paused = false }) {
  const source = useLoader(THREE.FileLoader, MANIFEST_PATH);
  const manifest = useMemo(() => JSON.parse(source), [source]);
  const recipe = useMemo(() => ({
    ...entry.patient.actor.recipe,
    animation: {
      ...entry.patient.actor.recipe.animation,
      body,
      expression,
    },
    placement: {
      position: [0, 0, 0],
      // Normalize game-world placement for a review camera on +z.
      rotation: [0, 0, 0],
      scale: 1,
    },
  }), [entry, body, expression]);
  const cohort = manifest.cohorts?.[recipe.cohort];
  return cohort ? (
    <RendererCActor recipe={recipe} manifest={cohort} paused={paused} />
  ) : null;
}

function PedestrianFigure({ entry, animation, paused = false }) {
  const stageRef = useRef();
  const archetype = PEDESTRIAN_ARCHETYPES[entry.archetype];
  const gltfs = useLoader(GLTFLoader, archetype.animationSources, useConfiguredLoader());
  const actor = useMemo(() => {
    const root = cloneSkeleton(gltfs[0].scene);
    root.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material) node.material = node.material.clone();
      if (node.isSkinnedMesh) node.frustumCulled = false;
    });
    const clips = clipsCompatibleWith(root, gltfs.flatMap((gltf) => gltf.animations));
    const walkingStick = archetype.prop === 'walking-stick' ? buildWalkingStick() : null;
    return {
      root,
      clips,
      mixer: new THREE.AnimationMixer(root),
      stroller: entry.strollerVariant ? buildPeriodStroller(entry.strollerVariant) : null,
      walkingStick,
      walkingStickHand: walkingStick ? findMixamoBone(root, 'RightHand') : null,
    };
  }, [archetype.prop, gltfs, entry.strollerVariant]);

  useEffect(() => {
    const clip = actor.clips.find((candidate) => candidate.name === animation) ?? actor.clips[0];
    const action = clip ? actor.mixer.clipAction(clip) : null;
    action?.reset().play();
    if (action) actor.mixer.setTime(clip.duration * 0.18);
    return () => actor.mixer.stopAllAction();
  }, [actor, animation]);

  useFrame((_, delta) => {
    if (!paused) actor.mixer.update(Math.min(delta, 0.1));
    if (actor.walkingStick && stageRef.current) {
      stageRef.current.updateMatrixWorld(true);
      actor.walkingStick.update(actor.walkingStickHand, stageRef.current);
    }
  });

  useEffect(() => () => {
    actor.mixer.stopAllAction();
    actor.stroller?.dispose();
    actor.walkingStick?.dispose();
    actor.root.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }, [actor]);

  return (
    <group ref={stageRef}>
      <group scale={figureHeight(archetype.id)}>
        <primitive object={actor.root} />
      </group>
      {actor.stroller ? <primitive object={actor.stroller.group} /> : null}
      {actor.walkingStick ? <primitive object={actor.walkingStick.group} /> : null}
    </group>
  );
}

function NpcFigure({ entry, body = entry.animation, expression = entry.expression, paused = false }) {
  return entry.kind === 'patient' ? (
    <PatientFigure entry={entry} body={body} expression={expression} paused={paused} />
  ) : (
    <PedestrianFigure entry={entry} animation={body} paused={paused} />
  );
}

function GridCamera({ rows }) {
  const { camera } = useThree();
  useEffect(() => {
    const width = GRID_COLUMNS * CELL_WIDTH;
    const height = rows * CELL_HEIGHT;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.near = 0.1;
    camera.far = 30;
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, rows]);
  return null;
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#d7e2ee', '#332d28', 1.7]} />
      <directionalLight position={[3, 6, 5]} intensity={2.7} />
      <directionalLight position={[-4, 2, 4]} intensity={0.8} />
    </>
  );
}

function GridStage({ entries, animate }) {
  const rows = Math.max(1, Math.ceil(entries.length / GRID_COLUMNS));
  return (
    <>
      <color attach="background" args={['#111315']} />
      <StudioLights />
      <GridCamera rows={rows} />
      {entries.map((entry, index) => {
        const column = index % GRID_COLUMNS;
        const row = Math.floor(index / GRID_COLUMNS);
        const x = (column - (GRID_COLUMNS - 1) / 2) * CELL_WIDTH;
        const cellY = ((rows - 1) / 2 - row) * CELL_HEIGHT;
        return (
          <group key={entry.id}>
            <mesh position={[x, cellY, -0.7]}>
              <planeGeometry args={[CELL_WIDTH - 0.08, CELL_HEIGHT - 0.08]} />
              <meshStandardMaterial color={index % 2 ? '#181b1e' : '#15181a'} roughness={1} />
            </mesh>
            <group position={[x, cellY - 0.91, 0]}>
              <Suspense fallback={null}>
                <NpcFigure entry={entry} paused={!animate} />
              </Suspense>
            </group>
          </group>
        );
      })}
    </>
  );
}

function PreviewCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 1.05, 3.25);
    camera.lookAt(0, 0.82, 0);
  }, [camera]);
  return null;
}

function Turntable({ active, children }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current && active) ref.current.rotation.y += delta * 0.48;
  });
  return <group ref={ref}>{children}</group>;
}

function PreviewStage({ entry, body, expression, animate, turntable }) {
  return (
    <>
      <color attach="background" args={['#171a1d']} />
      <StudioLights />
      <PreviewCamera />
      <mesh position={[0, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.15, 48]} />
        <meshStandardMaterial color="#292d30" roughness={0.96} />
      </mesh>
      <Turntable active={turntable}>
        <Suspense fallback={null}>
          <NpcFigure
            key={`${entry.id}:${body}:${expression}`}
            entry={entry}
            body={body}
            expression={expression}
            paused={!animate}
          />
        </Suspense>
      </Turntable>
    </>
  );
}

function SmallButton({ active = false, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-1 text-[11px] transition ${
        active
          ? 'border-amber-500 bg-amber-500/15 text-amber-200'
          : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

export default function NpcPanel({ patients, onClose }) {
  const allEntries = useMemo(() => [...patientRows(patients), ...pedestrianRows()], [patients]);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(allEntries[0]?.id);
  const [body, setBody] = useState(allEntries[0]?.animation);
  const [expression, setExpression] = useState(allEntries[0]?.expression ?? 'neutral');
  const [animate, setAnimate] = useState(true);
  const [animateGrid, setAnimateGrid] = useState(false);
  const [turntable, setTurntable] = useState(false);

  const entries = useMemo(() => {
    if (filter === 'all') return allEntries;
    return allEntries.filter((entry) => entry.kind === filter);
  }, [allEntries, filter]);
  const selected = allEntries.find((entry) => entry.id === selectedId) ?? entries[0] ?? allEntries[0];
  const patientCount = allEntries.filter((entry) => entry.kind === 'patient').length;
  const pedestrianCount = allEntries.length - patientCount;

  useEffect(() => {
    if (!selected) return;
    setBody(selected.animation);
    setExpression(selected.expression ?? 'neutral');
  }, [selected]);

  useEffect(() => {
    if (entries.some((entry) => entry.id === selectedId)) return;
    setSelectedId(entries[0]?.id);
  }, [entries, selectedId]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const animations = selected?.kind === 'patient'
    ? CHARACTER_BODY_CUES
    : PEDESTRIAN_ARCHETYPES[selected?.archetype]?.animations ?? [];
  const rows = Math.max(1, Math.ceil(entries.length / GRID_COLUMNS));

  if (!selected) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-200">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-800 px-4">
        <div>
          <h2 className="text-sm font-semibold text-amber-300">NPC review</h2>
          <p className="text-[10px] text-neutral-500">
            {patientCount} patients · {pedestrianCount} pedestrians
          </p>
        </div>
        <div className="flex gap-1">
          {[
            ['all', `All ${allEntries.length}`],
            ['patient', `Patients ${patientCount}`],
            ['pedestrian', `Pedestrians ${pedestrianCount}`],
          ].map(([value, label]) => (
            <SmallButton key={value} active={filter === value} onClick={() => setFilter(value)}>
              {label}
            </SmallButton>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SmallButton active={animateGrid} onClick={() => setAnimateGrid((value) => !value)}>
            Animate grid
          </SmallButton>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:text-neutral-100"
          >
            Esc · close
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <Canvas
            orthographic
            frameloop={animateGrid ? 'always' : 'demand'}
            dpr={[0.65, 1]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.outputColorSpace = THREE.SRGBColorSpace;
            }}
          >
            <GridStage entries={entries} animate={animateGrid} />
          </Canvas>
          <div
            className="pointer-events-none absolute inset-0 grid grid-cols-4"
            style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
          >
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-label={`Inspect ${entry.label}`}
                onClick={() => setSelectedId(entry.id)}
                className={`pointer-events-auto flex min-h-0 items-end border p-2 text-left transition ${
                  entry.id === selected.id
                    ? 'border-amber-500 bg-amber-400/5'
                    : 'border-neutral-800/80 hover:border-neutral-600 hover:bg-white/[0.02]'
                }`}
              >
                <span className="block w-full rounded bg-black/70 px-2 py-1 backdrop-blur-sm">
                  <span className="block truncate text-xs text-neutral-100">{entry.label}</span>
                  <span className="block truncate text-[10px] text-neutral-400">
                    {entry.role} · {titleCase(entry.animation)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </main>

        <aside className="flex w-[390px] shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
          <div className="h-[42%] min-h-[280px] border-b border-neutral-800">
            <Canvas
              frameloop={animate || turntable ? 'always' : 'demand'}
              dpr={[0.75, 1.25]}
              shadows
              camera={{ fov: 34, near: 0.01, far: 30 }}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.outputColorSpace = THREE.SRGBColorSpace;
              }}
            >
              <PreviewStage
                entry={selected}
                body={body}
                expression={expression}
                animate={animate}
                turntable={turntable}
              />
            </Canvas>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-amber-500/80">
                  {selected.kind}
                </p>
                <h3 className="mt-1 font-serif text-xl text-neutral-100">{selected.label}</h3>
                <p className="mt-1 text-xs text-neutral-500">{selected.id}</p>
              </div>
              <div className="flex gap-1">
                <SmallButton active={animate} onClick={() => setAnimate((value) => !value)}>
                  Play
                </SmallButton>
                <SmallButton active={turntable} onClick={() => setTurntable((value) => !value)}>
                  Turn
                </SmallButton>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-neutral-500">Role</dt>
              <dd>{selected.role}</dd>
              <dt className="text-neutral-500">Location</dt>
              <dd>{selected.location}</dd>
              <dt className="text-neutral-500">Renderer</dt>
              <dd>{selected.kind === 'patient' ? 'Renderer C' : 'Skinned Mixamo GLB'}</dd>
              {selected.kind === 'patient' ? (
                <>
                  <dt className="text-neutral-500">Cohort</dt>
                  <dd>{titleCase(selected.patient.actor.recipe.cohort)}</dd>
                  <dt className="text-neutral-500">Seed</dt>
                  <dd>{selected.patient.profile.seed}</dd>
                </>
              ) : (
                <>
                  <dt className="text-neutral-500">Model</dt>
                  <dd className="truncate">{PEDESTRIAN_ARCHETYPES[selected.archetype].modelPath}</dd>
                  <dt className="text-neutral-500">Live action</dt>
                  <dd>{selected.animation}</dd>
                </>
              )}
            </dl>

            <section className="mt-5 border-t border-neutral-800 pt-4">
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                Animation
              </p>
              <div className="flex flex-wrap gap-1.5">
                {animations.map((animation) => (
                  <SmallButton key={animation} active={body === animation} onClick={() => setBody(animation)}>
                    {titleCase(animation)}
                  </SmallButton>
                ))}
              </div>
            </section>

            {selected.kind === 'patient' && (
              <section className="mt-4 border-t border-neutral-800 pt-4">
                <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Expression
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CHARACTER_EXPRESSIONS.map((value) => (
                    <SmallButton key={value} active={expression === value} onClick={() => setExpression(value)}>
                      {titleCase(value)}
                    </SmallButton>
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

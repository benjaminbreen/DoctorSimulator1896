import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { propList, builtBounds } from '../world/propCatalog.js';
import PropSheet from './PropSheet.jsx';
import { modelUrl, modelSize, modelCredit } from '../world/modelPacks.js';
import PropShape from '../scene/PropShape.jsx';
import PropMaterial from '../scene/PropMaterial.jsx';
import AssetRecipePanel from './AssetRecipePanel.jsx';
import {
  createAssetRecipe,
  createScatterRecipe,
  generateAssetVariants,
  generateScatterPlacements,
} from '../world/proceduralAssets.js';

const ASSET_STORAGE_KEY = 'ghosts-game.procedural-assets.v1';

function loadEditorState() {
  try {
    return JSON.parse(localStorage.getItem(ASSET_STORAGE_KEY)) ?? { assets: {}, scatters: {} };
  } catch {
    return { assets: {}, scatters: {} };
  }
}

// A workbench for props: one piece at a time on a metre grid, turntable and
// animation on demand. Both sources are here — the pieces built out of boxes
// in code and the converted GLB packs — because the point is to compare them
// at the same scale, which is where a piece that is quietly twice its size
// gives itself away.

function Grid({ span = 4 }) {
  const geometry = useMemo(() => {
    const points = [];
    for (let i = -span; i <= span; i += 1) {
      points.push(i, 0, -span, i, 0, span, -span, 0, i, span, 0, i);
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return buffer;
  }, [span]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#3c4348" />
      </lineSegments>
      {/* The metre nearest the origin, marked so scale is readable at a glance. */}
      <mesh position={[0.5, 0.002, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#55636a" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function Material({ item }) {
  return <PropMaterial item={item} />;
}

// A piece marked `spin` turns; one marked `swing` rocks. Both are read off
// the item, so a builder declares its own motion and the panel just runs it.
function Moving({ item, animate, children }) {
  const ref = useRef();
  useFrame((state, delta) => {
    const node = ref.current;
    if (!node) return;
    if (!animate) {
      node.rotation.set(0, 0, 0);
      return;
    }
    if (item.spin) {
      node.rotation.x += item.spin[0] * delta * 2.4;
      node.rotation.y += item.spin[1] * delta * 2.4;
      node.rotation.z += item.spin[2] * delta * 2.4;
    }
    if (item.swing) {
      const angle = Math.sin(state.clock.elapsedTime * 3.14) * 0.22;
      node.rotation.set(item.swing[0] * angle, item.swing[1] * angle, item.swing[2] * angle);
    }
  });
  return <group ref={ref}>{children}</group>;
}

function BuiltProp({ row, animate, recipe }) {
  const items = useMemo(() => row.build('preview', [0, 0, 0], recipe), [row, recipe]);
  const bounds = useMemo(() => builtBounds(items), [items]);
  // Stand the piece on the grid and centre it on the origin.
  const offset = [
    -(bounds.min[0] + bounds.max[0]) / 2,
    -bounds.min[1],
    -(bounds.min[2] + bounds.max[2]) / 2,
  ];

  const draw = (item, key) => {
    const meshes = item.parts
      ? item.parts.map((part, index) => (
          <mesh
            key={index}
            position={part.position}
            rotation={part.rotation ?? [0, 0, 0]}
            renderOrder={part.renderOrder ?? 0}
            castShadow={part.castShadow ?? true}
            receiveShadow={part.receiveShadow ?? true}
          >
            <PropShape item={part} />
            <Material item={part} />
          </mesh>
        ))
      : [
          <mesh
            key="self"
            rotation={item.rotation ?? [0, 0, 0]}
            renderOrder={item.renderOrder ?? 0}
            castShadow={item.castShadow ?? true}
            receiveShadow={item.receiveShadow ?? true}
          >
            <PropShape item={item} />
            <Material item={item} />
          </mesh>,
        ];
    const body = (
      <group key={key} position={item.position} rotation={[0, item.yaw ?? 0, 0]}>
        {meshes}
      </group>
    );
    // Motion pivots about the item's own origin, which is where a drum turns
    // and a pendulum hangs.
    if (item.spin || item.swing) {
      return (
        <group key={key} position={item.position} rotation={[0, item.yaw ?? 0, 0]}>
          <Moving item={item} animate={animate}>
            {meshes}
          </Moving>
        </group>
      );
    }
    return body;
  };

  return <group position={offset}>{items.map((item, index) => draw(item, item.id ?? index))}</group>;
}

function ScatterPreview({ row, recipe, scatterRecipe, animate }) {
  const placements = useMemo(
    () => generateScatterPlacements(recipe, scatterRecipe),
    [recipe, scatterRecipe],
  );
  const { width, depth } = scatterRecipe.values;
  return (
    <group>
      <mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#25282b" roughness={1} />
      </mesh>
      {placements.map((placement) => (
        <group
          key={placement.id}
          position={placement.position}
          rotation={[0, placement.yaw, 0]}
          scale={placement.scale}
        >
          <BuiltProp
            row={row}
            animate={animate}
            recipe={createAssetRecipe(row, { ...recipe, seed: placement.assetSeed })}
          />
        </group>
      ))}
    </group>
  );
}

function ModelProp({ row, animate }) {
  const gltf = useLoader(GLTFLoader, modelUrl(row.name));
  const object = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.material = node.material.clone();
      // Same repair the game does: a pack material at zero opacity is a fault
      // in the source, and would show here as nothing at all.
      if (node.material.opacity === 0 && !node.material.alphaMap) {
        node.material.transparent = false;
        node.material.opacity = 1;
      }
    });
    return clone;
  }, [gltf]);

  const mixer = useMemo(() => {
    if (!gltf.animations?.length) return null;
    const next = new THREE.AnimationMixer(object);
    for (const clip of gltf.animations) next.clipAction(clip).play();
    return next;
  }, [gltf, object]);

  useFrame((_, delta) => {
    if (mixer && animate) mixer.update(delta);
  });
  useEffect(() => () => mixer?.stopAllAction(), [mixer]);

  const size = modelSize(row.name);
  return (
    <group position={[0, 0, 0]}>
      <primitive object={object} />
      {/* The converter stands every piece on y=0 centred on its footprint,
          so nothing needs re-seating here. */}
      <group visible={false} scale={size} />
    </group>
  );
}

// `?prop=&yaw=&pitch=` drive the workbench from the address bar, so a change
// to a builder can be looked at by reloading one URL rather than by clicking
// through the list every time.
function query(name, fallback) {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

// Drag to orbit, wheel to zoom. Written out rather than pulled in: it is
// twenty lines and the panel needs nothing else from a controls library.
function Orbit({ radius, target }) {
  const { camera, gl } = useThree();
  const state = useRef({
    yaw: query('yaw', 0.7),
    pitch: query('pitch', 0.42),
    radius,
    dragging: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    state.current.radius = radius;
  }, [radius]);

  useEffect(() => {
    const element = gl.domElement;
    const down = (event) => {
      state.current.dragging = true;
      state.current.x = event.clientX;
      state.current.y = event.clientY;
    };
    const move = (event) => {
      if (!state.current.dragging) return;
      state.current.yaw -= (event.clientX - state.current.x) * 0.008;
      state.current.pitch = Math.max(
        -0.2,
        Math.min(1.4, state.current.pitch + (event.clientY - state.current.y) * 0.006),
      );
      state.current.x = event.clientX;
      state.current.y = event.clientY;
    };
    const up = () => {
      state.current.dragging = false;
    };
    const wheel = (event) => {
      event.preventDefault();
      state.current.radius = Math.max(0.25, Math.min(14, state.current.radius * (1 + event.deltaY * 0.001)));
    };
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      element.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  useFrame(() => {
    const { yaw, pitch, radius: r } = state.current;
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * r,
      target + Math.sin(pitch) * r,
      Math.cos(yaw) * Math.cos(pitch) * r,
    );
    camera.lookAt(0, target, 0);
  });
  return null;
}

function Turntable({ on, children }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current && on) ref.current.rotation.y += delta * 0.5;
  });
  return <group ref={ref}>{children}</group>;
}

// Brass is only brass because of what it reflects. Without an environment a
// metal renders black however it is lit, which is what made the whole
// apparatus read as a silhouette.
function StudioEnvironment() {
  const { scene, gl } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = environment.texture;
    return () => {
      scene.environment = null;
      environment.texture.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);
  return null;
}

function ToolButton({ active = false, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-1 text-xs ${
        active ? 'border-amber-500 bg-amber-500/10 text-amber-200' : 'border-neutral-700 text-neutral-400'
      }`}
    >
      {children}
    </button>
  );
}

export default function PropsPanel({ onClose }) {
  const rows = useMemo(() => propList(), []);
  const [editorState, setEditorState] = useState(loadEditorState);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => {
    const want = new URLSearchParams(window.location.search).get('prop')?.toLowerCase();
    if (!want) return rows[0]?.key ?? null;
    const hit = rows.find(
      (entry) => entry.key.toLowerCase() === want || entry.name.toLowerCase() === want,
    ) ?? rows.find((entry) => entry.label.toLowerCase().includes(want));
    return hit?.key ?? rows[0]?.key ?? null;
  });
  const [animate, setAnimate] = useState(true);
  const [turntable, setTurntable] = useState(false);
  const [mode, setMode] = useState('inspect');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) => row.label.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  const row = rows.find((entry) => entry.key === selected) ?? filtered[0] ?? null;
  const editable = Boolean(row?.family && row?.schema);
  const recipe = useMemo(
    () => editable ? createAssetRecipe(row, editorState.assets?.[row.key]) : null,
    [editable, row, editorState.assets],
  );
  const scatterRecipe = useMemo(
    () => editable ? createScatterRecipe(editorState.scatters?.[row.key] ?? { seed: 1896 }) : null,
    [editable, row, editorState.scatters],
  );
  // The sheet shows what the search narrowed to, or failing that the group
  // the selected piece belongs to — never all 170 at once, which would be a
  // wall of thumbnails nobody can read.
  const sheetRows = useMemo(() => {
    if (query.trim()) return filtered.slice(0, 30);
    return rows.filter((entry) => entry.group === row?.group).slice(0, 30);
  }, [rows, filtered, query, row]);
  const variantRows = useMemo(() => {
    if (!editable) return [];
    return generateAssetVariants(row, recipe).map((variant, index) => ({
        ...row,
        key: `${row.key}/variant-${index}`,
        label: `Seed ${variant.seed}`,
        recipe: variant,
      }));
  }, [editable, row, recipe]);

  // Frame the piece from its own size: a dynamometer and a bookcase should
  // both arrive filling the view.
  const measured = useMemo(() => {
    if (!row) return { size: [1, 1, 1] };
    if (row.kind === 'model') return { size: row.size ?? modelSize(row.name) };
    return builtBounds(row.build('measure', [0, 0, 0], recipe));
  }, [row, recipe]);
  const builtItems = useMemo(
    () => editable ? row.build('editor-stats', [0, 0, 0], recipe) : [],
    [editable, row, recipe],
  );
  const scatterActive = mode === 'scatter' && editable;
  const extent = Math.max(0.2, ...measured.size);
  const credit = row?.kind === 'model' ? modelCredit(row.name) : null;

  useEffect(() => {
    try {
      localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(editorState));
    } catch {
      // The editor remains usable when storage is disabled or full.
    }
  }, [editorState]);

  useEffect(() => {
    if (!editable && ['edit', 'variants', 'scatter'].includes(mode)) setMode('inspect');
  }, [editable, mode]);

  function setRecipe(next) {
    setEditorState((state) => ({
      ...state,
      assets: { ...(state.assets ?? {}), [row.key]: next },
    }));
  }

  function setScatterRecipe(next) {
    setEditorState((state) => ({
      ...state,
      scatters: { ...(state.scatters ?? {}), [row.key]: next },
    }));
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex bg-neutral-950 text-neutral-200">
      <aside className="flex w-72 shrink-0 flex-col border-r border-neutral-800">
        <div className="border-b border-neutral-800 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-amber-300">Props</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:text-neutral-100"
            >
              Esc
            </button>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search props…"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs outline-none focus:border-amber-500"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {Object.entries(
            filtered.reduce((groups, entry) => {
              (groups[entry.group] ??= []).push(entry);
              return groups;
            }, {}),
          ).map(([group, entries]) => (
            <div key={group}>
              <p className="sticky top-0 bg-neutral-950/95 px-3 py-1 text-[10px] uppercase tracking-wide text-neutral-500">
                {group}
              </p>
              {entries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setSelected(entry.key)}
                  className={`block w-full truncate px-3 py-1 text-left text-xs ${
                    entry.key === row?.key
                      ? 'bg-amber-500/15 text-amber-200'
                      : 'text-neutral-300 hover:bg-neutral-900'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className="border-t border-neutral-800 p-2 text-[10px] text-neutral-500">
          {rows.length} pieces · drag to orbit · wheel to zoom
        </p>
      </aside>

      <main className="relative min-w-0 flex-1">
        {mode === 'sheet' && (
          <PropSheet rows={sheetRows} columns={sheetRows.length > 12 ? 5 : 4} turntable={turntable} />
        )}
        {mode === 'variants' && (
          <PropSheet rows={variantRows} columns={4} turntable={turntable} />
        )}
        {['inspect', 'edit', 'scatter'].includes(mode) && row && (
          <Canvas
            key={`${row.key}:${mode}`}
            shadows
            camera={{ fov: 40, near: 0.01, far: 100, position: [1, 1, 1] }}
            gl={{ antialias: true }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.outputColorSpace = THREE.SRGBColorSpace;
            }}
          >
            <color attach="background" args={['#14171a']} />
            <StudioEnvironment />
            <hemisphereLight args={['#c8d4e4', '#3a3630', 1.1]} />
            <directionalLight position={[2.4, 4, 2.2]} intensity={2.2} castShadow />
            <directionalLight position={[-3, 2, -2]} intensity={0.5} />
            <Grid span={scatterActive ? Math.max(3, Math.ceil(Math.max(scatterRecipe.values.width, scatterRecipe.values.depth) / 2)) : Math.max(2, Math.ceil(extent))} />
            <Suspense fallback={null}>
              {scatterActive ? (
                <ScatterPreview row={row} recipe={recipe} scatterRecipe={scatterRecipe} animate={animate} />
              ) : (
                <Turntable on={turntable}>
                  {row.kind === 'built' ? (
                    <BuiltProp row={row} animate={animate} recipe={recipe} />
                  ) : (
                    <ModelProp row={row} animate={animate} />
                  )}
                </Turntable>
              )}
            </Suspense>
            <Orbit
              radius={scatterActive
                ? Math.max(scatterRecipe.values.width, scatterRecipe.values.depth) * 1.15
                : extent * 2.4}
              target={scatterActive ? Math.min(extent * 0.35, 0.8) : extent * 0.42}
            />
          </Canvas>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <div className="rounded bg-black/60 px-3 py-2">
            <p className="text-sm text-amber-200">{row?.label}</p>
            <p className="text-[11px] text-neutral-400">
              {measured.size.map((value) => value.toFixed(3)).join(' × ')} m
            </p>
            {row?.note && <p className="mt-1 max-w-md text-[11px] text-neutral-400">{row.note}</p>}
            {credit && (
              <p className="mt-1 text-[10px] text-neutral-500">
                {credit.author} · {credit.license}
              </p>
            )}
          </div>
          <div className="pointer-events-auto flex max-w-[70%] flex-wrap justify-end gap-2">
            <ToolButton active={mode === 'inspect'} onClick={() => setMode('inspect')}>Inspect</ToolButton>
            <ToolButton active={mode === 'sheet'} onClick={() => setMode('sheet')}>Group sheet</ToolButton>
            {editable && <ToolButton active={mode === 'edit'} onClick={() => setMode('edit')}>Edit</ToolButton>}
            {editable && <ToolButton active={mode === 'variants'} onClick={() => setMode('variants')}>Variants</ToolButton>}
            {editable && <ToolButton active={mode === 'scatter'} onClick={() => setMode('scatter')}>Scatter</ToolButton>}
            <ToolButton active={animate} onClick={() => setAnimate((value) => !value)}>Animation</ToolButton>
            <ToolButton active={turntable} onClick={() => setTurntable((value) => !value)}>Turntable</ToolButton>
          </div>
        </div>
      </main>
      {editable && ['edit', 'variants', 'scatter'].includes(mode) && (
        <AssetRecipePanel
          row={row}
          recipe={recipe}
          scatterRecipe={scatterRecipe}
          items={builtItems}
          showScatter={mode === 'scatter'}
          onRecipeChange={setRecipe}
          onScatterChange={setScatterRecipe}
        />
      )}
    </div>
  );
}

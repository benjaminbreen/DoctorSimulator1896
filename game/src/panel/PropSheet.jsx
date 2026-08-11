import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { builtBounds } from '../world/propCatalog.js';
import { modelUrl, modelSize } from '../world/modelPacks.js';
import PropShape from '../scene/PropShape.jsx';
import PropMaterial from '../scene/PropMaterial.jsx';

// A contact sheet: every prop in the chosen group at once, each in its own
// cell, each scaled to fill it. One screenshot then shows the whole set, and
// the piece that is wrong is obvious beside the ones that are right — which
// is the only way to judge a set of props without looking at them one at a
// time and forgetting the last.
//
// The camera looks straight down the grid and each piece is tilted toward it
// instead. Tilting the camera was the obvious way round and it is wrong: a
// tilted orthographic view compresses the rows unevenly, so the labels stop
// lining up with their cells. Rotating the pieces keeps the mapping from
// world cell to screen cell exact, and still shows each one in three-quarter.
//
// Scaling every piece to fill its cell is deliberate: the sheet is for
// judging modelling, and true scale is what the single-prop grid is for. The
// label carries the real size so nothing is hidden.

const CELL = 1;
const FILL = 0.74;
// How far each piece leans toward the camera. Enough to read the top of a
// bench without losing the front of a chronoscope.
const LEAN = -0.95;

function Material({ item }) {
  return <PropMaterial item={item} />;
}

function BuiltCell({ row }) {
  const { items, offset, scale } = useMemo(() => {
    const built = row.build(`sheet-${row.name}`, [0, 0, 0], row.recipe);
    const bounds = builtBounds(built);
    const extent = Math.max(0.02, ...bounds.size);
    return {
      items: built,
      scale: (CELL * FILL) / extent,
      offset: [
        -(bounds.min[0] + bounds.max[0]) / 2,
        -bounds.min[1],
        -(bounds.min[2] + bounds.max[2]) / 2,
      ],
    };
  }, [row]);

  return (
    <group scale={scale}>
      <group position={offset}>
        {items.map((item, index) => (
          <group key={item.id ?? index} position={item.position} rotation={[0, item.yaw ?? 0, 0]}>
            {item.parts ? (
              item.parts.map((part, partIndex) => (
                <mesh
                  key={partIndex}
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
            ) : (
              <mesh
                rotation={item.rotation ?? [0, 0, 0]}
                renderOrder={item.renderOrder ?? 0}
                castShadow={item.castShadow ?? true}
                receiveShadow={item.receiveShadow ?? true}
              >
                <PropShape item={item} />
                <Material item={item} />
              </mesh>
            )}
          </group>
        ))}
      </group>
    </group>
  );
}

function ModelCell({ row }) {
  const gltf = useLoader(GLTFLoader, modelUrl(row.name));
  const object = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.material = node.material.clone();
      if (node.material.opacity === 0 && !node.material.alphaMap) {
        node.material.transparent = false;
        node.material.opacity = 1;
      }
    });
    return clone;
  }, [gltf]);
  const size = modelSize(row.name);
  const scale = (CELL * FILL) / Math.max(0.02, ...size);
  return (
    <group scale={scale}>
      <primitive object={object} />
    </group>
  );
}

function Turn({ on, children }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current && on) ref.current.rotation.y += delta * 0.4;
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

export default function PropSheet({ rows, columns = 5, turntable = false }) {
  const grid = useMemo(() => {
    const cols = Math.max(1, columns);
    const laid = rows.map((row, index) => ({
      row,
      col: index % cols,
      line: Math.floor(index / cols),
    }));
    const lines = Math.max(1, Math.ceil(rows.length / cols));
    return { laid, cols, lines };
  }, [rows, columns]);

  const width = grid.cols * CELL;
  const depth = grid.lines * CELL;
  // One orthographic camera over the whole grid, tilted enough to read a
  // piece in three-quarter without losing the row alignment.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // What fraction of the canvas the world grid actually covers. The frustum
  // is fitted to whichever axis is tighter, so the grid rarely fills the
  // frame — and the label overlay has to match it exactly or every caption
  // sits on the wrong cell.
  const [frame, setFrame] = useState({ width: '100%', height: '100%' });

  return (
    <div className="relative h-full w-full">
      <Canvas
        orthographic
        shadows
        camera={{ zoom: 1, position: [0, 0, 10], near: -50, far: 50 }}
        gl={{ antialias: true }}
        onCreated={({ gl, camera, size }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          // Frame the grid exactly, so a cell's screen box is its world box.
          // Fit by whichever axis is tighter, then let the other overflow the
          // frame rather than shrinking the cells.
          const aspect = size.width / size.height;
          const halfHeight = Math.max(depth / 2, width / 2 / aspect);
          camera.left = -halfHeight * aspect;
          camera.right = halfHeight * aspect;
          camera.top = halfHeight;
          camera.bottom = -halfHeight;
          camera.position.set(0, 10, 0);
          camera.up.set(0, 0, -1);
          camera.lookAt(0, 0, 0);
          camera.updateProjectionMatrix();
          setFrame({
            width: `${(width / (halfHeight * 2 * aspect)) * 100}%`,
            height: `${(depth / (halfHeight * 2)) * 100}%`,
          });
        }}
      >
        <color attach="background" args={['#15181b']} />
        <StudioEnvironment />
        <hemisphereLight args={['#ccd8e8', '#3a3630', 1.0]} />
        <directionalLight position={[2, 8, -4]} intensity={2.4} />
        <directionalLight position={[-4, 4, 5]} intensity={0.6} />
        <Suspense fallback={null}>
          {ready &&
            grid.laid.map(({ row, col, line }) => (
              <group
                key={row.key}
                position={[
                  (col - (grid.cols - 1) / 2) * CELL,
                  0,
                  (line - (grid.lines - 1) / 2) * CELL,
                ]}
              >
                {/* Lean the piece toward the camera, and stand it on its own
                    tile so a flat prop still reads against the ground. */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
                  <planeGeometry args={[CELL * 0.96, CELL * 0.96]} />
                  <meshStandardMaterial color="#20242a" roughness={1} />
                </mesh>
                <group rotation={[LEAN, 0, 0]}>
                  <Turn on={turntable}>
                    {row.kind === 'built' ? <BuiltCell row={row} /> : <ModelCell row={row} />}
                  </Turn>
                </group>
              </group>
            ))}
        </Suspense>
      </Canvas>

      {/* Labels on a CSS grid of the same shape as the world grid. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2"
        style={{
          width: frame.width,
          height: frame.height,
          gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
          gridTemplateRows: `repeat(${grid.lines}, 1fr)`,
        }}
      >
        {grid.laid.map(({ row }) => (
          <div key={row.key} className="flex items-end justify-center p-1">
            <span className="rounded bg-black/55 px-1.5 py-0.5 text-center text-[10px] leading-tight text-neutral-300">
              {row.label}
              <br />
              <span className="text-neutral-500">
                {(row.kind === 'model'
                  ? row.size ?? modelSize(row.name)
                  : builtBounds(row.build('m', [0, 0, 0], row.recipe)).size
                )
                  .map((value) => value.toFixed(2))
                  .join('×')}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

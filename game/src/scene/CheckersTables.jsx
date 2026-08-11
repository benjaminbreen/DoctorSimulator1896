import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { newGame, legalMoves, applyMove, bestMove } from '../world/checkers.js';
import StaticColliders from './lib/StaticColliders.jsx';
import { getInteraction, useInstrument, stopUsing } from '../world/interaction.js';
import { terrainHeight } from '../world/terrain.js';
import { gameDebug } from '../debug.js';
import { recover } from '../world/player.js';

// Two checkers tables under the Kinderberg. E at a table seats you over the
// board (the interaction store freezes and hides the body, same as the
// carousel ride); clicks pick a piece and place it; the opponent answers
// from world/checkers.js after a thinking pause. The chess-and-checkers
// tradition on this site is documented from the early 1900s — whether
// tables stood here in 1896 is Ben's to verify.

const KINDERBERG = { x: 44, z: -56 };
const TABLES = [
  { id: 'checkers-table-a', x: 41.48, z: -58.57 },
  { id: 'checkers-table-b', x: 46.54, z: -53.45 },
].map((table) => {
  const ox = table.x - KINDERBERG.x;
  const oz = table.z - KINDERBERG.z;
  const length = Math.hypot(ox, oz);
  // Item yaw convention: local +x maps to (cos yaw, -sin yaw). The +x stool
  // faces the shelter's outside; the player always sits there.
  return {
    ...table,
    outward: [ox / length, oz / length],
    yaw: Math.atan2(-oz / length, ox / length),
    ground: terrainHeight(table.x, table.z),
  };
});

const SQUARE = 0.08;
const BOARD_Y = 0.795;
const scratch = new THREE.Object3D();
const scratchColor = new THREE.Color();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const worldPoint = new THREE.Vector3();

const RED = [0.56, 0.18, 0.12];
const BLACK = [0.15, 0.13, 0.11];

function boardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5a4028';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#c9a24b';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 468, 468);
  const cell = 468 / 8;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      ctx.fillStyle = (r + c) % 2 === 1 ? '#3d5a44' : '#e6d3a3';
      ctx.fillRect(22 + c * cell + 1, 22 + r * cell + 1, cell - 2, cell - 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export default function CheckersTables() {
  const { camera, gl } = useThree();
  const piecesRef = useRef(null);
  const highlightsRef = useRef(null);
  const boardMeshesRef = useRef([]);
  const tableGroupsRef = useRef([]);

  // Per-table game state lives outside React: the meshes are refreshed
  // imperatively after every move.
  const stateRef = useRef({
    games: TABLES.map(() => newGame()),
    selected: null,
    playing: null,
    framing: null,
    since: 0,
    aiDueAt: 0,
    resetAt: 0,
    rewarded: TABLES.map(() => false),
  });

  const materials = useMemo(
    () => ({
      walnut: new THREE.MeshStandardMaterial({ color: '#6b4e33', roughness: 0.8 }),
      board: new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.55 }),
      piece: new THREE.MeshStandardMaterial({ roughness: 0.4 }),
      highlight: new THREE.MeshBasicMaterial({ color: '#f0c53f', transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    }),
    [],
  );

  function refreshPieces() {
    const pieces = piecesRef.current;
    const highlights = highlightsRef.current;
    if (!pieces || !highlights) return;
    const state = stateRef.current;
    let cursor = 0;
    TABLES.forEach((table, tableIndex) => {
      const cos = Math.cos(table.yaw);
      const sin = Math.sin(table.yaw);
      const { board } = state.games[tableIndex];
      for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
          const piece = board[r][c];
          if (piece === 0) continue;
          const lx = (r - 3.5) * SQUARE;
          const lz = (c - 3.5) * SQUARE;
          scratch.position.set(
            table.x + lx * cos + lz * sin,
            table.ground + BOARD_Y + 0.012,
            table.z - lx * sin + lz * cos,
          );
          scratch.rotation.set(0, 0, 0);
          scratch.scale.set(1, Math.abs(piece) === 2 ? 2.3 : 1, 1);
          scratch.updateMatrix();
          pieces.setMatrixAt(cursor, scratch.matrix);
          pieces.setColorAt(cursor, scratchColor.setRGB(...(piece > 0 ? RED : BLACK)));
          cursor += 1;
        }
      }
    });
    for (let i = cursor; i < pieces.count; i += 1) {
      scratch.position.set(0, -50, 0);
      scratch.scale.set(0.001, 0.001, 0.001);
      scratch.updateMatrix();
      pieces.setMatrixAt(i, scratch.matrix);
    }
    pieces.instanceMatrix.needsUpdate = true;
    if (pieces.instanceColor) pieces.instanceColor.needsUpdate = true;

    // Selection and legal-target markers on the active board.
    let marks = [];
    if (state.playing !== null && state.selected) {
      const game = state.games[state.playing];
      marks = [
        state.selected,
        ...legalMoves(game)
          .filter((move) => move.path[0][0] === state.selected[0] && move.path[0][1] === state.selected[1])
          .map((move) => move.path[move.path.length - 1]),
      ];
    }
    marks.forEach(([r, c], index) => {
      const table = TABLES[state.playing];
      const cos = Math.cos(table.yaw);
      const sin = Math.sin(table.yaw);
      const lx = (r - 3.5) * SQUARE;
      const lz = (c - 3.5) * SQUARE;
      scratch.position.set(
        table.x + lx * cos + lz * sin,
        table.ground + BOARD_Y + 0.004,
        table.z - lx * sin + lz * cos,
      );
      scratch.rotation.set(-Math.PI / 2, 0, 0);
      scratch.scale.set(1, 1, 1);
      scratch.updateMatrix();
      highlights.setMatrixAt(index, scratch.matrix);
    });
    for (let i = marks.length; i < highlights.count; i += 1) {
      scratch.position.set(0, -50, 0);
      scratch.scale.set(0.001, 0.001, 0.001);
      scratch.updateMatrix();
      highlights.setMatrixAt(i, scratch.matrix);
    }
    highlights.instanceMatrix.needsUpdate = true;
    scratch.rotation.set(0, 0, 0);
    scratch.scale.set(1, 1, 1);
  }

  // E to sit down at a reachable table, E again to stand up.
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'KeyE') return;
      const state = stateRef.current;
      const now = performance.now();
      if (state.playing !== null) {
        if (now - state.since > 350) {
          state.playing = null;
          state.selected = null;
          stopUsing();
          refreshPieces();
        }
        return;
      }
      const reach = getInteraction().reach;
      const tableIndex = TABLES.findIndex((table) => table.id === reach?.id);
      if (tableIndex < 0) return;
      const table = TABLES[tableIndex];
      state.playing = tableIndex;
      state.selected = null;
      state.since = now;
      const eye = [
        table.x + table.outward[0] * 0.78,
        table.ground + 1.42,
        table.z + table.outward[1] * 0.78,
      ];
      state.framing = {
        position: eye,
        target: [table.x - table.outward[0] * 0.12, table.ground + 0.72, table.z - table.outward[1] * 0.12],
        fov: 48,
      };
      useInstrument({ id: table.id, framing: state.framing });
      refreshPieces();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Clicks pick up and put down pieces. A click is a pointer pair that
  // barely moved, so camera drags stay camera drags.
  useEffect(() => {
    const element = gl.domElement;
    let downAt = null;
    const onDown = (event) => {
      downAt = [event.clientX, event.clientY];
    };
    const onUp = (event) => {
      if (!downAt) return;
      const moved = Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]);
      downAt = null;
      if (moved > 6) return;
      const state = stateRef.current;
      if (state.playing === null) return;
      const game = state.games[state.playing];
      if (game.winner !== null || game.turn !== 1) return;
      const bounds = element.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const board = boardMeshesRef.current[state.playing];
      const hit = board ? raycaster.intersectObject(board, false)[0] : null;
      if (!hit) return;
      const group = tableGroupsRef.current[state.playing];
      worldPoint.copy(hit.point);
      group.worldToLocal(worldPoint);
      const r = Math.round(worldPoint.x / SQUARE + 3.5);
      const c = Math.round(worldPoint.z / SQUARE + 3.5);
      if (r < 0 || r > 7 || c < 0 || c > 7) return;
      if (game.board[r][c] > 0) {
        state.selected = [r, c];
      } else if (state.selected) {
        const move = legalMoves(game).find(
          (candidate) =>
            candidate.path[0][0] === state.selected[0] &&
            candidate.path[0][1] === state.selected[1] &&
            candidate.path[candidate.path.length - 1][0] === r &&
            candidate.path[candidate.path.length - 1][1] === c,
        );
        if (move) {
          state.games[state.playing] = applyMove(game, move);
          state.selected = null;
          const next = state.games[state.playing];
          if (next.winner === null) state.aiDueAt = performance.now() + 750;
          else state.resetAt = performance.now() + 2500;
        } else {
          state.selected = null;
        }
      }
      refreshPieces();
    };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointerup', onUp);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl]);

  useFrame(() => {
    const state = stateRef.current;
    if (state.playing === null) return;
    if (getInteraction().using?.id !== TABLES[state.playing].id) {
      // Ended from outside; stand up quietly.
      state.playing = null;
      state.selected = null;
      refreshPieces();
      return;
    }
    gameDebug.prompt = null;
    const now = performance.now();
    const tableIndex = state.playing;
    const game = state.games[tableIndex];
    if (game.winner === null && game.turn === -1 && now >= state.aiDueAt) {
      const move = bestMove(game);
      state.games[tableIndex] = move ? applyMove(game, move) : game;
      if (state.games[tableIndex].winner !== null) state.resetAt = now + 2500;
      refreshPieces();
    }
    const latest = state.games[tableIndex];
    if (latest.winner !== null && !state.rewarded[tableIndex]) {
      state.rewarded[tableIndex] = true;
      recover({
        neurasthenia: 8,
        source: 'checkers',
        label: 'Played a game of checkers',
      });
    }
    if (latest.winner !== null && now >= state.resetAt) {
      state.games[tableIndex] = newGame();
      state.rewarded[tableIndex] = false;
      state.selected = null;
      refreshPieces();
    }
  });

  useEffect(() => {
    refreshPieces();
  });

  return (
    <>
      {TABLES.map((table, index) => (
        <group
          key={table.id}
          position={[table.x, table.ground, table.z]}
          rotation={[0, table.yaw, 0]}
          ref={(node) => {
            tableGroupsRef.current[index] = node;
          }}
        >
          <mesh position={[0, 0.76, 0]} material={materials.walnut} castShadow receiveShadow>
            <boxGeometry args={[0.92, 0.06, 0.92]} />
          </mesh>
          <mesh
            position={[0, BOARD_Y, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={materials.board}
            ref={(node) => {
              boardMeshesRef.current[index] = node;
            }}
          >
            <planeGeometry args={[0.76, 0.76]} />
          </mesh>
          <mesh position={[0, 0.38, 0]} material={materials.walnut} castShadow>
            <cylinderGeometry args={[0.09, 0.12, 0.74, 10]} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.75, 0.225, 0]} material={materials.walnut} castShadow>
              <cylinderGeometry args={[0.17, 0.19, 0.45, 12]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* frustumCulled off: instance matrices sit far from the mesh origin,
          and the culler only looks at the tiny base geometry's sphere. */}
      <instancedMesh ref={piecesRef} args={[undefined, materials.piece, 48]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.036, 0.036, 0.018, 16]} />
      </instancedMesh>
      <instancedMesh ref={highlightsRef} args={[undefined, materials.highlight, 16]} frustumCulled={false}>
        <planeGeometry args={[0.074, 0.074]} />
      </instancedMesh>
      <StaticColliders
        entries={TABLES.map((table) => ({ type: 'cylinder', p: [table.x, table.ground + 0.4, table.z], radius: 0.34, height: 0.8 }))}
      />
    </>
  );
}

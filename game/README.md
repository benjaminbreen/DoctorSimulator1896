# Game

The playable game app. Three zones — consulting office, waiting room, and
the southeast corner of Central Park (The Pond, Gapstow, the Drive, the
Green, Fifth Avenue backdrop; authored in `src/world/centralPark.js` from
the 1890s maps). Placeholder player with over-the-shoulder camera, jumping,
sculpted terrain, shader sky/clouds, bloom, and a tuning panel. Walk to a
door and press E to travel, use the panel's zone select, or
`__game.set('zone', 'central-park')`. M cycles the camera: over-the-shoulder,
first person, overhead, hero (follows the player's facing). Defaults are
Ben's tuned preset; Reset returns to it.

Separate npm package from character-lab (own node_modules, own three version).

## Run

```bash
npm --prefix game install
npm run game        # from repo root, serves http://127.0.0.1:5175
npm run game:test   # unit tests (node --test, no build needed)
```

## Structure

- `src/world/` — one blueprint JSON + one lighting JSON per zone, indexed by
  `zones.js`. `blueprint.js` derives wall boxes around openings; meshes,
  physics colliders, and camera occlusion all consume the same derived
  boxes. `kind: "exterior"` skips walls/ceiling and adds boundary colliders.
- `src/movement/`, `src/camera/` — framework-free math, unit-tested.
  Defaults seeded from Darwin-Game v1's tuned constants.
- `src/scene/` — R3F components. PlayerRig drives a Rapier kinematic
  character controller (walk, run, jump with coyote time and buffering);
  CameraRig does damped follow with asymmetric occlusion and a ground
  clamp. Interiors use LightingRig (window portals, gaslight fixtures);
  exteriors use SkyRig (graded sky dome, sun by solar altitude, tinted
  cloud sprites, fog). The sky recipe follows Darwin: LOW turbidity
  (~0.35) and rayleigh ~3, or ACES washes the dome white. Each zone's
  lighting config sets `exposureBase`; the exposure slider multiplies it.
- `src/tuning/` — settings schema (groups → parameters, `live` vs `rebuild`
  mode) and the mutable runtime the panel writes and useFrame reads. No React
  state in the hot path. Rebuild params remount the canvas.
- `src/panel/` — schema-driven sidebar: search, export/import/reset.

## Debug handle

`window.__game` exposes `tuning`, `set(id, value)`, `player` (position,
grounded, yaw), `setLook(yaw, pitch)`, `teleport(x, y, z)`, and `stats`.
Screenshots plus this handle are the headless verification path.

## Traps

- Rapier handle liveness: always check `world.getRigidBody/getCollider`
  before use in useFrame (see `physics/useCharacterController.js`). A call on
  a dropped handle poisons the wasm world silently.
- The frame delta is clamped to 1/30 before movement; without it, a
  backgrounded tab teleports the player through walls on refocus.
- Rapier wasm init can stall while the tab is hidden; the scene boots when
  the tab becomes visible.

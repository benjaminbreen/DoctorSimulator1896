# Engine architecture

Rules for separating reusable engine systems from project-specific content.

## The test for every module

*Would this file move to another historical game unchanged?*

- Yes → it is engine. It must not import period content.
- No → it is content. It should be data and configs, thin over engine
  vocabulary.
- "It would move if I deleted half of it" → split it.

## Current structure

- **world/ vs scene/**: framework-free simulation and layout stay separate from
  R3F rendering. The simulation decides; the renderer draws. Gameplay rules
  should be pure modules with tests.
- **Registry pattern**: zones, model packs, interior generation, and now
  zone features are data entries resolved by small registries, not
  hardcoded mounts.
- **Determinism**: builders are seeded, tests assert `deepEqual` on double
  builds. LLM-facing systems sit on this ground truth.
- **Shared item data**: colliders, prompts, camera occlusion, and rendering read
  the same item lists.

## Shared modules

- **scene/lib/** contains shared rendering mechanics. `instances.js` is the
  common InstancedMesh path, and `StaticColliders.jsx` renders collider lists
  from world builders.
- **scene/ZoneFeatures.jsx** — set dressing resolved from the zone's
  `features` list. GameCanvas mounts `<ZoneFeatures>` once and does not name
  individual landmarks.
- **Interaction store** (world/interaction.js) — reach, prompts, and the
  `using` framing shared by instruments and other stations.

## Interaction and instrument contract

Furniture and apparatus use one optional `affordance` field:

| Value | Result |
|---|---|
| absent | No prompt |
| `{ verb, kind: 'act' }` | Perform an action in place |
| `{ verb, kind: 'instrument' }` | Enter instrument mode |

The interaction system owns reach and prompts. Content supplies the payload.

Instrument views show the state of a simulation, not a scripted result. Each
instrument exposes `{ framing, state, step(dt, input) }`; deterministic code
updates its state, and the 3D view renders that state. Instrument rules must be
unit tested without the renderer.

## Broader content split

Revisit this move when the broader content structure needs it:

```
src/
  world/            engine systems only: terrain field machinery, blueprint,
                    zones registry, travel, interaction, solar, scatter,
                    minigames (checkers), station framing helpers
  content/park1896/ centralPark, streetGrid, gapstow, dairy, carousel,
                    parkRocks configs, parkCatalog, blueprints + lighting
  scene/            renderers; scene/lib/ for shared mechanics
```

The rule for the split: **vocabulary is engine, instances are content.**
`rusticwork.js`'s shelter builder is engine; its `SHELTERS` array is 1896
content. Apply the same rule to masonry, terrain, and scatter modules.

Two conventions to carry over explicitly:
- **Scale**: geographic compression and structure scale are explicit constants,
  never values hidden in vertex math.
- **History flags**: every content module states what is documented and
  what is conjecture, and research.md is a draft until Ben verifies.

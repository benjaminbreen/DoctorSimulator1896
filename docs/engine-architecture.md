# Engine architecture

How the codebase stays reusable as a base for other historical educational
LLM-augmented games (Shakespeare's London is the standing example), and what
keeps it from decaying the way Young Darwin's did. Written 2026-08-10 after
the first full content pass on the park.

## The test for every module

*Would this file move to Shakespeare's London unchanged?*

- Yes → it is engine. It must not import period content.
- No → it is content. It should be data and configs, thin over engine
  vocabulary.
- "It would move if I deleted half of it" → split it.

## What already works (keep doing this)

- **world/ vs scene/**: framework-free simulation and layout on one side,
  R3F rendering on the other. The sim decides, the renderer draws. Every
  gameplay rule (checkers, travel, interaction reach) is a pure module with
  tests. This is the single biggest improvement over Darwin, where store.js
  and ThreeHUD.jsx owned everything and could not be tested or reused.
- **Registry pattern**: zones, model packs, interior generation, and now
  zone features are data entries resolved by small registries, not
  hardcoded mounts.
- **Determinism**: builders are seeded, tests assert `deepEqual` on double
  builds. LLM-facing systems sit on this ground truth.
- **Items as the lingua franca**: colliders, prompts (affordances), camera
  occlusion, and rendering all read the same item lists. New gameplay
  hooks (the carousel ride, checkers seats) attach by adding items, not by
  editing PlayerRig.

## The seams (added 2026-08-10)

- **scene/lib/** — shared rendering mechanics. `instances.js` is the one
  way to fill an InstancedMesh (it bakes in the instance-aware bounding
  sphere; five hand-rolled copies of it each had to be patched for the
  same culling bug the day this file was created). `StaticColliders.jsx`
  renders a world-builder's collider list. Geometry helpers with checked
  winding belong here next — the roof/gable/cone builders currently live
  in three components.
- **scene/ZoneFeatures.jsx** — set dressing resolved from the zone's
  `features` list. GameCanvas mounts `<ZoneFeatures>` once and never
  learns another landmark's name. Before this, GameCanvas was growing a
  `zone === 'central-park' && <X/>` line per landmark — exactly how
  ThreeDarwinGame.jsx started.
- **Interaction store** (world/interaction.js) — reach, prompts, and the
  `using` framing are a bus both the instrument system and the free-form
  stations (carousel ride, checkers) share without knowing each other.

## Broader content split (deferred until after M1)

This is not Phase 2 of the M1 plan. Moving the existing park files does not
reduce the risk of the consultation loop, and the current worktree contains
active instrument and environment changes. Revisit the move after M1:

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
`rusticwork.js`'s shelter builder is engine (Shakespeare's London wants
arbors too); its `SHELTERS` array is 1896 content. Same for the stone
courses in `gapstow.js` (a vocabulary for any masonry arch), the terrain
operators (knolls, pads, path grading, water carve — the Thames is the
Pond with a different outline), and the rock/pebble scatter. Where a file
holds both today, the split happens at move time.

Two conventions to carry over explicitly:
- **Scale**: the world is 0.4 of real geography, people are full size, and
  hero structures split the difference (`BRIDGE_SCALE` 1.45). A new game
  picks its own compression, but it is one constant per structure, never
  baked into vertex math.
- **History flags**: every content module states what is documented and
  what is conjecture, and research.md is a draft until Ben verifies.

## Optimization backlog

Perf (screenshots run 24–31 fps; profile before believing any of this,
ideally by porting Darwin's perf-lab harness — see engine-reuse.md):

1. **Terrain collider**: the 280×230 trimesh (~129k tris) should be a
   rapier heightfield — `sampleHeights()` in terrain.js already produces
   the grid. Caution: rapier heightfields are column-major and the scale
   vector is easy to get mirrored; do it with the app bootable and walk
   the pond rim to verify, since a wrong stride reads as terrain offset by
   half a map. Likely the single biggest physics win.
2. **Draw calls**: Furniture renders every non-instanced item as its own
   mesh; the street grid and window field are the suspects worth counting
   first (`renderer.info.render.calls` in the debug HUD would settle it).
3. **Shadows**: one sun with a big PCF map re-renders every caster every
   frame. Options: smaller map indoors, update-on-move-only outdoors.
4. **AO**: N8AO at full resolution with strength 2.2–2.6 is expensive on
   a big exterior; a half-resolution setting for the park would go
   unnoticed.
5. **Textures**: shingle set is 2.7 MB of JPG for a background material;
   1K webp would halve the whole texture payload.

Graphics polish, cheap and content-free:
- Water: shore-distance fade (pondDepth is already available per vertex)
  so the rim reads as shallows instead of a hard polygon edge.
- Wind: foliageWind's bus could drive the carousel pennant and future
  flags/awnings so everything blows the same way.

Gameplay seams ready when wanted:
- The ride/seat pattern (freeze + framing + steer) is two hand-rolled
  copies now; a third use should extract a `station` helper into
  world/interaction.js or a sibling.
- Checkers has no outcome text; that belongs to the UI pass with the rest
  of the HUD.

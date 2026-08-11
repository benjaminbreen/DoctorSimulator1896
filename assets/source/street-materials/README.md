# Generated street materials

These four source swatches were generated with the built-in OpenAI ImageGen
tool on August 11, 2026. They are flat, orthographic source images rather than
finished game maps. `scripts/materials/build_street_pbr.py` repairs the tile
edges and derives the albedo, normal, roughness, and height maps served by the
game.

The prompts requested:

- dark nineteenth-century granite Belgian-block carriageway setts;
- a more worn, wheel-polished intersection variant;
- large gray bluestone and granite sidewalk flags;
- narrow longitudinal granite gutter stones.

Every prompt required a square, top-down, edge-to-edge, seamless diffuse
material with flat overcast lighting, no perspective, no objects, no plants,
no street markings, and no watermark.

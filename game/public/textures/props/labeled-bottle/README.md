# Labeled bottle surfaces

The cork and blank paper albedo sources were authored with OpenAI ImageGen on
2026-08-10 for this non-commercial project. They contain no historical claims.

Runtime files:

- `cork-albedo.webp`, `cork-roughness.webp`, `cork-normal.webp`
- `paper-albedo.webp`, `paper-roughness.webp`, `paper-normal.webp`

The PNG files retain the project-bound ImageGen outputs. The WebP albedo,
roughness, and normal maps are produced by
`scripts/materials/build_surface_pbr.py`. Roughness and normal are independent
derived data maps and remain in linear colour space at runtime.

The exact prompts and modelling limitations are recorded in
`artifacts/img2threejs/labeled-bottle-v2/imagegen-prompts.md`.

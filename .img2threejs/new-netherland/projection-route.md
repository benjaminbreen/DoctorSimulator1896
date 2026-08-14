# Projection route

Reference projection is not appropriate for this real-time architectural landmark.

- The mockup is one perspective view and cannot provide wraparound facade pixels.
- The playable camera sees multiple street approaches, including the curved corner where a single-view projection would shear and expose missing coverage.
- Repeated brick, rusticated stone, slate, glass, and trim are better represented with repeatable authored materials and geometry-driven UVs.
- Phase 1 uses restrained existing real-time textures and independent material scalars. Later material work may generate de-lit, seamless albedo/normal/roughness sets.

Decision: `procedural/authored material`, no reference projection.

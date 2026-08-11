# Renderer C ageing correction evidence

Reference: `codex-clipboard-30c843fc-83a3-4858-8ad6-9d5c87a1d012.png`

- Identification: an existing real-time Renderer C humanoid, viewed from the front-left at close range. This is a correction to an existing character system, not a new reconstruction.
- Overall form: the head, body, hair, brows, clothing, rig, and camera framing already exist and are outside this correction.
- Relevant parts: the scalp-hair material, eyebrow material, and procedural forehead-wrinkle mask.
- Relationships: the eyebrow meshes sit on the face and must inherit the same greying amount and target grey as the visible scalp hair. Forehead wrinkle masks are evaluated in normalized face coordinates.
- Materials: hair is opaque and matte, with a medium-grey albedo at the shown setting. Brows remain nearly black. Skin uses a procedural relief and colour shader.
- Visible defects: brow value does not follow the grey hair; forehead creases read as horizontal bands instead of paired arcs meeting near the midline.
- Limits: the screenshot shows one face anchor and one three-quarter view. The correction must therefore be checked on the shared Renderer C runtime and at more than one angle or anchor.


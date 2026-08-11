# Current bottle analysis

The supplied image is a screenshot of the existing procedural editor, not a
historical object reference. It is useful as a defect baseline only. The asset
therefore remains `draft — reference required`.

Observed implementation failures:

- Three capped radial primitives create false horizontal discs at the body,
  shoulder, and neck joints.
- The glass uses alpha blending, so it reads as grey plastic without a wall,
  lip, base thickness, refraction, or a coherent inner cavity.
- The liquid is an opaque cylinder. Its upper surface is flat and it cannot
  follow the shoulder when the fill is raised.
- The paper label is a flat box in front of the body rather than a sheet that
  follows the bottle radius.
- The cork is an untextured cylinder and sits above rather than partly inside
  the mouth.

Reconstruction target:

- One closed lathed glass profile with outer wall, rim, inner wall, and base.
- A liquid profile derived from the same inner radius function, with a concave
  meniscus and contact ring.
- A cylinder-sector label centred on the viewing front and offset 0.35 mm from
  the glass.
- A tapered, partly inserted cork with authored albedo and independent PBR data
  maps.

Confidence is high for these rendering corrections and low for any claim about
period bottle proportions, glass colour, contents, label wording, or paper.

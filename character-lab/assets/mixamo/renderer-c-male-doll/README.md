# Renderer C male Mixamo doll

`renderer-c-male-mixamo-doll.fbx` is the canonical neutral male body for
Renderer C animation acquisition. It uses the same MPFB native Mixamo skeleton
and body proportions as the live male master.

The doll deliberately has no eyes, teeth, hair, clothing, helper geometry or
facial morphs. Those parts remain on the production character and should never
be sent through Mixamo.

## Mixamo workflow

1. Upload `renderer-c-male-mixamo-doll.fbx` to Mixamo.
2. If Mixamo asks for markers, place its required chin, wrist, elbow, knee and
   groin markers on this neutral figure. Do not change the figure between
   animation downloads.
3. Preview and select an animation.
4. Download **FBX Binary**, **Without Skin**, **30 FPS**, with **Keyframe
   Reduction: None**.
5. Keep the downloaded FBX unchanged for the Blender import and MPFB `Map
   Mixamo` step.

Do not upload a clothed patient or download a fresh skinned character per
motion. The point of this doll is to keep every downloaded clip in one stable
skeleton family that maps back to Renderer C.

Regenerate the doll with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/characters/export_renderer_c_mixamo_doll.py -- \
  --output character-lab/assets/mixamo/renderer-c-male-doll/renderer-c-male-mixamo-doll.fbx \
  --manifest character-lab/assets/mixamo/renderer-c-male-doll/renderer-c-male-mixamo-doll.json
```

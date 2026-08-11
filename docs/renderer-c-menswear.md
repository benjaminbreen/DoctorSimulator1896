# Renderer C men's wardrobe

Status: working technical proof with provisional historical labels. Ben must
approve both the historical interpretation and asset licensing before this
wardrobe becomes shipped game content.

## Current architecture

Renderer C has three proven MPFB garment carriers: tailored suit, working
shirt-and-trousers, and the `mens-victorian-sample` import. They share the
character's Mixamo skeleton and body-build morphs, so shoulders, elbows, hips,
knees, and ankles follow all ten current motion clips.

`mens-authored-victorian-set` is the first imported-art hybrid. It uses the
authored waistcoat, collar, buttons, and red cravat from
`a_set_of_victorian_clothes.glb`, but not that asset's limb surfaces. The source
file divides its sleeve and trouser surfaces into disconnected front and rear
objects. Generic weight transfer made those pieces open into large planes when
the elbows or knees bent. They are not production-safe.

The hybrid therefore combines:

- the authored textured waistcoat, collar, and cravat as a fitted skinned
  overlay;
- the existing MPFB working carrier's proven shirt sleeves and trousers;
- the existing Renderer C shoes, skeleton, body morphs, and ten animations.

Character Lab keeps the working carrier's shirt and trousers continuous beneath
the authored overlay. An earlier experiment hid individual torso triangles by
their dominant skinning bone, but blended shoulder weights created visibly torn
armholes. The small amount of concealed overlap is preferable to broken cloth.

The separate `1830s_frock_coat_unbuttoned.glb` is retained as a source study but
is not exported in the male master. It is earlier than the game's 1896 date and
its long unsupported panels need a dedicated coat-tail rig before use.

## Live controls

Body weight, muscle, and proportion morphs are baked into the authored overlay
and update in real time. The MPFB underlayer already supports those controls.
Material palette, subtle pattern, roughness, and wear also update immediately
on the MPFB pieces.

The authored waistcoat currently keeps its supplied texture. Recolouring it
well requires either a mask texture or separate waistcoat, shirt, and cravat
materials in the source asset; applying one flat tint would destroy its useful
striping and trim.

Changing garment topology or selecting a different authored asset still
requires a prebuilt GLB. Renderer C should not rebuild clothes at runtime.

## Provisional wardrobe families

- `mens-working-clothes`: fitted shirt and trousers, with optional braces or a
  working jacket treatment.
- `mens-sack-suit`: the fitted MPFB tailored carrier.
- `mens-victorian-sample`: a third-party MPFB suit carrier used to test the
  standard fitted-asset path.
- `mens-authored-victorian-set`: authored waistcoat/cravat over the reliable
  MPFB shirt sleeves and trousers.
- `mens-formal-suit` and `mens-mourning-suit`: provisional palette and
  silhouette treatments, not approved final 1896 garments.

These are art-direction categories, not historical claims.

## Validation gate

An outfit is not approved until it passes:

- light, average, and heavy Renderer C body builds;
- all eight male identity anchors;
- seated idle, talking, stand-up, standing idle, and walking clips;
- front, side, and three-quarter views;
- continuous shoulders, elbows, wrists, waist, hips, knees, and ankles;
- no body exposure caused by hidden underlayers;
- no garment vertex outside a finite bounded envelope;
- consultation LOD readability and mobile frame cost;
- verified redistribution licence and complete attribution.

The current authored hybrid is a consultation-LOD proof. A lower-triangle,
texture-compressed nearby LOD and a baked crowd LOD remain separate work.

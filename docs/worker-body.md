# Complete worker body — November 1, 2026

The worker now uses one complete clothed body generated and rigged in Tripo.
The sleeves, cuffs, shirt, braces, trousers, boots and hands retain that donor's
geometry and skin weights. The build does not recreate its arms from curves.
The existing lean expressive head supplies the facial controls, eyes, lips,
hair and whiskers. This is a prototype for review, not a finished character art set.

## MPFB evaluation

MPFB 2.0.18 runs in Blender 5.2.2 through an isolated extension directory.
Its native human and Mixamo rig were created successfully: 19,158 source
vertices and 52 bones before helper removal. Its official Mixamo mapping also
baked the project's exact-doll motions successfully.

The clothing test used Elvaerwyn's `elvs_male_shirt_tie_tucked1` and
`elvs_male_trouser` from the official
[Shirts 02](https://static.makehumancommunity.org/assets/assetpacks/shirts02.html)
and [Pants 02](https://static.makehumancommunity.org/assets/assetpacks/pants02.html)
packs, both CC-BY, with Margaret Toigo's CC0 ankle boots. Standing, seated and
talking renders are under `artifacts/characters/mpfb-worker`.

This proves that the MPFB body/rig route is usable. The tested clothes have
modern details, including the shirt's paired chest pockets and long tie, and
the import needed further material work. They did not provide the ready 1890s
worker outfit sought here. No clothing from that evaluation ships in the new
worker. The authorized Tripo fallback supplied the complete outfit instead.

## Generated source and fitting

The original image and exact imagegen prompt are in
`assets/source/worker-template-2026-11-01/references`. It depicts a cotton band
collar shirt, high-waisted wool trousers, button braces and leather ankle boots.
This is a period-informed fictional design, not a reconstruction of a surviving
outfit. The historical worker references remain in `docs/modular-men.md`.

Tripo generation `4b4ca20d-f17a-4aef-9f8b-b9b934e0e8c6` used Smart Mesh P2,
texturing and the Studio humanoid Mixamo preset: 100 + 20 + 20 credits.
The confirmed account balance after the work was 2,385. Studio did not expose
a humanoid model version, so the record does not claim an API rig version.
The complete mesh initially had 6,111 quad faces and 5,615 vertices.

The head and its lower throat are separate mesh islands. Replacing those
islands preserves the full shirt collar; a horizontal cut left a second throat
and cut the high nape. Only the existing expressive head's lower neck is fitted
into the opening. Its rigid jaw and facial expression deltas are retained.
The shirt collar follows the chest instead of receiving head rotation.

The FBX imported with metallic skin/fabric and an empty normal-map connection.
The build converts those surfaces to nonmetallic materials and removes that
connection. Cotton, wool, braces, hands and boots have separate materials, so
clothing tint does not recolour skin or braces. The donor's palms face inward
in its A-pose; its knee-rest correction accounts for that orientation.

The exported asset keeps nine existing game motions, the expressive-head
contract and the bounded belly/waist controls. Its web build is about 6.1 MiB.
This is download size, not a measured frame-rate improvement.

## Rebuild and review

```sh
node scripts/characters/build-worker.mjs
node scripts/characters/build-worker.mjs --check
node scripts/characters/capture-worker.mjs
```

Set `BLENDER_BIN` if Blender is outside the locations used by the existing
character build scripts. Rebuilding uses downloaded local sources and spends
no Tripo credits. It reads the existing lean template for its expressive head.

Open `/face-lab.html?model=male-worker-template` in Character Lab. `worker-base`
and `worker-silver` are saved appearance recipes; both use the same body and rig.
The lab exposes face shape, eye/skin/hair colour, hair, whiskers, belly, waist
and clothing tint. There is one complete worker outfit. An interchangeable
garment library and a fitted apron remain separate work.

The game review uses Samuel's ordinary consultation flow under the existing
playtest-only appearance override. Clinical facts and the ordinary patient
asset remain unchanged:

```sh
node game/scripts/gameplay-playtest.mjs --scenario=samuel --offline \
  --url='http://127.0.0.1:5175/?appearancePreset=worker-base' \
  --video --replay=game/scripts/playthroughs/modular-men.jsonl
```

Check the side and rear views, wrist joins, hand contact, walking, sitting,
standing and speaking poses. Hair clumps, eyelid corners and the source's
low-resolution fingers still need art refinement. Extreme body/face combinations
are not visually accepted just because their control values are bounded.

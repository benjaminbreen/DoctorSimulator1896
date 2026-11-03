# Relaxed standing hands

The published modular patients now carry corrected hand poses in StandingIdle,
Walk, SitDown and StandUp. The generic retarget previously preserved open fingers
and forward-facing palms from the rig's rest pose. This made an ordinary idle
look like a modelling pose.

The correction measures each rig's palm from the wrist and metacarpal joints.
Palms turn toward the thighs, fingers curl gently, and thumbs settle toward the
index fingers. Pronation is shared between the forearm and wrist. The standing
arms use a small elbow bend and hand spacing measured against the posed garment,
including coat tails and skirt volume. Walking keeps its original arm swing.
The standing skirt carriers also discard stray arm/shoulder weights, transferring
them to the hips so arm movement cannot pull spikes out of the lower fabric.
The green walking suit uses a hip-bound standing carrier to avoid the imported
leg weights collapsing its skirt. Its separate seated carrier still supplies
the lap shape.

The standing correction fades out during the first part of SitDown and returns
near the end of StandUp. ClinicIdle and the seated gestures are unchanged. Root
travel and leg tracks are unchanged. This adds no per-frame pose solver to the
lab or game: it is baked into the four exported clips.

`scripts/lib/relax-standing-posture.mjs` runs inside the ordinary modular-patient
optimizer, after the Blender export. Per-clip version metadata prevents a second
pass from adding more finger curl. The original assembled Blender files retain
the source performances; published GLBs include the correction. The export
contract also rejects animation channels whose sampler is not registered in
that clip, including after a GLB round trip.

To repair existing published assets without rebuilding their heads or textures:

```sh
node scripts/characters/fix-standing-posture.mjs
```

This saves original GLBs and pose diagnostics under the ignored
`artifacts/characters/standing-posture/` directory and replaces each output
atomically. It preserves textures, facial controls, geometry and skeleton names.

To repeat the review:

```sh
node --test tests/standing-posture.test.mjs
node scripts/characters/capture-standing-posture.mjs --url=http://127.0.0.1:5196
```

The review covers all eighteen modular patients, with additional side views,
walking phases, sitting and rising transitions, seated controls and a hat grip
on the distinct bodies. Tests check inward palms and relaxed fingers on the
published clips, unchanged seated/root/leg tracks, idempotence and valid sampler
references. The broad body and full garments need more lateral hand clearance
than the lean suit; a single wrist offset is not suitable for the full set.

Validation: 809 game tests and 16 focused posture/runtime tests passed, as did
both production builds and all thirteen expansion export contracts. The lab
review captured 91 poses, followed by garment-clearance checks on the distinct
bodies. The male gameplay replay passed. A longer female replay completed the
consultation but timed out taking a street screenshot; the affected entrance,
walking, sitting and examination path was rerun separately.

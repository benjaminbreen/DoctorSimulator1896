# Humanoid reaction sources

These Mixamo FBXs are the editable sources for the shared fall, prone, rise,
and ledge-slip motions used by pedestrians and the player. Rebuild the compact,
mesh-free crowd motion pack with:

```sh
npm run reactions:export
```

`npm run tripo-player:export` retargets the same sources onto the playable
figure. Both exporters remove net horizontal hips drift so separate fall,
prone, and rise clips keep one simulation-owned world anchor. Vertical motion
and the within-clip body movement are retained.

Runtime names:

- `Edge Slip on heights.fbx` → `EdgeSlip`
- `Shoulder Hit And Fall.fbx` → `FallShoulder`
- `Falling Down.fbx` → `FallGeneric`
- `Fallen Idle.fbx` → `FallenIdle`
- `Standing Up from Fall.fbx` → `RiseFromFall`


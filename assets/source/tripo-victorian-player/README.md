# Tripo Victorian player source

These are the editable FBX sources for `game/public/models/tripo-victorian-player.glb`.
Rebuild the web asset from the repository root with:

```sh
npm run tripo-player:export
node scripts/characters/optimize-tripo-player.mjs
```

The playable export currently includes these Mixamo clips:

- `Neutral Idle.fbx` → `StandingIdle` (upper-arm correction applied)
- `Walking-2.fbx` → `Walk`
- `Slow Run.fbx` → `Run`
- `Jump.fbx` → `Jump`
- `Standing Jump-2.fbx` → `StandingJump`
- `Throw Object.fbx` → `Throw`
- `Quick Formal Bow.fbx` → `FormalBow`
- `Shaking Hands 2.fbx` → `Handshake`
- `Run To Stop.fbx` → `RunStop`
- `Vault Over Box.fbx` → `Vault` (the game uses the crossing, before the hide)
- `Jogging Stumble.fbx` → `Stumble`
- `Terrified.fbx` → `Startle` (the game uses the opening upper-body recoil)

The build also includes the carriage ladder cycle, carrying and pickup motions,
smoking, and the shared fall and recovery clips. The complete export list is in
`scripts/characters/export_tripo_player.py`. The FBXs stay in the source tree;
the game serves only the two optimized player GLBs.

# Tripo Victorian player source

These are the editable FBX sources for `game/public/models/tripo-victorian-player.glb`.
Rebuild the web asset from the repository root with:

```sh
npm run tripo-player:export
```

The playable export currently includes these Mixamo clips:

- `Neutral Idle.fbx` → `StandingIdle` (upper-arm correction applied)
- `Walking-2.fbx` → `Walk`
- `Slow Run.fbx` → `Run`
- `Jump.fbx` → `Jump`
- `Standing Jump-2.fbx` → `StandingJump`
- `Quick Formal Bow.fbx` → `FormalBow`
- `Shaking Hands 2.fbx` → `Handshake`

The other FBXs are retained here as source motions for later seated and
interaction states. They are not included in the playable GLB yet.

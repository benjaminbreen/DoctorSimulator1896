# Renderer C consultation motion sources

These animation-only FBX files were downloaded from Mixamo for Renderer C.
`npm run renderer-c:mixamo` rebuilds both MPFB parametric masters with the
motions baked directly onto MPFB's native 52-bone Mixamo rig. Character Lab
plays those embedded actions without a runtime skeleton conversion.

- `Sit To Stand.fbx`: primary seated-to-standing motion.
- `Sitting Idle.fbx`: longer seated breathing loop.
- `Sitting-2.fbx`: shorter, quieter seated loop.
- `Stand To Sit.fbx`: reverse transition for returning to the chair.
- `Walking-2.fbx`: neutral pedestrian walk loop.
- `Walking With Shopping Bag.fbx`: asymmetric carried-item walk loop.

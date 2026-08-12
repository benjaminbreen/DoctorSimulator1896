# Nora Byrne source assets

`Nora Byrne Skinned.fbx` is Nora's Tripo model after Mixamo rigging. The four
`Sitting` files are animation-only Mixamo downloads made from the same upload.
The export script also uses the project's shared seated idle, transitions, and
walk as fallbacks.

Run `npm run nora:export` after replacing a source FBX. Dialogue code requests
semantic body cues; Nora's recipe maps those cues to these clip names.

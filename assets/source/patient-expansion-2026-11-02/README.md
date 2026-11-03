# Patient expansion sources

Ten user-approved fictional ImageGen references, their prompts and ten Tripo
Studio FBX/4k texture exports. `provenance.json` records generation IDs, hashes,
reported topology, credit usage and authorization. The five C-series exports
include Studio’s Mixamo skeleton. No source is a scan of a real person.

`H1-fit.json` through `H5-fit.json` contain measured normalization and facial
anchors. `bodies.json` contains source paths, target heights and garment fits.
Generated intermediate blends, neck/eye atlases and wardrobe bakes are ignored;
original references and exports use Git LFS.

From the repository root, run:

```sh
node scripts/characters/build-patient-expansion.mjs
node scripts/characters/build-patient-expansion.mjs --assemble-only --rebuild-bodies
node scripts/characters/build-patient-expansion.mjs --check
```

See `docs/patient-expansion.md` for fitting, visual review, runtime selection,
historical sources and limitations.

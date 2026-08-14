# Gerry Mansion material evidence

The admitted target is a stylized render, not a calibrated photograph. It is reliable for relative color, value separation, and roughness intent, but it cannot support exact inverse PBR extraction. Texture projection was therefore skipped and the reconstruction uses independent, redistributable maps already shipped with the game.

## Material observations and wiring

- Warm red-orange brick: `/textures/facades/brick.webp`, world-scale projected at 3 metres per repeat through `createFacadeMaterial`. The source supplies color and restrained bump response; scalar roughness is 0.90. Target tint is `#c98b6e`, with darker instance variation.
- Buff limestone: independent `/textures/architecture/buff-limestone_col.webp`, `_nrm.webp`, and `_rough.webp` maps, projected at 2.25 metres per repeat. Normal strength is 0.34 and roughness remains matte. Target tint is `#d9cbb1`.
- Blue-gray slate: low-cost shared roof material using `#3c4650`, roughness 0.78, and metalness 0.04. Tile-scale relief is deliberately omitted on this landmark because the roof silhouette is more important at the game camera distance and an extra map fetch would affect every shared roof batch.
- Dark period glass: shared scalar PBR material, roughness 0.40 and metalness 0.02. Dark blue-gray color creates recess depth without transmission overdraw.
- Painted iron: shared scalar PBR material, roughness 0.54 and metalness 0.68. Thin repeated parts are instanced.
- Rusticated base: uses the same shared masonry/facade system with darker tint; the target only establishes value separation, not a unique map set.

## Runtime constraints

No new texture set is added. Brick, limestone, glass, slate, and iron remain shared across all Gilded Age landmark instances. New fidelity is concentrated in silhouette geometry and repeated instances, while decorative parts do not receive their own shadow draw calls.

The accepted limitation is that the slate and iron use scalar roughness rather than inferred maps. This is intentional: the target render does not contain trustworthy source material channels, and the result is judged in the actual game lighting and camera.

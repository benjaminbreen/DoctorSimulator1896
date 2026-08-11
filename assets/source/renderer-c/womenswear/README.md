# Renderer C womenswear source assets

These are CC0 MakeHuman/MPFB fitted meshes selected as garment-construction
sources. They are not approved historical reconstructions. Ben must approve
the final 1896 silhouettes before they become game content.

## MakeHuman Community Dress 01

Source: https://static.makehumancommunity.org/assets/assetpacks/dress01.html

Author: Margaret Toigo. Licence: CC0.

- `toigo_halter_dress_with_fluted_skirt`: existing fitted foundation used by
  Renderer C.
- `toigo_bodice_dress_with_lace_ruffle_skirt`: bodice and full-skirt topology
  candidate.
- `toigo_dress_with_tiered_skirt`: alternative full-skirt topology candidate.

Each directory keeps the OBJ, MHCLO fit map, material, texture and thumbnail
from the official pack. The MHCLO files are the useful part: MPFB can fit these
meshes to the generated body before the character is exported as GLB.

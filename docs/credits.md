# Credits

Third-party assets converted into the game, with the licence each one ships
under. CC-BY requires this list to travel with any build, so add an entry when
you add a model. `scripts/models/convert-pack.mjs` copies the credit out of the
source file into the pack manifest, and `tests/model-packs.test.js` fails if a
converted piece has no redistributable licence.

## What this project may use

*Ghosts of the Machine Age* is a non-commercial educational project, written
by a historian for teaching use. It is not sold and carries no advertising.

**Non-commercial licences are therefore fine.** CC-BY-NC and CC-BY-NC-SA are
as usable here as CC-BY, and need no flag, no warning and no replacement plan.
Attribution in this file is the whole obligation.

What still rules an asset out is the absence of a redistribution right — a
"no redistribution" or all-rights-reserved source cannot ship, because a web
build serves the `.glb` itself. Those go under **Not cleared** below.

## Park props — `game/public/models/park/`

| Piece | Author | Licence | Source |
| --- | --- | --- | --- |
| Park Bench (`large_park_bench`) | RBG_illustrations | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/park-bench-2ee2bc87756d4bf0932d83ab860ddb8f) |
| Bench (`small_park_bench`) | igi | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/bench-704caf7553e94e8c8f51c1cd841ef4c7) |
| Low-Poly Lamp Post (`low-poly_lamp_post`) | Memorie | CC-BY-4.0 | Sketchfab |
| Metal And Concrete Guardrail (`metal_and_concrete_guardrail_8_MB`) | Mehdi Shahsavan | CC-BY-4.0 | Sketchfab |
| Shapespark low poly exterior plants kit (`shapespark_plants__*`) | Shapespark | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/shapespark-low-poly-exterior-plants-kit) |
| Animated Grass - Vegetation (`meadow_grass`) | raguramkgr | CC-BY-4.0 | Sketchfab |

The plants kit is one file holding thirty pieces; the converter splits it into
a model each (`__Tree-01-1_0`, `__Bush-03_15`, …). All of them carry the same
credit. Both entries came across from Young Darwin, which had already converted
them; the credit rides in the file, so it survived the trip.

## Interior props — `game/public/models/props/`

| Piece | Author | Licence | Source |
| --- | --- | --- | --- |
| Explorer's Globe (`explorers_globe`) | RittikaSen | CC-BY-4.0 | Sketchfab |
| Medieval telescope (`medieval_telescope`) | chaschinkaa | CC-BY-4.0 | Sketchfab |
| Victorian Style Sofa (`victorian_style_sofa`) | ryankentpaule | CC-BY-4.0 | Sketchfab |
| Vintage Wooden Workdesk (`vintage_wooden_workdesk`) | Poring | CC-BY-4.0 | Sketchfab |
| Elegan old book pack (`elegan_old_book_pack__*`) | 3D_for_everyone | CC-BY-4.0 | Sketchfab |
| Game Ready Carpet (`game_ready_carpet`) | Voidy Entertainment | CC-BY-NC-4.0 | [Sketchfab](https://sketchfab.com/VoidyAssets) |
| Arm Chair 01 (`ArmChair_01`) | Kirill Sannikov | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/ArmChair_01) |
| Chemistry Set (`chemistry_set`) | Jiří Ptáček | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/chemistry_set) |
| Round Spectacles (`round_spectacles`) | Sean Buckley | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/round_spectacles) |
| Vintage Crutches 01 (`vintage_crutches_01`) | James Ray Cock | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/vintage_crutches_01) |
| Vintage Microscope (`vintage_microscope`) | Luis José Fernández Rodríguez | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/vintage_microscope) |
| Wooden Candlestick (`wooden_candlestick`) | Josh Dean | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/wooden_candlestick) |
| Vintage Pocket Watch (`vintage_pocket_watch`) | Tal Swicegood | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/vintage_pocket_watch) |
| Tea Set 01 (`tea_set_01`) | James Ray Cock, Jurita Burger, Rico Cilliers | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/tea_set_01) |
| Mantel Clock 01 (`mantel_clock_01`) | Rico Cilliers, Yann Kervran | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/mantel_clock_01) |
| Old Bed Frame (`old_bed_frame`) | Luca B | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/old_bed_frame) |
| Vintage Day Bed (`vintage_day_bed`) | Aron Łyczek | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/vintage_day_bed) |
| Book Encyclopedia Set 01 (`book_encyclopedia_set_01`) | John Malcolm | CC0-1.0 | [Poly Haven](https://polyhaven.com/a/book_encyclopedia_set_01) |

The book pack ships as one file holding two dozen books; the converter splits it
into a model per book (`__Book_3`, `__Book_pack_5`, …) so they can be shelved
individually. All the split pieces carry the same credit.

The Poly Haven pieces were downloaded at 1K through its public asset API. Poly
Haven publishes its models under CC0. Their author, licence and source page are
also embedded in each source GLB and copied into the shipped manifest.

## Character clothing sources — `assets/source/renderer-c/`

These are fitting and construction sources, not approved historical
reconstructions. Ben must approve the final 1896 silhouettes before use in the
game.

| Piece | Author | Licence | Source |
| --- | --- | --- | --- |
| Bodice dress with lace ruffle skirt | Margaret Toigo | CC0 | [MakeHuman Dress 01](https://static.makehumancommunity.org/assets/assetpacks/dress01.html) |
| Dress with tiered skirt | Margaret Toigo | CC0 | [MakeHuman Dress 01](https://static.makehumancommunity.org/assets/assetpacks/dress01.html) |
| Male double-breasted suit | Margaret Toigo | CC0 | [MakeHuman Suits 01](https://static.makehumancommunity.org/assets/assetpacks/suits01.html) |
| Suit with dinner jacket | Margaret Toigo | CC0 | [MakeHuman Suits 01](https://static.makehumancommunity.org/assets/assetpacks/suits01.html) |
| 1830s Frock Coat (Unbuttoned) | Digital Dressmaker | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/1830s-frock-coat-unbuttoned-bb2d52721c394447904afa41f70ca56c) |
| A set of Victorian clothes | deymar | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/a-set-of-victorian-clothes-cfe0ad26828a42cebf49aea928ea8a15) |
| Simple Drape Victorian Dress Test | pers | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/simple-drape-victorian-dress-test-0e2f55763d8244cf93ecdeffb5976532) |
| Victorian Ladies Hoop Skirt Dress | pers | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/victorian-ladies-hoop-skirt-dress-50d7a13a47a041c7991720fee21579c7) |
| Newsboy cap | jujube | CC0 | [MakeHuman Hats 01](https://static.makehumancommunity.org/assets/assetpacks/hats01.html) |
| Bowler hat | culturalibre | CC-BY | [MakeHuman Hats 03](https://static.makehumancommunity.org/assets/assetpacks/hats03.html) |
| Male flat cap | Elvaerwyn | CC-BY | [MakeHuman Hats 03](https://static.makehumancommunity.org/assets/assetpacks/hats03.html) |
| Top hat | Elvaerwyn | CC-BY | [MakeHuman Hats 03](https://static.makehumancommunity.org/assets/assetpacks/hats03.html) |
| Maid bonnet | Elvaerwyn | CC-BY | [MakeHuman Hats 03](https://static.makehumancommunity.org/assets/assetpacks/hats03.html) |
| Female ankle boots | Margaret Toigo | CC0 | [MakeHuman Shoes 01](https://static.makehumancommunity.org/assets/assetpacks/shoes01.html) |
| Male ankle boots | Margaret Toigo | CC0 | [MakeHuman Shoes 01](https://static.makehumancommunity.org/assets/assetpacks/shoes01.html) |
| Round glasses | Margaret Toigo | CC0 | [MakeHuman Glasses 01](https://static.makehumancommunity.org/assets/assetpacks/glasses01.html) |

The four Sketchfab GLBs keep their original credit metadata. They are unskinned
reference meshes and require fitting before they can follow the Renderer C rig.
The MakeHuman pieces include MHCLO fit maps and are directly compatible with
the existing MPFB fitting stage; generated characters export to GLB afterward.

## Mixamo pedestrian sources

| Piece | Creator / source | Licence / use |
| --- | --- | --- |
| Straw-hatted pedestrian | Project-provided character mesh; rig and motion processing through [Adobe Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Project asset; Mixamo permits royalty-free incorporation into video games |

The web build separates this character's mesh from its nineteen animation-only
clips. The motion pack retains the common 65-bone Mixamo contract so it can be
tested on the other pedestrian meshes before reuse.

## Surfaces — `game/public/textures/props/`

| Texture | Author | Licence |
| --- | --- | --- |
| `Wallpaper_Vintage` | gre4esky | CC-BY-4.0 |

## Metropolitan Club interior surfaces — `game/public/textures/metclub/`

| Texture | Source | Licence |
| --- | --- | --- |
| `marble_*` | "Marble 012", [ambientCG](https://ambientcg.com) | CC0-1.0 |
| `walnut_*` | "Wood 067", [ambientCG](https://ambientcg.com) | CC0-1.0 |
| `wood-warm_*` | "Wood 026", [ambientCG](https://ambientcg.com) | CC0-1.0 |

## Procedural facade surfaces — `game/public/textures/facades/`

| Texture | Creator / source | Licence |
| --- | --- | --- |
| `ashlar-gray.webp` | OpenAI ImageGen, directed for this project (2026) | Project-generated asset |

## Architectural surfaces — `game/public/textures/architecture/`

| Texture | Creator / source | Licence |
| --- | --- | --- |
| `buff-limestone_*` | OpenAI ImageGen albedo source, directed for this project; normal and roughness maps derived locally (2026) | Project-generated asset |

## Cattell laboratory wall images — `game/public/textures/cattell-lab/`

| Image | Creator / source | Licence |
| --- | --- | --- |
| `francis-galton-c1890.jpg` | Graham's Art Studios, circa 1890; [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sir_Francis_Galton,_circa_1890.jpg) | Public domain |
| `herbert-spencer-1889.jpg` | Herbert Spencer photograph (1889), Wellcome Collection; [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Herbert_Spencer._Photograph,_1889._Wellcome_V0027201.jpg) | CC-BY-4.0 |
| `william-james-1890s.jpg` | Sarah Choate Sears, 1890s; Houghton Library / [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:William_James_in_1890s.jpg) | Public domain |
| `cattell-blackboard-1896.png` | OpenAI ImageGen, directed for this project (2026) | Project-generated asset |

## Renderer C clothing studies

The local copies of `a_set_of_victorian_clothes` and
`1830s_frock_coat_unbuttoned` are credited in the character-clothing table
above. Only the waistcoat, collar and cravat portion of the former is in the
current Renderer C male proof. The 1830s coat remains source material and is
not exported in the current character master.

## Not cleared

Sources present in `assets-src/` that must not be converted or shipped until
their terms are settled:

- **Late 1800s Fainting Couches Type A** (Mad_Lobster_Workshop) — marked
  "COPYRIGHT TO Mad_Lobster_Workshop". No redistribution licence.
- **Rope Barrier** (MaX3Dd) — Sketchfab Standard licence. Allows use in a game
  but not redistribution of the asset itself, which is what a web build does
  when it serves the `.glb`.

## Other

The June 15, 1896 front page of *The Journal* in
`game/public/newspapers/1896-06-15.jpg` is from the Library of Congress,
Serial and Government Publications Division. The Library of Congress reports
no known U.S. copyright restrictions for the digitized collection. [Source
record](https://www.loc.gov/item/sn84031792/1896-06-15/ed-1/).

The CGTrader Victorian interior pack under `game/public/models/victorian/` is a
purchased asset; its licence terms live with the purchase, not here.

The Pond outline and Gapstow Bridge footprint in `game/src/world/` are traced
from OpenStreetMap data (© OpenStreetMap contributors, ODbL).

The animated street horse (`game/public/models/horse.glb`) is **Horse** by
[kenchoo](https://sketchfab.com/kenchoo), licensed
[CC-BY-NC-SA-4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), from
[Sketchfab](https://sketchfab.com/3d-models/horse-86d47bdcd5ab41238ba44547e4d21f9c).
The original credit and licence metadata remain embedded in the GLB.

# Credits

Third-party assets converted into the game, with the licence each one ships
under. CC-BY requires this list to travel with any build, so add an entry when
you add a model. `scripts/models/convert-pack.mjs` copies the credit out of the
source file into the pack manifest, and `tests/model-packs.test.js` fails if a
converted piece has no redistributable licence.

## Modular patient prototype — October 29, 2026

Carmela Russo and the fictional seamstress head were generated in Ben Breen's
Tripo Pro account from OpenAI-generated fictional reference images. The body
uses Tripo's Mixamo skeleton preset. Eyelids, structural face variations, the
lip and mouth rig, teeth, gums, tongue, procedural updos and fibre maps, the seated skirt and apron
are project-authored adaptations. Tripo's
[paid-user terms](https://www.tripo3d.ai/terms) and
[commercial-use guide](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially)
permit use, modification and distribution of paid outputs.

The embedded motions reuse the project's existing Adobe Mixamo downloads.
Adobe's [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
permits royalty-free use in games. These are game characters, not a standalone
redistribution of the motion library. Detailed source IDs and credit use are
recorded in `assets/source/carmela-russo-2026-10-29/provenance.json`.

The November 1 eyelashes are project-authored procedural geometry, fitted to
the moving eyelids at runtime. They use no additional third-party assets.

The October 30 hair pass adds a chignon, waved knot and braided knot with live
grooming controls. These meshes and their mathematical colour and normal maps
are project-authored. The Museum of the Earth's
[Carlotta Maury collection](https://www.museumoftheearth.org/daring-to-dig/bio/helen-plummer-new-828dk),
including a ca. 1895 profile, informed the silhouette. The historical photograph
is a research reference and is not included in the game build.

The later ear-coverage pass retains those styles and adds soft side waves and
curled side rolls. Their geometry and strand coverage masks are project-authored.
The fine-fibre and curl albedos were generated with OpenAI's built-in image
tool; the normal maps are derived from those images. Source images and exact
prompts are in `assets/source/carmela-russo-2026-10-29/references/`. The user's
fashion plate and the University of Louisville's
[1889–1899 pin-curl portrait](https://digital.library.louisville.edu/concern/images/ulpa_1980_020_0971?locale=en)
are research references only; neither is shipped as a game texture.

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
The six `shapespark_plants__Tree-*-lod.glb` derivatives simplify the same
credited tree geometry for distant groves; they reuse the original textures.

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

The Victorian Style Sofa's blanket was made double-sided and given one
restrained subdivision pass on October 31, 2026. The sofa geometry and textures
retain ryankentpaule's original credit. The editable repair is in
`scripts/models/repair-sofa-blanket.mjs`; its maximum vertex movement is 12 mm.

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
| Ferdinand de Chapuys / wine merchant | Project-created character mesh and portrait; rig and motion processing through Adobe Mixamo | Project asset |

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

## Event banners — `game/public/ui/events/` and `game/public/ui/callers/`

| Images | Creator / source | Licence |
| --- | --- | --- |
| Sixty-one cut-paper event, outcome, day-flow, and caller banners (`*.webp`) | OpenAI ImageGen, directed for this project (2026) | Project-generated assets |

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
`Sconce-responsive.glb` is a derivative of its `Sconce.glb`, with the two
shades separated for contact animation. Rebuild with
`node scripts/models/build-responsive-sconce.mjs`.

The Pond outline and Gapstow Bridge footprint in `game/src/world/` are traced
from OpenStreetMap data (© OpenStreetMap contributors, ODbL).

The animated street horse (`game/public/models/horse.glb`) is **Horse** by
[kenchoo](https://sketchfab.com/kenchoo), licensed
[CC-BY-NC-SA-4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), from
[Sketchfab](https://sketchfab.com/3d-models/horse-86d47bdcd5ab41238ba44547e4d21f9c).
The original credit and licence metadata remain embedded in the GLB.

The paintings in `game/public/art/` are public-domain works from
[Wikimedia Commons](https://commons.wikimedia.org/): Arnold Böcklin,
*Isle of the Dead* (third version, 1883, Alte Nationalgalerie) and
*Self-Portrait with Death Playing the Fiddle* (1872, Alte Nationalgalerie);
Fernand Khnopff, *I Lock My Door Upon Myself* (1891, Neue Pinakothek);
Odilon Redon, *Closed Eyes* (1890, Musée d'Orsay); Théophile Steinlen,
*Tournée du Chat Noir* (1896, public domain, via Wikimedia Commons); Henri de
Toulouse-Lautrec, *Divan Japonais* (1893, public domain, via Wikimedia
Commons); Aubrey Beardsley, *The Peacock Skirt* (1893, public domain, via
Wikimedia Commons); Edward Penfield, *Harper's for June* (1890s, Library of
Congress); Louis Dalrymple, *Just Wobbling!* (Puck cover, April 8, 1896,
Library of Congress); Currier & Ives, *The Great East River Suspension
Bridge* (1883, public domain, via Wikimedia Commons).

## New male templates, October 31, 2026

`male-lean-template.glb` and `male-broad-template.glb` use new fictional head and
body meshes generated in the user's paid Tripo Studio account from project-made
OpenAI ImageGen references. Source prompts, generation IDs, downloads and credit
usage are recorded in `assets/source/modular-men-2026-10-31/provenance.json`.
Blender assembly adds fitted eyes, lids, lips, teeth, expressions, procedural
hair, facial hair and bounded body controls. Hair fibres reuse the project's
previously generated Carmela hair textures. Facial-hair clumps use a new
ImageGen fibre reference saved with its prompt as `references/facial-hair-fibres-v1.*`
in the same source folder. Motion is retargeted from the
project's existing Mixamo source clips, credited with the other character
animations. The references are original fictional designs; the Met and portrait
records linked in `docs/modular-men.md` informed the period range and are not
embedded as textures in these models.

The modular male work shirts, wrist joins, apron patterns, straps and their
cotton/canvas/leather textures are generated by project-authored Blender and
Python code. Historical photographs linked in `docs/modular-men.md` informed
the clothing range; their pixels are not included in the shipped assets.

## Complete worker body, November 1, 2026

`male-worker-template.glb` uses a complete clothed worker generated and rigged
in the user's paid Tripo Studio account from an original built-in ImageGen
reference. The source geometry includes the shirt sleeves, cuffs, braces,
trousers, hands and boots. Its fitted expressive head, hair and facial hair
reuse the lean male template credited above. Motions reuse the existing Mixamo
sources. The original prompt, generation ID, downloads and 140-credit cost
are recorded in `assets/source/worker-template-2026-11-01/provenance.json`.
See `docs/worker-body.md` for the material conversion and neck fitting changes.

The MPFB comparison used CC-BY clothes by Elvaerwyn from Shirts 02 and Pants 02,
plus Margaret Toigo's CC0 boots. Those comparison clothes are not included in
the shipped worker asset.

## Procedural hats, November 1, 2026

The 16 modular hat families, ribbons, lining, flowers, feathers, veil meshes and
fabric textures are generated by project-authored JavaScript. No Tripo credits
or downloaded third-party models/textures were used for this set. Period
museum objects, newspaper fashion pages and uniform records are linked with
scope and uncertainty in `docs/headwear.md`; their images are not distributed
in the game. Character bodies, hair and Mixamo motion sources retain the
credits listed above.

The hat material refinement reuses the project's original neutral fabric source
images in `assets/source/renderer-c/fabrics`. `scripts/materials/bake_headwear.py`
combines those sources with project-authored herringbone, weave, straw braid,
velvet pile, leather grain and feather fields. It bakes separate albedo, normal
and occlusion/roughness maps into `textures/headwear` in both apps. Museum
reference images remain reference-only and are not part of these textures.

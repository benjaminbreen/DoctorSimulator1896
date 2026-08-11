# Golden dress intake

## Scope

The screenshot is a failure baseline, not the intended historical reference. The target is an approximate 1890s-inspired day dress for a real-time, rigged character. It must be usable for standing, walking, and seated consultation poses. Exact reconstruction from the screenshot is neither possible nor desirable.

## Observed baseline

- The subject is a realistic-proportioned adult character viewed from a high front three-quarter angle while seated.
- The current garment is a layered set of fitted and full-skirt forms. Its silhouette is broadly dress-like, but several layers intersect or separate visibly.
- The torso and sleeves show multiple abrupt color regions with hard, irregular boundaries. Some boundaries reveal white or skin-colored gaps.
- A pale V-shaped chest region appears painted across the fitted torso. It does not read as a sewn insert because its edges do not follow a stable seam or raised garment boundary.
- The sleeve trim appears as small disconnected light and green regions. It does not remain continuous around the arms.
- The skirt carries a strong diagonal weave pattern. The pattern changes scale and direction abruptly at mesh boundaries and visible seams.
- The lower skirt has enough volume to read as a full skirt, but the lap, overskirt, and side volume collide in the seated pose.
- Two buttons are visible at the center waist. They are small discrete solids and read more clearly than the painted trim.

## Required structure

- Macro: fitted long-sleeved bodice and one full ankle-length skirt, sharing a stable waist transition.
- Meso: raised neckline or modest collar, real cuffs, center-front closure, waist band, and optional hem or restrained bodice trim.
- Micro: buttons, narrow piping or seam relief, and fabric weave supplied by normal/roughness maps rather than by large color blocks.
- Spatial rule: bodice and skirt must remain attached at the waist; cuffs must conform to the sleeve and move with the lower arm; buttons must sit slightly above the bodice surface; no trim may float in front of the body.

## Topology and rigging strategy

- Bodice, sleeves, and skirt are L4 cross-joint conforming shells.
- Cuffs and buttons are L3 single-bone or narrowly weighted details.
- Seam lines and fine weave are surface relief or material detail, not detached panels.
- A single standing garment mesh should remain active in seated poses. A seated corrective shape may adjust the lap and thigh clearance, but the runtime should not swap to unrelated geometry.

## Material target

- First review material: neutral matte cloth with moderate roughness so geometry and intersections are visible.
- Golden dress default: muted ochre or brown-gold cloth, not metallic gold; darker brown secondary regions; restrained cream or dark accent.
- Fabric maps may add small-scale weave, roughness variation, and shallow normal relief. Albedo must not encode garment construction lines that should be geometry.

## Definition of acceptable first version

- Reads immediately as one coherent late-nineteenth-century-inspired dress at normal gameplay distance.
- Raised neckline, long sleeves, fitted waist, full skirt, real cuffs, and a center closure are visible.
- No painted V panel, random color patches, white holes, floating trim, or rigid skirt collapse.
- Holds together in standing front, front three-quarter, side, rear, and seated views.
- Exact period cut, class-specific trim, cloth simulation, and production tailoring remain later research and refinement tasks.

## Uncertainty

- The screenshot supplies no authoritative front, side, rear, pattern-cut, or museum reference for a target dress.
- Hidden back construction and exact seam placement are inferred.
- The result should be labeled approximate until historical references and a dress historian's review support a narrower 1896 style claim.

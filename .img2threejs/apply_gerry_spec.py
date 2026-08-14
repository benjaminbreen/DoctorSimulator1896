#!/usr/bin/env python3
"""Apply the Gerry Mansion reconstruction contract to the generated spec."""

from __future__ import annotations

import json
from pathlib import Path

from apply_landmark_spec import component, material


ROOT = Path(__file__).parent
SPEC = ROOT / "gerry-mansion-spec.json"
INVENTORY = ROOT / "gerry-mansion-detail-inventory.json"


def attachment(parent: str) -> dict:
    return {
        "parentSocket": f"{parent}-shell",
        "localStart": [0, 0, 0],
        "localEnd": [0, 0.04, 0],
        "contactType": "embedded-overlap",
        "embedDepth": 0.04,
        "overlap": 0.04,
        "gapTolerance": 0.01,
        "notes": "Static architectural child overlaps its parent by at least 0.04 world units.",
    }


def as_rgba(color: str) -> str:
    value = color.lstrip("#")
    return f"rgba({int(value[0:2], 16)}, {int(value[2:4], 16)}, {int(value[4:6], 16)}, 1)"


def main() -> None:
    spec = json.loads(SPEC.read_text())
    inventory = json.loads(INVENTORY.read_text())["detailInventory"]
    detail_kinds = {
        "silhouette": "contour",
        "architectural-detail": "ridge",
        "massing": "contour",
        "facade-system": "ridge",
        "opening-system": "hole",
        "material": "stain",
    }
    for detail in inventory["details"]:
        detail["kind"] = detail_kinds[detail["kind"]]
        ref = detail["mapsTo"]["ref"]
        if ".localFeatures." in ref:
            owner, feature = ref.split(".localFeatures.")
            detail["mapsTo"]["ref"] = f"{owner}/{feature}"
        elif ".localOverrides." in ref:
            owner, feature = ref.split(".localOverrides.")
            detail["mapsTo"]["ref"] = f"{owner}/{feature}"
    spec["preSpecAssessment"]["detailInventory"] = inventory
    spec["preSpecAssessment"]["unknownsToResolveBeforeImplementation"] = []
    spec["suitability"] = "pass"
    spec["scores"] = {
        "object_isolation": 3,
        "silhouette_readability": 3,
        "depth_inference": 2,
        "primitive_decomposition": 3,
        "material_procedurality": 3,
        "occlusion_risk": 2,
        "interaction_fit": 3,
    }
    spec["referenceCamera"] = {
        "solved": False,
        "fovDegrees": 40,
        "aspect": 1.34,
        "orientation": {"yaw": -36, "pitch": 15, "roll": 0},
        "positionHint": [-2.6, 1.55, 3.8],
        "note": "Reference is a stylized three-quarter render, used for relative massing rather than texture projection.",
    }
    spec["assumptions"] = [
        "The visible west and north elevations control fidelity; hidden rear elevations reuse the same grammar.",
        "The existing playable footprint and collision proxy remain unchanged.",
        "The target render establishes color and roughness intent but is not a recoverable measured PBR source.",
    ]
    spec["coordinateFrame"] = {
        "front": "north street elevation (-z in the game parcel)",
        "up": "+y",
        "scaleReference": "existing 24.6 by 18.5 by 12.6 metre gameplay parcel",
    }
    spec["silhouette"] = {
        "boundingShape": "stepped L-shaped masonry mansion with a dominant near-square corner pavilion",
        "aspectRatios": ["pavilion wall width:height about 0.62", "roof height:pavilion wall height about 0.52", "wing cornice:pavilion cornice about 0.72"],
        "symmetry": "locally ordered bays but globally asymmetric corner composition",
        "dominantCurves": ["round-headed ground arches", "large loggia arch"],
        "negativeSpaces": ["recessed loggia", "conservatory glazing", "gaps between dormer pinnacles"],
        "landmarks": ["steep pavilion roof", "Gothic dormers", "capped chimneys", "loggia balcony", "side conservatory"],
    }
    spec["viewEvidence"] = [{
        "id": "full-object",
        "view": "three-quarter street corner",
        "imageRegion": {"x": 0, "y": 0, "width": 1, "height": 1, "units": "normalized"},
        "observations": [
            "Near-square pavilion rises clearly above both wings.",
            "Tall blue-gray truncated hip roof carries paired stone-gabled dormers and finial.",
            "Warm brick fields are divided by buff-stone belts, surrounds, and shallow quoins.",
            "North loggia and side conservatory break the otherwise repeated bay grid.",
        ],
        "confidence": 0.94,
    }]

    # id, name, level, role, parent, material, local feature, primary, secondary, class
    definitions = [
        ("mansion-root", "Gerry Mansion parcel rig", "macro", "static landmark root", None, "brick", "parcel-envelope", "#c98b6e", "#ad7058", "stone"),
        ("pavilion-walls", "Dominant square corner pavilion", "macro", "primary masonry mass", "mansion-root", "brick", "shallow-corner-quoins", "#c98b6e", "#b7785f", "stone"),
        ("pavilion-roof", "Tall pavilion chateau roof", "macro", "skyline-defining roof", "pavilion-walls", "slate", "steep-truncated-hip", "#3c4650", "#56606a", "stone"),
        ("street-wings", "Stepped lower street wings", "macro", "secondary masonry masses", "mansion-root", "brick", "stepped-cornice-heights", "#c98b6e", "#b7785f", "stone"),
        ("north-loggia", "North arch loggia", "macro", "primary facade focal assembly", "street-wings", "limestone", "recessed-arch-balcony", "#d9cbb1", "#baa98e", "stone"),
        ("conservatory", "Side iron and glass conservatory", "macro", "projecting side entrance", "street-wings", "iron", "mullion-grid", "#20282a", "#56666b", "metal"),
        ("foundations", "Rusticated masonry foundation", "macro", "continuous building base", "mansion-root", "foundation", "rusticated-plinth", "#827c73", "#a59b8c", "stone"),
        ("skyline-ornament", "Roofline ornament ensemble", "macro", "silhouette accents", "mansion-root", "slate", "broken-roofline", "#3c4650", "#d9cbb1", "stone"),
        ("west-wing", "Lower Fifth Avenue wing", "meso", "side wing shell", "street-wings", "brick", "compressed-west-wing", "#c48769", "#ad7058", "stone"),
        ("north-wing", "Lower East 61st Street wing", "meso", "front wing shell", "street-wings", "brick", "compressed-north-wing", "#c48769", "#ad7058", "stone"),
        ("pavilion-cornice", "Layered pavilion cornice and belts", "meso", "horizontal hierarchy", "pavilion-walls", "limestone", "layered-belts", "#d9cbb1", "#bfae92", "stone"),
        ("main-dormers", "Large Gothic pavilion dormers", "meso", "roof openings", "pavilion-roof", "limestone", "gabled-pinnacle-frame", "#d9cbb1", "#bfae92", "stone"),
        ("chimneys", "Tall capped brick chimneys", "meso", "roof silhouette accents", "skyline-ornament", "brick", "two-tier-caps", "#c0785e", "#d9cbb1", "stone"),
        ("ground-openings", "Round-headed ground openings", "meso", "base opening system", "foundations", "limestone", "round-head-surrounds", "#d9cbb1", "#263b44", "stone"),
        ("upper-windows", "Tall upper sash windows", "meso", "upper opening system", "pavilion-walls", "limestone", "stepped-sash-surrounds", "#d9cbb1", "#263b44", "stone"),
        ("wing-dormers", "Lower wing wall dormers", "meso", "wing roof openings", "street-wings", "limestone", "gabled-wing-dormers", "#d9cbb1", "#3c4650", "stone"),
        ("wing-cornices", "Wing belt and cornice courses", "meso", "wing horizontal hierarchy", "street-wings", "limestone", "stepped-wing-cornices", "#d9cbb1", "#bfae92", "stone"),
        ("roof-curb", "Pavilion roof curb and crown", "meso", "roof termination", "pavilion-roof", "limestone", "stone-roof-curb", "#d9cbb1", "#3c4650", "stone"),
        ("loggia-arch", "Deep monumental loggia arch", "meso", "focal arch surround", "north-loggia", "limestone", "deep-arch-reveal", "#d9cbb1", "#2d2420", "stone"),
        ("loggia-balcony", "Projecting loggia balcony", "meso", "balcony assembly", "north-loggia", "limestone", "projecting-balcony", "#d9cbb1", "#20282a", "stone"),
        ("conservatory-base", "Conservatory masonry base", "meso", "attached plinth", "conservatory", "foundation", "attached-masonry-base", "#827c73", "#a59b8c", "stone"),
        ("conservatory-glazing", "Conservatory transparent shell", "meso", "glazed enclosure", "conservatory", "glass", "transparent-panel-grid", "#354d57", "#78909a", "glass"),
        ("conservatory-roof", "Low conservatory roof", "meso", "shallow metal hip", "conservatory", "iron", "shallow-faceted-roof", "#20282a", "#56666b", "metal"),
        ("entrance-portals", "Street entrance portals", "meso", "door and arch assembly", "ground-openings", "limestone", "recessed-period-doors", "#d9cbb1", "#3a2b24", "stone"),
        ("side-returns", "Visible side return facade", "meso", "corner depth shell", "pavilion-walls", "brick", "wrapped-bay-rhythm", "#c98b6e", "#ad7058", "stone"),
        ("finial", "Pavilion crown finial", "meso", "top silhouette marker", "pavilion-roof", "iron", "cross-and-spire", "#20282a", "#d9cbb1", "metal"),
        ("wing-roofs", "Broken lower slate roofs", "meso", "stepped roof shells", "street-wings", "slate", "overlapping-low-roofs", "#3c4650", "#56606a", "stone"),
        ("quoin-system", "Alternating shallow corner quoins", "meso", "corner masonry dressing", "pavilion-walls", "limestone", "restrained-quoin-cadence", "#d9cbb1", "#bfae92", "stone"),
        ("dormer-pinnacles", "Dormer pinnacle pairs", "micro", "repeated roof ornament", "main-dormers", "limestone", "paired-stone-pinnacles", "#d9cbb1", "#bfae92", "stone"),
        ("dormer-windows", "Dormer sash inserts", "micro", "repeated roof glazing", "main-dormers", "glass", "narrow-dormer-sashes", "#263b44", "#52666f", "glass"),
        ("chimney-caps", "Layered chimney cap blocks", "micro", "repeated chimney termination", "chimneys", "limestone", "double-cap-projection", "#d9cbb1", "#bfae92", "stone"),
        ("window-sashes", "Shared dark sash crosses", "micro", "repeated window linework", "upper-windows", "iron", "thin-sash-crosses", "#20282a", "#354d57", "metal"),
        ("archivolt-crowns", "Low-segment stone archivolts", "micro", "repeated arch crowns", "ground-openings", "limestone", "twelve-segment-arch-ring", "#d9cbb1", "#bfae92", "stone"),
        ("balcony-balusters", "Short balcony baluster row", "micro", "repeated balcony supports", "loggia-balcony", "limestone", "instanced-baluster-row", "#d9cbb1", "#bfae92", "stone"),
        ("conservatory-mullions", "Thin conservatory mullions", "micro", "repeated iron grid", "conservatory-glazing", "iron", "instanced-mullion-grid", "#20282a", "#56666b", "metal"),
        ("iron-areaway", "Low street areaway rail", "micro", "street-edge ironwork", "foundations", "iron", "period-areaway-rail", "#20282a", "#56666b", "metal"),
        ("cornice-layers", "Nested stone cornice slabs", "micro", "repeated horizontal relief", "pavilion-cornice", "limestone", "three-shallow-projections", "#d9cbb1", "#bfae92", "stone"),
        ("brick-joint-relief", "Brick mortar relief", "micro", "material surface relief", "pavilion-walls", "brick", "world-scale-mortar-normal", "#c98b6e", "#ad7058", "stone"),
    ]
    components = [component(*definition) for definition in definitions]
    for item in components:
        item["colorMaterialRecipe"]["dominantAlbedo"] = as_rgba(item["colorMaterialRecipe"]["dominantAlbedo"])
        item["colorMaterialRecipe"]["secondaryAlbedo"] = as_rgba(item["colorMaterialRecipe"]["secondaryAlbedo"])
        if item["parent"]:
            item["attachment"] = attachment(item["parent"])
        if item["id"] == "pavilion-roof":
            item["primitive"] = "extrude"
            item["topologyRationale"] = "A low-segment closed frustum provides the steep four-plane roof and small crown plateau with twelve triangles."
        elif "arch" in item["id"]:
            item["primitive"] = "extrude"
            item["topologyRationale"] = "A twelve-segment planar arch ring changes the opening silhouette and is cheaper than boolean masonry cuts."
        elif item["id"] == "conservatory-glazing":
            item["primitive"] = "plane-card"
            item["topologyClass"] = "conforming-shell"
            item["topologyRationale"] = "Thin transparent panes conform to the supporting mullion enclosure and do not need solid volume."
        elif item["id"] == "brick-joint-relief":
            item["primitive"] = "plane-card"
            item["topologyClass"] = "material-only"
            item["topologyRationale"] = "Mortar-scale relief is supplied by independent albedo, normal, and roughness maps and does not alter the silhouette."
    spec["componentTree"] = components

    materials = [
        material("brick", "Warm red-orange brick", "#c98b6e", "#ad7058", 0.91, 0.0, "warm-matte-field"),
        material("limestone", "Buff limestone trim", "#d9cbb1", "#bfae92", 0.86, 0.0, "buff-matte-trim"),
        material("slate", "Blue-gray slate", "#3c4650", "#56606a", 0.78, 0.02, "subtle-tile-relief"),
        material("foundation", "Darker rusticated base stone", "#827c73", "#a59b8c", 0.92, 0.0, "base-weathering"),
        material("glass", "Dark period glazing", "#354d57", "#78909a", 0.32, 0.0, "panel-depth"),
        material("iron", "Painted architectural iron", "#20282a", "#56666b", 0.54, 0.72, "dark-painted-metal"),
    ]
    for mat in materials:
        mat["qualityTier"] = "gameplay-landmark"
    spec["materials"] = materials
    spec["repetitionSystems"] = [
        {"id": "upper-window-grid", "componentRef": "upper-windows", "distribution": "Two pavilion rows plus compressed wing rows", "geometry": "shared four-piece surround, pane, and sash", "instances": 24, "buildsGeometry": True, "realization": "instanced-geometry"},
        {"id": "ground-arch-grid", "componentRef": "ground-openings", "distribution": "Both street-facing base elevations", "geometry": "shared twelve-segment fan and crown with straight jambs", "instances": 13, "buildsGeometry": True, "realization": "instanced-geometry"},
        {"id": "quoin-cadence", "componentRef": "quoin-system", "distribution": "True pavilion corners only", "geometry": "alternating shallow stone blocks", "instances": 24, "buildsGeometry": True, "realization": "instanced-geometry"},
        {"id": "gothic-dormer-set", "componentRef": "main-dormers", "distribution": "Two major dormers per visible pavilion roof face plus smaller wing gables", "geometry": "shared gable, sash, and pinnacle boxes", "instances": 8, "buildsGeometry": True, "realization": "instanced-geometry"},
        {"id": "chimney-set", "componentRef": "chimneys", "distribution": "Asymmetric roof-edge positions", "geometry": "shared brick stack and two shallow cap blocks", "instances": 5, "buildsGeometry": True, "realization": "instanced-geometry"},
        {"id": "fine-iron-and-balusters", "componentRef": "conservatory-mullions", "distribution": "Conservatory, balcony, and areaway", "geometry": "shared thin box rails and balusters", "instances": 42, "buildsGeometry": True, "realization": "instanced-geometry"},
    ]
    spec["lookDevTargets"]["qualityPriority"] = "performance-balanced-reference-fidelity"
    extract = spec["lookDevTargets"]["materialPass"]["referencePbrExtraction"]
    extract["requiredWhenSourceImagePresent"] = False
    extract["stopOnLowConfidence"] = False
    extract["acceptedLimitation"] = "Target is a stylized renderer output; use the game's independent facade PBR maps and document that limitation."
    spec["performanceBudget"] = {
        "qualityPriority": "performance-balanced-reference-fidelity",
        "targetTriangles": 12000,
        "maxDrawCalls": 20,
        "textureSize": 1024,
        "fpsTarget": 60,
        "optimizationPolicy": "Keep one coarse collider, share six materials, instance all repeated windows/arches/stone/iron, and add custom geometry only for the 12-triangle pavilion roof and shared gables.",
    }
    spec["lodPlan"] = [
        {"tier": "near", "distance": 0, "strategy": "full instanced landmark detail"},
        {"tier": "mid", "distance": 45, "strategy": "same batches; small silhouette-stable parts naturally subpixel"},
        {"tier": "far", "distance": 95, "strategy": "district view relies on shell and roof silhouette; decorative shadow casting remains disabled"},
    ]
    spec["lightingFromPhoto"] = [
        "The existing game sun is the directional key light and the sky/environment provides fill and rim.",
        "Existing ACES exposure and blue sky background are retained so material comparisons reflect actual gameplay.",
        "Macro shells and roofs cast; small instanced facade dressing receives light without separate decorative shadow maps.",
        "World contact shadows and AO provide recess depth at arches, cornices, and the conservatory base.",
    ]
    spec["risks"] = [
        "A low or broad pavilion roof will recreate the current apartment-block silhouette.",
        "Oversized quoins or window surrounds will become white teeth under direct sun.",
        "Transparent conservatory panels can overdraw; keep the enclosure shallow and panel count low.",
        "Decorative meshes must remain in shared instanced batches to protect draw-call and shadow budgets.",
    ]
    spec["featureReviewTargets"] = [
        {"id": "pavilion-silhouette", "name": "Dominant pavilion and tall truncated roof", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["pavilion-walls", "pavilion-roof"], "evidenceRefs": ["full-object"]},
        {"id": "stepped-wing-hierarchy", "name": "Clearly lower overlapping street wings", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["street-wings", "wing-roofs"], "evidenceRefs": ["full-object"]},
        {"id": "gothic-roofline", "name": "Stone-gabled dormers, chimneys, and finial", "tier": "critical", "passIds": ["form-refinement"], "minimumScore": 0.78, "mustPass": True, "componentRefs": ["main-dormers", "chimneys", "finial"], "evidenceRefs": ["full-object"]},
        {"id": "loggia-conservatory", "name": "Recessed loggia and attached conservatory", "tier": "critical", "passIds": ["form-refinement"], "minimumScore": 0.75, "mustPass": True, "componentRefs": ["north-loggia", "conservatory"], "evidenceRefs": ["full-object"]},
        {"id": "material-readability", "name": "Warm brick, buff stone, slate, glass, and iron separation", "tier": "important", "passIds": ["material-pass", "surface-pass"], "minimumScore": 0.7, "mustPass": False, "componentRefs": ["pavilion-walls", "pavilion-roof", "conservatory"], "evidenceRefs": ["full-object"]},
    ]
    for build_pass in spec["buildPasses"]:
        build_pass["componentRefs"] = [component["id"] for component in components if component["level"] == "macro"]
    SPEC.write_text(json.dumps(spec, indent=2) + "\n")


if __name__ == "__main__":
    main()

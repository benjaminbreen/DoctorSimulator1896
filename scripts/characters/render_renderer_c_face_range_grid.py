"""Render an eight-face Renderer C diversity gate.

This is a geometry/presentation test, not a runtime export. It deliberately
holds age and sex presentation close while varying coordinated facial regions.
"""

import argparse
import json
import os
import sys

import bpy


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import generate_patient as common
import generate_renderer_c as renderer_c
import prove_renderer_c_identity_transfer as proof
import render_mpfb_identity_diversity as identity_gate


PIPELINE = "renderer-c-eight-face-range-v1"


ANCHORS = (
    {
        "id": "01-aquiline-narrow",
        "race": (1.0, 0.0, 0.0),
        "headShape": "oval",
        "brow": "eyebrow001.mhclo",
        "lashes": "eyelashes01.mhclo",
        "eyeColor": "#7a9aac",
        "skin": "young_caucasian_female.mhmat",
        "gnmDonor": 4,
        "gnmStrength": 0.46,
        "values": {
            "headWidth": -0.18, "faceHeight": 0.16, "headDepth": 0.04,
            "jawWidth": -0.16, "chinHeight": 0.02, "chinProminence": 0.00,
            "noseWidth": -0.14, "noseLength": 0.48, "noseDepth": 0.44,
            "noseBridge": 0.38, "noseCurve": 0.36, "noseHump": 0.28,
            "noseTipAngle": -0.18, "noseWidthUpper": -0.10,
            "noseWidthMiddle": -0.16, "noseWidthLower": -0.08,
            "eyeSize": -0.10, "eyeSpacing": -0.06, "eyeDepth": 0.18,
            "eyeHeightInner": 0.10, "eyeHeightOuter": -0.12,
            "mouthWidth": -0.08, "lipFullness": -0.10, "cupidBow": 0.22,
            "cheekVolume": -0.10, "cheekboneProminence": 0.25,
            "foreheadHeight": 0.16, "browAngle": 0.14,
        },
    },
    {
        "id": "02-soft-round",
        "race": (0.90, 0.0, 0.10),
        "headShape": "round",
        "brow": "eyebrow004.mhclo",
        "lashes": "eyelashes03.mhclo",
        "eyeColor": "#628270",
        "skin": "young_caucasian_female2.mhmat",
        "gnmDonor": 7,
        "gnmStrength": 0.34,
        "values": {
            "headWidth": 0.18, "faceHeight": -0.12, "headDepth": 0.12,
            "jawWidth": 0.04, "chinHeight": -0.20, "chinProminence": -0.18,
            "noseWidth": 0.10, "noseLength": -0.28, "noseDepth": -0.20,
            "noseTipAngle": 0.24, "noseCompression": 0.20,
            "noseWidthUpper": 0.02, "noseWidthMiddle": 0.08, "noseWidthLower": 0.16,
            "eyeSize": 0.16, "eyeSpacing": 0.12, "eyeDepth": -0.10,
            "eyeHeightCenter": 0.14, "mouthWidth": 0.12, "lipFullness": 0.20,
            "mouthCornerAngle": 0.08, "cheekVolume": 0.30,
            "cheekboneProminence": -0.12, "cheekInnerVolume": 0.20,
            "foreheadProminence": -0.08, "browAngle": -0.08,
        },
    },
    {
        "id": "03-heart-high-cheek",
        "race": (0.90, 0.10, 0.0),
        "headShape": "invertedtriangular",
        "brow": "eyebrow006.mhclo",
        "lashes": "eyelashes02.mhclo",
        "eyeColor": "#876838",
        "skin": "young_caucasian_female.mhmat",
        "gnmDonor": 1,
        "gnmStrength": 0.40,
        "values": {
            "headWidth": 0.08, "faceHeight": 0.04, "headDepth": -0.05,
            "jawWidth": -0.26, "chinHeight": 0.04, "chinProminence": -0.06,
            "noseWidth": -0.20, "noseLength": 0.08, "noseDepth": 0.02,
            "noseTipWidth": -0.18, "noseFlaring": -0.16,
            "eyeSize": 0.14, "eyeSpacing": -0.08, "eyeDepth": -0.04,
            "eyeHeightOuter": 0.16, "eyeCornerOuter": 0.12,
            "mouthWidth": -0.12, "lipFullness": 0.16, "cupidBowWidth": -0.16,
            "cheekVolume": -0.10, "cheekboneProminence": 0.42,
            "cheekHeight": 0.30, "templeVolume": -0.12,
            "foreheadHeight": 0.12, "browAngle": 0.20,
        },
    },
    {
        "id": "04-broad-straight",
        "race": (0.92, 0.0, 0.08),
        "headShape": "square",
        "brow": "eyebrow008.mhclo",
        "lashes": "eyelashes01.mhclo",
        "eyeColor": "#5d4330",
        "skin": "young_caucasian_female2.mhmat",
        "gnmDonor": 2,
        "gnmStrength": 0.40,
        "values": {
            "headWidth": 0.16, "faceHeight": 0.02, "headDepth": 0.10,
            "jawWidth": 0.12, "chinHeight": -0.10, "chinProminence": 0.02,
            "chinBone": 0.08, "noseWidth": 0.28, "noseLength": 0.06,
            "noseDepth": 0.10, "noseTipWidth": 0.24, "nostrilWidth": 0.26,
            "noseWidthUpper": 0.12, "noseWidthMiddle": 0.28, "noseWidthLower": 0.34,
            "eyeSize": -0.12, "eyeSpacing": 0.18, "eyeDepth": 0.10,
            "eyeHeightCenter": -0.08, "mouthWidth": 0.28, "lipFullness": -0.10,
            "mouthHeight": -0.06, "cheekVolume": 0.08,
            "cheekboneProminence": 0.10, "foreheadProminence": 0.10,
            "browAngle": -0.14,
        },
    },
    {
        "id": "05-deep-set-compact",
        "race": (1.0, 0.0, 0.0),
        "headShape": "rectangular",
        "brow": "eyebrow010.mhclo",
        "lashes": "eyelashes02.mhclo",
        "eyeColor": "#52758f",
        "skin": "young_caucasian_female.mhmat",
        "gnmDonor": 10,
        "gnmStrength": 0.44,
        "values": {
            "headWidth": -0.04, "faceHeight": -0.08, "headDepth": 0.14,
            "jawWidth": 0.00, "chinHeight": -0.14, "chinProminence": -0.04,
            "noseWidth": -0.04, "noseLength": 0.20, "noseDepth": 0.34,
            "noseBridge": 0.42, "noseCurve": 0.10, "noseHump": 0.14,
            "noseCompression": -0.12, "eyeSize": -0.08, "eyeSpacing": -0.14,
            "eyeDepth": 0.34, "eyeFold": 0.24, "eyeFoldVertical": -0.14,
            "browDepth": 0.24, "browHeight": -0.10, "mouthWidth": -0.18,
            "lipFullness": -0.04, "mouthDepth": -0.12,
            "cheekVolume": -0.16, "cheekInnerVolume": -0.14,
            "foreheadProminence": 0.18,
        },
    },
    {
        "id": "06-wide-eyed-delicate",
        "race": (0.90, 0.10, 0.0),
        "headShape": "oval",
        "brow": "eyebrow002.mhclo",
        "lashes": "eyelashes03.mhclo",
        "eyeColor": "#718d66",
        "skin": "young_caucasian_female2.mhmat",
        "gnmDonor": 8,
        "gnmStrength": 0.36,
        "values": {
            "headWidth": -0.10, "faceHeight": 0.10, "headDepth": -0.06,
            "jawWidth": -0.18, "chinHeight": 0.04, "chinProminence": -0.10,
            "noseWidth": -0.24, "noseLength": -0.10, "noseDepth": -0.14,
            "noseTipWidth": -0.22, "noseFlaring": -0.18, "noseTipAngle": 0.12,
            "eyeSize": 0.28, "eyeSpacing": 0.08, "eyeDepth": -0.12,
            "eyeHeightInner": 0.14, "eyeHeightCenter": 0.20, "eyeHeightOuter": 0.14,
            "mouthWidth": 0.04, "lipFullness": 0.20, "upperLipHeight": 0.14,
            "lowerLipHeight": 0.20, "cheekVolume": 0.06,
            "cheekboneProminence": 0.18, "browHeight": 0.14,
        },
    },
    {
        "id": "07-roman-oval",
        "race": (1.0, 0.0, 0.0),
        "headShape": "oval",
        "brow": "eyebrow011.mhclo",
        "lashes": "eyelashes01.mhclo",
        "eyeColor": "#50412f",
        "skin": "young_caucasian_female.mhmat",
        "gnmDonor": 5,
        "gnmStrength": 0.42,
        "values": {
            "headWidth": 0.00, "faceHeight": 0.14, "headDepth": 0.08,
            "jawWidth": 0.02, "chinHeight": 0.00, "chinProminence": 0.06,
            "noseWidth": -0.06, "noseLength": 0.42, "noseDepth": 0.50,
            "noseBridge": 0.48, "noseCurve": 0.22, "noseHump": 0.38,
            "noseTipAngle": -0.20, "septumAngle": -0.16,
            "eyeSize": -0.08, "eyeSpacing": 0.02, "eyeDepth": 0.20,
            "eyeHeightOuter": -0.08, "mouthWidth": 0.08, "lipFullness": 0.02,
            "upperLipHeight": -0.08, "cheekVolume": -0.12,
            "cheekboneProminence": 0.20, "foreheadHeight": 0.12,
            "browAngle": -0.04,
        },
    },
    {
        "id": "08-upturned-square",
        "race": (0.90, 0.05, 0.05),
        "headShape": "square",
        "brow": "eyebrow012.mhclo",
        "lashes": "eyelashes02.mhclo",
        "eyeColor": "#7796a2",
        "skin": "young_caucasian_female2.mhmat",
        "gnmDonor": 11,
        "gnmStrength": 0.38,
        "values": {
            "headWidth": 0.14, "faceHeight": -0.02, "headDepth": 0.04,
            "jawWidth": 0.12, "chinHeight": -0.14, "chinProminence": -0.06,
            "noseWidth": 0.18, "noseLength": -0.18, "noseDepth": -0.10,
            "noseTipAngle": 0.32, "noseBaseHeight": 0.18,
            "nostrilAngle": 0.22, "noseFlaring": 0.16,
            "noseWidthUpper": -0.04, "noseWidthMiddle": 0.10, "noseWidthLower": 0.24,
            "eyeSize": 0.04, "eyeSpacing": -0.10, "eyeDepth": 0.02,
            "eyeHeightOuter": 0.10, "eyeCornerOuter": 0.10,
            "mouthWidth": 0.18, "lipFullness": 0.08,
            "mouthCornerAngle": 0.16, "cupidBowWidth": 0.18,
            "cheekVolume": 0.12, "cheekboneProminence": 0.00,
            "foreheadProminence": -0.08, "browAngle": 0.08,
        },
    },
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--gnm-npz", default=proof.DEFAULT_GNM)
    parser.add_argument("--semantic-diversity", type=float, default=1.65)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def identity_values(anchor):
    structural = {
        name: 0.0
        for name in (
            *identity_gate.PRIMARY_IDS,
            *identity_gate.DETAIL_IDS,
            *identity_gate.EXTRA_SIGNED_TARGETS.keys(),
            *identity_gate.EXTRA_PAIRED_TARGETS.keys(),
        )
    }
    caucasian, asian, african = anchor["race"]
    structural.update({
        "gender": 0.025,
        "age": 0.555,
        "muscle": 0.27,
        "weight": 0.48,
        "proportions": 0.49,
        "height": 0.47,
        "race": {"asian": asian, "caucasian": caucasian, "african": african},
        "headShape": anchor["headShape"],
        "headShapeStrength": 0.34,
        "earShape": "round",
        "earShapeStrength": 0.18,
        "asymTarget": "asym/asym-mouth-1-l.target.gz",
        "asymStrength": 0.025,
        "faceAsymmetry": 0.02,
        "eyeColor": anchor["eyeColor"],
    })
    structural.update(anchor["values"])
    # Guardrail requested for this gate: no long or strongly projected chins.
    structural["chinHeight"] = max(-0.22, min(0.08, structural.get("chinHeight", 0.0)))
    structural["chinProminence"] = max(-0.20, min(0.08, structural.get("chinProminence", 0.0)))
    structural["chinPrognathism"] = max(-0.10, min(0.08, structural.get("chinPrognathism", 0.0)))
    return structural


def add_face(services, anchor, args, output_dir):
    HumanService, TargetService, AssetService, LocationService = services
    values = identity_values(anchor)
    base = HumanService.create_human(macro_detail_dict={
        "gender": values["gender"], "age": values["age"],
        "muscle": values["muscle"], "weight": values["weight"],
        "proportions": values["proportions"], "height": values["height"],
        "cupsize": 0.42, "firmness": 0.48, "race": values["race"],
    })
    base.name = f"Range_{anchor['id']}_Body"
    common.add_face_targets(TargetService, LocationService, base, values)
    identity_gate.add_expanded_targets(TargetService, LocationService, base, values)
    TargetService.bake_targets(base)

    transfer_state = {}
    target_path = os.path.join(output_dir, f"{anchor['id']}-gnm.target")
    transfer_metrics = proof.apply_gnm_transfer(
        base,
        args.gnm_npz,
        anchor["gnmDonor"],
        "semantic",
        args.semantic_diversity,
        "female",
        anchor["gnmStrength"],
        target_path,
        LocationService.get_mpfb_data("targets"),
        "none",
        transfer_state,
    )

    skin_path = common.find_asset(AssetService, anchor["skin"], "skins")
    HumanService.set_character_skin(skin_path, base, skin_type="GAMEENGINE")
    for polygon in base.data.polygons:
        polygon.use_smooth = True

    eyes = renderer_c.add_eyes(HumanService, AssetService, base, values, "consultation")
    brows = renderer_c.add_named_asset(
        HumanService, AssetService, base, "eyebrows", anchor["brow"], "Eyebrows", f"Range_{anchor['id']}_Brows"
    )
    lashes = renderer_c.add_named_asset(
        HumanService, AssetService, base, "eyelashes", anchor["lashes"], "Eyelashes", f"Range_{anchor['id']}_Lashes"
    )
    hair = common.add_authored_hair(HumanService, base)
    garment = renderer_c.add_named_asset(
        HumanService, AssetService, base, "clothes", "female_elegantsuit01.mhclo", "Clothes", f"Range_{anchor['id']}_Garment"
    )
    renderer_c.set_material_override(garment, f"Range_{anchor['id']}_GarmentMaterial", "#183326", 0.84)
    renderer_c.configure_alpha_asset(brows, 0.22, False)
    renderer_c.configure_alpha_asset(lashes, 0.36, False)
    renderer_c.configure_alpha_asset(hair, 0.28, True)
    brow_tints = (
        (0.055, 0.035, 0.025), (0.16, 0.09, 0.045), (0.08, 0.05, 0.03), (0.025, 0.02, 0.018),
        (0.11, 0.065, 0.035), (0.07, 0.045, 0.03), (0.035, 0.025, 0.020), (0.14, 0.08, 0.04),
    )
    identity_gate.tint_materials(brows, brow_tints[int(anchor["id"][:2]) - 1], 0.86)
    identity_gate.tint_materials(lashes, (0.018, 0.012, 0.010), 0.84)
    bpy.context.view_layer.update()
    return base, transfer_metrics, values


def render_face(output_dir, anchor, base, camera):
    bpy.context.scene.render.resolution_x = 420
    bpy.context.scene.render.resolution_y = 500
    proof.place_camera(camera, base, "front")
    path = os.path.join(output_dir, f"{anchor['id']}.png")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    args = arguments()
    output_dir = os.path.abspath(args.output_dir)
    os.makedirs(output_dir, exist_ok=True)
    import bl_ext.user_default.mpfb  # noqa: F401

    services = (
        proof.dynamic_import("mpfb.services.humanservice", "HumanService"),
        proof.dynamic_import("mpfb.services.targetservice", "TargetService"),
        proof.dynamic_import("mpfb.services.assetservice", "AssetService"),
        proof.dynamic_import("mpfb.services.locationservice", "LocationService"),
    )
    entries = []
    for anchor in ANCHORS:
        camera = proof.setup_stage(output_dir)
        base, transfer_metrics, values = add_face(services, anchor, args, output_dir)
        render_path = render_face(output_dir, anchor, base, camera)
        entries.append({
            "id": anchor["id"],
            "render": render_path,
            "race": values["race"],
            "brow": anchor["brow"],
            "eyeColor": anchor["eyeColor"],
            "skin": anchor["skin"],
            "gnm": transfer_metrics,
            "values": anchor["values"],
        })
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump({"pipeline": PIPELINE, "entries": entries}, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"RENDERER_C_FACE_RANGE_OK {manifest_path}")


if __name__ == "__main__":
    main()

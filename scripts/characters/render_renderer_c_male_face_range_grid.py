"""Render eight White male Renderer C faces around age 30.

The gate emphasizes coordinated nose and facial-shape diversity while applying
strict jaw and chin limits. It does not test facial animation.
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


PIPELINE = "renderer-c-eight-male-face-range-v1"


ANCHORS = (
    {
        "id": "01-narrow-aquiline", "headShape": "oval", "donor": 4, "gnmStrength": 0.55,
        "brow": "eyebrow003.mhclo", "hair": "short02.mhclo", "eyeColor": "#6385a0",
        "skin": "young_caucasian_male.mhmat",
        "values": {
            "headWidth": -0.18, "faceHeight": 0.08, "headDepth": 0.02,
            "jawWidth": -0.16, "chinHeight": -0.14, "chinProminence": -0.12,
            "noseWidth": -0.14, "noseLength": 0.48, "noseDepth": 0.46,
            "noseBridge": 0.40, "noseCurve": 0.34, "noseHump": 0.30,
            "noseTipAngle": -0.20, "noseWidthUpper": -0.12,
            "noseWidthMiddle": -0.16, "noseWidthLower": -0.08,
            "eyeSize": -0.12, "eyeSpacing": -0.06, "eyeDepth": 0.20,
            "eyeHeightOuter": -0.10, "mouthWidth": -0.06, "lipFullness": -0.16,
            "cheekVolume": -0.12, "cheekboneProminence": 0.24,
            "foreheadHeight": 0.16, "browAngle": 0.12,
        },
    },
    {
        "id": "02-round-snub", "headShape": "round", "donor": 2, "gnmStrength": 0.52,
        "brow": "eyebrow007.mhclo", "hair": "short02.mhclo", "eyeColor": "#6f8a69",
        "skin": "young_caucasian_male2.mhmat",
        "values": {
            "headWidth": 0.14, "faceHeight": -0.12, "headDepth": 0.12,
            "jawWidth": 0.04, "chinHeight": -0.18, "chinProminence": -0.16,
            "chinBone": -0.10, "noseWidth": 0.12, "noseLength": -0.26,
            "noseDepth": -0.18, "noseTipAngle": 0.24, "noseCompression": 0.22,
            "noseWidthUpper": 0.02, "noseWidthMiddle": 0.10, "noseWidthLower": 0.18,
            "eyeSize": 0.10, "eyeSpacing": 0.10, "eyeDepth": -0.08,
            "mouthWidth": 0.10, "lipFullness": 0.06, "cheekVolume": 0.22,
            "cheekboneProminence": -0.10, "cheekInnerVolume": 0.16,
            "foreheadProminence": -0.08, "browAngle": -0.10,
        },
    },
    {
        "id": "03-broad-straight", "headShape": "square", "donor": 6, "gnmStrength": 0.55,
        "brow": "eyebrow009.mhclo", "hair": "short01.mhclo", "eyeColor": "#594536",
        "skin": "young_caucasian_male.mhmat",
        "values": {
            "headWidth": 0.14, "faceHeight": 0.00, "headDepth": 0.08,
            "jawWidth": 0.08, "chinHeight": -0.12, "chinProminence": -0.06,
            "noseWidth": 0.30, "noseLength": 0.06, "noseDepth": 0.10,
            "noseTipWidth": 0.26, "nostrilWidth": 0.28,
            "noseWidthUpper": 0.14, "noseWidthMiddle": 0.28, "noseWidthLower": 0.34,
            "eyeSize": -0.14, "eyeSpacing": 0.16, "eyeDepth": 0.10,
            "eyeHeightCenter": -0.08, "mouthWidth": 0.24, "lipFullness": -0.16,
            "cheekVolume": 0.04, "cheekboneProminence": 0.10,
            "foreheadProminence": 0.10, "browAngle": -0.14,
        },
    },
    {
        "id": "04-thin-hooked", "headShape": "rectangular", "donor": 1, "gnmStrength": 0.56,
        "brow": "eyebrow011.mhclo", "hair": "short01.mhclo", "eyeColor": "#6a7f8a",
        "skin": "young_caucasian_male2.mhmat",
        "values": {
            "headWidth": -0.08, "faceHeight": 0.16, "headDepth": 0.10,
            "jawWidth": -0.08, "chinHeight": -0.04, "chinProminence": -0.04,
            "noseWidth": -0.18, "noseLength": 0.42, "noseDepth": 0.52,
            "noseBridge": 0.34, "noseCurve": 0.50, "noseHump": 0.44,
            "noseTipAngle": -0.30, "septumAngle": -0.22,
            "noseWidthUpper": -0.18, "noseWidthMiddle": -0.22, "noseWidthLower": -0.10,
            "eyeSize": -0.08, "eyeSpacing": -0.12, "eyeDepth": 0.28,
            "eyeFold": 0.18, "mouthWidth": -0.12, "lipFullness": -0.10,
            "cheekVolume": -0.18, "cheekboneProminence": 0.28,
            "templeVolume": -0.14, "browDepth": 0.20,
        },
    },
    {
        "id": "05-short-upturned", "headShape": "oval", "donor": 7, "gnmStrength": 0.52,
        "brow": "eyebrow004.mhclo", "hair": "short02.mhclo", "eyeColor": "#7a945e",
        "skin": "young_caucasian_male.mhmat",
        "values": {
            "headWidth": 0.02, "faceHeight": -0.06, "headDepth": -0.04,
            "jawWidth": -0.06, "chinHeight": -0.16, "chinProminence": -0.12,
            "noseWidth": 0.08, "noseLength": -0.24, "noseDepth": -0.14,
            "noseTipAngle": 0.34, "noseBaseHeight": 0.20,
            "nostrilAngle": 0.24, "noseFlaring": 0.14,
            "noseWidthUpper": -0.08, "noseWidthMiddle": 0.04, "noseWidthLower": 0.18,
            "eyeSize": 0.08, "eyeSpacing": -0.06, "eyeDepth": -0.04,
            "eyeHeightOuter": 0.10, "mouthWidth": 0.12, "lipFullness": 0.04,
            "mouthCornerAngle": 0.12, "cheekVolume": 0.10,
            "cheekboneProminence": -0.04, "foreheadProminence": -0.08,
        },
    },
    {
        "id": "06-long-greek", "headShape": "oval", "donor": 10, "gnmStrength": 0.56,
        "brow": "eyebrow008.mhclo", "hair": "short02.mhclo", "eyeColor": "#554438",
        "skin": "young_caucasian_male2.mhmat",
        "values": {
            "headWidth": 0.00, "faceHeight": 0.12, "headDepth": 0.06,
            "jawWidth": 0.00, "chinHeight": -0.08, "chinProminence": -0.04,
            "noseWidth": -0.04, "noseLength": 0.48, "noseDepth": 0.44,
            "noseBridge": 0.54, "noseCurve": 0.06, "noseHump": 0.14,
            "noseTipAngle": -0.12, "noseCompression": -0.14,
            "eyeSize": -0.06, "eyeSpacing": 0.02, "eyeDepth": 0.18,
            "eyeHeightInner": -0.06, "mouthWidth": 0.04, "lipFullness": -0.04,
            "upperLipHeight": -0.10, "cheekVolume": -0.08,
            "cheekboneProminence": 0.18, "foreheadHeight": 0.12,
        },
    },
    {
        "id": "07-wide-flared", "headShape": "round", "donor": 11, "gnmStrength": 0.52,
        "brow": "eyebrow012.mhclo", "hair": "short01.mhclo", "eyeColor": "#758fa4",
        "skin": "young_caucasian_male.mhmat",
        "values": {
            "headWidth": 0.10, "faceHeight": -0.04, "headDepth": 0.04,
            "jawWidth": 0.04, "chinHeight": -0.16, "chinProminence": -0.14,
            "chinBone": -0.08, "noseWidth": 0.34, "noseLength": -0.08,
            "noseDepth": 0.02, "noseFlaring": 0.34, "nostrilWidth": 0.36,
            "noseTipWidth": 0.30, "noseWidthUpper": 0.04,
            "noseWidthMiddle": 0.24, "noseWidthLower": 0.40,
            "eyeSize": 0.02, "eyeSpacing": 0.14, "eyeDepth": 0.02,
            "mouthWidth": 0.18, "lipFullness": 0.02,
            "cheekVolume": 0.18, "cheekInnerVolume": 0.10,
            "browAngle": 0.08, "foreheadHeight": -0.08,
        },
    },
    {
        "id": "08-compact-concave", "headShape": "square", "donor": 5, "gnmStrength": 0.50,
        "brow": "eyebrow001.mhclo", "hair": "short01.mhclo", "eyeColor": "#6b846e",
        "skin": "young_caucasian_male2.mhmat",
        "values": {
            "headWidth": 0.08, "faceHeight": -0.10, "headDepth": 0.00,
            "jawWidth": 0.06, "chinHeight": -0.18, "chinProminence": -0.16,
            "chinBone": -0.12, "noseWidth": -0.02, "noseLength": -0.10,
            "noseDepth": -0.22, "noseBridge": -0.20, "noseCurve": -0.30,
            "noseTipAngle": 0.14, "noseCompression": 0.18,
            "eyeSize": 0.04, "eyeSpacing": -0.10, "eyeDepth": -0.12,
            "eyeHeightCenter": 0.08, "mouthWidth": -0.08, "lipFullness": 0.08,
            "cheekVolume": 0.12, "cheekboneProminence": -0.08,
            "foreheadProminence": -0.12, "browHeight": -0.08,
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
    values = {
        name: 0.0
        for name in (
            *identity_gate.PRIMARY_IDS,
            *identity_gate.DETAIL_IDS,
            *identity_gate.EXTRA_SIGNED_TARGETS.keys(),
            *identity_gate.EXTRA_PAIRED_TARGETS.keys(),
        )
    }
    values.update({
        "gender": 0.94, "age": 0.555, "muscle": 0.38, "weight": 0.48,
        "proportions": 0.50, "height": 0.53,
        "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
        "headShape": anchor["headShape"], "headShapeStrength": 0.30,
        "earShape": "round", "earShapeStrength": 0.16,
        "asymTarget": "asym/asym-nose-2-r.target.gz", "asymStrength": 0.025,
        "faceAsymmetry": 0.018, "eyeColor": anchor["eyeColor"],
    })
    values.update(anchor["values"])
    # Male macro targets already enlarge the lower face. Keep the explicit
    # structure inside a restrained envelope instead of using jaw size as the
    # primary source of identity.
    values["jawWidth"] = max(-0.18, min(0.08, values.get("jawWidth", 0.0)))
    values["chinHeight"] = max(-0.20, min(-0.02, values.get("chinHeight", -0.08)))
    values["chinProminence"] = max(-0.18, min(-0.02, values.get("chinProminence", -0.08)))
    values["chinPrognathism"] = max(-0.12, min(0.02, values.get("chinPrognathism", -0.04)))
    return values


def add_face(services, anchor, args, output_dir):
    HumanService, TargetService, AssetService, LocationService = services
    values = identity_values(anchor)
    base = HumanService.create_human(macro_detail_dict={
        "gender": values["gender"], "age": values["age"],
        "muscle": values["muscle"], "weight": values["weight"],
        "proportions": values["proportions"], "height": values["height"],
        "cupsize": 0.30, "firmness": 0.50, "race": values["race"],
    })
    base.name = f"MaleRange_{anchor['id']}_Body"
    common.add_face_targets(TargetService, LocationService, base, values)
    identity_gate.add_expanded_targets(TargetService, LocationService, base, values)
    TargetService.bake_targets(base)

    transfer_state = {}
    target_path = os.path.join(output_dir, f"{anchor['id']}-gnm.target")
    transfer_metrics = proof.apply_gnm_transfer(
        base, args.gnm_npz, anchor["donor"], "semantic", args.semantic_diversity,
        "male", anchor["gnmStrength"], target_path,
        LocationService.get_mpfb_data("targets"), "none", transfer_state,
    )

    skin_path = common.find_asset(AssetService, anchor["skin"], "skins")
    HumanService.set_character_skin(skin_path, base, skin_type="GAMEENGINE")
    for polygon in base.data.polygons:
        polygon.use_smooth = True

    eyes = renderer_c.add_eyes(HumanService, AssetService, base, values, "consultation")
    brows = renderer_c.add_named_asset(
        HumanService, AssetService, base, "eyebrows", anchor["brow"], "Eyebrows", f"MaleRange_{anchor['id']}_Brows"
    )
    lashes = renderer_c.add_named_asset(
        HumanService, AssetService, base, "eyelashes", "eyelashes01.mhclo", "Eyelashes", f"MaleRange_{anchor['id']}_Lashes"
    )
    hair = renderer_c.add_named_asset(
        HumanService, AssetService, base, "hair", anchor["hair"], "Hair", f"MaleRange_{anchor['id']}_Hair"
    )
    garment = renderer_c.add_named_asset(
        HumanService, AssetService, base, "clothes", "male_elegantsuit01.mhclo", "Clothes", f"MaleRange_{anchor['id']}_Garment"
    )
    renderer_c.set_material_override(garment, f"MaleRange_{anchor['id']}_GarmentMaterial", "#202b25", 0.84)
    renderer_c.configure_alpha_asset(brows, 0.22, False)
    renderer_c.configure_alpha_asset(lashes, 0.36, False)
    renderer_c.configure_alpha_asset(hair, 0.28, True)
    brow_tints = (
        (0.045, 0.030, 0.022), (0.10, 0.055, 0.030), (0.025, 0.020, 0.018), (0.075, 0.045, 0.028),
        (0.13, 0.075, 0.038), (0.035, 0.026, 0.020), (0.085, 0.050, 0.028), (0.045, 0.032, 0.024),
    )
    identity_gate.tint_materials(brows, brow_tints[int(anchor["id"][:2]) - 1], 0.88)
    identity_gate.tint_materials(lashes, (0.018, 0.012, 0.010), 0.86)
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
            "id": anchor["id"], "render": render_path,
            "brow": anchor["brow"], "hair": anchor["hair"],
            "eyeColor": anchor["eyeColor"], "skin": anchor["skin"],
            "gnm": transfer_metrics, "values": anchor["values"],
        })
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump({"pipeline": PIPELINE, "entries": entries}, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"RENDERER_C_MALE_FACE_RANGE_OK {manifest_path}")


if __name__ == "__main__":
    main()

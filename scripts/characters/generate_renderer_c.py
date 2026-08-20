"""Build Renderer C: a patient-aware MPFB2 export for Three.js.

Renderer A proved the parametric body and named face-unit path. Renderer C
keeps that foundation but treats fitted eyes, brows, lashes, hair, and skin as
first-class production assets. Identity is baked before any attachment is
fitted, so every exported part shares the same face.
"""

import argparse
import importlib
import json
import math
import os
import random
import sys

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
import generate_patient as common


PIPELINE_VERSION = "renderer-c-mpfb2-v1"
EYE_ASSET_UUID = "2c12f43b-1303-432c-b7ce-d78346baf2e6"


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preset", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--preview")
    parser.add_argument("--lod", choices=("consultation", "nearby", "crowd"), default="consultation")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def dynamic_import(package_suffix, symbol):
    for module_name in list(sys.modules):
        if module_name.endswith(package_suffix):
            module = importlib.import_module(module_name)
            if hasattr(module, symbol):
                return getattr(module, symbol)
    raise RuntimeError(f"MPFB module ending in {package_suffix!r} was not loaded")


def patient_sex(preset, values):
    recorded = str(preset.get("patient", {}).get("identity", {}).get("sex", "")).lower()
    if recorded in ("male", "female"):
        return recorded
    return "male" if float(values.get("gender", 0.0)) >= 0.5 else "female"


def patient_age(preset, values):
    recorded = preset.get("patient", {}).get("identity", {}).get("age")
    if isinstance(recorded, (int, float)):
        return int(recorded)
    return round(18 + float(values.get("age", 0.5)) * 62)


def normalized_race(values):
    weights = {name: max(0.0, float(values.get(name, 0.0))) for name in ("asian", "caucasian", "african")}
    total = sum(weights.values())
    if total <= 0.0001:
        return {"asian": 0.0, "caucasian": 1.0, "african": 0.0}
    return {name: weight / total for name, weight in weights.items()}


def skin_asset_name(preset, values):
    age = patient_age(preset, values)
    age_band = "young" if age < 35 else "middleage" if age < 61 else "old"
    ancestry = max(normalized_race(values), key=normalized_race(values).get)
    return f"{age_band}_{ancestry}_{patient_sex(preset, values)}.mhmat"


def hex_rgb(color):
    value = str(color or "#5b3825").lstrip("#")
    if len(value) != 6:
        value = "5b3825"
    return tuple(int(value[index:index + 2], 16) / 255.0 for index in (0, 2, 4))


def eye_material_name(color):
    target = hex_rgb(color)
    palette = {
        "brown": (0.30, 0.16, 0.08),
        "brownlight": (0.46, 0.30, 0.16),
        "green": (0.27, 0.37, 0.22),
        "grey": (0.36, 0.40, 0.39),
        "bluegreen": (0.24, 0.39, 0.40),
        "blue": (0.19, 0.31, 0.47),
        "lightblue": (0.35, 0.52, 0.65),
        "deepblue": (0.10, 0.20, 0.38),
    }
    return min(palette, key=lambda name: sum((target[i] - palette[name][i]) ** 2 for i in range(3)))


def add_named_asset(HumanService, AssetService, base, directory, filename, asset_type, name, alternatives=None):
    path = common.find_asset(AssetService, filename, directory)
    result = HumanService.add_mhclo_asset(
        path,
        base,
        asset_type=asset_type,
        material_type="GAMEENGINE",
        alternative_materials=alternatives,
    )
    if result is None or not hasattr(result, "name"):
        raise RuntimeError(f"MPFB failed to add {directory}/{filename}")
    result.name = name
    result["renderer_c_role"] = directory.rstrip("s")
    return result


def add_eyes(HumanService, AssetService, base, values, lod):
    eye_filename = "high-poly.mhclo" if lod == "consultation" else "low-poly.mhclo"
    material_name = eye_material_name(values.get("eyeColor"))
    fragment = f"materials/{material_name}.mhmat"
    return add_named_asset(
        HumanService,
        AssetService,
        base,
        "eyes",
        eye_filename,
        "Eyes",
        "Eyes",
        alternatives={EYE_ASSET_UUID: fragment},
    )


def select_face_assets(values, seed):
    rng = random.Random(f"renderer-c-face-assets:{seed}")
    arch = float(values.get("browArch", 0.0))
    density = float(values.get("browDensity", 0.7))
    if arch > 0.32:
        brow_pool = ("eyebrow006", "eyebrow010", "eyebrow012")
    elif density > 0.82:
        brow_pool = ("eyebrow003", "eyebrow007", "eyebrow011")
    else:
        brow_pool = ("eyebrow001", "eyebrow004", "eyebrow008", "eyebrow009")
    brow = rng.choice(brow_pool)
    lash_density = float(values.get("lashDensity", 0.65))
    lash = "eyelashes04" if lash_density > 0.82 else "eyelashes03" if lash_density > 0.62 else "eyelashes02"
    return brow, lash


def add_hair(HumanService, AssetService, base, preset, values):
    sex = patient_sex(preset, values)
    style = str(values.get("hairStyle", "low-bun"))
    if sex == "female" and style not in ("cropped-waves", "short-parted"):
        hair = common.add_authored_hair(HumanService, base)
        hair.name = "RendererC_Hair"
        hair["renderer_c_role"] = "hair"
        hair["renderer_c_hair_source"] = "authored-victorian-low-bun"
        return hair
    male_styles = {
        "cropped-waves": "short02.mhclo",
        "short-parted": "short03.mhclo",
        "pompadour": "short04.mhclo",
    }
    filename = male_styles.get(style, "short01.mhclo")
    hair = add_named_asset(HumanService, AssetService, base, "hair", filename, "Hair", "RendererC_Hair")
    hair["renderer_c_hair_source"] = filename
    return hair


def set_material_override(obj, name, color, roughness):
    override = common.material(name, color, roughness)
    for index in range(len(obj.data.materials)):
        obj.data.materials[index] = override


def configure_alpha_asset(obj, alpha_threshold, casts_shadow):
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = casts_shadow
    for mat in obj.data.materials:
        if not mat:
            continue
        mat.diffuse_color[3] = 1.0
        # Blender 4.2+ replaced blend_method with surface_render_method.
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "DITHERED"
        elif hasattr(mat, "blend_method"):
            mat.blend_method = "HASHED"
        if hasattr(mat, "use_transparency_overlap"):
            mat.use_transparency_overlap = False
        mat["renderer_c_alpha_threshold"] = alpha_threshold


def trim_face_units(base, fitted, keep):
    if keep is None:
        return
    for obj in [base, *fitted]:
        keys = getattr(obj.data, "shape_keys", None)
        if not keys:
            continue
        for key in list(keys.key_blocks)[1:]:
            if key.name not in keep:
                obj.shape_key_remove(key)


def decimate_object(obj, ratio):
    if not obj or obj.type != "MESH" or len(obj.data.polygons) < 300:
        return
    keys = getattr(obj.data, "shape_keys", None)
    if keys:
        for key in list(keys.key_blocks)[1:]:
            obj.shape_key_remove(key)
    modifier = obj.modifiers.new(name="RendererC_CrowdDecimate", type="DECIMATE")
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def export_glb(output, objects):
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj and obj.name in bpy.context.scene.objects:
            obj.hide_set(False)
            obj.hide_render = False
            obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        # The optimizer collapses constant channels to two STEP keyframes.
        # three.js does not re-assert STEP values between keyframes, so the
        # game's procedural gaze deltas accumulate and the head spins.
        export_optimize_animation_size=False,
        export_morph=True,
        export_morph_normal=True,
        export_extras=True,
        export_yup=True,
    )


def main():
    args = arguments()
    with open(args.preset, "r", encoding="utf-8") as handle:
        preset = json.load(handle)
    values = preset["values"]
    seed = int(values.get("seed", preset.get("patient", {}).get("seed", 1)))

    import bl_ext.user_default.mpfb  # noqa: F401

    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")
    AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
    LocationService = dynamic_import("mpfb.services.locationservice", "LocationService")
    ExportService = dynamic_import("mpfb.services.exportservice", "ExportService")
    FaceService = dynamic_import("mpfb.services.faceservice", "FaceService")

    common.clear_scene()
    macro = {
        "gender": values["gender"],
        "age": values["age"],
        "muscle": values["muscle"],
        "weight": values["weight"],
        "proportions": values["proportions"],
        "height": values["height"],
        "cupsize": 0.42,
        "firmness": 0.48,
        "race": normalized_race(values),
    }
    base = HumanService.create_human(macro_detail_dict=macro)
    base.name = "Human_Body"
    base["renderer_c_pipeline"] = PIPELINE_VERSION
    base["renderer_c_lod"] = args.lod
    base["patient_seed"] = int(preset.get("patient", {}).get("seed", seed))
    base["appearance_seed"] = seed

    skin_name = skin_asset_name(preset, values)
    try:
        skin_path = common.find_asset(AssetService, skin_name, "skins")
    except RuntimeError:
        fallback = f"middleage_caucasian_{patient_sex(preset, values)}.mhmat"
        skin_path = common.find_asset(AssetService, fallback, "skins")
    HumanService.set_character_skin(skin_path, base, skin_type="GAMEENGINE")

    common.add_face_targets(TargetService, LocationService, base, values)
    TargetService.bake_targets(base)

    if args.lod != "crowd":
        if not FaceService.is_faceunits01_installed(force_recheck=True):
            raise RuntimeError("Renderer C requires MPFB's official faceunits01 asset pack")
        FaceService.load_targets(
            base,
            load_microsoft_visemes=False,
            load_meta_visemes=False,
            load_arkit_faceunits=True,
        )

    rig = HumanService.add_builtin_rig(base, "game_engine")
    rig.name = "Patient_Rig"
    rig["renderer_c_pipeline"] = PIPELINE_VERSION

    eyes = add_eyes(HumanService, AssetService, base, values, args.lod)
    brow_name, lash_name = select_face_assets(values, seed)
    brows = add_named_asset(HumanService, AssetService, base, "eyebrows", f"{brow_name}.mhclo", "Eyebrows", "Eyebrows")
    lashes = add_named_asset(HumanService, AssetService, base, "eyelashes", f"{lash_name}.mhclo", "Eyelashes", "Eyelashes")
    teeth = add_named_asset(HumanService, AssetService, base, "teeth", "teeth_base.mhclo", "Teeth", "Teeth")
    hair = add_hair(HumanService, AssetService, base, preset, values)

    sex = patient_sex(preset, values)
    garment_name = "male_elegantsuit01.mhclo" if sex == "male" else "female_elegantsuit01.mhclo"
    garment = add_named_asset(HumanService, AssetService, base, "clothes", garment_name, "Clothes", "RendererC_BaseGarment")
    set_material_override(garment, "RendererC_Garment", values["dressColor"], values["fabricRoughness"])
    shoes = add_named_asset(HumanService, AssetService, base, "clothes", "shoes05.mhclo", "Clothes", "RendererC_Shoes")
    set_material_override(shoes, "RendererC_Shoes_Material", "#211713", 0.78)

    fitted = [eyes, brows, lashes, teeth, hair, garment, shoes]
    if args.lod != "crowd":
        FaceService.interpolate_targets(base)
    configure_alpha_asset(brows, 0.22, False)
    configure_alpha_asset(lashes, 0.38, False)
    configure_alpha_asset(hair, 0.28, True)

    if args.lod == "nearby":
        trim_face_units(base, fitted, {
            "eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft", "eyeSquintRight",
            "browInnerUp", "browDownLeft", "browDownRight",
            "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight",
            "jawOpen", "mouthClose", "mouthPucker", "mouthFunnel",
        })

    posed_bones = common.pose_character(rig, values)
    common.create_idle_actions(rig, values, posed_bones)
    ExportService.bake_modifiers_remove_helpers(
        base,
        bake_masks=True,
        bake_subdiv=False,
        remove_helpers=True,
        also_proxy=False,
    )
    if args.lod == "crowd":
        decimate_object(base, 0.34)
        decimate_object(garment, 0.42)
        decimate_object(hair, 0.52)
        decimate_object(shoes, 0.50)

    bpy.context.scene["renderer_c_manifest"] = json.dumps({
        "pipeline": PIPELINE_VERSION,
        "lod": args.lod,
        "patientId": preset.get("id"),
        "patientSeed": preset.get("patient", {}).get("seed", seed),
        "appearanceSeed": seed,
        "skin": skin_name,
        "eyes": "high-poly" if args.lod == "consultation" else "low-poly",
        "eyeMaterial": eye_material_name(values.get("eyeColor")),
        "eyebrows": brow_name,
        "eyelashes": lash_name,
        "hair": hair.get("renderer_c_hair_source", "unknown"),
    }, separators=(",", ":"))
    export_glb(args.output, [base, rig, *fitted])
    if args.preview:
        common.render_preview(args.preview, base)
    print(f"RENDERER_C_OK output={args.output} lod={args.lod} skin={skin_name} hair={hair.name}")


if __name__ == "__main__":
    main()

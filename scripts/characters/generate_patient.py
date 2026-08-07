"""Generate a deterministic, game-ready 1896 patient with MPFB and procedural dress pieces.

Run through `npm run character:generate`. This file intentionally uses only Blender and
MPFB APIs so an agent can revise it without a paid character-generator dependency.
"""

import argparse
import importlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AUTHORED_HAIR_ROOT = os.path.join(
    PROJECT_ROOT,
    "character-lab",
    "assets",
    "makehuman",
    "rehmanpolanski_hair_bun_brown",
)


def dynamic_import(package_suffix, symbol):
    for module_name in list(sys.modules):
        if module_name.endswith(package_suffix):
            module = importlib.import_module(module_name)
            if hasattr(module, symbol):
                return getattr(module, symbol)
    raise RuntimeError(f"MPFB module ending in {package_suffix!r} was not loaded")


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preset", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--preview")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name, color, roughness=0.75, metallic=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    rgba = tuple(int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)) + (1.0,)
    node.inputs["Base Color"].default_value = rgba
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Metallic"].default_value = metallic
    return mat


def find_asset(AssetService, filename, directory):
    path = AssetService.find_asset_absolute_path(filename, asset_subdir=directory)
    if path is None:
        raise RuntimeError(f"Missing {filename}; install the official MakeHuman system assets pack")
    return path


def add_asset(HumanService, AssetService, base, directory, filename, asset_type, object_name):
    path = find_asset(AssetService, filename, directory)
    result = HumanService.add_mhclo_asset(path, base, asset_type=asset_type, material_type="GAMEENGINE")
    # Current MPFB returns the new object, but tolerate API changes by discovering it.
    if result is not None and hasattr(result, "name"):
        result.name = object_name
        return result
    candidates = [obj for obj in bpy.context.scene.objects if obj.get("asset_type") == asset_type]
    if candidates:
        candidates[-1].name = object_name
        return candidates[-1]
    return None


def add_authored_hair(HumanService, base):
    path = os.path.join(AUTHORED_HAIR_ROOT, "rehmanpolanski_hair_bun_brown.mhclo")
    if not os.path.exists(path):
        raise RuntimeError(f"Missing project hair asset: {path}")
    result = HumanService.add_mhclo_asset(
        path,
        base,
        asset_type="Clothes",
        material_type="GAMEENGINE",
    )
    if result is not None and hasattr(result, "name"):
        result.name = "Authored_Hair_Bun"
        return result
    candidates = [obj for obj in bpy.context.scene.objects if obj.get("asset_type") == "Clothes"]
    if candidates:
        candidates[-1].name = "Authored_Hair_Bun"
        return candidates[-1]
    raise RuntimeError("MPFB did not create the authored hair object")


def load_signed_target(TargetService, targets_root, base, parameter_id, value, positive, negative=None):
    if abs(value) < 0.0001:
        return
    relative = positive if value >= 0 or not negative else negative
    full_path = os.path.join(targets_root, relative)
    if not os.path.exists(full_path):
        print(f"WARN target not found: {relative}")
        return
    key = TargetService.load_target(base, full_path, weight=abs(float(value)))
    key.name = parameter_id


def add_face_targets(TargetService, LocationService, base, values):
    root = LocationService.get_mpfb_data("targets")
    mappings = {
        "headWidth": ("head/head-scale-horiz-incr.target.gz", "head/head-scale-horiz-decr.target.gz"),
        "faceHeight": ("head/head-scale-vert-incr.target.gz", "head/head-scale-vert-decr.target.gz"),
        "headDepth": ("head/head-scale-depth-incr.target.gz", "head/head-scale-depth-decr.target.gz"),
        "headAngle": ("head/head-angle-out.target.gz", "head/head-angle-in.target.gz"),
        "headBackDepth": ("head/head-back-scale-depth-incr.target.gz", "head/head-back-scale-depth-decr.target.gz"),
        "noseWidth": ("nose/nose-scale-horiz-incr.target.gz", "nose/nose-scale-horiz-decr.target.gz"),
        "noseLength": ("nose/nose-scale-vert-incr.target.gz", "nose/nose-scale-vert-decr.target.gz"),
        "noseVolume": ("nose/nose-volume-incr.target.gz", "nose/nose-volume-decr.target.gz"),
        "noseDepth": ("nose/nose-scale-depth-incr.target.gz", "nose/nose-scale-depth-decr.target.gz"),
        "noseBridge": ("nose/nose-greek-incr.target.gz", "nose/nose-greek-decr.target.gz"),
        "noseCurve": ("nose/nose-curve-convex.target.gz", "nose/nose-curve-concave.target.gz"),
        "noseTipAngle": ("nose/nose-point-up.target.gz", "nose/nose-point-down.target.gz"),
        "nostrilWidth": ("nose/nose-nostrils-width-incr.target.gz", "nose/nose-nostrils-width-decr.target.gz"),
        "jawWidth": ("chin/chin-width-incr.target.gz", "chin/chin-width-decr.target.gz"),
        "chinHeight": ("chin/chin-height-incr.target.gz", "chin/chin-height-decr.target.gz"),
        "chinProminence": ("chin/chin-prominent-incr.target.gz", "chin/chin-prominent-decr.target.gz"),
        "chinPrognathism": ("chin/chin-prognathism-incr.target.gz", "chin/chin-prognathism-decr.target.gz"),
        "browHeight": ("eyebrows/eyebrows-trans-up.target.gz", "eyebrows/eyebrows-trans-down.target.gz"),
        "browAngle": ("eyebrows/eyebrows-angle-up.target.gz", "eyebrows/eyebrows-angle-down.target.gz"),
        "mouthWidth": ("mouth/mouth-scale-horiz-incr.target.gz", "mouth/mouth-scale-horiz-decr.target.gz"),
        "mouthVerticalPosition": ("mouth/mouth-trans-up.target.gz", "mouth/mouth-trans-down.target.gz"),
        "mouthDepth": ("mouth/mouth-scale-depth-incr.target.gz", "mouth/mouth-scale-depth-decr.target.gz"),
        "cupidBow": ("mouth/mouth-cupidsbow-incr.target.gz", "mouth/mouth-cupidsbow-decr.target.gz"),
        "philtrumVolume": ("mouth/mouth-philtrum-volume-incr.target.gz", "mouth/mouth-philtrum-volume-decr.target.gz"),
        "shoulderWidth": ("torso/measure-shoulder-dist-incr.target.gz", "torso/measure-shoulder-dist-decr.target.gz"),
        "torsoLength": ("torso/measure-napetowaist-dist-incr.target.gz", "torso/measure-napetowaist-dist-decr.target.gz"),
    }
    for parameter_id, targets in mappings.items():
        load_signed_target(TargetService, root, base, parameter_id, values.get(parameter_id, 0), *targets)
    paired = {
        "eyeSize": ("eyes/{side}-eye-scale-incr.target.gz", "eyes/{side}-eye-scale-decr.target.gz"),
        "eyeSpacing": ("eyes/{side}-eye-trans-out.target.gz", "eyes/{side}-eye-trans-in.target.gz"),
        "cheekVolume": ("cheek/{side}-cheek-volume-incr.target.gz", "cheek/{side}-cheek-volume-decr.target.gz"),
        "cheekboneProminence": ("cheek/{side}-cheek-bones-incr.target.gz", "cheek/{side}-cheek-bones-decr.target.gz"),
        "cheekHeight": ("cheek/{side}-cheek-trans-up.target.gz", "cheek/{side}-cheek-trans-down.target.gz"),
        "cheekInnerVolume": ("cheek/{side}-cheek-inner-incr.target.gz", "cheek/{side}-cheek-inner-decr.target.gz"),
        "eyeVerticalPosition": ("eyes/{side}-eye-trans-up.target.gz", "eyes/{side}-eye-trans-down.target.gz"),
        "eyeHeightInner": ("eyes/{side}-eye-height1-incr.target.gz", "eyes/{side}-eye-height1-decr.target.gz"),
        "eyeHeightCenter": ("eyes/{side}-eye-height2-incr.target.gz", "eyes/{side}-eye-height2-decr.target.gz"),
        "eyeHeightOuter": ("eyes/{side}-eye-height3-incr.target.gz", "eyes/{side}-eye-height3-decr.target.gz"),
        "epicanthus": ("eyes/{side}-eye-epicanthus-in.target.gz", "eyes/{side}-eye-epicanthus-out.target.gz"),
        "eyeFold": ("eyes/{side}-eye-eyefold-convex.target.gz", "eyes/{side}-eye-eyefold-concave.target.gz"),
    }
    for parameter_id, templates in paired.items():
        for side in ("l", "r"):
            load_signed_target(TargetService, root, base, f"{parameter_id}_{side.upper()}", values.get(parameter_id, 0), *(template.format(side=side) for template in templates))
    eye_depth = values.get("eyeDepth", 0)
    for side in ("l", "r"):
        for region in ("push1", "push2"):
            load_signed_target(
                TargetService, root, base, f"eyeDepth_{side.upper()}_{region}", eye_depth,
                f"eyes/{side}-eye-{region}-out.target.gz", f"eyes/{side}-eye-{region}-in.target.gz"
            )
    asymmetry = values.get("faceAsymmetry", 0)
    load_signed_target(TargetService, root, base, "faceAsymmetry", asymmetry, "asym/asym-cheek-1-r.target.gz")
    lip_value = values.get("lipFullness", 0)
    for lip in ("upperlip", "lowerlip"):
        load_signed_target(
            TargetService, root, base, f"lipFullness_{lip}", lip_value,
            f"mouth/mouth-{lip}-volume-incr.target.gz", f"mouth/mouth-{lip}-volume-decr.target.gz"
        )
    head_shape = values.get("headShape", "oval")
    shape_path = os.path.join(root, "head", f"head-{head_shape}.target.gz")
    if os.path.exists(shape_path):
        TargetService.load_target(base, shape_path, weight=values.get("headShapeStrength", 0.45), name="headShape")


def pose_character(rig, values):
    # The game-engine rig uses local bone coordinates. Angles chosen empirically from
    # contact sheets; unkeyed pose bones do not survive GLB clip playback, so every
    # bone posed here is also keyed inside each exported action (see stash note).
    seated = values.get("seated", 0) >= 0.5
    pose = {
        "upperarm_l": (math.radians(12 if seated else 0), math.radians(70), 0),
        "upperarm_r": (math.radians(12 if seated else 0), math.radians(-70), 0),
        "lowerarm_l": (math.radians(46 if seated else 0), math.radians(8), math.radians(7)),
        "lowerarm_r": (math.radians(46 if seated else 0), math.radians(-8), math.radians(-7)),
        "head": (0, values.get("headTurn", 0), values.get("headTilt", 0)),
        "spine_03": (math.radians(values.get("posture", 0) * -3), 0, 0),
    }
    if seated:
        pose.update({
            # Y here is bone twist (no visible effect); knee adduction is applied
            # at runtime by the viewer's kneesTogether control on local Z.
            "thigh_l": (math.radians(-80), 0, 0),
            "thigh_r": (math.radians(-80), 0, 0),
            "calf_l": (math.radians(72), 0, 0),
            "calf_r": (math.radians(72), 0, 0),
            "foot_l": (math.radians(8), 0, 0),
            "foot_r": (math.radians(8), 0, 0),
            "spine_01": (math.radians(-4), 0, 0),
        })
    posed = []
    for name, angles in pose.items():
        bone = rig.pose.bones.get(name)
        if bone:
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = angles
            posed.append(name)
        else:
            print(f"WARN pose bone not found: {name}")
    if seated:
        # Align the finalized pelvis to the chair. Body height and proportions
        # change its position, so a fixed rig offset makes some seeds sink.
        bpy.context.view_layer.update()
        pelvis = rig.pose.bones.get("pelvis")
        if pelvis:
            pelvis_world_z = (rig.matrix_world @ pelvis.head).z
            rig.location.z += 0.455 - pelvis_world_z
    bpy.context.view_layer.update()
    return posed


def author_idle_action(rig, values, posed_bones, name, breath_scale, fidget_scale):
    """Author one looping performance. Every statically posed bone is keyed too, so the
    seated pose survives clip playback in Three.js (unkeyed bones revert to bind pose)."""
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    animated = ["spine_02", "spine_03", "neck_01", "head", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"]
    base = {}
    for bone_name in set(animated + posed_bones):
        bone = rig.pose.bones.get(bone_name)
        if bone:
            bone.rotation_mode = "XYZ"
            base[bone_name] = bone.rotation_euler.copy()

    breath_amount = (0.45 + values.get("breathing", 0.22) * 0.8) * breath_scale
    fidget_amount = (0.35 + values.get("fidget", 0.1) * 1.4) * fidget_scale
    keys = [
        (1, 0.0, 0.0),
        (25, 1.0, 0.25),
        (49, 0.0, 0.75),
        (73, -0.72, -0.35),
        (97, 0.0, 0.0),
    ]
    for frame, breath, fidget in keys:
        offsets = {
            "spine_02": (0.006 * breath * breath_amount, 0.002 * fidget, 0.002 * fidget),
            "spine_03": (-0.010 * breath * breath_amount, -0.003 * fidget, 0.0035 * fidget),
            "neck_01": (0.002 * breath, 0.003 * fidget, -0.002 * fidget),
            "head": (-0.003 * breath, 0.010 * fidget * fidget_amount, -0.007 * fidget * fidget_amount),
            "lowerarm_l": (0.003 * fidget, -0.004 * fidget, 0.008 * fidget * fidget_amount),
            "lowerarm_r": (-0.002 * fidget, 0.004 * fidget, -0.006 * fidget * fidget_amount),
            "hand_l": (0.003 * fidget, 0.002 * fidget, 0.010 * fidget * fidget_amount),
            "hand_r": (-0.002 * fidget, -0.002 * fidget, -0.008 * fidget * fidget_amount),
        }
        for bone_name, original in base.items():
            bone = rig.pose.bones[bone_name]
            delta = offsets.get(bone_name, (0, 0, 0))
            bone.rotation_euler = tuple(original[index] + delta[index] for index in range(3))
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)
    for bone_name, original in base.items():
        rig.pose.bones[bone_name].rotation_euler = original
    if hasattr(action, "fcurves"):
        for curve in action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = "BEZIER"
    return action


def create_idle_actions(rig, values, posed_bones):
    """Two clips, stashed as NLA tracks so the glTF exporter emits both."""
    rig.animation_data_create()
    clips = [
        author_idle_action(rig, values, posed_bones, "ClinicIdle", 1.0, 1.0),
        author_idle_action(rig, values, posed_bones, "RestlessIdle", 1.35, 2.6),
    ]
    rig.animation_data.action = None
    for action in clips:
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, int(action.frame_range[0]), action)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 97
    bpy.context.scene.frame_set(1)
    return clips


def export_glb(output, objects=None):
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = objects or list(bpy.context.scene.objects)
    for obj in export_objects:
        if obj and obj.name in bpy.context.scene.objects:
            obj.hide_set(False)
            obj.hide_render = False
            obj.select_set(True)
    if export_objects:
        bpy.context.view_layer.objects.active = export_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_morph=True,
        export_morph_normal=True,
        export_yup=True,
    )


def render_preview(path, base):
    if not path:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    floor_mat = material("Preview floor", "#201811", 0.95)
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    floor = bpy.context.object
    floor.data.materials.append(floor_mat)
    chair_mat = material("Preview chair", "#241505", 0.85)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.10, 0.42))
    seat = bpy.context.object
    seat.scale = (0.27, 0.24, 0.03)
    seat.data.materials.append(chair_mat)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.30, 0.75))
    back = bpy.context.object
    back.scale = (0.27, 0.03, 0.36)
    back.data.materials.append(chair_mat)
    bpy.ops.object.camera_add(location=(2.25, -3.5, 1.55))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    direction = Vector((0, 0, 0.92)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58
    bpy.ops.object.light_add(type="AREA", location=(-1.8, -2.4, 3.0))
    key = bpy.context.object
    key.data.energy = 260
    key.data.shape = "DISK"
    key.data.size = 2.2
    key.data.color = (1.0, 0.67, 0.36)
    key.rotation_euler = (math.radians(25), 0, math.radians(-28))
    bpy.ops.object.light_add(type="AREA", location=(2.2, -0.4, 2.2))
    fill = bpy.context.object
    fill.data.energy = 125
    fill.data.size = 2.5
    fill.data.color = (0.45, 0.62, 1.0)
    world = bpy.context.scene.world or bpy.data.worlds.new("Preview World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.008, 0.005, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.08
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.wm.save_as_mainfile(filepath=path.replace("-contact-sheet.png", ".blend"))
    bpy.ops.render.render(write_still=True)


def main():
    args = arguments()
    with open(args.preset, "r", encoding="utf-8") as handle:
        preset = json.load(handle)
    values = preset["values"]
    import bl_ext.user_default.mpfb  # noqa: F401  (loads the Blender extension)
    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")
    AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
    LocationService = dynamic_import("mpfb.services.locationservice", "LocationService")
    ExportService = dynamic_import("mpfb.services.exportservice", "ExportService")
    FaceService = dynamic_import("mpfb.services.faceservice", "FaceService")
    clear_scene()
    race = {name: max(0.0, float(values.get(name, 0.0))) for name in ("asian", "caucasian", "african")}
    race_total = sum(race.values())
    if race_total <= 0.0001:
        race = {"asian": 0.0, "caucasian": 1.0, "african": 0.0}
    else:
        race = {name: weight / race_total for name, weight in race.items()}
    macro = {
        "gender": values["gender"], "age": values["age"], "muscle": values["muscle"],
        "weight": values["weight"], "proportions": values["proportions"], "height": values["height"],
        "cupsize": 0.42, "firmness": 0.48,
        "race": race,
    }
    base = HumanService.create_human(macro_detail_dict=macro)
    base.name = "Human_Body"
    skin_path = find_asset(AssetService, "middleage_caucasian_female.mhmat", "skins")
    HumanService.set_character_skin(skin_path, base, skin_type="GAMEENGINE")
    add_face_targets(TargetService, LocationService, base, values)
    # Identity is finalized before fitting the rig, eyes, teeth, hair proxies,
    # and garments. This prevents runtime skin-only morphs from pulling the
    # face away from its attachments.
    TargetService.bake_targets(base)
    if not FaceService.is_faceunits01_installed(force_recheck=True):
        raise RuntimeError(
            "Missing faceunits01; install the official MPFB face-units asset pack "
            "before generating characters"
        )
    FaceService.load_targets(
        base,
        load_microsoft_visemes=False,
        load_meta_visemes=False,
        load_arkit_faceunits=True,
    )
    rig = HumanService.add_builtin_rig(base, "game_engine")
    rig.name = "Patient_Rig"
    add_asset(HumanService, AssetService, base, "eyes", "low-poly.mhclo", "Eyes", "Eyes")
    add_asset(HumanService, AssetService, base, "eyebrows", "eyebrow001.mhclo", "Eyebrows", "Eyebrows")
    add_asset(HumanService, AssetService, base, "eyelashes", "eyelashes01.mhclo", "Eyelashes", "Eyelashes")
    add_asset(HumanService, AssetService, base, "teeth", "teeth_base.mhclo", "Teeth", "Teeth")
    authored_hair = add_authored_hair(HumanService, base)
    garment = add_asset(HumanService, AssetService, base, "clothes", "female_elegantsuit01.mhclo", "Clothes", "Dress_Bodice")
    if garment:
        dress_override = material("Dress_1896_Base", values["dressColor"], values["fabricRoughness"])
        for index in range(len(garment.data.materials)):
            garment.data.materials[index] = dress_override
    shoes = add_asset(HumanService, AssetService, base, "clothes", "shoes05.mhclo", "Clothes", "Shoes")
    if shoes:
        shoe_mat = material("Shoes_1896", "#211713", 0.78)
        for index in range(len(shoes.data.materials)):
            shoes.data.materials[index] = shoe_mat
    # Keep every fitted facial object coordinated with the basemesh.
    FaceService.interpolate_targets(base)
    posed_bones = pose_character(rig, values)
    create_idle_actions(rig, values, posed_bones)
    # The viewport mask must be physically baked for GLB. Keeping it as a modifier
    # exports MPFB's helper/joint surfaces, which occlude the real skin in Three.js.
    ExportService.bake_modifiers_remove_helpers(
        base, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=False
    )
    bpy.context.scene["character_lab_preset"] = json.dumps(preset, separators=(",", ":"))
    shared_objects = [rig, *[obj for obj in (authored_hair, garment, shoes) if obj]]
    for object_name in ("Eyes", "Eyebrows", "Eyelashes", "Teeth"):
        found = bpy.data.objects.get(object_name)
        if found:
            shared_objects.append(found)
    export_glb(args.output, [base, *shared_objects])
    render_preview(args.preview, base)
    print(
        f"CHARACTER_LAB_OK output={args.output} objects={len(bpy.context.scene.objects)}"
    )


if __name__ == "__main__":
    main()

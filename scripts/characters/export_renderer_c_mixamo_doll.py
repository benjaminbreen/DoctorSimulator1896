"""Export the canonical Renderer C male doll for Mixamo.

The doll uses the same neutral male MPFB body and native Mixamo skeleton as
Renderer C. It intentionally omits face morphs, helpers, hair, eyes and clothes
so Mixamo receives one simple skinned mesh with an unambiguous human rig.
"""

import argparse
import hashlib
import json
import os
import sys

import bpy
from mathutils import Vector


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import generate_patient as common
import generate_renderer_c_master as renderer_c_master
import prove_renderer_c_identity_transfer as proof


PIPELINE = "renderer-c-mixamo-doll-v1"
EXPECTED_BONES = (
    "mixamorig:Hips",
    "mixamorig:Spine",
    "mixamorig:Spine1",
    "mixamorig:Spine2",
    "mixamorig:Neck",
    "mixamorig:Head",
    "mixamorig:LeftShoulder",
    "mixamorig:LeftArm",
    "mixamorig:LeftForeArm",
    "mixamorig:LeftHand",
    "mixamorig:RightShoulder",
    "mixamorig:RightArm",
    "mixamorig:RightForeArm",
    "mixamorig:RightHand",
    "mixamorig:LeftUpLeg",
    "mixamorig:LeftLeg",
    "mixamorig:LeftFoot",
    "mixamorig:LeftToeBase",
    "mixamorig:RightUpLeg",
    "mixamorig:RightLeg",
    "mixamorig:RightFoot",
    "mixamorig:RightToeBase",
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def services():
    return (
        proof.dynamic_import("mpfb.services.humanservice", "HumanService"),
        proof.dynamic_import("mpfb.services.targetservice", "TargetService"),
        proof.dynamic_import("mpfb.services.assetservice", "AssetService"),
        proof.dynamic_import("mpfb.services.locationservice", "LocationService"),
        proof.dynamic_import("mpfb.services.faceservice", "FaceService"),
        proof.dynamic_import("mpfb.services.exportservice", "ExportService"),
    )


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def object_bounds(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = [min(corner[axis] for corner in corners) for axis in range(3)]
    maximum = [max(corner[axis] for corner in corners) for axis in range(3)]
    return {
        "min": [round(value, 6) for value in minimum],
        "max": [round(value, 6) for value in maximum],
        "size": [round(maximum[axis] - minimum[axis], 6) for axis in range(3)],
    }


def validate_doll(body, rig):
    if body.type != "MESH" or rig.type != "ARMATURE":
        raise RuntimeError("Reduced doll must contain one mesh and one armature")
    if body.parent != rig:
        raise RuntimeError("Reduced doll body is not parented to its rig")
    if body.data.shape_keys is not None:
        raise RuntimeError("Reduced doll still has shape keys")
    armature_modifiers = [modifier for modifier in body.modifiers if modifier.type == "ARMATURE"]
    if len(armature_modifiers) != 1 or armature_modifiers[0].object != rig:
        raise RuntimeError("Reduced doll does not have exactly one valid armature modifier")

    bone_names = {bone.name for bone in rig.data.bones}
    missing_bones = sorted(set(EXPECTED_BONES) - bone_names)
    if missing_bones:
        raise RuntimeError(f"Reduced doll is missing Mixamo bones: {missing_bones}")
    extra_vertex_groups = sorted(group.name for group in body.vertex_groups if group.name not in bone_names)
    if extra_vertex_groups:
        raise RuntimeError(f"Reduced doll still has non-skeleton vertex groups: {extra_vertex_groups}")

    weighted_vertices = sum(1 for vertex in body.data.vertices if vertex.groups)
    if weighted_vertices != len(body.data.vertices):
        raise RuntimeError(
            f"Reduced doll has {len(body.data.vertices) - weighted_vertices} unweighted vertices"
        )
    if len(body.data.vertices) < 1000 or len(body.data.polygons) < 1000:
        raise RuntimeError("Reduced doll body was unexpectedly reduced to an invalid mesh")

    bounds = object_bounds(body)
    if bounds["size"][2] < 1.0 or bounds["size"][2] > 2.5:
        raise RuntimeError(f"Reduced doll height is implausible: {bounds['size'][2]} m")

    return {
        "vertices": len(body.data.vertices),
        "polygons": len(body.data.polygons),
        "bones": len(rig.data.bones),
        "deformBones": sum(1 for bone in rig.data.bones if bone.use_deform),
        "vertexGroups": len(body.vertex_groups),
        "weightedVertices": weighted_vertices,
        "boundsMeters": bounds,
    }


def create_reduced_doll():
    mpfb_services = services()
    HumanService = mpfb_services[0]
    definition = renderer_c_master.cohort_definition("men")
    neutral = renderer_c_master.neutral_values(definition)

    common.clear_scene()
    source_body = renderer_c_master.make_endpoint(
        mpfb_services,
        definition,
        neutral,
        "RendererC_Male_Mixamo_SourceBody",
    )
    for polygon in source_body.data.polygons:
        polygon.use_smooth = True
    source_rig = HumanService.add_builtin_rig(source_body, "mixamo")
    source_rig.name = "RendererC_Male_Mixamo_SourceRig"
    source_body["renderer_c_pipeline"] = renderer_c_master.PIPELINE
    source_rig["renderer_c_pipeline"] = renderer_c_master.PIPELINE

    before = set(bpy.data.objects)
    activate(source_body)
    # The MPFB button normally opens Blender's FBX dialog after creating the
    # doll. Headless builds export below with explicit, repeatable settings.
    bpy.context.scene.MPFB_ANIO_call_fbx = False
    result = bpy.ops.mpfb.reduced_doll()
    if "FINISHED" not in result:
        raise RuntimeError(f"MPFB reduced-doll operation failed: {result}")

    created = set(bpy.data.objects) - before
    bodies = [obj for obj in created if obj.type == "MESH"]
    rigs = [obj for obj in created if obj.type == "ARMATURE"]
    if len(bodies) != 1 or len(rigs) != 1:
        raise RuntimeError(
            f"MPFB reduced-doll operation created {len(bodies)} meshes and {len(rigs)} armatures"
        )
    body, rig = bodies[0], rigs[0]
    body.name = "RendererC_Male_Doll_Body"
    body.data.name = "RendererC_Male_Doll_Mesh"
    rig.name = "RendererC_Male_Doll_Rig"
    rig.data.name = "RendererC_Male_Doll_Skeleton"
    body["renderer_c_pipeline"] = PIPELINE
    body["renderer_c_cohort"] = "men"
    rig["renderer_c_pipeline"] = PIPELINE
    rig["renderer_c_cohort"] = "men"
    if rig.animation_data:
        rig.animation_data_clear()

    # MPFB's body carries mask and authoring groups that are useful in Blender
    # but are not bones. Remove them so the FBX contains only skinning groups.
    bone_names = {bone.name for bone in rig.data.bones}
    for group in list(body.vertex_groups):
        if group.name not in bone_names:
            body.vertex_groups.remove(group)

    bpy.data.objects.remove(source_body, do_unlink=True)
    bpy.data.objects.remove(source_rig, do_unlink=True)
    bpy.context.view_layer.update()
    return body, rig, definition, neutral


def export_fbx(output, body, rig):
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.fbx(
        filepath=output,
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        use_space_transform=True,
        bake_space_transform=False,
        axis_forward="-Z",
        axis_up="Y",
        use_mesh_modifiers=True,
        use_mesh_modifiers_render=True,
        mesh_smooth_type="FACE",
        use_subsurf=False,
        use_armature_deform_only=True,
        add_leaf_bones=False,
        armature_nodetype="NULL",
        bake_anim=False,
        path_mode="AUTO",
        embed_textures=False,
    )


def validate_round_trip(output):
    common.clear_scene()
    bpy.ops.import_scene.fbx(filepath=output, automatic_bone_orientation=True)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(meshes) != 1 or len(rigs) != 1:
        raise RuntimeError(f"FBX round trip produced {len(meshes)} meshes and {len(rigs)} armatures")
    body, rig = meshes[0], rigs[0]
    armature_modifiers = [modifier for modifier in body.modifiers if modifier.type == "ARMATURE"]
    if len(armature_modifiers) != 1 or armature_modifiers[0].object != rig:
        raise RuntimeError("FBX round trip lost the body-to-rig binding")
    bone_names = {bone.name for bone in rig.data.bones}
    missing_bones = sorted(set(EXPECTED_BONES) - bone_names)
    if missing_bones:
        raise RuntimeError(f"FBX round trip lost Mixamo bones: {missing_bones}")
    return {
        "meshes": len(meshes),
        "armatures": len(rigs),
        "vertices": len(body.data.vertices),
        "polygons": len(body.data.polygons),
        "bones": len(rig.data.bones),
        "boundsMeters": object_bounds(body),
    }


def main():
    args = arguments()
    output = os.path.abspath(args.output)
    manifest_path = os.path.abspath(args.manifest)
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)

    import bl_ext.user_default.mpfb  # noqa: F401

    body, rig, definition, neutral = create_reduced_doll()
    source_facts = validate_doll(body, rig)
    export_fbx(output, body, rig)
    round_trip = validate_round_trip(output)
    with open(output, "rb") as handle:
        checksum = hashlib.sha256(handle.read()).hexdigest()

    manifest = {
        "pipeline": PIPELINE,
        "purpose": "Upload this exact reduced doll to Mixamo for Renderer C male animations",
        "cohort": "men",
        "sex": definition["sex"],
        "rig": "mpfb-mixamo",
        "bodyParameters": renderer_c_master.macro(neutral, definition),
        "source": source_facts,
        "roundTrip": round_trip,
        "fbx": {
            "filename": os.path.basename(output),
            "bytes": os.path.getsize(output),
            "sha256": checksum,
            "axisForward": "-Z",
            "axisUp": "Y",
            "unit": "meter",
            "animation": False,
        },
        "mixamoDownload": {
            "format": "FBX Binary",
            "skin": "Without Skin",
            "framesPerSecond": 30,
            "keyframeReduction": "None",
        },
    }
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(
        "RENDERER_C_MIXAMO_DOLL_OK "
        f"output={output} vertices={source_facts['vertices']} bones={source_facts['bones']}"
    )


if __name__ == "__main__":
    main()

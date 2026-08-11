"""Create a strict T-pose Renderer C fitting avatar for Marvelous Designer.

The production character keeps its original Mixamo bind pose. This derivative
FBX exists only for pattern construction and cloth simulation in MD; finished
garments are transferred back to the production skeleton in Blender.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector


ARM_CHAINS = {
    "left": (
        "mixamorig:LeftArm",
        "mixamorig:LeftForeArm",
        "mixamorig:LeftHand",
    ),
    "right": (
        "mixamorig:RightArm",
        "mixamorig:RightForeArm",
        "mixamorig:RightHand",
    ),
}


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def rotate_pose_bone_to_direction(rig, bone_name, target_direction):
    pose_bone = rig.pose.bones[bone_name]
    current_direction = (pose_bone.tail - pose_bone.head).normalized()
    target = Vector(target_direction).normalized()
    correction = current_direction.rotation_difference(target)
    pivot = pose_bone.head.copy()
    pose_bone.matrix = (
        Matrix.Translation(pivot)
        @ correction.to_matrix().to_4x4()
        @ Matrix.Translation(-pivot)
        @ pose_bone.matrix
    )
    bpy.context.view_layer.update()


def apply_strict_t_pose(body, rig):
    rig.data.pose_position = "POSE"
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"

    for bone_name in ARM_CHAINS["left"]:
        rotate_pose_bone_to_direction(rig, bone_name, (1.0, 0.0, 0.0))
    for bone_name in ARM_CHAINS["right"]:
        rotate_pose_bone_to_direction(rig, bone_name, (-1.0, 0.0, 0.0))

    # Capture the visibly deformed T-pose surface before changing the rig's
    # rest matrices. Blender's pose-as-rest operator otherwise preserves the
    # old A-pose surface by changing the mesh-to-bone bind matrices.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated_body = body.evaluated_get(depsgraph)
    t_pose_mesh = bpy.data.meshes.new_from_object(
        evaluated_body,
        preserve_all_data_layers=True,
        depsgraph=depsgraph,
    )
    t_pose_mesh.name = "RendererC_Male_MD_Fitting_Mesh"

    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    old_mesh = body.data
    body.data = t_pose_mesh
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    bpy.context.view_layer.update()


def validate_t_pose(rig):
    report = {}
    for side, chain in ARM_CHAINS.items():
        expected_sign = 1.0 if side == "left" else -1.0
        report[side] = []
        for bone_name in chain:
            bone = rig.data.bones[bone_name]
            direction = (bone.tail_local - bone.head_local).normalized()
            angle = math.degrees(direction.angle(Vector((expected_sign, 0.0, 0.0))))
            report[side].append(
                {
                    "bone": bone_name,
                    "direction": [round(value, 6) for value in direction],
                    "horizontalErrorDegrees": round(angle, 6),
                }
            )
            if angle > 0.25:
                raise RuntimeError(f"{bone_name} is not horizontal after T-pose conversion: {angle}")
    return report


def export_fbx(path, body, rig):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.fbx(
        filepath=path,
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
        mesh_smooth_type="FACE",
        use_subsurf=False,
        use_armature_deform_only=True,
        add_leaf_bones=False,
        armature_nodetype="NULL",
        bake_anim=False,
        path_mode="AUTO",
        embed_textures=False,
    )


def main():
    args = arguments()
    source = os.path.abspath(args.source)
    output = os.path.abspath(args.output)
    manifest_path = os.path.abspath(args.manifest)

    clear_scene()
    bpy.ops.import_scene.fbx(filepath=source, automatic_bone_orientation=False)
    bodies = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(bodies) != 1 or len(rigs) != 1:
        raise RuntimeError(f"Expected one body and one rig, got {len(bodies)} and {len(rigs)}")
    body, rig = bodies[0], rigs[0]
    if rig.animation_data:
        rig.animation_data_clear()

    apply_strict_t_pose(body, rig)
    pose_report = validate_t_pose(rig)
    body.name = "RendererC_Male_MD_Fitting_Body"
    rig.name = "RendererC_Male_MD_Fitting_Rig"
    body["renderer_c_pipeline"] = "renderer-c-md-fitting-avatar-v1"
    rig["renderer_c_pipeline"] = "renderer-c-md-fitting-avatar-v1"
    export_fbx(output, body, rig)

    with open(output, "rb") as handle:
        checksum = hashlib.sha256(handle.read()).hexdigest()
    manifest = {
        "pipeline": "renderer-c-md-fitting-avatar-v1",
        "purpose": "Marvelous Designer pattern fitting only; not a runtime character",
        "source": source,
        "output": output,
        "sha256": checksum,
        "bytes": os.path.getsize(output),
        "arms": pose_report,
    }
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"RENDERER_C_MD_AVATAR_OK output={output}")


if __name__ == "__main__":
    main()

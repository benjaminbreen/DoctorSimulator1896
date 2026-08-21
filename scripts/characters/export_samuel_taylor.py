"""Build Samuel Taylor from one Mixamo skin and a small seated motion set.

Same workflow as export_nora_byrne.py: copy Mixamo's animation channels
directly and correct only the upper-arm bind-pose difference. The master
FBX's own embedded idle is transferred as ClinicIdle by importing the
master a second time as a clip source.
"""

import argparse
import math
import os
import sys

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import tripo_face_shapes as face_shapes


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SOURCE_DIR = os.path.join(ROOT, "assets", "source", "samuel-taylor")
MASTER = "1896 Mixed Race Typesetter 1896 Skinned Idle.fbx"
CLIPS = (
    ("Sitting Idle.fbx", "ClinicIdle"),
    (MASTER, "StandingIdle"),
    ("Sitting Disbelief.fbx", "SittingDisbelief"),
    ("Sitting to Crying Bent Over to Sitting.fbx", "SittingCrying"),
    ("Sitting Galvanic Shock to Head.fbx", "SittingGalvanicShock"),
)
# The galvanic shock is a deliberate violent jerk; the default head-step gate
# would reject it.
HEAD_STEP_LIMITS = {"SittingGalvanicShock": 0.35}
HIPS = "mixamorig:Hips"
CHECK_BONES = (
    "mixamorig:Head",
    "mixamorig:LeftHand",
    "mixamorig:RightHand",
    "mixamorig:LeftFoot",
    "mixamorig:RightFoot",
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_fbx(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(
        filepath=os.path.abspath(path),
        use_anim=True,
        automatic_bone_orientation=False,
    )
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    rigs = [obj for obj in imported if obj.type == "ARMATURE"]
    if len(rigs) != 1:
        raise RuntimeError(f"{os.path.basename(path)}: expected one armature")
    return rigs[0], imported


def bone_contract(rig):
    return {
        bone.name: bone.parent.name if bone.parent else None
        for bone in rig.data.bones
    }


def remove_objects(objects):
    for obj in objects:
        if obj.name in bpy.context.scene.objects:
            bpy.data.objects.remove(obj, do_unlink=True)


def transfer_clip(target, target_contract, path, name):
    source, imported = import_fbx(path)
    source_action = source.animation_data.action if source.animation_data else None
    if not source_action:
        raise RuntimeError(f"{os.path.basename(path)} has no animation")
    # Generic Mixamo clips ship a reduced skeleton without finger chains.
    # Accept any subset whose parentage matches; absent bones are keyed to
    # rest below so the mixer still asserts every bone each frame.
    source_contract = bone_contract(source)
    for bone_name, parent in source_contract.items():
        if bone_name not in target_contract or target_contract[bone_name] != parent:
            raise RuntimeError(f"{os.path.basename(path)} does not match the typesetter's rig")

    action = source_action.copy()
    action.name = name
    action.use_fake_user = True
    target.animation_data_create()
    target.animation_data.action = action
    if action.slots:
        target.animation_data.action_slot = action.slots[0]
    alignment = (
        target.data.bones[HIPS].matrix_local
        @ source.data.bones[HIPS].matrix_local.inverted()
    )

    frame_start, frame_end = map(lambda value: int(round(value)), source_action.frame_range)
    arm_names = ("mixamorig:LeftArm", "mixamorig:RightArm")
    # Animation-only Mixamo downloads carry a different armature-object frame
    # than the skinned master, so the copied root channels play the figure
    # pitched over. Re-express the hips through the object-frame difference.
    world_fix = target.matrix_world.inverted() @ source.matrix_world
    for frame in range(frame_start, frame_end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        desired_rotations = {
            bone_name: (
                alignment @ source.pose.bones[bone_name].matrix
            ).to_quaternion()
            for bone_name in arm_names
        }
        desired_hips = world_fix @ source.pose.bones[HIPS].matrix
        for bone_name in arm_names:
            bone = target.pose.bones[bone_name]
            desired = desired_rotations[bone_name].to_matrix().to_4x4()
            desired.translation = bone.matrix.translation
            bone.matrix = desired
        hips_bone = target.pose.bones[HIPS]
        hips_bone.matrix = desired_hips
        bpy.context.view_layer.update()
        for bone_name in arm_names:
            bone = target.pose.bones[bone_name]
            bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
        hips_bone.keyframe_insert("rotation_quaternion", frame=frame, group=hips_bone.name)
        hips_bone.keyframe_insert("location", frame=frame, group=hips_bone.name)

    for bone_name in target_contract:
        if bone_name in source_contract:
            continue
        bone = target.pose.bones[bone_name]
        bone.matrix_basis.identity()
        for frame in (frame_start, frame_end):
            bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)

    target.animation_data.action = None
    source.animation_data_clear()
    remove_objects(imported)
    if source_action.name in bpy.data.actions:
        bpy.data.actions.remove(source_action)
    print(f"SAMUEL_ACTION_OK name={name} frames={frame_start}-{frame_end}")
    return action


def validate_action(rig, action):
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]
    start, end = map(lambda value: int(round(value)), action.frame_range)
    head_step_limit = HEAD_STEP_LIMITS.get(action.name, 0.15)
    previous_head = None
    maximum_head_step = 0.0
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        hips = (rig.matrix_world @ rig.pose.bones[HIPS].matrix).translation
        head = (rig.matrix_world @ rig.pose.bones["mixamorig:Head"].matrix).translation
        feet = [
            (rig.matrix_world @ rig.pose.bones[name].matrix).translation
            for name in ("mixamorig:LeftFoot", "mixamorig:RightFoot")
        ]
        if (head - hips).length < 0.18:
            raise RuntimeError(f"{action.name}: torso has collapsed")
        if any((hips - foot).length < 0.22 for foot in feet):
            raise RuntimeError(f"{action.name}: a leg has collapsed")
        for name in CHECK_BONES:
            point = (rig.matrix_world @ rig.pose.bones[name].matrix).translation
            if not all(math.isfinite(value) for value in point):
                raise RuntimeError(f"{action.name}: {name} has a non-finite pose")
            if (point - hips).length > 1.65:
                raise RuntimeError(f"{action.name}: {name} is implausibly far from the hips")
        if previous_head is not None:
            maximum_head_step = max(maximum_head_step, (head - previous_head).length)
        previous_head = head.copy()
    if maximum_head_step > head_step_limit:
        raise RuntimeError(
            f"{action.name}: one-frame head jump is {maximum_head_step:.3f}m"
        )
    rig.animation_data.action = None
    print(
        f"SAMUEL_ACTION_VALID name={action.name} "
        f"max_head_step={maximum_head_step:.4f}"
    )


def make_materials_opaque(meshes):
    for mesh in meshes:
        for polygon in mesh.data.polygons:
            polygon.use_smooth = True
        for slot in mesh.material_slots:
            material = slot.material
            if not material:
                continue
            material.diffuse_color[3] = 1
            material.surface_render_method = "DITHERED"
            if not material.use_nodes:
                continue
            for node in material.node_tree.nodes:
                if node.type != "BSDF_PRINCIPLED":
                    continue
                alpha = node.inputs.get("Alpha")
                if alpha:
                    for link in list(alpha.links):
                        material.node_tree.links.remove(link)
                    alpha.default_value = 1


def stash_actions(rig, actions):
    rig.animation_data_create()
    rig.animation_data.action = None
    for action in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(round(action.frame_range[0])), action)
        if action.slots:
            strip.action_slot = action.slots[0]
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]


def main():
    args = arguments()
    source_dir = os.path.abspath(args.source_dir)
    output = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    clear_scene()
    bpy.context.scene.render.fps = 30

    rig, imported = import_fbx(os.path.join(source_dir, MASTER))
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes or any(
        not any(mod.type == "ARMATURE" for mod in mesh.modifiers) for mesh in meshes
    ):
        raise RuntimeError("The typesetter master must contain skinned meshes only")
    rig.name = "SamuelTaylorRig"
    for index, mesh in enumerate(meshes):
        mesh.name = "SamuelTaylor" if index == 0 else f"SamuelTaylor_{index + 1:02d}"
    target_contract = bone_contract(rig)

    master_action = rig.animation_data.action if rig.animation_data else None
    rig.animation_data_clear()
    if master_action:
        bpy.data.actions.remove(master_action)
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()

    actions = [
        transfer_clip(
            rig,
            target_contract,
            os.path.join(source_dir, filename),
            name,
        )
        for filename, name in CLIPS
    ]
    for action in actions:
        validate_action(rig, action)
    stash_actions(rig, actions)
    make_materials_opaque(meshes)
    face_frame = face_shapes.build_face_shapes(meshes[0], rig)
    if os.environ.get("FACE_DEBUG"):
        face_shapes.render_debug(meshes[0], rig, face_frame, os.environ["FACE_DEBUG"])
    if os.environ.get("FACE_SHEET"):
        face_shapes.render_expression_sheet(meshes[0], rig, face_frame, os.environ["FACE_SHEET"])

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(int(round(action.frame_range[1])) for action in actions)
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in imported:
        if obj.name in bpy.context.scene.objects:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        # The optimizer writes constant channels as STEP, which the game's
        # mixer does not re-assert between keyframes; see retarget notes.
        export_optimize_animation_size=False,
        export_frame_range=False,
        export_nla_strips=True,
        export_skins=True,
        export_morph=True,
        export_yup=True,
    )
    print(
        f"SAMUEL_EXPORT_OK output={output} bones={len(rig.data.bones)} "
        f"clips={','.join(action.name for action in actions)}"
    )


if __name__ == "__main__":
    main()

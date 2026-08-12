"""Combine the approved Mixamo consultation motions into one web GLB.

The source downloads contain an armature and animation but no mesh. A tiny
hidden skinned triangle keeps the skeleton explicit for Three.js retargeting.
"""

import argparse
import os
import sys

import bpy


CLIPS = (
    ("Sit To Stand.fbx", "MixamoSitToStand"),
    ("Sitting Idle.fbx", "MixamoSittingIdle"),
    ("Sitting-2.fbx", "MixamoSittingStill"),
    ("Stand To Sit.fbx", "MixamoStandToSit"),
    ("Walking-2.fbx", "MixamoWalk"),
    ("Walking With Shopping Bag.fbx", "MixamoWalkWithBag"),
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--clip",
        action="append",
        default=[],
        metavar="FILE=NAME",
        help="Override the consultation clip list with one repeatable source/name pair",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Remove net horizontal hips travel while preserving vertical motion",
    )
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def imported_armature(previous_objects):
    candidates = [
        obj for obj in bpy.context.scene.objects
        if obj not in previous_objects and obj.type == "ARMATURE"
    ]
    if len(candidates) != 1:
        raise RuntimeError(f"Expected one imported armature, found {len(candidates)}")
    return candidates[0]


def import_clip(path, clip_name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(
        filepath=path,
        use_anim=True,
        automatic_bone_orientation=False,
    )
    armature = imported_armature(before)
    action = armature.animation_data.action if armature.animation_data else None
    if not action:
        raise RuntimeError(f"{os.path.basename(path)} has no animation action")
    action.name = clip_name
    action.use_fake_user = True
    return armature, action, [obj for obj in bpy.context.scene.objects if obj not in before]


def remove_imported_objects(objects):
    for obj in objects:
        if obj.name in bpy.context.scene.objects:
            bpy.data.objects.remove(obj, do_unlink=True)


def add_skeleton_carrier(armature, hips_name):
    mesh = bpy.data.meshes.new("MixamoSkeletonCarrier")
    mesh.from_pydata(((0, 0, 0), (0.01, 0, 0), (0, 0.01, 0)), (), ((0, 1, 2),))
    mesh.update()
    carrier = bpy.data.objects.new("MixamoSkeletonCarrier", mesh)
    bpy.context.collection.objects.link(carrier)
    group = carrier.vertex_groups.new(name=hips_name)
    group.add((0, 1, 2), 1.0, "REPLACE")
    modifier = carrier.modifiers.new(name="MixamoArmature", type="ARMATURE")
    modifier.object = armature
    carrier.parent = armature
    carrier.hide_render = True
    carrier["motion_source_only"] = True
    return carrier


def stash_actions(armature, actions):
    armature.animation_data_create()
    armature.animation_data.action = None
    for action in actions:
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]


def parse_clips(values):
    if not values:
        return CLIPS
    clips = []
    for value in values:
        filename, separator, name = value.partition("=")
        if not separator or not filename.strip() or not name.strip():
            raise RuntimeError(f"Invalid --clip value {value!r}; expected FILE=NAME")
        clips.append((filename.strip(), name.strip()))
    return tuple(clips)


def remove_planar_drift(armature, action):
    """Make a Mixamo action end at its starting x/y root position.

    Imported Mixamo armatures are rotated into Blender, so hips x/y are the
    ground plane and z is vertical. Removing only the linear net drift keeps
    the fall and rise intact while allowing separate clips to share one actor
    anchor without a metre-wide snap between them.
    """
    hips = next(
        (bone for bone in armature.pose.bones if bone.name.lower().endswith("hips")),
        None,
    )
    if not hips:
        raise RuntimeError(f"{action.name} has no Mixamo hips bone")
    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = map(int, action.frame_range)
    bpy.context.scene.frame_set(start)
    bpy.context.view_layer.update()
    start_location = hips.location.copy()
    bpy.context.scene.frame_set(end)
    bpy.context.view_layer.update()
    drift = hips.location - start_location
    drift.z = 0.0
    span = max(1, end - start)
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        hips.location -= drift * ((frame - start) / span)
        hips.keyframe_insert("location", frame=frame, group=hips.name)
    armature.animation_data.action = None
    print(
        f"MIXAMO_IN_PLACE name={action.name} "
        f"drift={tuple(round(value, 5) for value in drift)}"
    )


def main():
    args = arguments()
    source_dir = os.path.abspath(args.source_dir)
    output = os.path.abspath(args.output)
    clips = parse_clips(args.clip)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    clear_scene()

    primary = None
    bone_names = None
    actions = []
    for filename, clip_name in clips:
        path = os.path.join(source_dir, filename)
        if not os.path.exists(path):
            raise RuntimeError(f"Missing Mixamo source: {path}")
        armature, action, imported = import_clip(path, clip_name)
        current_bones = tuple(bone.name for bone in armature.data.bones)
        if primary is None:
            primary = armature
            primary.name = "MixamoMotionRig"
            bone_names = current_bones
        else:
            if current_bones != bone_names:
                raise RuntimeError(f"{filename} uses a different Mixamo skeleton")
            if args.in_place:
                remove_planar_drift(armature, action)
            remove_imported_objects(imported)
        if primary is armature and args.in_place:
            remove_planar_drift(armature, action)
        actions.append(action)

    primary.animation_data_clear()
    stash_actions(primary, actions)
    carrier = add_skeleton_carrier(primary, "mixamorig:Hips")
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(int(action.frame_range[1]) for action in actions)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    primary.select_set(True)
    carrier.select_set(True)
    bpy.context.view_layer.objects.active = primary
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_skins=True,
        export_yup=True,
    )
    print(
        "MIXAMO_MOTIONS_OK "
        f"output={output} bones={len(bone_names)} "
        f"clips={','.join(action.name for action in actions)}"
    )


if __name__ == "__main__":
    main()

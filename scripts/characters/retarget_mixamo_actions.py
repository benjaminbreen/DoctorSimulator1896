"""Bake exact-doll Mixamo FBX actions onto Renderer C's MPFB rig.

The source FBXs were downloaded without skin after uploading the canonical
Renderer C male doll. MPFB's own Map Mixamo operation therefore has matching
bone names and a matching rest skeleton on both sides.
"""

import math
import os

import bpy


MOTION_SOURCES = (
    ("Sitting Idle Hands on Knees.fbx", "ClinicIdle"),
    ("Sitting Talking.fbx", "SittingTalking"),
    ("Sitting Striking Knee.fbx", "SittingKneeStrike"),
    ("Sitting Dejected.fbx", "SittingDejected"),
    ("Sitting Talking Legs Crossed.fbx", "SittingTalkingLegsCrossed"),
    ("Standing To Sitting.fbx", "SitDown"),
    ("Sitting To Standing.fbx", "StandUp"),
    ("Standing Idle.fbx", "StandingIdle"),
    ("Walking Standard.fbx", "Walk"),
    ("Standing Up from Lying Down.fbx", "RiseFromFloor"),
)


def _mixamo_suffix(name):
    return name.split(":", 1)[-1].lower()


def _import_source(path):
    before = set(bpy.context.scene.objects)
    # MPFB's documented workflow explicitly enables automatic bone
    # orientation when importing a Mixamo animation-only FBX.
    bpy.ops.import_scene.fbx(
        filepath=path,
        use_anim=True,
        automatic_bone_orientation=True,
    )
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    armatures = [obj for obj in imported if obj.type == "ARMATURE"]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one Mixamo armature in {path}, found {len(armatures)}")
    if meshes:
        raise RuntimeError(f"Mixamo source must be downloaded without skin: {path}")
    source = armatures[0]
    action = source.animation_data.action if source.animation_data else None
    if not action:
        raise RuntimeError(f"Mixamo source has no action: {path}")
    return source, action, imported


def _remove_imported(imported):
    for obj in imported:
        if obj.name not in bpy.context.scene.objects:
            continue
        obj_type = obj.type
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and getattr(data, "users", 1) == 0:
            if obj_type == "ARMATURE":
                bpy.data.armatures.remove(data)
            elif obj_type == "MESH":
                bpy.data.meshes.remove(data)


def _clear_pose(rig):
    rig.animation_data_create()
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()


def _pose_bone(rig, suffix):
    return next(
        (bone for bone in rig.pose.bones if _mixamo_suffix(bone.name) == suffix),
        None,
    )


FINGER_PARTS = ("thumb", "index", "middle", "ring", "pinky")


def _is_finger(name):
    suffix = _mixamo_suffix(name)
    return any(part in suffix for part in FINGER_PARTS)


def _map_with_mpfb(target, source):
    """Run MPFB's official Snap to mixamo operation."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    target.hide_set(False)
    source.hide_set(False)
    target.select_set(True)
    source.select_set(True)
    bpy.context.view_layer.objects.active = target
    result = bpy.ops.mpfb.map_mixamo()
    if "FINISHED" not in result:
        raise RuntimeError(f"MPFB Map Mixamo failed: {result}")
    mapped = sum(
        1
        for bone in target.pose.bones
        if any(constraint.type == "COPY_ROTATION" and constraint.target == source for constraint in bone.constraints)
    )
    if mapped != len(target.data.bones):
        raise RuntimeError(f"MPFB mapped {mapped} of {len(target.data.bones)} bones")
    hips = _pose_bone(target, "hips")
    if not hips or not any(
        constraint.type == "COPY_LOCATION" and constraint.target == source
        for constraint in hips.constraints
    ):
        raise RuntimeError("MPFB Map Mixamo did not map hips translation")
    return mapped


def _bake_action(target, source, source_action, name):
    _clear_pose(target)
    source.animation_data.action = source_action
    start = int(round(source_action.frame_range[0]))
    end = int(round(source_action.frame_range[1]))
    bpy.context.scene.frame_start = start
    bpy.context.scene.frame_end = end
    bpy.context.scene.frame_set(start)
    bpy.context.view_layer.update()
    mapped = _map_with_mpfb(target, source)

    # The doll's flat Mixamo hand and MPFB's sculpted relaxed hand disagree by
    # up to ~47 degrees per knuckle, so copying finger rotations bakes a claw.
    # Drop the finger constraints and let hands hold the rig's own rest pose.
    for bone in target.pose.bones:
        if not _is_finger(bone.name):
            continue
        for constraint in list(bone.constraints):
            if constraint.type == "COPY_ROTATION" and constraint.target == source:
                bone.constraints.remove(constraint)

    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(
        frame_start=start,
        frame_end=end,
        step=1,
        only_selected=False,
        visual_keying=True,
        clear_constraints=True,
        clear_parents=False,
        use_current_action=False,
        clean_curves=False,
        bake_types={"POSE"},
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    action = target.animation_data.action
    if not action:
        raise RuntimeError(f"Blender did not bake {name}")
    action.name = name
    action.use_fake_user = True
    print(f"MIXAMO_ACTION_OK name={name} frames={start}-{end} mapped={mapped}")
    return action


def _remove_linear_walk_drift(rig, action):
    """Keep the standard walk in place while retaining its pelvic sway."""
    hips = _pose_bone(rig, "hips")
    if not hips:
        raise RuntimeError("MPFB Mixamo hips bone is missing")
    rig.animation_data.action = action
    start = int(round(action.frame_range[0]))
    end = int(round(action.frame_range[1]))
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
        hips.keyframe_insert(data_path="location", frame=frame, group=hips.name)
    print(f"MIXAMO_WALK_IN_PLACE name={action.name} drift={tuple(round(value, 5) for value in drift)}")


def _validate_action(rig, action):
    """Reject discontinuities and corrupt transforms before GLB export."""
    required = {
        suffix: _pose_bone(rig, suffix)
        for suffix in ("hips", "head", "lefthand", "righthand", "leftfoot", "rightfoot")
    }
    if any(bone is None for bone in required.values()):
        raise RuntimeError(f"{action.name} cannot be checked because required bones are missing")
    rig.animation_data.action = action
    start = int(round(action.frame_range[0]))
    end = int(round(action.frame_range[1]))
    fingers = [bone for bone in rig.pose.bones if _is_finger(bone.name)]
    previous_head = None
    maximum_head_step = 0.0
    maximum_position = 0.0
    maximum_finger = 0.0
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        for bone in required.values():
            position = (rig.matrix_world @ bone.matrix).translation
            if not all(math.isfinite(value) for value in position):
                raise RuntimeError(f"{action.name} has a non-finite pose at frame {frame}")
            maximum_position = max(maximum_position, position.length)
        for bone in fingers:
            angle = bone.matrix_basis.to_quaternion().angle
            maximum_finger = max(maximum_finger, angle)
        head = (rig.matrix_world @ required["head"].matrix).to_quaternion()
        if previous_head is not None:
            maximum_head_step = max(maximum_head_step, previous_head.rotation_difference(head).angle)
        previous_head = head
    if maximum_position > 8.0:
        raise RuntimeError(f"{action.name} leaves the character bounds ({maximum_position:.2f}m)")
    if maximum_head_step > math.radians(35):
        raise RuntimeError(
            f"{action.name} has a {math.degrees(maximum_head_step):.1f}-degree one-frame head jump"
        )
    # Fingers are pinned to the rig's rest pose during baking; any real
    # deviation means the claw-handed constraint copy has come back.
    if maximum_finger > math.radians(5):
        raise RuntimeError(
            f"{action.name} moves a finger {math.degrees(maximum_finger):.1f} degrees from rest"
        )
    print(
        f"MIXAMO_ACTION_VALID name={action.name} "
        f"head_step_deg={math.degrees(maximum_head_step):.2f} max_position={maximum_position:.3f} "
        f"finger_deg={math.degrees(maximum_finger):.2f}"
    )


def _stash_actions(rig, actions):
    rig.animation_data_create()
    rig.animation_data.action = None
    for action in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(round(action.frame_range[0])), action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]


def attach_mixamo_actions(rig, source_dir):
    """Bake and stash all exact-doll Renderer C motions on ``rig``."""
    if not any(_mixamo_suffix(bone.name) == "hips" for bone in rig.data.bones):
        raise RuntimeError("Renderer C must use MPFB's native Mixamo rig")
    actions = []
    for filename, name in MOTION_SOURCES:
        path = os.path.join(source_dir, filename)
        if not os.path.exists(path):
            raise RuntimeError(f"Missing Mixamo animation: {path}")
        source, source_action, imported = _import_source(path)
        try:
            action = _bake_action(rig, source, source_action, name)
            if name == "Walk":
                _remove_linear_walk_drift(rig, action)
            _validate_action(rig, action)
            actions.append(action)
        finally:
            source.animation_data_clear()
            _remove_imported(imported)
            # Imported source actions are inputs only. Keeping them would make
            # the glTF exporter expose duplicate mixamo.com clips.
            if source_action.name in bpy.data.actions:
                bpy.data.actions.remove(source_action)
    _stash_actions(rig, actions)
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(int(round(action.frame_range[1])) for action in actions)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    return actions

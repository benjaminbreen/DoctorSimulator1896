"""Build a playable GLB from the rigged Tripo/Mixamo character.

The skinned FBX supplies the mesh, materials, and armature. Mixamo animation
downloads share the bone hierarchy but not the arm rest pose, so every clip
gets a per-frame upper-arm retarget; the remaining channels stay intact.

    /Applications/Blender.app/Contents/MacOS/Blender --factory-startup \
      --background --python scripts/characters/export_tripo_player.py -- \
      --output game/public/models/tripo-victorian-player.glb
"""

import argparse
import os
import sys

import bpy


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SOURCE_DIR = os.path.join(
    ROOT,
    "assets",
    "source",
    "tripo-victorian-player",
)
DEFAULT_REACTION_SOURCE_DIR = os.path.join(
    ROOT,
    "assets",
    "source",
    "mixamo",
    "reactions",
)
SOURCE_MODEL = "Standing W_Briefcase Idle with skin.fbx"
CLIPS = (
    ("Neutral Idle.fbx", "StandingIdle"),
    ("Walking-2.fbx", "Walk"),
    ("Slow Run.fbx", "Run"),
    ("Jump.fbx", "Jump"),
    ("Standing Jump-2.fbx", "StandingJump"),
    ("Quick Formal Bow.fbx", "FormalBow"),
    ("Shaking Hands 2.fbx", "Handshake"),
    ("Smoking.fbx", "Smoking"),
    ("Throw Object.fbx", "Throw"),
    ("Idle Preparing Throw.fbx", "ThrowReady"),
    ("Carrying idle.fbx", "CarryIdle"),
    ("Walking carrying object.fbx", "CarryWalk"),
    ("Running carrying object.fbx", "CarryRun"),
    ("Pick up object.fbx", "PickUp"),
    ("Climbing Ladder.fbx", "ClimbCarriage"),
)
REACTION_CLIPS = (
    ("Edge Slip on heights.fbx", "EdgeSlip"),
    ("Shoulder Hit And Fall.fbx", "FallShoulder"),
    ("Falling Down.fbx", "FallGeneric"),
    ("Fallen Idle.fbx", "FallenIdle"),
    ("Standing Up from Fall.fbx", "RiseFromFall"),
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--reaction-source-dir", default=DEFAULT_REACTION_SOURCE_DIR)
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
    added = [obj for obj in bpy.context.scene.objects if obj not in before]
    armatures = [obj for obj in added if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(
            f"{os.path.basename(path)}: expected one armature, found {len(armatures)}"
        )
    return armatures[0], added


def bone_contract(armature):
    return {
        bone.name: bone.parent.name if bone.parent else None
        for bone in armature.data.bones
    }


def remove_objects(objects):
    for obj in objects:
        if obj.name in bpy.context.scene.objects:
            bpy.data.objects.remove(obj, do_unlink=True)


def transfer_action(
    path,
    name,
    target,
    target_contract,
    *,
    in_place=False,
    remove_vertical=False,
    lock_vertical=False,
):
    source, objects = import_fbx(path)
    source_action = source.animation_data.action if source.animation_data else None
    if not source_action:
        raise RuntimeError(f"{os.path.basename(path)} has no animation")
    if bone_contract(source) != target_contract:
        raise RuntimeError(f"{os.path.basename(path)} does not match the player rig")

    # This direct channel copy is the stable path used by the original player.
    # A separate copy keeps the surgical arm adjustment from changing the
    # source rig while its reference pose is being evaluated.
    action = source_action.copy()
    action.name = name
    action.use_fake_user = True
    target.animation_data_create()

    # The player rig's upper arms rest in an A-pose; Mixamo animation
    # downloads rest in a T-pose. Copied local rotations play on the wrong
    # baseline and pin the arms to the torso, so re-key the upper arms from
    # the source's world orientation each frame.
    target.animation_data.action = action
    # Bind the target to the copied slot; assignment alone creates a fresh
    # empty slot, and the arm keys would land there while the body curves
    # stay in a slot nothing evaluates.
    target.animation_data.action_slot = action.slots[0]
    hips = "mixamorig:Hips"
    alignment = (
        target.data.bones[hips].matrix_local
        @ source.data.bones[hips].matrix_local.inverted()
    )
    arm_names = ("mixamorig:LeftArm", "mixamorig:RightArm")
    frame_start, frame_end = map(int, source_action.frame_range)
    for frame in range(frame_start, frame_end + 1):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        desired_rotations = {
            bone_name: (
                alignment @ source.pose.bones[bone_name].matrix
            ).to_quaternion()
            for bone_name in arm_names
        }
        for bone_name in arm_names:
            bone = target.pose.bones[bone_name]
            desired = desired_rotations[bone_name].to_matrix().to_4x4()
            desired.translation = bone.matrix.translation
            bone.matrix = desired
        bpy.context.view_layer.update()
        for bone_name in arm_names:
            bone = target.pose.bones[bone_name]
            bone.keyframe_insert(
                "rotation_quaternion",
                frame=frame,
                group=bone.name,
            )

    if in_place:
        hips_bone = target.pose.bones[hips]
        bpy.context.scene.frame_set(frame_start)
        bpy.context.view_layer.update()
        start_location = hips_bone.location.copy()
        bpy.context.scene.frame_set(frame_end)
        bpy.context.view_layer.update()
        drift = hips_bone.location - start_location
        # Mixamo's imported armature is x/y horizontal and z vertical here.
        if not remove_vertical:
            drift.z = 0.0
        span = max(1, frame_end - frame_start)
        for frame in range(frame_start, frame_end + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            if lock_vertical:
                hips_bone.location.z = start_location.z
                hips_bone.location.x -= drift.x * ((frame - frame_start) / span)
                hips_bone.location.y -= drift.y * ((frame - frame_start) / span)
            else:
                hips_bone.location -= drift * ((frame - frame_start) / span)
            hips_bone.keyframe_insert("location", frame=frame, group=hips_bone.name)
        print(
            f"TRIPO_ACTION_IN_PLACE name={name} "
            f"drift={tuple(round(value, 5) for value in drift)}"
        )

    target.animation_data.action = None
    remove_objects(objects)
    bpy.data.actions.remove(source_action)
    return action


def stash_actions(armature, actions):
    armature.animation_data_create()
    armature.animation_data.action = None
    for action in actions:
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.action_slot = action.slots[0]
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]


def image_for(fragment, *, srgb=None):
    matches = []
    for image in bpy.data.images:
        filename = os.path.basename(image.filepath).lower()
        if fragment not in filename:
            continue
        if srgb is not None and (image.colorspace_settings.name == "sRGB") != srgb:
            continue
        matches.append(image)
    if not matches:
        raise RuntimeError(f"Embedded {fragment} texture was not found")
    return max(matches, key=lambda image: image.size[0] * image.size[1])


def repair_tripo_material(material):
    """Replace Mixamo's lossy FBX material conversion with the embedded PBR maps."""
    base_color = image_for("basecolor", srgb=True)
    normal = image_for("normal")
    roughness = image_for("roughness")
    normal.colorspace_settings.name = "Non-Color"
    roughness.colorspace_settings.name = "Non-Color"

    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (620, 80)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (340, 80)
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = 0.6
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    def texture_node(image, location):
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        node.location = location
        return node

    base_node = texture_node(base_color, (-520, 260))
    roughness_node = texture_node(roughness, (-520, 20))
    normal_node = texture_node(normal, (-520, -400))
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (40, -320)

    links.new(base_node.outputs["Color"], shader.inputs["Base Color"])
    links.new(roughness_node.outputs["Color"], shader.inputs["Roughness"])
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])


def main():
    args = arguments()
    source_dir = os.path.abspath(args.source_dir)
    reaction_source_dir = os.path.abspath(args.reaction_source_dir)
    output = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    clear_scene()
    bpy.context.scene.render.fps = 30

    source_model = os.path.join(source_dir, SOURCE_MODEL)
    if not os.path.exists(source_model):
        raise RuntimeError(f"Missing player source: {source_model}")
    rig, player_objects = import_fbx(source_model)
    meshes = [obj for obj in player_objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one player mesh, found {len(meshes)}")
    rig.name = "TripoPlayerRig"
    meshes[0].name = "TripoVictorianPlayer"

    source_action = rig.animation_data.action if rig.animation_data else None
    rig.animation_data_clear()
    if source_action:
        bpy.data.actions.remove(source_action)
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()

    target_contract = bone_contract(rig)
    actions = []
    for filename, clip_name in CLIPS:
        path = os.path.join(source_dir, filename)
        if clip_name == "ClimbCarriage" and not os.path.exists(path):
            path = os.path.join(ROOT, filename)
        if not os.path.exists(path):
            raise RuntimeError(f"Missing Mixamo source: {path}")
        actions.append(
            transfer_action(
                path,
                clip_name,
                rig,
                target_contract,
                in_place=clip_name == "ClimbCarriage",
                remove_vertical=clip_name == "ClimbCarriage",
                lock_vertical=clip_name == "ClimbCarriage",
            )
        )
    for filename, clip_name in REACTION_CLIPS:
        path = os.path.join(reaction_source_dir, filename)
        if not os.path.exists(path):
            raise RuntimeError(f"Missing reaction source: {path}")
        actions.append(
            transfer_action(path, clip_name, rig, target_contract, in_place=True)
        )
    stash_actions(rig, actions)

    materials = {slot.material for slot in meshes[0].material_slots if slot.material}
    tripo_materials = [material for material in materials if material.name.startswith("tripo_mat")]
    if len(tripo_materials) != 1:
        raise RuntimeError(f"Expected one Tripo material, found {len(tripo_materials)}")
    repair_tripo_material(tripo_materials[0])

    for mesh in meshes:
        for polygon in mesh.data.polygons:
            polygon.use_smooth = True

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(int(action.frame_range[1]) for action in actions)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    for obj in player_objects:
        if obj.name in bpy.context.scene.objects:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_frame_range=False,
        export_nla_strips=True,
        export_skins=True,
        export_yup=True,
    )
    print(
        "TRIPO_PLAYER_OK "
        f"output={output} bones={len(target_contract)} "
        f"triangles={len(meshes[0].data.polygons)} "
        f"clips={','.join(action.name for action in actions)}"
    )


if __name__ == "__main__":
    main()

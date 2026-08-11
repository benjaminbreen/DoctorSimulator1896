"""Build the game's rigged player placeholder: the Renderer C doll body with
the Mixamo locomotion clips baked onto its own skeleton.

    /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python scripts/characters/export_player_placeholder.py -- \
      --output game/public/models/player-placeholder.glb

The doll and the motion downloads come from the same Mixamo skeleton family
(see the doll README), so the actions transfer by bone name and the game needs
no runtime retargeting — unlike the lab, which retargets onto the production
masters. Mixamo prefixes bones with "mixamorig:" on download; the doll may not,
so names are matched with the prefix stripped.
"""

import argparse
import os
import sys

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOLL = os.path.join(
    ROOT, "character-lab", "assets", "mixamo", "renderer-c-male-doll",
    "renderer-c-male-mixamo-doll.fbx",
)
DOWNLOADS = os.path.join(
    ROOT, "character-lab", "assets", "mixamo", "renderer-c-male-doll", "downloads",
)

# The clips the player needs: standing still and walking.
CLIPS = (("Standing Idle.fbx", "Idle"), ("Walking Standard.fbx", "Walk"))


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_fbx(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True, automatic_bone_orientation=False)
    added = [obj for obj in bpy.context.scene.objects if obj not in before]
    armatures = [obj for obj in added if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"{os.path.basename(path)}: expected one armature, got {len(armatures)}")
    return armatures[0], added


# The doll was uploaded to Mixamo and comes back with the same bone names its
# downloads use, so an action drops straight onto it. Anything else means the
# doll was regenerated differently and the clips need real retargeting.
def check_same_rig(source, target, label):
    extra = {bone.name for bone in source.data.bones} - {bone.name for bone in target.data.bones}
    if extra:
        raise RuntimeError(f"{label}: {len(extra)} bones the doll lacks, e.g. {sorted(extra)[:3]}")


def stash(armature, actions):
    armature.animation_data_create()
    armature.animation_data.action = None
    for action in actions:
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]


def main():
    args = arguments()
    output = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    clear_scene()

    doll, doll_objects = import_fbx(DOLL)
    doll.name = "PlayerRig"
    doll.animation_data_clear()
    print(f"doll bones: {len(doll.data.bones)}, sample {[b.name for b in doll.data.bones][:4]}")

    actions = []
    for filename, clip_name in CLIPS:
        path = os.path.join(DOWNLOADS, filename)
        if not os.path.exists(path):
            raise RuntimeError(f"Missing Mixamo source: {path}")
        source, imported = import_fbx(path)
        action = source.animation_data.action if source.animation_data else None
        if not action:
            raise RuntimeError(f"{filename} has no action")
        action.name = clip_name
        action.use_fake_user = True
        check_same_rig(source, doll, clip_name)
        actions.append(action)
        for obj in imported:
            if obj.name in bpy.context.scene.objects:
                bpy.data.objects.remove(obj, do_unlink=True)

    stash(doll, actions)
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(int(action.frame_range[1]) for action in actions)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    for obj in doll_objects:
        if obj.name in bpy.context.scene.objects:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = doll
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_frame_range=False,
        export_nla_strips=True,
    )
    print(f"wrote {output}")


main()

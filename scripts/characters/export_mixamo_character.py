"""Export one skinned Mixamo FBX as a compact web character GLB.

Animation-only downloads belong in ``convert_mixamo_motion.py``.  This script
keeps the visual master separate so one motion pack can be reused by several
compatible NPC meshes.
"""

import argparse
import os
import sys

import bpy


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--clip-name", default="StandingIdle")
    parser.add_argument("--texture-size", type=int, default=1024)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def main():
    args = arguments()
    source = os.path.abspath(args.source)
    output = os.path.abspath(args.output)
    if not os.path.exists(source):
        raise RuntimeError(f"Missing Mixamo character source: {source}")
    os.makedirs(os.path.dirname(output), exist_ok=True)
    clear_scene()

    bpy.ops.import_scene.fbx(
        filepath=source,
        use_anim=True,
        automatic_bone_orientation=False,
    )
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one armature, found {len(armatures)}")
    if not meshes:
        raise RuntimeError("The Mixamo visual master contains no mesh")

    armature = armatures[0]
    action = armature.animation_data.action if armature.animation_data else None
    if not action:
        raise RuntimeError("The Mixamo visual master contains no animation")
    action.name = args.clip_name
    action.use_fake_user = True

    # A 2K source texture is unnecessary for a background pedestrian.  Resize
    # only the in-memory import; the authoring FBX remains unchanged.
    texture_size = max(64, args.texture_size)
    for image in bpy.data.images:
        width, height = image.size
        largest = max(width, height)
        if largest <= texture_size or min(width, height) <= 0:
            continue
        scale = texture_size / largest
        image.scale(max(1, round(width * scale)), max(1, round(height * scale)))

    # Tripo's FBX materials often arrive with metallic set to one and the
    # atlas alpha wired into the entire body material. The alpha channel is
    # unused here; exporting it as BLEND makes overlapping skirt and body
    # triangles look translucent. Keep the character dielectric and opaque.
    for material in bpy.data.materials:
        material.diffuse_color[3] = 1
        if not material.use_nodes:
            material.metallic = 0.0
            continue
        for node in material.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            metallic = node.inputs.get("Metallic")
            if metallic is not None:
                for link in list(metallic.links):
                    material.node_tree.links.remove(link)
                metallic.default_value = 0.0
            alpha = node.inputs.get("Alpha")
            if alpha is not None:
                for link in list(alpha.links):
                    material.node_tree.links.remove(link)
                alpha.default_value = 1.0

    armature["game_character_family"] = "mixamo-pedestrian"
    armature["source_file"] = os.path.basename(source)
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_start = int(action.frame_range[0])
    bpy.context.scene.frame_end = int(action.frame_range[1])
    bpy.context.scene.frame_set(bpy.context.scene.frame_start)
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_skins=True,
        export_yup=True,
        export_image_format="WEBP",
        export_image_quality=80,
    )
    print(
        "MIXAMO_CHARACTER_OK "
        f"output={output} meshes={len(meshes)} bones={len(armature.data.bones)} "
        f"clip={action.name}"
    )


if __name__ == "__main__":
    main()

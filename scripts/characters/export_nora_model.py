"""Export Nora's original Mixamo skin without retargeting or rebaking it."""

import argparse
import os
import sys

import bpy


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SOURCE = os.path.join(ROOT, "assets", "source", "nora-byrne", "Nora Byrne Skinned.fbx")


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def main():
    args = arguments()
    output = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(
        filepath=os.path.abspath(args.source),
        use_anim=True,
        automatic_bone_orientation=False,
    )
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(rigs) != 1 or len(meshes) != 1:
        raise RuntimeError("Nora source must contain one armature and one skinned mesh")
    rig = rigs[0]
    mesh = meshes[0]
    rig.name = "NoraByrneRig"
    mesh.name = "NoraByrne"

    # The source file's standing idle is not used during consultations. Keep
    # the skin in its bind pose and load seated Mixamo tracks separately.
    action = rig.animation_data.action if rig.animation_data else None
    rig.animation_data_clear()
    if action:
        bpy.data.actions.remove(action)
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    for polygon in mesh.data.polygons:
        polygon.use_smooth = True

    # Ignore the base-colour PNG's unused alpha channel. Tripo/Mixamo imports
    # otherwise make the whole character a blended transparent surface.
    for slot in mesh.material_slots:
        material = slot.material
        if not material:
            continue
        material.diffuse_color[3] = 1
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

    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_yup=True,
    )
    print(f"NORA_MODEL_OK output={output} bones={len(rig.data.bones)}")


if __name__ == "__main__":
    main()

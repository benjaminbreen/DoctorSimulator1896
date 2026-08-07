"""Render a neutral standing or seated Meta MHR rig proof in Blender.

This mirrors the local-axis pose used by the browser controller and exists to
keep a visual record of rig-integration attempts under mockups/.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fbx", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--pose", choices=["standing", "seated"], default="seated")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def rotate(armature, name, axis, angle):
    bone = armature.pose.bones.get(name)
    if bone is None:
        return
    bone.rotation_mode = "QUATERNION"
    vector = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}[axis]
    bone.rotation_quaternion = bone.rotation_quaternion @ Quaternion(vector, angle)


def configure_material(body):
    material = bpy.data.materials.new("MHR_Pose_Proof_Skin")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.31, 0.12, 0.065, 1)
    bsdf.inputs["Roughness"].default_value = 0.63
    body.data.materials.clear()
    body.data.materials.append(material)
    for polygon in body.data.polygons:
        polygon.use_smooth = True


def freeze_evaluated_body(source, vertical_offset=0.0):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        vertices = [(vertex.co.x * 0.01, vertex.co.y * 0.01 + vertical_offset, vertex.co.z * 0.01) for vertex in evaluated_mesh.vertices]
    finally:
        evaluated.to_mesh_clear()
    faces = [list(polygon.vertices) for polygon in source.data.polygons]
    mesh = bpy.data.meshes.new("MHR_Pose_Proof_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(source.data.materials[0])
    snapshot = bpy.data.objects.new("MHR_Pose_Proof", mesh)
    bpy.context.collection.objects.link(snapshot)
    source.hide_render = True
    return snapshot


def configure_scene(output):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output
    scene.view_settings.look = "AgX - Medium High Contrast"
    world = scene.world or bpy.data.worlds.new("MHR Pose Proof World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.013, 0.010, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.05

    bpy.ops.object.camera_add(location=(0, 0.86, 4.0))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.05
    point_at(camera, (0, 0.86, 0))
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(-1.15, 2.6, 2.4))
    key = bpy.context.object
    key.data.energy = 520
    key.data.size = 2.2
    key.data.color = (1.0, 0.73, 0.52)
    point_at(key, (0, 1.05, 0))
    bpy.ops.object.light_add(type="AREA", location=(1.4, 1.6, 2.6))
    fill = bpy.context.object
    fill.data.energy = 180
    fill.data.size = 2.5
    fill.data.color = (0.55, 0.68, 1.0)
    point_at(fill, (0, 1.0, 0))


def main():
    args = arguments()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.wm.fbx_import(filepath=os.path.abspath(args.fbx))
    body = bpy.data.objects.get("body_mesh")
    armature = bpy.data.objects.get("body_world")
    if body is None or armature is None:
        raise RuntimeError("MHR FBX did not contain body_mesh/body_world")
    configure_material(body)

    if body.data.shape_keys:
        for key in body.data.shape_keys.key_blocks:
            if key.name != "Basis":
                key.value = 0

    if args.pose == "seated":
        rotate(armature, "r_upleg", "z", -1.47)
        rotate(armature, "l_upleg", "z", -1.47)
        rotate(armature, "r_lowleg", "z", 1.58)
        rotate(armature, "l_lowleg", "z", 1.58)
        rotate(armature, "r_talocrural", "z", -0.11)
        rotate(armature, "l_talocrural", "z", -0.11)
        rotate(armature, "c_spine0", "z", 0.07)
        rotate(armature, "c_spine1", "z", 0.08)
        rotate(armature, "c_spine2", "z", 0.06)
        rotate(armature, "r_uparm", "z", 0.75)
        rotate(armature, "l_uparm", "z", 0.75)
        rotate(armature, "r_lowarm", "z", -0.35)
        rotate(armature, "l_lowarm", "z", -0.35)
    bpy.context.view_layer.update()
    freeze_evaluated_body(body, -0.39 if args.pose == "seated" else 0.0)
    armature.hide_render = True
    configure_scene(os.path.abspath(args.output))
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

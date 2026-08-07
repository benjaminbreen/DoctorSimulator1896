"""Render a repeatable MHR demographic-calibration contact sheet.

The coefficient manifest is produced by the real JavaScript MHR controller.
Blender only applies those coefficients and supplies a stable camera, crop,
material, and lighting environment for visual regression.
"""

from __future__ import annotations

import argparse
import bmesh
import json
import math
import os
import sys

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def color(hex_value):
    value = hex_value.lstrip("#")
    channels = [int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)]
    return tuple(channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels)


def skin_material(index, hex_value):
    material = bpy.data.materials.new(f"MHR_Audit_Skin_{index}")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    red, green, blue = color(hex_value)
    bsdf.inputs["Base Color"].default_value = (red, green, blue, 1)
    bsdf.inputs["Roughness"].default_value = 0.58
    bsdf.inputs["Specular IOR Level"].default_value = 0.28
    return material


def set_identity(source, weights, expression_weights=None):
    keys = source.data.shape_keys.key_blocks
    for key in keys:
        if key.name != "Basis":
            key.value = 0
    for component, weight in enumerate(weights):
        key = keys.get(f"shape_{component}")
        if key is None:
            raise RuntimeError(f"MHR master is missing shape_{component}")
        key.slider_min = -3.0
        key.slider_max = 3.0
        key.value = float(weight)
    for offset, weight in enumerate(expression_weights or []):
        key = keys.get(f"shape_{45 + offset}")
        if key is None:
            raise RuntimeError(f"MHR master is missing expression shape_{45 + offset}")
        key.slider_min = -1.0
        key.slider_max = 1.0
        key.value = float(weight)


def make_bust(source, name, location, material):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        vertices = [source.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices]
        faces = [list(polygon.vertices) for polygon in evaluated_mesh.polygons]
    finally:
        evaluated.to_mesh_clear()
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=(0, 0, 1.44), plane_no=(0, 0, 1),
        clear_inner=True, clear_outer=False,
    )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(material)
    snapshot = bpy.data.objects.new(name, mesh)
    snapshot.location = location
    bpy.context.collection.objects.link(snapshot)


def label_material():
    material = bpy.data.materials.new("MHR_Audit_Label")
    material.diffuse_color = (0.82, 0.75, 0.62, 1)
    return material


def add_label(text, location, material, size):
    bpy.ops.object.text_add(location=location, rotation=(math.radians(90), 0, 0))
    label = bpy.context.object
    label.data.body = text
    label.data.align_x = "CENTER"
    label.data.align_y = "CENTER"
    label.data.size = size
    label.data.extrude = 0.001
    label.data.materials.append(material)


def configure_scene(output, centre_x, centre_z):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 2400
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output
    scene.view_settings.look = "AgX - Medium High Contrast"
    world = scene.world or bpy.data.worlds.new("MHR Audit World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.014, 0.010, 0.008, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.06

    bpy.ops.object.camera_add(location=(centre_x, -5.0, centre_z))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    # Blender defines orthographic scale across the horizontal image axis.
    camera.data.ortho_scale = 2.80
    point_at(camera, (centre_x, 0, centre_z))
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(centre_x - 1.4, -2.2, centre_z + 1.4))
    key = bpy.context.object
    key.data.energy = 360
    key.data.size = 3.0
    key.data.color = (1.0, 0.76, 0.58)
    point_at(key, (centre_x, 0, centre_z))
    bpy.ops.object.light_add(type="AREA", location=(centre_x + 1.6, -1.1, centre_z + 0.7))
    fill = bpy.context.object
    fill.data.energy = 125
    fill.data.size = 3.4
    fill.data.color = (0.55, 0.68, 1.0)
    point_at(fill, (centre_x, 0, centre_z))


def main():
    args = arguments()
    with open(args.manifest, encoding="utf-8") as handle:
        manifest = json.load(handle)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.model))
    source = bpy.data.objects.get("body_mesh")
    if source is None or source.data.shape_keys is None:
        raise RuntimeError("MHR master did not import with body_mesh shape keys")

    columns = int(manifest.get("columns", 4))
    x_spacing = 0.68
    z_spacing = 0.62
    centre_x = (columns - 1) * x_spacing * 0.5
    centre_z = 1.25
    material = label_material()
    for index, entry in enumerate(manifest["entries"]):
        set_identity(source, entry["identityWeights"], entry.get("expressionWeights"))
        bpy.context.view_layer.update()
        column = index % columns
        row = index // columns
        location = (column * x_spacing, 0, -row * z_spacing)
        make_bust(source, f"MHR_Audit_{index}", location, skin_material(index, entry["skinTone"]))
        add_label(entry["label"], (location[0], -0.02, 1.365 + location[2]), material, 0.034)
        add_label(entry["detail"], (location[0], -0.02, 1.318 + location[2]), material, 0.025)

    source.hide_render = True
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            obj.hide_render = True
    configure_scene(os.path.abspath(args.output), centre_x, centre_z)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

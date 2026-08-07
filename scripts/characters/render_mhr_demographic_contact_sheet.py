"""Render a repeatable MHR demographic-calibration contact sheet.

The coefficient manifest is produced by the real JavaScript MHR controller.
Blender only applies those coefficients and supplies a stable camera, crop,
material, and lighting environment for visual regression.
"""

from __future__ import annotations

import argparse
import array
import base64
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
    parser.add_argument(
        "--review-detail",
        action="store_true",
        help="Use a taller, tighter layout so eye, nose, and mouth differences are reviewable.",
    )
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


def skin_material(index, hex_value, surface=None, vertex_colors=False):
    material = bpy.data.materials.new(f"MHR_Audit_Skin_{index}")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    red, green, blue = color(hex_value)
    bsdf.inputs["Base Color"].default_value = (red, green, blue, 1)
    bsdf.inputs["Roughness"].default_value = float((surface or {}).get("roughness", 0.72))
    bsdf.inputs["Specular IOR Level"].default_value = 0.28
    if vertex_colors:
        attribute = material.node_tree.nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = "Color"
        material.node_tree.links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
    detail = float((surface or {}).get("detail", 0.18))
    if detail > 0.01:
        noise = material.node_tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 115.0 / max(0.45, float((surface or {}).get("poreScale", 1.0)))
        noise.inputs["Detail"].default_value = 2.2
        noise.inputs["Roughness"].default_value = 0.62
        bump = material.node_tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = detail * 0.16
        bump.inputs["Distance"].default_value = 0.018
        material.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        material.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def detail_material(index, detail):
    material = bpy.data.materials.new(f"MHR_Audit_Detail_{index}_{detail.get('name', 'mesh')}")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    red, green, blue = color(detail.get("color", "#241711"))
    bsdf.inputs["Base Color"].default_value = (red, green, blue, 1)
    bsdf.inputs["Roughness"].default_value = float(detail.get("roughness", 0.72))
    bsdf.inputs["Specular IOR Level"].default_value = 0.30
    if detail.get("kind") == "hair-card":
        texture_path = os.path.abspath(os.path.join(
            os.path.dirname(__file__),
            "../../character-lab/public/textures/victorian-hair-card.png",
        ))
        image = bpy.data.images.get("Victorian Hair Card Atlas") or bpy.data.images.load(texture_path)
        image.name = "Victorian Hair Card Atlas"
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = image
        multiply = material.node_tree.nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1.0
        multiply.inputs[1].default_value = (red, green, blue, 1)
        material.node_tree.links.new(texture.outputs["Color"], multiply.inputs[2])
        material.node_tree.links.new(multiply.outputs["Color"], bsdf.inputs["Base Color"])
        material.node_tree.links.new(texture.outputs["Alpha"], bsdf.inputs["Alpha"])
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        material.use_transparency_overlap = False
    if detail.get("colorBase64"):
        attribute = material.node_tree.nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = "Color"
        material.node_tree.links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
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


def set_baked_position(source, encoded):
    """Apply the exact live Three.js result, including localized face edits."""
    coordinates = array.array("f")
    coordinates.frombytes(base64.b64decode(encoded))
    expected = len(source.data.vertices) * 3
    if len(coordinates) != expected:
        raise RuntimeError(f"Position payload has {len(coordinates)} floats; expected {expected}")
    # GLTFLoader exposes metre-scale glTF coordinates. Blender's importer keeps
    # the mesh data in centimetres and carries the Y-up-to-Z-up conversion plus
    # 0.01 scale on the object matrix, so only the unit conversion belongs here.
    converted = array.array("f", [0.0]) * expected
    for offset in range(0, expected, 3):
        converted[offset] = coordinates[offset] * 100
        converted[offset + 1] = coordinates[offset + 1] * 100
        converted[offset + 2] = coordinates[offset + 2] * 100
    keys = source.data.shape_keys.key_blocks
    for key in keys:
        if key.name != "Basis":
            key.value = 0
    keys["Basis"].data.foreach_set("co", converted)
    source.data.update()


def float_array(encoded):
    values = array.array("f")
    values.frombytes(base64.b64decode(encoded))
    return values


def uint_array(encoded):
    values = array.array("I")
    values.frombytes(base64.b64decode(encoded))
    return values


def add_point_colors(mesh, encoded):
    if not encoded:
        return
    rgb = float_array(encoded)
    if len(rgb) != len(mesh.vertices) * 3:
        raise RuntimeError(f"Color payload has {len(rgb)} floats for {len(mesh.vertices)} vertices")
    rgba = array.array("f", [0.0]) * (len(mesh.vertices) * 4)
    for vertex in range(len(mesh.vertices)):
        rgba[vertex * 4] = rgb[vertex * 3]
        rgba[vertex * 4 + 1] = rgb[vertex * 3 + 1]
        rgba[vertex * 4 + 2] = rgb[vertex * 3 + 2]
        rgba[vertex * 4 + 3] = 1.0
    layer = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    layer.data.foreach_set("color", rgba)


def make_bust(source, name, location, material, entry):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        vertices = [source.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices]
        if entry.get("visibleIndexBase64"):
            triangles = uint_array(entry["visibleIndexBase64"])
            faces = [triangles[offset : offset + 3] for offset in range(0, len(triangles), 3)]
        else:
            faces = [list(polygon.vertices) for polygon in evaluated_mesh.polygons]
    finally:
        evaluated.to_mesh_clear()
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    add_point_colors(mesh, entry.get("skinColorBase64"))
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=(0, 0, 1.315 if entry.get("dressColor") else 1.44), plane_no=(0, 0, 1),
        clear_inner=True, clear_outer=False,
    )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(material)
    if entry.get("dressColor"):
        mesh.materials.append(detail_material(name, {
            "name": "PresentationGarment",
            "color": entry["dressColor"],
            "roughness": 0.82,
        }))
        for polygon in mesh.polygons:
            centre = polygon.center
            # This intentionally provisional bodice is painted on the fitted
            # torso surface, so it follows every identity without floating in
            # front of the portrait while the production wardrobe is pending.
            # A modest bateau neckline is intentionally broad enough to read
            # as clothing while leaving a clean neck/upper-chest opening. The
            # old absolute-X rule climbed to the shoulders one triangle at a
            # time and produced a conspicuous saw-tooth collar.
            neckline = 1.405 + max(0.0, abs(centre.x) - 0.055) * 0.34
            if centre.z < neckline:
                polygon.material_index = 1
    snapshot = bpy.data.objects.new(name, mesh)
    snapshot.location = location
    bpy.context.collection.objects.link(snapshot)


def make_detail_mesh(source, detail, index, location):
    coordinates = float_array(detail["positionBase64"])
    triangles = uint_array(detail["indexBase64"])
    vertices = []
    for offset in range(0, len(coordinates), 3):
        point = source.matrix_world @ Vector((
            coordinates[offset] * 100,
            coordinates[offset + 1] * 100,
            coordinates[offset + 2] * 100,
        ))
        vertices.append(point)
    faces = [triangles[offset : offset + 3] for offset in range(0, len(triangles), 3)]
    mesh = bpy.data.meshes.new(f"MHR_Audit_Detail_{index}_{detail['name']}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    if detail.get("kind") == "clothing":
        editable = bmesh.new()
        editable.from_mesh(mesh)
        bmesh.ops.bisect_plane(
            editable,
            geom=list(editable.verts) + list(editable.edges) + list(editable.faces),
            plane_co=(0, 0, 1.325),
            plane_no=(0, 0, 1),
            clear_inner=True,
            clear_outer=False,
        )
        loose = [vertex for vertex in editable.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(editable, geom=loose, context="VERTS")
        editable.to_mesh(mesh)
        editable.free()
        mesh.update()
    if detail.get("uvBase64"):
        uv_values = float_array(detail["uvBase64"])
        if len(uv_values) == len(vertices) * 2:
            uv_layer = mesh.uv_layers.new(name="UVMap")
            for loop in mesh.loops:
                vertex = loop.vertex_index
                uv_layer.data[loop.index].uv = (
                    uv_values[vertex * 2],
                    uv_values[vertex * 2 + 1],
                )
    add_point_colors(mesh, detail.get("colorBase64"))
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(detail_material(index, detail))
    snapshot = bpy.data.objects.new(f"MHR_Audit_Detail_{index}_{detail['name']}", mesh)
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


def configure_scene(output, centre_x, centre_z, rows, review_detail=False):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 2600 if review_detail else 2400
    scene.render.resolution_y = 1600 if review_detail else 1080
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
    # Blender's orthographic scale is the horizontal camera span. Leave enough
    # width for four shoulder-level busts while the 2600x1600 aspect ratio keeps
    # the two rows tight vertically.
    camera.data.ortho_scale = max(2.25, rows * 0.92 + 0.30) if review_detail else 5.00
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
    x_spacing = 0.54 if args.review_detail else 0.68
    z_spacing = 0.62
    rows = math.ceil(len(manifest["entries"]) / columns)
    centre_x = (columns - 1) * x_spacing * 0.5
    centre_z = 1.55 - (rows - 1) * z_spacing * 0.5
    material = label_material()
    for index, entry in enumerate(manifest["entries"]):
        if entry.get("positionBase64"):
            set_baked_position(source, entry["positionBase64"])
        else:
            set_identity(source, entry["identityWeights"], entry.get("expressionWeights"))
        bpy.context.view_layer.update()
        column = index % columns
        row = index // columns
        location = (column * x_spacing, 0, -row * z_spacing)
        make_bust(
            source,
            f"MHR_Audit_{index}",
            location,
            skin_material(
                index,
                entry["skinTone"],
                entry.get("surface"),
                bool(entry.get("skinColorBase64")),
            ),
            entry,
        )
        for detail in entry.get("detailMeshes", []):
            make_detail_mesh(source, detail, index, location)
        add_label(entry["label"], (location[0], -0.35, 1.275 + location[2]), material, 0.031)
        add_label(entry["detail"], (location[0], -0.35, 1.235 + location[2]), material, 0.022)

    source.hide_render = True
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            obj.hide_render = True
    configure_scene(os.path.abspath(args.output), centre_x, centre_z, rows, args.review_detail)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

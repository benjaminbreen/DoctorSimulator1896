"""Generate seeded Meta MHR LOD1 face proofs and a morph-capable GLB.

The official FBX already contains 45 identity and 72 facial-expression shape
keys.  This proof randomizes only the 20 head identity components (20..39),
leaving body, hand, pose, and expression neutral so identity range can be judged
without confounds.

Example:
  blender --background --python scripts/characters/mhr_proof.py -- \
    --fbx /private/tmp/mhr-assets/assets/lod1.fbx \
    --output-dir /private/tmp/mhr-proof
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
import numpy as np


DEFAULT_SEEDS = [111, 222, 333, 444, 555, 666]


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fbx", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seeds", nargs="+", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--head-strength", type=float, default=1.0)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def configure_material(source):
    material = bpy.data.materials.new("MHR_Proof_Skin")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.24, 0.095, 0.05, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.52
    source.data.materials.clear()
    source.data.materials.append(material)


def configure_render(output_path, columns, rows):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1650
    scene.render.resolution_y = 1050
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world or bpy.data.worlds.new("MHR Proof World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.014, 0.012, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.04

    center_x = (columns - 1) * 0.22
    center_y = 1.55 - (rows - 1) * 0.23
    bpy.ops.object.camera_add(location=(center_x, center_y, 4.0))
    camera = bpy.context.object
    camera.name = "MHR_Proof_Camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(columns * 0.42, rows * 0.56)
    point_at(camera, (center_x, center_y, 0.0))
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(center_x - 0.45, center_y + 0.5, 1.6))
    key = bpy.context.object
    key.data.energy = 120
    key.data.size = 1.5
    key.data.color = (1.0, 0.72, 0.54)
    point_at(key, (center_x, center_y, 0.0))

    bpy.ops.object.light_add(type="AREA", location=(center_x + 0.65, center_y + 0.2, 1.25))
    fill = bpy.context.object
    fill.data.energy = 35
    fill.data.size = 1.8
    fill.data.color = (0.48, 0.66, 1.0)
    point_at(fill, (center_x, center_y, 0.0))


def add_label(text, location):
    bpy.ops.object.text_add(location=location)
    label = bpy.context.object
    label.data.body = text
    label.data.align_x = "CENTER"
    label.data.align_y = "CENTER"
    label.data.size = 0.028
    material = bpy.data.materials.get("MHR_Label") or bpy.data.materials.new("MHR_Label")
    material.diffuse_color = (0.78, 0.72, 0.64, 1)
    label.data.materials.append(material)


def set_identity(source, coefficients):
    keys = source.data.shape_keys.key_blocks
    if len(keys) != 118:
        raise RuntimeError(f"Expected Basis + 117 MHR keys; found {len(keys)}")
    for component in range(117):
        key = keys[component + 1]
        key.slider_min = -3.0
        key.slider_max = 3.0
        key.value = float(coefficients[component]) if component < 45 else 0.0


def evaluated_vertices(source):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        return np.asarray([vertex.co[:] for vertex in mesh.vertices], dtype=np.float64)
    finally:
        evaluated.to_mesh_clear()


def make_head_snapshot(source, name, location, cutoff_y=1.42):
    # MHR's evaluated FBX mesh is expressed in centimeters even though the
    # imported Blender object's displayed dimensions are meters.
    vertices = evaluated_vertices(source) * 0.01
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    faces = [list(polygon.vertices) for polygon in source.data.polygons]
    mesh.from_pydata(vertices.tolist(), [], faces)
    mesh.update()
    # Bisect instead of dropping crossing polygons, which would leave a visibly
    # jagged triangle boundary across the base of each comparison bust.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        plane_co=(0.0, cutoff_y, 0.0),
        plane_no=(0.0, 1.0, 0.0),
        clear_inner=True,
        clear_outer=False,
    )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.materials.append(source.data.materials[0])
    snapshot = bpy.data.objects.new(name, mesh)
    snapshot.location = location
    bpy.context.collection.objects.link(snapshot)
    return snapshot, vertices


def export_neutral_morph_library(source, armature, path):
    source.hide_render = False
    armature.hide_render = False
    set_identity(source, np.zeros(117, dtype=np.float64))
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_morph=True,
        export_skins=True,
        export_animations=False,
    )


def rms_distance(left, right):
    return float(np.sqrt(np.mean(np.square(left - right))))


def main():
    args = arguments()
    os.makedirs(args.output_dir, exist_ok=True)
    clear_scene()
    bpy.ops.wm.fbx_import(filepath=os.path.abspath(args.fbx))
    source = bpy.data.objects.get("body_mesh")
    armature = bpy.data.objects.get("body_world")
    if source is None or armature is None:
        raise RuntimeError("Official MHR FBX did not contain body_mesh/body_world")
    configure_material(source)

    glb_path = os.path.join(args.output_dir, "mhr-lod1-morph-library.glb")
    export_neutral_morph_library(source, armature, glb_path)

    columns = min(3, len(args.seeds))
    rows = math.ceil(len(args.seeds) / columns)
    vertex_sets = []
    report = {
        "engine": "Meta Momentum Human Rig 1.0.1 LOD1",
        "seeds": args.seeds,
        "headStrength": args.head_strength,
        "identityComponents": {"body": 20, "head": 20, "hands": 5},
        "expressionComponents": 72,
        "shapeKeysInFbxIncludingBasis": len(source.data.shape_keys.key_blocks),
        "heads": [],
        "pairwiseRmsMeters": {},
        "glb": os.path.basename(glb_path),
    }

    for index, seed in enumerate(args.seeds):
        rng = np.random.default_rng(seed)
        coefficients = np.zeros(117, dtype=np.float64)
        coefficients[20:40] = np.clip(
            args.head_strength * rng.normal(0.0, 1.0, 20), -2.5, 2.5
        )
        set_identity(source, coefficients)
        bpy.context.view_layer.update()
        column = index % columns
        row = index // columns
        location = (column * 0.44, -row * 0.46, 0)
        _, vertices = make_head_snapshot(source, f"MHR_Seed_{seed}", location)
        vertex_sets.append(vertices)
        add_label(str(seed), (location[0], location[1] + 1.31, 0.25))
        report["heads"].append({
            "seed": seed,
            "headCoefficientRange": [
                round(float(np.min(coefficients[20:40])), 5),
                round(float(np.max(coefficients[20:40])), 5),
            ],
            "headCoefficientStd": round(float(np.std(coefficients[20:40])), 5),
        })

    for left_index, left_seed in enumerate(args.seeds):
        for right_index in range(left_index + 1, len(args.seeds)):
            right_seed = args.seeds[right_index]
            report["pairwiseRmsMeters"][f"{left_seed}-{right_seed}"] = round(
                rms_distance(vertex_sets[left_index], vertex_sets[right_index]), 8
            )

    source.hide_render = True
    armature.hide_render = True
    for obj in bpy.context.scene.objects:
        if obj.type == "EMPTY" or obj.name.startswith("Collision"):
            obj.hide_render = True

    gallery_path = os.path.join(args.output_dir, "mhr-identity-gallery.png")
    configure_render(gallery_path, columns, rows)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.output_dir, "mhr-proof.blend"))
    bpy.ops.render.render(write_still=True)
    with open(os.path.join(args.output_dir, "mhr-report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    print(f"MHR_PROOF_OK gallery={gallery_path} heads={len(args.seeds)}")


if __name__ == "__main__":
    main()

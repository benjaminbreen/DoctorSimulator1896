"""Render neutral previews and report geometry facts for source garment GLBs."""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
from mathutils import Vector


def script_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def world_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    high = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return low, high


def look_at(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def main():
    args = script_args()
    if len(args) < 2:
        raise SystemExit("usage: blender --background --python inspect_garment_assets.py -- OUT_DIR ASSET...")

    output_dir, *asset_paths = args
    os.makedirs(output_dir, exist_ok=True)
    results = []

    for asset_path in asset_paths:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(asset_path))
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        if not meshes:
            continue

        low, high = world_bounds(meshes)
        center = (low + high) * 0.5
        size = high - low
        largest = max(size)

        root = bpy.data.objects.new("PreviewNormalized", None)
        bpy.context.scene.collection.objects.link(root)
        for obj in [obj for obj in bpy.context.scene.objects if obj.parent is None and obj != root]:
            obj.parent = root
        root.scale = (1 / largest,) * 3
        root.location = -center / largest

        scene = bpy.context.scene
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = 720
        scene.render.resolution_y = 900
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.world = bpy.data.worlds.new("PreviewWorld")
        scene.world.color = (0.025, 0.025, 0.025)

        camera_data = bpy.data.cameras.new("PreviewCamera")
        camera = bpy.data.objects.new("PreviewCamera", camera_data)
        scene.collection.objects.link(camera)
        scene.camera = camera
        camera.data.lens = 68
        camera.location = (1.25, -2.35, 0.2)
        look_at(camera, (0, 0, 0))

        for name, location, energy, size_value in (
            ("Key", (-2.5, -3.0, 3.5), 1100, 4.0),
            ("Fill", (3.0, -1.0, 1.5), 650, 3.5),
            ("Rim", (0.0, 3.0, 2.5), 850, 3.0),
        ):
            data = bpy.data.lights.new(name, "AREA")
            data.energy = energy
            data.shape = "DISK"
            data.size = size_value
            light = bpy.data.objects.new(name, data)
            light.location = location
            scene.collection.objects.link(light)
            look_at(light, (0, 0, 0))

        stem = os.path.splitext(os.path.basename(asset_path))[0]
        scene.render.filepath = os.path.join(output_dir, f"{stem}.png")
        bpy.ops.render.render(write_still=True)
        if 1 < len(meshes) <= 4:
            for index, preview_mesh in enumerate(meshes, start=1):
                for mesh in meshes:
                    mesh.hide_render = mesh != preview_mesh
                scene.render.filepath = os.path.join(output_dir, f"{stem}-mesh-{index:02d}.png")
                bpy.ops.render.render(write_still=True)
            for mesh in meshes:
                mesh.hide_render = False

        results.append(
            {
                "asset": asset_path,
                "bounds": {"min": list(low), "max": list(high), "size": list(size)},
                "meshes": [
                    {
                        "name": obj.name,
                        "bounds": {
                            "min": list(world_bounds([obj])[0]),
                            "max": list(world_bounds([obj])[1]),
                        },
                        "vertices": len(obj.data.vertices),
                        "polygons": len(obj.data.polygons),
                        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
                        "skinned": any(mod.type == "ARMATURE" for mod in obj.modifiers),
                    }
                    for obj in meshes
                ],
                "actions": [
                    {"name": action.name, "frameRange": list(action.frame_range)}
                    for action in bpy.data.actions
                ],
            }
        )

    with open(os.path.join(output_dir, "assets.json"), "w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=2)


if __name__ == "__main__":
    main()

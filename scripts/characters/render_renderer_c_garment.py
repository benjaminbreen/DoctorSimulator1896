"""Render isolated Renderer C garment views for deformation review."""

from __future__ import annotations

import argparse
import json
import os
import sys

import bpy
from mathutils import Vector


def script_args() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("model")
    parser.add_argument("output_dir")
    parser.add_argument("--garment", action="append", required=True)
    parser.add_argument("--body", action="store_true")
    parser.add_argument("--clip")
    parser.add_argument("--fraction", type=float, default=0.5)
    parser.add_argument("--gold", action="store_true")
    parser.add_argument("--facts-only", action="store_true")
    return parser.parse_args(script_args())


def look_at(obj, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name, color, roughness):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    return result


def selected_meshes(prefixes):
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and any(
            obj.name == prefix or obj.name.startswith(f"{prefix}.") for prefix in prefixes
        )
    ]


def apply_clip(clip_name, fraction):
    if not clip_name:
        for rig in (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"):
            if rig.animation_data:
                rig.animation_data.action = None
            rig.data.pose_position = "REST"
        bpy.context.scene.frame_set(0)
        return None
    rig = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
    action = next((item for item in bpy.data.actions if item.name == clip_name), None)
    if rig is None or action is None:
        raise RuntimeError(f"Missing rig or clip {clip_name!r}")
    rig.animation_data_create()
    rig.animation_data.action = action
    start, end = action.frame_range
    frame = start + (end - start) * max(0.0, min(1.0, fraction))
    bpy.context.scene.frame_set(int(round(frame)))
    return {"clip": action.name, "frame": frame, "range": [start, end]}


def mesh_facts(obj):
    parents = list(range(len(obj.data.vertices)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for edge in obj.data.edges:
        left, right = edge.vertices
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parents[right_root] = left_root
    components = {}
    for vertex in obj.data.vertices:
        components.setdefault(find(vertex.index), []).append(vertex)

    return {
        "name": obj.name,
        "vertices": len(obj.data.vertices),
        "polygons": len(obj.data.polygons),
        "uvLayers": [layer.name for layer in obj.data.uv_layers],
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "shapeKeys": list(obj.data.shape_keys.key_blocks.keys()) if obj.data.shape_keys else [],
        "skinned": any(modifier.type == "ARMATURE" for modifier in obj.modifiers),
        "connectedComponents": [
            {
                "vertices": len(vertices),
                "min": [min(vertex.co[axis] for vertex in vertices) for axis in range(3)],
                "max": [max(vertex.co[axis] for vertex in vertices) for axis in range(3)],
            }
            for vertices in sorted(components.values(), key=len, reverse=True)
        ],
    }


def main() -> None:
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.model))

    garments = selected_meshes(args.garment)
    if not garments:
        raise RuntimeError(f"No garment matched {args.garment}")
    body = selected_meshes(["Human_Body"]) if args.body else []
    visible = set(garments + body)
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.hide_render = obj not in visible

    garment_material = material("GarmentReview", (0.42, 0.44, 0.47), 0.78)
    golden_materials = {
        "base": material("GoldenBaseReview", (0.58, 0.36, 0.12), 0.82),
        "secondary": material("GoldenSecondaryReview", (0.24, 0.12, 0.055), 0.84),
        "accent": material("GoldenAccentReview", (0.68, 0.52, 0.27), 0.72),
    }
    body_material = material("BodyReview", (0.24, 0.25, 0.27), 0.86)
    for obj in garments:
        if args.gold:
            for slot in obj.material_slots:
                original = slot.material.name.lower() if slot.material else ""
                role = "accent" if "accent" in original else "secondary" if "secondary" in original else "base"
                slot.material = golden_materials[role]
        else:
            obj.data.materials.clear()
            obj.data.materials.append(garment_material)
    for obj in body:
        obj.data.materials.clear()
        obj.data.materials.append(body_material)

    pose = apply_clip(args.clip, args.fraction)

    stem = "-".join(args.garment)
    if args.clip:
        stem = f"{stem}-{args.clip.lower()}"
    facts = {
        "model": os.path.abspath(args.model),
        "garmentPrefixes": args.garment,
        "pose": pose,
        "meshes": [mesh_facts(obj) for obj in garments],
    }
    facts_path = os.path.join(args.output_dir, f"{stem}-facts.json")
    with open(facts_path, "w", encoding="utf-8") as handle:
        json.dump(facts, handle, indent=2)
    if args.facts_only:
        return

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("ReviewWorld")
    scene.world.color = (0.018, 0.018, 0.022)

    camera_data = bpy.data.cameras.new("ReviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 1.75
    camera = bpy.data.objects.new("ReviewCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    for name, location, energy, size in (
        ("Key", (-2.6, -3.4, 3.4), 950, 3.0),
        ("Fill", (3.2, -1.2, 2.2), 500, 4.0),
        ("Rim", (0.5, 3.1, 2.8), 700, 3.0),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        light.location = location
        scene.collection.objects.link(light)
        look_at(light, (0, 0, 0.85))

    views = {
        "front": (0.0, -4.0, 1.05),
        "three-quarter": (2.75, -3.2, 1.05),
        "side": (4.0, 0.0, 1.05),
        "rear": (0.0, 4.0, 1.05),
    }
    for view, location in views.items():
        camera.location = location
        look_at(camera, (0, 0, 0.82))
        scene.render.filepath = os.path.join(args.output_dir, f"{stem}-{view}.png")
        bpy.ops.render.render(write_still=True)

if __name__ == "__main__":
    main()

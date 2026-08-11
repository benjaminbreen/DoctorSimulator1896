"""Render authored Renderer C menswear at useful animation checkpoints."""

from __future__ import annotations

import os
import sys

import bpy
from mathutils import Vector


POSES = (
    ("rest-pose", None, 0.0),
    ("clinic-idle", "ClinicIdle", 0.15),
    ("stand-up-start", "StandUp", 0.02),
    ("stand-up-middle", "StandUp", 0.50),
    ("stand-up-end", "StandUp", 0.98),
    ("standing-idle", "StandingIdle", 0.25),
    ("walk-contact", "Walk", 0.10),
    ("walk-passing", "Walk", 0.55),
    ("sitting-talking", "SittingTalking", 0.42),
)

VISIBLE_EXACT = {
    "Human_Body",
    "RendererC_Shoes",
    "RendererC_Eyes_01",
    "RendererC_Brows_01",
    "RendererC_Hair_01",
    "RendererC_Lashes_01",
    "RendererC_Teeth_01",
}

def script_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def set_runtime_visibility(mode):
    visible_prefixes = []
    if mode == "set":
        visible_prefixes.append("RendererC_AuthoredVictorianWaistcoat_")
    visible_exact = set(VISIBLE_EXACT)
    if mode == "set":
        visible_exact.add("RendererC_WorkGarment")
    elif mode == "waistcoat":
        visible_exact.add("RendererC_AuthoredVictorianWaistcoat_01")
    if mode == "base":
        visible_exact.add("RendererC_BaseGarment")
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        visible = obj.name in visible_exact or obj.name.startswith(tuple(visible_prefixes))
        obj.hide_render = not visible
        obj.hide_viewport = not visible
        if visible:
            for material in obj.data.materials:
                if not material:
                    continue
                material.diffuse_color[3] = 1.0
                if hasattr(material, "surface_render_method"):
                    material.surface_render_method = "DITHERED"


def evaluated_bounds():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError("No visible evaluated garment geometry")
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return low, high


def set_action(rig, action_name, fraction):
    if action_name is None:
        rig.data.pose_position = "REST"
        bpy.context.scene.frame_set(0)
        bpy.context.view_layer.update()
        return
    rig.data.pose_position = "POSE"
    action = bpy.data.actions.get(action_name)
    if not action:
        raise RuntimeError(f"Missing animation action {action_name}")
    rig.animation_data_create()
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    rig.animation_data.action = action
    start, end = action.frame_range
    frame = start + (end - start) * fraction
    bpy.context.scene.frame_set(int(round(frame)))
    bpy.context.view_layer.update()


def frame_camera(camera):
    low, high = evaluated_bounds()
    size = high - low
    center = (low + high) * 0.5
    height = max(size.z, 0.01)
    width = max(size.x, 0.01)
    distance = max(height * 2.0, width * 2.4)
    camera.location = (center.x + height * 0.28, center.y - distance, center.z + height * 0.04)
    camera.data.lens = 62
    look_at(camera, center)


def configure_scene(output_dir):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("RendererCMenswearWorld")
    scene.world.color = (0.018, 0.014, 0.012)

    camera_data = bpy.data.cameras.new("RendererCMenswearCamera")
    camera = bpy.data.objects.new("RendererCMenswearCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    for name, location, energy, size in (
        ("Key", (-2.5, -4.0, 4.5), 1200, 3.5),
        ("Fill", (3.2, -2.0, 2.5), 650, 3.5),
        ("Rim", (0.0, 3.0, 3.2), 900, 3.0),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        light.location = location
        scene.collection.objects.link(light)
        look_at(light, (0, 0, 0.9))

    os.makedirs(output_dir, exist_ok=True)
    return scene, camera


def main():
    args = script_args()
    if len(args) not in {2, 3}:
        raise SystemExit(
            "usage: blender --background --python render_renderer_c_menswear_motion.py "
            "-- MODEL.glb OUT_DIR [base|set|waistcoat]"
        )
    model_path, output_dir = map(os.path.abspath, args[:2])
    mode = args[2] if len(args) >= 3 else "set"
    if mode not in {"base", "set", "waistcoat"}:
        raise SystemExit(f"Unknown garment review mode: {mode}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=model_path)

    rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(rigs) != 1:
        raise RuntimeError(f"Expected one Renderer C armature; found {len(rigs)}")
    rig = rigs[0]
    set_runtime_visibility(mode)
    scene, camera = configure_scene(output_dir)

    for stem, action_name, fraction in POSES:
        set_action(rig, action_name, fraction)
        frame_camera(camera)
        scene.render.filepath = os.path.join(output_dir, f"{stem}.png")
        bpy.ops.render.render(write_still=True)
        print(f"RENDERER_C_MENSWEAR_FRAME {stem} {action_name} {fraction:.2f}")


if __name__ == "__main__":
    main()

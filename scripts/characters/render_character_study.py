"""Render a fixed close-up expression study from an editable character source."""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--anchor', type=int, default=1)
parser.add_argument('--front', type=int, choices=(-1, 1), default=1)
parser.add_argument('--target', type=float, nargs=3)
parser.add_argument('--distance', type=float, default=0.85)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
os.makedirs(args.output, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.source))
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
for obj in scene.objects:
    if obj.type == 'ARMATURE':
        obj.data.pose_position = 'REST'
    if obj.type != 'MESH':
        continue
    slot = obj.get('renderer_c_variant_slot')
    if slot is not None:
        obj.hide_render = int(slot) != args.anchor - 1
    if obj.name.startswith(('RendererC_BaseGarment', 'RendererC_Victorian')):
        obj.hide_render = True
    if obj.name == 'RendererC_GoldenDressSeatedSkirt':
        obj.hide_render = True
    if obj.data.shape_keys:
        obj.data.shape_keys.animation_data_clear()
        for key in obj.data.shape_keys.key_blocks:
            key.value = 1 if key.name == f'rc_anchor_{args.anchor:02d}' else 0

bpy.context.view_layer.update()
eyes = next((o for o in meshes if o.name == f'RendererC_Eyes_{args.anchor:02d}'), None)
if args.target:
    center = Vector(args.target)
elif eyes:
    evaluated = eyes.evaluated_get(bpy.context.evaluated_depsgraph_get())
    points = [evaluated.matrix_world @ v.co for v in evaluated.data.vertices]
    center = sum(points, Vector()) / len(points)
else:
    rig = next((o for o in scene.objects if o.type == 'ARMATURE'), None)
    if rig:
        head = next(b for b in rig.data.bones if b.name.endswith('Head'))
        center = rig.matrix_world @ head.head_local + Vector((0, -0.04, 0.10))
    else:
        points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
        center = Vector([(min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)])

def point_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.camera_add(location=center + Vector((0, args.front * args.distance, 0.02)))
camera = bpy.context.object
camera.data.lens = 72
point_at(camera, center - Vector((0, 0, 0.025)))
scene.camera = camera
for position, energy, size in [((-0.50, -0.65, 0.55), 60, 0.65), ((0.45, -0.3, 0.25), 22, 0.7), ((0.2, 0.35, 0.55), 40, 0.5)]:
    bpy.ops.object.light_add(type='AREA', location=center + Vector((position[0], position[1] * -args.front, position[2])))
    light = bpy.context.object
    light.data.energy, light.data.size = energy, size
    point_at(light, center)
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.16, 0.17, 0.19, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
scene.render.engine = 'BLENDER_EEVEE_NEXT' if bpy.app.version < (5, 0, 0) else 'BLENDER_EEVEE'
scene.render.resolution_x = 720
scene.render.resolution_y = 840
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
studies = [
    ('neutral', {}),
    ('half-blink', {'eyeBlinkLeft': 0.5, 'eyeBlinkRight': 0.5}),
    ('blink', {'eyeBlinkLeft': 1, 'eyeBlinkRight': 1}),
    ('speech', {'jawOpen': 0.35}),
    ('concern', {'browInnerUp': 0.28, 'mouthFrownLeft': 0.15, 'mouthFrownRight': 0.15}),
    ('relief', {'mouthSmileLeft': 0.22, 'mouthSmileRight': 0.22}),
]
captures, skipped = [], []
available = {key.name for obj in meshes if obj.data.shape_keys for key in obj.data.shape_keys.key_blocks}
for name, weights in studies:
    missing = [key for key in weights if key not in available]
    if missing:
        skipped.append({'name': name, 'missing': missing})
        continue
    for obj in meshes:
        if not obj.data.shape_keys:
            continue
        for key in obj.data.shape_keys.key_blocks:
            if not key.name.startswith('rc_') and key.name != 'Basis':
                key.value = weights.get(key.name, 0)
    scene.render.filepath = os.path.abspath(os.path.join(args.output, name + '.png'))
    bpy.ops.render.render(write_still=True)
    captures.append(name)
with open(os.path.join(args.output, 'study.json'), 'w') as file:
    json.dump({'source': args.source, 'anchor': args.anchor, 'cameraTarget': list(center), 'studies': studies, 'captures': captures, 'skipped': skipped}, file, indent=2)

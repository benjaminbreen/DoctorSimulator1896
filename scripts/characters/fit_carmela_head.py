"""Rejected canonical-head fitting study; not used by the game or normal build."""

import argparse
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--bake', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
source = os.path.join(root, 'assets/source/carmela-russo-2026-10-29')
os.makedirs(args.output, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(root, 'character-lab/public/models/mrs-ostrander-1896.blend'))

keep = {'Human_Body', 'Eyes', 'Teeth'}
for obj in list(bpy.context.scene.objects):
    if obj.name not in keep:
        bpy.data.objects.remove(obj, do_unlink=True)
parts = list(bpy.context.scene.objects)
for obj in parts:
    for modifier in list(obj.modifiers):
        obj.modifiers.remove(modifier)
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if obj.data.shape_keys:
        obj.data.shape_keys.animation_data_clear()
        for key in obj.data.shape_keys.key_blocks:
            key.value = 0

face = bpy.data.objects['Human_Body']
bm = bmesh.new()
bm.from_mesh(face.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < .94], context='VERTS')
bm.to_mesh(face.data)
bm.free()
face.name = 'Carmela_Face'

before = set(bpy.context.scene.objects)
bpy.ops.import_scene.fbx(filepath=os.path.join(source, 'head-p2-v1/carmela-head-p2-v1.fbx'))
donor = next(o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH')
donor.name = 'Tripo_Surface_Reference'
bpy.context.view_layer.objects.active = donor
bpy.ops.object.select_all(action='DESELECT')
donor.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
surface = BVHTree.FromPolygons([v.co for v in donor.data.vertices], [p.vertices for p in donor.data.polygons])

# These measured landmarks belong to this identity, not a generic face detector.
# The deformation applies to every key, so expression deltas follow the fit.
landmarks = [
    ((0, -.025, 1.206), (0, -.03, 1.0)),
    ((0, -.1592, 1.0568), (0, -.4153, .548)),
    ((0, -.1459, 1.029), (0, -.374, .454)),
    ((0, -.147, 1.016), (0, -.371, .425)),
    ((0, -.120, .973), (0, -.298, .299)),
    ((0, .030, 1.12), (0, .16, .75)),
    ((0, -.03, .94), (0, .015, .20)),
]
for side in (-1, 1):
    for a, b in [
        ((.015, -.130, 1.100), (.047, -.337, .667)),
        ((.040, -.126, 1.101), (.176, -.289, .670)),
        ((.029, -.133, 1.1045), (.111, -.322, .695)),
        ((.029, -.130, 1.0960), (.111, -.322, .655)),
        ((.030, -.140, 1.028), (.099, -.344, .443)),
        ((.019, -.146, 1.052), (.053, -.385, .531)),
        ((.088, -.045, 1.070), (.280, -.10, .575)),
        ((.071, -.100, 1.062), (.218, -.272, .548)),
        ((.080, -.025, 1.15), (.230, -.01, .842)),
    ]:
        landmarks.append(((a[0] * side, *a[1:]), (b[0] * side, *b[1:])))

centers = np.asarray([a for a, _ in landmarks])
targets = np.asarray([b for _, b in landmarks])

def kernel(points):
    distances = np.linalg.norm(points[:, None, :] - centers[None, :, :], axis=2)
    return np.exp(-(distances / .045) ** 2)

def baseline(values):
    return values * 2.9 + np.asarray((0, .057, -2.524))

weights = np.linalg.solve(kernel(centers) + np.eye(len(centers)) * .035, targets - baseline(centers))

def warp(points):
    values = np.asarray(points)
    return baseline(values) + kernel(values) @ weights

for obj in parts:
    keys = obj.data.shape_keys.key_blocks if obj.data.shape_keys else []
    original = np.asarray([v.co[:] for v in (keys[0].data if keys else obj.data.vertices)])
    fitted = warp(original)
    correction = np.zeros_like(fitted)
    if obj == face:
        for index, point in enumerate(fitted):
            x, y, z = point
            # Front projection preserves loop positions in the image plane.
            # Nearest-point fitting can fold an eyelid onto the cheek below it.
            if y < -.24 and .28 < z < .92:
                eye = min(((x - s * .111) / .087) ** 2 + ((z - .674) / .045) ** 2 for s in (-1, 1))
                mouth = (x / .12) ** 2 + ((z - .445) / .05) ** 2
                protection = min(1, max(0, eye - 1.1), max(0, mouth - 1.0))
                hit = surface.ray_cast(Vector((x, -2, z)), Vector((0, 1, 0)))
                if hit[0] and abs(hit[0].y - y) < .10:
                    correction[index, 1] = (hit[0].y - y) * protection
                continue
            hit = surface.find_nearest(Vector(point))
            if hit[0] and hit[3] < .075:
                correction[index] = np.asarray(hit[0]) - point
    if keys:
        mapped_keys = [warp([v.co[:] for v in key.data]) + correction for key in keys]
        for key, mapped in zip(keys, mapped_keys):
            for vertex, value in zip(key.data, mapped):
                vertex.co = value
        for vertex, value in zip(obj.data.vertices, mapped_keys[0]):
            vertex.co = value
    else:
        for vertex, value in zip(obj.data.vertices, fitted + correction):
            vertex.co = value
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

if args.bake:
    # Emission transfers appearance without baking the review lighting into skin.
    donor_material = donor.data.materials[0]
    image_node = next(n for n in donor_material.node_tree.nodes if n.type == 'TEX_IMAGE')
    output = next(n for n in donor_material.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
    emission = donor_material.node_tree.nodes.new('ShaderNodeEmission')
    donor_material.node_tree.links.new(image_node.outputs['Color'], emission.inputs['Color'])
    donor_material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    image = bpy.data.images.new('Carmela_Skin', width=2048, height=2048)
    material = bpy.data.materials.new('Carmela_Skin')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .7
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    material.node_tree.nodes.active = texture
    face.data.materials.clear()
    face.data.materials.append(material)
    for polygon in face.data.polygons:
        polygon.material_index = 0
    bpy.ops.object.select_all(action='DESELECT')
    donor.select_set(True)
    face.select_set(True)
    bpy.context.view_layer.objects.active = face
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = .06
    scene.render.bake.max_ray_distance = .15
    scene.render.bake.margin = 12
    bpy.ops.object.bake(type='EMIT')
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    image.filepath_raw = os.path.abspath(os.path.join(args.output, 'carmela-skin.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()

donor.hide_render = True
donor.hide_set(True)
for name, color in [('Eyes', (.22, .13, .06, 1)), ('Teeth', (.62, .57, .49, 1))]:
    obj = bpy.data.objects[name]
    material = bpy.data.materials.new(name + '_Review')
    material.diffuse_color = color
    material.use_nodes = True
    material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = color
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.output, 'carmela-face-fit.blend')))
print('CARMELA_FACE_FIT_OK', len(face.data.vertices), len(face.data.shape_keys.key_blocks))

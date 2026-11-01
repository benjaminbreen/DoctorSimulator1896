"""Assemble Carmela and retarget the project's Mixamo motions to her skeleton."""

import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import carmela_wardrobe
import carmela_hair

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--head', default='direct-head-v1/carmela-head.blend')
parser.add_argument('--name', default='carmela')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.context.preferences.filepaths.save_version = 0
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
source_dir = os.path.join(root, 'assets/source/carmela-russo-2026-10-29')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=os.path.join(source_dir, 'body-p2-v1/tripo_convert_8f1d0749-19c0-483f-8d6c-85ad12730b46.fbx'), automatic_bone_orientation=False)
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
rig.name = 'Carmela_Rig'
body.name = 'Carmela_DayDress'
rig.scale *= 1.65
bpy.context.view_layer.update()
for obj in [rig, body]:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bm = bmesh.new()
bm.from_mesh(body.data)
seen, remove = set(), []
for vertex in bm.verts:
    if vertex in seen:
        continue
    stack, component = [vertex], []
    seen.add(vertex)
    while stack:
        point = stack.pop()
        component.append(point)
        for edge in point.link_edges:
            neighbor = edge.other_vert(point)
            if neighbor not in seen:
                seen.add(neighbor)
                stack.append(neighbor)
    heights = [point.co.z for point in component]
    if min(heights) > 1.30 and max(heights) > 1.47:
        remove.extend(component)
bmesh.ops.delete(bm, geom=remove, context='VERTS')
# Smart Mesh left small open seams in the sleeves. Close them before posing.
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0008)
sleeve_edges = [edge for edge in bm.edges if edge.is_boundary and all(abs(v.co.x) > .25 and .6 < v.co.z < 1.1 for v in edge.verts)]
patches = bmesh.ops.holes_fill(bm, edges=sleeve_edges, sides=16)['faces']
uv_layer = bm.loops.layers.uv.active
for face in patches:
    neighbors = [other for edge in face.edges for other in edge.link_faces if other not in patches]
    if not neighbors:
        continue
    adjacent = min(neighbors, key=lambda other: (other.calc_center_median()-face.calc_center_median()).length_squared)
    face.material_index = adjacent.material_index
    if uv_layer:
        for loop in face.loops:
            nearest = min(adjacent.loops, key=lambda other: (other.vert.co-loop.vert.co).length_squared)
            loop[uv_layer].uv = nearest[uv_layer].uv
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(body.data)
bm.free()

path = os.path.join(source_dir, args.head)
with bpy.data.libraries.load(path, link=False) as (available, loaded):
    loaded.objects = [name for name in available.objects if name.startswith(('Carmela_', 'Tripo_Surface_Reference')) or name in ('Eyes', 'Teeth')]
head_parts = []
for obj in loaded.objects:
    bpy.context.collection.objects.link(obj)
    obj.hide_set(False)
    obj.hide_render = False
    obj.scale = (.35, .35, .35)
    obj.location = (0, 0, 1.30)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    head_parts.append(obj)
reference = next(o for o in head_parts if o.name == 'Tripo_Surface_Reference')
head_parts.remove(reference)
head_parts.extend(carmela_hair.build(reference, source_dir, args.name))
bpy.data.objects.remove(reference, do_unlink=True)

def add_identity_shapes(obj):
    if not obj.data.shape_keys:
        obj.shape_key_add(name='Basis', from_mix=False).value = 0
    basis = obj.data.shape_keys.key_blocks[0]
    eye_z = .665 if 'second-' in args.head else .674
    def displacement(co, name):
        x, y, z = co
        if name == 'rc_headWidth':
            return Vector((x*.14*math.exp(-((z-.56)/.25)**2), 0, 0))
        if name == 'rc_noseWidth':
            weight = math.exp(-(x/.085)**2-((z-eye_z+.13)/.09)**2)*max(0, min(1, (-y-.1)/.1))
            return Vector((x*.32*weight, 0, 0))
        if name == 'rc_jawLength':
            weight = math.exp(-((z-.32)/.13)**2-(x/.23)**2)*max(0, min(1, (z-.24)/.08))
            return Vector((0, 0, -.045*weight))
        return Vector((0, 0, .03*math.exp(-((z-.90)/.16)**2)))
    for name in ['rc_headWidth', 'rc_noseWidth', 'rc_jawLength', 'rc_foreheadHeight']:
        key = obj.shape_key_add(name=name, from_mix=False)
        key.value = 0
        for vertex, neutral in zip(key.data, basis.data):
            raw = Vector((neutral.co.x/.35, neutral.co.y/.35, (neutral.co.z-1.3)/.35))
            vertex.co = neutral.co + displacement(raw, name)*.35

for obj in head_parts:
    add_identity_shapes(obj)
    obj.vertex_groups.clear()
    head = obj.vertex_groups.new(name='mixamorig:Head')
    neck = obj.vertex_groups.new(name='mixamorig:Neck')
    shoulders = obj.vertex_groups.new(name='mixamorig:Spine2')
    for vertex in obj.data.vertices:
        # The chin belongs to the skull. Blending up through the lower face
        # ties it to the shoulders and stretches it when the head pitches.
        weight = max(0, min(1, (vertex.co.z-1.365)/.025)) if obj.name == 'Carmela_Face' else 1
        neck_blend = max(0, min(1, (vertex.co.z-1.36)/.06))
        head.add([vertex.index], weight, 'REPLACE')
        neck.add([vertex.index], (1-weight)*neck_blend, 'REPLACE')
        shoulders.add([vertex.index], (1-weight)*(1-neck_blend), 'REPLACE')
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = obj.modifiers.new('Patient skeleton', 'ARMATURE')
    modifier.object = rig
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

# Resize every head part and expression together. Blend out at the lower neck
# so the existing collar and neck binding keep their fit.
head_scale = .88
head_pivot = Vector((0, 0, 1.40))
for obj in head_parts:
    keys = obj.data.shape_keys.key_blocks
    neutral = [point.co.copy() for point in keys[0].data]
    for index, point in enumerate(neutral):
        blend = max(0, min(1, (point.z-1.39)/.06)) if obj.name == 'Carmela_Face' else 1
        blend = blend*blend*(3-2*blend)
        scale = 1+(head_scale-1)*blend
        for key in keys:
            key.data[index].co = head_pivot+(key.data[index].co-head_pivot)*scale
            if obj.name == 'Carmela_Face' and point.z < 1.46:
                # The donor's nape flares outside the collar in profile.
                t = max(0, min(1, (key.data[index].co.z-1.39)/.07))
                limit = .015+.090*t*t*(3-2*t)
                key.data[index].co.y = min(key.data[index].co.y, limit)
    for vertex, point in zip(obj.data.vertices, keys[0].data):
        vertex.co = point.co
    obj.data.update()

for polygon in body.data.polygons:
    polygon.use_smooth = True
for material in body.data.materials:
    if material.use_nodes:
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = .85
        alpha = shader.inputs.get('Alpha')
        for link in list(alpha.links):
            material.node_tree.links.remove(link)
        alpha.default_value = 1

from modular_motion import retarget

scene = bpy.context.scene
actions = retarget(rig, root)

carmela_wardrobe.build(body, rig, actions[0], os.path.join(source_dir, 'wardrobe'))

for action in actions:
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, int(action.frame_range[0]), action)
    if action.slots:
        strip.action_slot = action.slots[0]
rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
rig.data.pose_position = 'REST'
scene.frame_set(1)
os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source_dir, args.name+'-assembled.blend'))
rig.data.pose_position = 'POSE'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.abspath(args.output), export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_optimize_animation_size=False, export_morph=True, export_skins=True, export_yup=True, export_vertex_color='ACTIVE')
print('CARMELA_CHARACTER_OK', args.output)

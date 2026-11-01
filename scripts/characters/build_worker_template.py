"""Prepare a complete Tripo worker and keep its authored garment geometry."""

import argparse
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modular_motion import retarget, rest_hands_on_knees, fit_head_to_torso

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--blend', required=True)
parser.add_argument('--head', help='Uncompressed GLB of an existing expressive male template')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=os.path.abspath(args.source), automatic_bone_orientation=False)
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
rig.name = 'Carmela_Rig'
body.name = 'Patient_WorkerBody'

# FBX stores this mesh and its rig in different unit systems. Bake their
# world transforms separately so applying scale cannot scale the body twice.
world = body.matrix_world.copy()
height = max((world @ v.co).z for v in body.data.vertices)
scale = Matrix.Scale(1.78/height, 4)
rig.data.transform(scale @ rig.matrix_world)
rig.matrix_world = Matrix.Identity(4)
body.data.transform(scale @ world)
body.parent = rig
body.matrix_parent_inverse = Matrix.Identity(4)
body.matrix_basis = Matrix.Identity(4)
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
for polygon in body.data.polygons:
    polygon.use_smooth = True
material = body.data.materials[0]
material.name = 'Worker_OriginalTexture'
shader = material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .88
shader.inputs['Metallic'].default_value = 0
shader.inputs['Specular IOR Level'].default_value = .22
for link in list(shader.inputs['Alpha'].links):
    material.node_tree.links.remove(link)
shader.inputs['Alpha'].default_value = 1
for link in list(shader.inputs['Normal'].links):
    if link.from_node.type == 'NORMAL_MAP' and not link.from_node.inputs['Color'].is_linked:
        material.node_tree.links.remove(link)

if args.head:
    # The head is a separate island extending below the collar. A horizontal
    # cut leaves its lower throat behind and also cuts the shirt's high nape.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    seen, remove = set(), []
    for vertex in bm.verts:
        if vertex in seen: continue
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
        if min(v.co.z for v in component) > 1.3:
            remove.extend(component)
    bmesh.ops.delete(bm, geom=remove, context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    neck_groups = [body.vertex_groups[name] for name in ['mixamorig:Head', 'mixamorig:Neck']]
    chest = body.vertex_groups['mixamorig:Spine2']
    for vertex in body.data.vertices:
        if vertex.co.z < 1.35: continue
        moved = sum(g.weight for g in vertex.groups if g.group in [group.index for group in neck_groups])
        if not moved: continue
        existing = sum(g.weight for g in vertex.groups if g.group == chest.index)
        chest.add([vertex.index], existing+moved, 'REPLACE')
        for group in neck_groups: group.remove([vertex.index])
    before = set(bpy.context.scene.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.head))
    imported = [o for o in bpy.context.scene.objects if o not in before]
    heads = [o for o in imported if o.type == 'MESH' and
             o.name.startswith(('Carmela_', 'Patient_FacialHair_'))]
    delta = Vector((0, -.04, .04))
    for obj in heads:
        world = obj.matrix_world.copy()
        obj.data.transform(Matrix.Translation(delta) @ world, shape_keys=True)
        if obj.name == 'Carmela_Face':
            # Only the existing lower neck enters the new shirt opening;
            # preserve the jaw, chin and all expression displacements above it.
            head_group = obj.vertex_groups['mixamorig:Head'].index
            neck_weights = [1-sum(g.weight for g in point.groups if g.group == head_group)
                            for point in obj.data.vertices]
            def lower_neck(point, weight):
                t = max(0, min(1, (1.54-point.z)/.08))
                t = t*t*(3-2*t)*weight
                point.x *= 1+.25*t
                point.y = .01+(point.y-.01)*(1-.30*t)
                point.z -= .06*t
            for key in obj.data.shape_keys.key_blocks:
                for point, weight in zip(key.data, neck_weights): lower_neck(point.co, weight)
            for point, basis in zip(obj.data.vertices, obj.data.shape_keys.key_blocks[0].data):
                point.co = basis.co
        obj.parent = rig
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)
        for modifier in obj.modifiers:
            if modifier.type == 'ARMATURE': modifier.object = rig
        if 'modularDepthOffset' in obj:
            obj['modularDepthOffset'] -= delta.y
    for obj in imported:
        if obj not in heads: bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        if action not in before_actions: bpy.data.actions.remove(action)
    if not any(o.name == 'Carmela_Face' for o in heads):
        raise RuntimeError('The supplied head is missing the expressive face')

# Preserve the atlas and garment topology while giving skin, wool and cotton
# separate tint controls. Braces keep their original leather colour.
pixels = np.array(next(n.image for n in material.node_tree.nodes
                       if n.type == 'TEX_IMAGE').pixels[:], dtype=np.float32)
image = next(n.image for n in material.node_tree.nodes if n.type == 'TEX_IMAGE')
pixels = pixels.reshape(image.size[1], image.size[0], 4)
names = ['Patient_WorkCotton', 'Patient_WorkWool', 'Worker_Braces', 'Patient_Hands', 'Patient_MaleBoots']
body.data.materials.clear()
for name in names:
    unused = bpy.data.materials.get(name)
    if unused: unused.name = 'Unused_workerSource_'+name
    copy = material.copy()
    copy.name = name
    body.data.materials.append(copy)
groups = {g.index: g.name for g in body.vertex_groups}
uvs = body.data.uv_layers.active.data
for polygon in body.data.polygons:
    center = sum((body.data.vertices[i].co for i in polygon.vertices), Vector())/len(polygon.vertices)
    hands = sum(g.weight for i in polygon.vertices for g in body.data.vertices[i].groups
                if any(part in groups[g.group] for part in ['Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky']))/len(polygon.vertices)
    uv = sum((uvs[i].uv for i in polygon.loop_indices), Vector((0, 0)))/len(polygon.loop_indices)
    r, g, b = pixels[min(image.size[1]-1, int(uv.y*image.size[1])),
                     min(image.size[0]-1, int(uv.x*image.size[0])), :3]
    brace = r > g*1.2 and g < .33 and (abs(center.x) > .06 or center.y > .025)
    polygon.material_index = 3 if hands > .65 else 4 if center.z < .14 else 1 if center.z < 1.05 else 2 if brace else 0

body.shape_key_add(name='Basis')
for name in ['rc_bellySize', 'rc_waistWidth']:
    key = body.shape_key_add(name=name)
    key.slider_min = -1
    for point, original in zip(key.data, body.data.vertices):
        x, y, z = original.co
        trunk = math.exp(-((z-.99)/.26)**4-(x/.23)**4)
        trunk *= max(0, min(1, (z-.78)/.12))
        if name == 'rc_bellySize':
            point.co.y -= .065*trunk*max(0, min(1, (-y+.01)/.09))
            point.co.x += x*.10*trunk
        else:
            point.co.x += x*.15*trunk

actions = retarget(rig, root, lap_height=.65)
fit_head_to_torso(rig, actions)
rest_hands_on_knees(rig, next(a for a in actions if a.name == 'ClinicIdle'), palms_inward=True)
for action in actions:
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, int(action.frame_range[0]), action)
    strip.action_slot = action.slots[0]
rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
rig.data.pose_position = 'REST'
bpy.context.scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
rig.data.pose_position = 'POSE'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(args.output), export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='NLA_TRACKS',
    export_optimize_animation_size=False, export_morph=True,
    export_skins=True, export_yup=True, export_extras=True,
)
print('WORKER_TEMPLATE_OK', args.output, flush=True)

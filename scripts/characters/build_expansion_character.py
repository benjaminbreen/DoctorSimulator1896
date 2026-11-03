"""Fit a measured expressive donor to one complete Tripo clothing template."""
import argparse
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import carmela_hair
import carmela_wardrobe
import male_eyes
import male_facial_hair
import male_hair
import male_neck
from modular_motion import retarget, rest_hands_on_knees, fit_head_to_torso

parser = argparse.ArgumentParser()
parser.add_argument('--head', required=True)
parser.add_argument('--body', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--rebuild-body', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
source = os.path.join(root, 'assets/source/patient-expansion-2026-11-02')
head_config = json.load(open(os.path.join(source, args.head+'-fit.json')))
body_config = json.load(open(os.path.join(source, 'bodies.json')))[args.body]
male = head_config['identity'].startswith('male-')
if male != (body_config['sex'] == 'male'):
    raise RuntimeError('The head and clothing rig must have compatible proportions')
bpy.context.preferences.filepaths.save_version = 0
cache = os.path.join(source, 'prepared-'+args.body+'.blend')
if os.path.exists(cache) and not args.rebuild_body:
    bpy.ops.wm.open_mainfile(filepath=cache)
else:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=os.path.join(root, body_config['source']), automatic_bone_orientation=False)
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    rig.name = 'Carmela_Rig'
    body.name = 'Patient_ExpansionBody'
    world = body.matrix_world.copy()
    height = max((world @ v.co).z for v in body.data.vertices)
    scale = Matrix.Scale(body_config['height']/height, 4)
    rig.data.transform(scale @ rig.matrix_world)
    rig.matrix_world = Matrix.Identity(4)
    body.data.transform(scale @ world)
    body.parent = rig
    body.matrix_parent_inverse = Matrix.Identity(4)
    body.matrix_basis = Matrix.Identity(4)
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    material = body.data.materials[0]
    image = next(n.image for n in material.node_tree.nodes if n.type == 'TEX_IMAGE')
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4)
    head_indices = {body.vertex_groups[n].index for n in ['mixamorig:Head', 'mixamorig:Neck']}
    weights = [sum(g.weight for g in v.groups if g.group in head_indices) for v in body.data.vertices]
    bm = bmesh.new()
    bm.from_mesh(body.data)
    uv_layer = bm.loops.layers.uv.active
    remove, visited = set(), set()
    for vertex in bm.verts:
        if vertex in visited:
            continue
        stack, component = [vertex], []
        visited.add(vertex)
        while stack:
            current = stack.pop()
            component.append(current)
            for edge in current.link_edges:
                neighbor = edge.other_vert(current)
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        if min(v.co.z for v in component) > body_config['height']*.80 and max(v.co.z for v in component) > body_config['height']*.95:
            remove.update(f for v in component for f in v.link_faces)

    # Some exports weld the neck into the shirt. Classify complete UV charts,
    # so an ivory collar survives and desaturated skin fragments do not remain.
    parents = {f: f for f in bm.faces}
    def chart_root(face):
        while parents[face] != face:
            parents[face] = parents[parents[face]]
            face = parents[face]
        return face
    for edge in bm.edges:
        if len(edge.link_faces) != 2:
            continue
        a, b = edge.link_faces
        auv = {loop.vert: loop[uv_layer].uv for loop in a.loops}
        buv = {loop.vert: loop[uv_layer].uv for loop in b.loops}
        if all((auv[v]-buv[v]).length < 1e-5 for v in edge.verts):
            parents[chart_root(a)] = chart_root(b)
    charts = {}
    for face in bm.faces:
        charts.setdefault(chart_root(face), []).append(face)
    for faces in charts.values():
        vertices = {v for face in faces for v in face.verts}
        low, high = min(v.co.z for v in vertices), max(v.co.z for v in vertices)
        if low < body_config['height']*.80:
            continue
        colors = []
        for face in faces:
            uv = sum((loop[uv_layer].uv for loop in face.loops), Vector((0, 0)))/len(face.loops)
            colors.append(pixels[int((uv.y%1)*image.size[1]), int((uv.x%1)*image.size[0]), :3])
        r, g, b = np.median(colors, axis=0)
        skin = r > .45 and r > g*1.15 and r > b*1.23
        weight = sum(weights[v.index] for v in vertices)/len(vertices)
        if low > body_config['height']*.90 or (high > body_config['height']*.84 and skin and weight > .30):
            remove.update(faces)
    for face in bm.faces:
        if face in remove or face.calc_center_median().z < body_config['height']*.80:
            continue
        uv = sum((loop[uv_layer].uv for loop in face.loops), Vector((0, 0)))/len(face.loops)
        r, g, b = pixels[int((uv.y%1)*image.size[1]), int((uv.x%1)*image.size[0]), :3]
        weight = sum(weights[v.index] for v in face.verts)/len(face.verts)
        if weight > .40 and r > .50 and r-g > .09 and r-b > .14:
            remove.add(face)
        if args.body == 'C4' and face.calc_center_median().z > rig.data.bones['mixamorig:Neck'].head_local.z-.035 and abs(face.calc_center_median().x) < .10 and min(r,g,b) > .50:
            remove.add(face)
    print('NATIVE_HEAD_REMOVED', args.body, len(remove))
    bmesh.ops.delete(bm, geom=list(remove), context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    chest = body.vertex_groups['mixamorig:Spine2']
    for vertex in body.data.vertices:
        moved = sum(g.weight for g in vertex.groups if g.group in head_indices)
        if not moved:
            continue
        old = sum(g.weight for g in vertex.groups if g.group == chest.index)
        chest.add([vertex.index], old+moved, 'REPLACE')
        for index in head_indices:
            body.vertex_groups[index].remove([vertex.index])
    shader = material.node_tree.nodes.get('Principled BSDF')
    for name, value in [('Metallic', 0), ('Roughness', .86), ('Alpha', 1)]:
        for link in list(shader.inputs[name].links):
            material.node_tree.links.remove(link)
        shader.inputs[name].default_value = value
    for link in list(shader.inputs['Normal'].links):
        if link.from_node.type == 'NORMAL_MAP' and not link.from_node.inputs['Color'].is_linked:
            material.node_tree.links.remove(link)
    if args.body == 'C5':
        material.use_backface_culling = False
    actions = retarget(rig, root, lap_height=.66)
    fit_head_to_torso(rig, actions)
    rest_hands_on_knees(rig, next(a for a in actions if a.name == 'ClinicIdle'))
    if not male:
        adjacency = [[] for _ in body.data.vertices]
        for edge in body.data.edges:
            a, b = edge.vertices
            adjacency[a].append(b)
            adjacency[b].append(a)
        seen, skirt_vertices, hidden_legs = set(), set(), set()
        leg_groups = {g.index for g in body.vertex_groups if 'Leg' in g.name}
        for index in range(len(adjacency)):
            if index in seen:
                continue
            stack, component = [index], []
            seen.add(index)
            while stack:
                current = stack.pop()
                component.append(current)
                for neighbor in adjacency[current]:
                    if neighbor not in seen:
                        seen.add(neighbor)
                        stack.append(neighbor)
            points = [body.data.vertices[i].co for i in component]
            if min(p.z for p in points) < .45 and max(p.z for p in points) < 1.22 and min(p.x for p in points) < -.18 and max(p.x for p in points) > .18:
                skirt_vertices.update(component)
            leg = sum(g.weight for i in component for g in body.data.vertices[i].groups if g.group in leg_groups)/len(component)
            if min(p.z for p in points) > .05 and max(p.z for p in points) < .85 and leg > .5:
                hidden_legs.update(component)
        if hidden_legs:
            bm = bmesh.new()
            bm.from_mesh(body.data)
            bm.verts.ensure_lookup_table()
            skirt = {bm.verts[i] for i in skirt_vertices}
            bmesh.ops.delete(bm, geom=[bm.verts[i] for i in hidden_legs], context='VERTS')
            bm.verts.index_update()
            skirt_vertices = {v.index for v in skirt if v.is_valid}
            bm.to_mesh(body.data)
            bm.free()
        carmela_wardrobe.build(body, rig, actions[0], os.path.join(source, 'wardrobe-'+args.body),
                              waist_z=body_config['waist'], hem_z=body_config['hem'], shoe_top=.38,
                              skirt_vertices=skirt_vertices or None, fabric_band=body_config.get('fabricBand'))
        for obj in list(bpy.context.scene.objects):
            if obj.name.startswith('Patient_Apron'):
                bpy.data.objects.remove(obj, do_unlink=True)
    else:
        names = ['Patient_MaleFabric', 'Patient_Hands', 'Patient_MaleBoots', 'Patient_MaleShirt']
        body.data.materials.clear()
        for name in names:
            copy = material.copy()
            copy.name = name
            body.data.materials.append(copy)
        groups = {g.index: g.name for g in body.vertex_groups}
        for polygon in body.data.polygons:
            center = sum((body.data.vertices[i].co for i in polygon.vertices), Vector())/len(polygon.vertices)
            hand = sum(g.weight for i in polygon.vertices for g in body.data.vertices[i].groups
                       if 'Hand' in groups[g.group])/len(polygon.vertices)
            uv = sum((body.data.uv_layers.active.data[i].uv for i in polygon.loop_indices), Vector((0, 0)))/len(polygon.loop_indices)
            color = pixels[min(image.size[1]-1, int((uv.y%1)*image.size[1])), min(image.size[0]-1, int((uv.x%1)*image.size[0])), :3]
            polygon.material_index = 1 if hand > .65 else 2 if center.z < .20 else 3 if np.mean(color) > .58 else 0
        body.shape_key_add(name='Basis')
        for name in ['rc_bellySize', 'rc_waistWidth']:
            key = body.shape_key_add(name=name)
            key.slider_min = -1
            for point, vertex in zip(key.data, body.data.vertices):
                x, y, z = vertex.co
                weight = math.exp(-((z-1.02)/.24)**4-(x/.24)**4)*max(0, min(1, (z-.80)/.12))
                if name == 'rc_bellySize':
                    point.co.y -= .055*weight*max(0, min(1, (-y+.01)/.09))
                    point.co.x += x*.08*weight
                else:
                    point.co.x += x*.12*weight
        if args.body == 'C4':
            joint = rig.data.bones['mixamorig:Neck'].head_local
            vertices, faces, uv = [], [], []
            for layer in range(4):
                top, inner = layer%2 == 0, layer >= 2
                for column in range(65):
                    angle = .045+(math.tau-.09)*column/64
                    back = (1-math.cos(angle))/2
                    radius_x = (.064 if top else .070)-(.002 if inner else 0)
                    radius_y = (.055 if top else .064)-(.002 if inner else 0)
                    vertices.append((joint.x+math.sin(angle)*radius_x,joint.y-math.cos(angle)*radius_y,
                                     joint.z+(-.002+.025*back if top else -.027+.025*back)))
                    uv.append((column/64,1 if top else 0))
            for column in range(64):
                for a,b in [(0,1),(3,2),(2,0),(1,3)]:
                    i,j=a*65+column,b*65+column
                    faces.append((i,i+1,j+1,j))
            faces.extend([(0,65,195,130),(64,194,259,129)])
            mesh=bpy.data.meshes.new('Worker_BandCollar');mesh.from_pydata(vertices,[],faces)
            collar=bpy.data.objects.new('Patient_ExpansionCollar',mesh);bpy.context.collection.objects.link(collar)
            cloth=bpy.data.materials.new('Patient_Collar');cloth.use_nodes=True
            bsdf=cloth.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.90
            for channel,file in [('Base Color','linen-albedo.webp'),('Normal','linen-normal.webp')]:
                texture=cloth.node_tree.nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(os.path.join(root,'game/public/textures/headwear',file),check_existing=True)
                if channel == 'Normal':
                    texture.image.colorspace_settings.name='Non-Color'
                    normal=cloth.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.3
                    cloth.node_tree.links.new(texture.outputs['Color'],normal.inputs['Color']);cloth.node_tree.links.new(normal.outputs[0],bsdf.inputs['Normal'])
                else:cloth.node_tree.links.new(texture.outputs['Color'],bsdf.inputs[channel])
            mesh.materials.append(cloth);layer=mesh.uv_layers.new(name='UVMap')
            for loop in mesh.loops:layer.data[loop.index].uv=uv[loop.vertex_index]
            for polygon in mesh.polygons:polygon.use_smooth=True
            bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
            collar.parent=rig;collar.matrix_parent_inverse=Matrix.Identity(4)
            collar.vertex_groups.new(name='mixamorig:Spine2').add(list(range(len(vertices))),1,'REPLACE')
            collar.modifiers.new('Patient skeleton','ARMATURE').object=rig
    body['garmentStyle'] = body_config['outfit']
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
    bpy.ops.wm.save_as_mainfile(filepath=cache)

rig = bpy.data.objects['Carmela_Rig']
body = bpy.data.objects['Patient_ExpansionBody']
rig.data.pose_position = 'REST'
path = os.path.join(source, 'fitted-'+args.head, 'carmela-head.blend')
with bpy.data.libraries.load(path, link=False) as (available, loaded):
    loaded.objects = [n for n in available.objects if n.startswith(('Carmela_', 'Tripo_Surface_Reference'))]
parts = []
for obj in loaded.objects:
    bpy.context.collection.objects.link(obj)
    obj.hide_set(False)
    obj.hide_render = False
    parts.append(obj)
reference = next(o for o in parts if o.name == 'Tripo_Surface_Reference')
parts.remove(reference)
face = next(o for o in parts if o.name == 'Carmela_Face')
face['fittedMouthSeam'] = True
face['modularSkinReference'] = head_config['skinReference']
face['expansionHead'] = args.head
face['expansionFitVersion'] = 2

def skin_median(obj, material, accepts):
    image = next(n.image for n in material.node_tree.nodes if n.type == 'TEX_IMAGE')
    sample = image.copy()
    sample.scale(512, 512)
    pixels = np.array(sample.pixels[:], dtype=np.float32).reshape(512, 512, 4)
    bpy.data.images.remove(sample)
    colors = []
    for polygon in obj.data.polygons:
        if obj.data.materials[polygon.material_index] != material:
            continue
        center = sum((obj.data.vertices[i].co for i in polygon.vertices), Vector())/len(polygon.vertices)
        if not accepts(center):
            continue
        uv = sum((obj.data.uv_layers.active.data[i].uv for i in polygon.loop_indices), Vector((0, 0)))/len(polygon.loop_indices)
        color = pixels[int((uv.y%1)*512), int((uv.x%1)*512), :3]
        if color.mean() > .04:
            colors.append(color)
    if not colors:
        raise RuntimeError('No visible skin samples for hand colour matching')
    return np.median(colors, axis=0)

cheek = skin_median(reference, reference.data.materials[0],
                    lambda p: .08 < abs(p.x) < .18 and head_config['anchors'][0]-.12 < p.z < head_config['anchors'][0]-.05 and p.y < 0)
hands_material = next(m for m in body.data.materials if m.name == 'Patient_Hands')
hands = skin_median(body, hands_material, lambda p: True)
hands_material['modularNativeSkinGain'] = np.clip(cheek/np.maximum(hands, .01), .25, 2).tolist()
male_eyes.build(parts, head_config['identity'], source, head_config.get('irisColor'))
if male:
    parts.extend(male_hair.build(reference, root))
    parts.extend(male_facial_hair.build(face, next(o for o in parts if o.name == 'Carmela_Lips'),
                                      head_config['identity'], head_config['anchors']))
else:
    hair_frame = Matrix.Translation(Vector((0, 0, 1.30))) @ Matrix.Scale(.35, 4)
    reference.data.transform(hair_frame)
    hair = carmela_hair.build(reference, os.path.join(root, 'assets/source/carmela-russo-2026-10-29'), head_config['identity'])
    reference.data.transform(hair_frame.inverted())
    for obj in hair:
        obj.data.transform(hair_frame.inverted(), shape_keys=True)
    parts.extend(hair)

head_scale = .29 if not male else .31
eye_z, _, _, mouth_z, _ = head_config['anchors']
nose = min((v.co for v in reference.data.vertices if abs(v.co.x) < .04 and mouth_z+.03 < v.co.z < eye_z-.06), key=lambda p: p.y)
collar_z = max(v.co.z for v in body.data.vertices if abs(v.co.x) < .085 and v.co.z > body_config['height']*.78)
neck_joint = rig.data.bones['mixamorig:Neck'].head_local
low_neck = [v.co for v in reference.data.vertices if abs(v.co.z-head_config['chinZ']+.10) < .02]
neck_center = Vector(tuple((min(p[i] for p in low_neck)+max(p[i] for p in low_neck))/2 for i in range(3)))
# The collar's tall back edge is not the front throat. Anchor the complete
# head to the cervical joint, with a short gap beneath the measured chin.
head_origin = Vector((neck_joint.x-neck_center.x*head_scale, neck_joint.y-neck_center.y*head_scale,
                      neck_joint.z+.12*head_scale-head_config['chinZ']*head_scale))
base = (rig.data.bones['mixamorig:Neck'].head_local-head_origin)/head_scale
base.z -= .04/head_scale
shoulders = (rig.data.bones['mixamorig:LeftArm'].head_local.x-rig.data.bones['mixamorig:RightArm'].head_local.x)/2
neck_radius = (shoulders*.31/head_scale, shoulders*.27/head_scale)
male_neck.fit(face, reference, os.path.join(source, args.head+'-'+args.body+'-neck.png'), base, neck_radius,
              fill_extension=True, cut_height=head_config['chinZ']-.035)
bpy.data.objects.remove(reference, do_unlink=True)
for obj in parts:
    if obj.type != 'MESH':
        continue
    if not obj.data.shape_keys:
        obj.shape_key_add(name='Basis')
    basis = obj.data.shape_keys.key_blocks[0]
    for name in ['rc_headWidth', 'rc_noseWidth', 'rc_jawLength', 'rc_foreheadHeight']:
        key = obj.shape_key_add(name=name)
        for point, original in zip(key.data, basis.data):
            x, y, z = original.co
            if name == 'rc_headWidth':
                point.co.x += x*.12*math.exp(-((z-.56)/.25)**2)*max(0, min(1, (z-.32)/.10))
            elif name == 'rc_noseWidth':
                point.co.x += x*.30*math.exp(-(x/.085)**2-((z-.53)/.09)**2)*max(0, min(1, (-y-.1)/.1))
            elif name == 'rc_jawLength':
                point.co.z -= .035*math.exp(-((z-.32)/.13)**2-(x/.23)**2)*max(0, min(1, (z-.24)/.08))
            else:
                point.co.z += .025*math.exp(-((z-.90)/.16)**2)
    obj.data.transform(Matrix.Translation(head_origin) @ Matrix.Scale(head_scale, 4), shape_keys=True)
    for vertex, original in zip(obj.data.vertices, obj.data.shape_keys.key_blocks[0].data):
        vertex.co = original.co
    if obj.name.startswith('Carmela_Eye_'):
        obj['modularDepthOffset'] = -head_origin.y
        obj['modularNeckGuard'] = True
        obj['modularNoseRatio'] = (nose.z-mouth_z)/(eye_z-mouth_z)
        obj['modularChinRatio'] = (mouth_z-head_config['chinZ'])/(eye_z-mouth_z)
    obj.vertex_groups.clear()
    head = obj.vertex_groups.new(name='mixamorig:Head')
    neck = obj.vertex_groups.new(name='mixamorig:Neck')
    chest = obj.vertex_groups.new(name='mixamorig:Spine2')
    chin_z = head_origin.z+head_config['chinZ']*head_scale
    for vertex in obj.data.vertices:
        t = max(0, min(1, (vertex.co.z-(chin_z-.055))/.030)) if obj == face else 1
        n = max(0, min(1, (vertex.co.z-(chin_z-.095))/.040))
        head.add([vertex.index], t, 'REPLACE')
        neck.add([vertex.index], (1-t)*n, 'REPLACE')
        chest.add([vertex.index], (1-t)*(1-n), 'REPLACE')
    obj.parent = rig
    obj.matrix_parent_inverse = Matrix.Identity(4)
    modifier = obj.modifiers.new('Patient skeleton', 'ARMATURE')
    modifier.object = rig
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()
print('EXPANSION_FIT', args.head, args.body, 'origin', tuple(head_origin), 'collar', collar_z, flush=True)
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
rig.data.pose_position = 'REST'
bpy.context.scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source, args.head+'-'+args.body+'-assembled.blend'))
rig.data.pose_position = 'POSE'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.abspath(args.output), export_format='GLB', use_selection=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_optimize_animation_size=False, export_morph=True, export_skins=True,
                          export_yup=True, export_extras=True)
print('EXPANSION_CHARACTER_OK', args.output, flush=True)

"""Assemble the two new male bodies with fitted expressive heads and motions."""
import argparse
import math
import os
import sys
import shutil
import tempfile
import bmesh
import numpy as np
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from modular_motion import retarget, rest_hands_on_knees, fit_head_to_torso
import male_hair
import male_facial_hair
import male_neck
import male_eyes
import male_workwear

parser = argparse.ArgumentParser()
parser.add_argument('--identity', choices=['male-a','male-b'], required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--reuse-motions', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
source = os.path.join(root, 'assets/source/modular-men-2026-10-31')
# Fit the jaw and neck to the collar; the donor body crowns are too tall.
config = {
 'male-a': ('male-a-body-mixamo-p2-v1/tripo_convert_ec971f25-28f2-4659-9edd-49fd07969310.fbx', 1.78, 1.393, .050, .656),
 'male-b': ('male-b-body-mixamo-p2-v1/tripo_convert_d1aa07ed-cef1-4f55-9b8b-5a839f8a1966.fbx', 1.74, 1.373, .030, .645),
}
fbx, height, head_z, head_y, eye_z = config[args.identity]
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=os.path.join(source, fbx), automatic_bone_orientation=False)
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
rig.name = 'Carmela_Rig'
body.name = 'Patient_MaleBody'
rig.scale *= height/max(v.co.z for v in body.data.vertices)
bpy.context.view_layer.update()
for obj in [rig, body]:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
neck_z = rig.data.bones['mixamorig:Neck'].head_local.z
body.data.calc_loop_triangles()
body_image=next(n.image for n in body.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
body_pixels=np.array(body_image.pixels[:],dtype=np.float32).reshape(body_image.size[1],body_image.size[0],4)
bm = bmesh.new()
bm.from_mesh(body.data)
uv_layer=bm.loops.layers.uv.active
skin_faces=[]
head_index=body.vertex_groups['mixamorig:Head'].index
neck_index=body.vertex_groups['mixamorig:Neck'].index
head_weights=[sum(g.weight for g in v.groups if g.group==head_index) for v in body.data.vertices]
neck_weights=[sum(g.weight for g in v.groups if g.group==neck_index) for v in body.data.vertices]
# The donor head is a separate island. Keep the complete shirt collar;
# a horizontal vertex cut also removes the raised collar and tears it.
seen, remove, boot_vertices = set(), [], set()
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
    low, high = min(v.co.z for v in component), max(v.co.z for v in component)
    if high<.16 and low<.02:boot_vertices.update(component)
    if low > height*.89 or (low > height*.79 and high > height*.95):
        remove.extend(component)
    elif high > height*.95:
        # The broad donor joins its head to the torso, while its shirt collar
        # is a separate island. Cut only the joined carrier inside that collar.
        component_set=set(component)
        remove.extend(v for v in component if v.co.z > height*.89)
        for polygon in bm.faces:
            if not all(v in component_set for v in polygon.verts): continue
            if polygon.calc_center_median().z < height*.805: continue
            colors=[]
            for loop in polygon.loops:
                u,v=loop[uv_layer].uv
                colors.append(body_pixels[min(body_image.size[1]-1,int((v%1)*body_image.size[1])),min(body_image.size[0]-1,int((u%1)*body_image.size[0])),:3])
            r,g,b=np.mean(colors,axis=0)
            head_weight=sum(head_weights[v.index] for v in polygon.verts)/len(polygon.verts)
            neck_weight=sum(neck_weights[v.index] for v in polygon.verts)/len(polygon.verts)
            skin=r>.01 and r>g*1.10 and r>b*1.18 and b>g*.76
            if head_weight>.5 or (head_weight+neck_weight>.5 and skin):
                skin_faces.append(polygon)
bmesh.ops.delete(bm, geom=skin_faces, context='FACES')
bmesh.ops.delete(bm, geom=list({v for v in remove if v.is_valid}|{v for v in bm.verts if not v.link_faces}), context='VERTS')
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0004)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.verts.index_update()
boot_indices={v.index for v in boot_vertices if v.is_valid}
bm.to_mesh(body.data)
bm.free()

# Collars and lapels belong to the garment, not the moving head. Tripo's
# neck weights pull their separate layers apart when the patient looks down.
spine_group=body.vertex_groups['mixamorig:Spine2']
for vertex in body.data.vertices:
    extra=sum(g.weight for g in vertex.groups if g.group in (head_index,neck_index))
    if extra<=0:continue
    existing=sum(g.weight for g in vertex.groups if g.group==spine_group.index)
    spine_group.add([vertex.index],existing+extra,'REPLACE')
    body.vertex_groups['mixamorig:Head'].remove([vertex.index])
    body.vertex_groups['mixamorig:Neck'].remove([vertex.index])
for vertex in body.data.vertices:
    if abs(vertex.co.x)<.13 and vertex.co.z>neck_z-.07:
        vertex.co.z=neck_z-.07+(vertex.co.z-neck_z+.07)*.70
body.data.update()

# Separate hands, cloth and boots so fabric colour never tints exposed skin.
original = body.data.materials[0]
body.data.materials.clear()
for name in ['Patient_MaleFabric','Patient_Hands','Patient_MaleBoots','Patient_MaleShirt']:
    material = original.copy()
    material.name = name
    material.use_backface_culling = name!='Patient_Hands'
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .83
    for link in list(shader.inputs['Alpha'].links):
        material.node_tree.links.remove(link)
    shader.inputs['Alpha'].default_value = 1
    body.data.materials.append(material)
collar=bpy.data.materials.new('Patient_MaleCollar');collar.use_nodes=True
collar.use_backface_culling=True
collar.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.76,.71,.61,1)
collar.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.88
body.data.materials.append(collar)
groups = {g.index:g.name for g in body.vertex_groups}
for polygon in body.data.polygons:
    weights = {}
    for index in polygon.vertices:
        for g in body.data.vertices[index].groups:
            name = groups[g.group]
            weights[name] = weights.get(name, 0)+g.weight/len(polygon.vertices)
    center = polygon.center
    hand = sum(w for n,w in weights.items() if any(s in n for s in ['Hand','Thumb','Index','Middle','Ring','Pinky']))
    if hand > .65:
        polygon.material_index = 1
    elif sum(i in boot_indices for i in polygon.vertices)>=len(polygon.vertices)/2 or (not boot_indices and center.z<.115):
        polygon.material_index = 2
    elif args.identity == 'male-b' and abs(center.x) > .19 and center.z > .85 and sum(w for n,w in weights.items() if 'Arm' in n or 'Shoulder' in n)>.40:
        polygon.material_index = 3
    elif args.identity=='male-a' and center.z>height*.5:
        colors=[]
        for i in polygon.loop_indices:
            u,v=body.data.uv_layers.active.data[i].uv
            colors.append(body_pixels[min(body_image.size[1]-1,int((v%1)*body_image.size[1])),min(body_image.size[0]-1,int((u%1)*body_image.size[0])),:3])
        if np.mean(colors)>.64:polygon.material_index=3
    polygon.use_smooth = True
if args.identity=='male-b':
    bm=bmesh.new();bm.from_mesh(body.data);seen=set()
    for vertex in bm.verts:
        if vertex in seen:continue
        todo=[vertex];component=set(todo);seen.add(vertex)
        while todo:
            current=todo.pop()
            for edge in current.link_edges:
                for neighbor in edge.verts:
                    if neighbor not in seen:seen.add(neighbor);component.add(neighbor);todo.append(neighbor)
        if min(v.co.z for v in component)>height*.80 and max(v.co.z for v in component)<height*.89 and len(component)>400:
            for polygon in {p for v in component for p in v.link_faces}:polygon.material_index=4
    bm.to_mesh(body.data);bm.free()
body.shape_key_add(name='Basis')
for name in ['rc_bellySize','rc_waistWidth']:
    key = body.shape_key_add(name=name)
    key.value = 0
    key.slider_min = -1
    for v, base in zip(key.data, body.data.vertices):
        x,y,z = base.co
        trunk = math.exp(-((z-height*.56)/(.17*height))**4-(x/.20)**4)
        trunk *= max(0,min(1,(z-height*.46)/(height*.07)))
        front = max(0,min(1,(-y+.015)/.09))
        if name == 'rc_bellySize':
            v.co.y -= .085*trunk*front
            v.co.x += x*.12*trunk
        else:
            v.co.x += x*.17*trunk

path = os.path.join(source, 'fitted-'+args.identity, 'carmela-head.blend')
with bpy.data.libraries.load(path, link=False) as (available, loaded):
    loaded.objects = [n for n in available.objects if n.startswith(('Carmela_', 'Tripo_Surface_Reference')) or n in ('Eyes','Teeth')]
parts = []
for obj in loaded.objects:
    bpy.context.collection.objects.link(obj)
    obj.hide_set(False)
    obj.hide_render = False
    parts.append(obj)
reference = next(o for o in parts if o.name == 'Tripo_Surface_Reference')
parts.remove(reference)
parts.extend(male_hair.build(reference, root))
male_eyes.build(parts,args.identity,source)
parts.extend(male_facial_hair.build(next(o for o in parts if o.name=='Carmela_Face'),next(o for o in parts if o.name=='Carmela_Lips'),args.identity))
base=(rig.data.bones['mixamorig:Neck'].head_local-Vector((0,head_y,head_z)))/.330
base.z-=.070/.330
shoulder=(rig.data.bones['mixamorig:LeftArm'].head_local.x-rig.data.bones['mixamorig:RightArm'].head_local.x)/2+.020
neck_radius=shoulder*.33/.330
male_neck.fit(next(o for o in parts if o.name=='Carmela_Face'),reference,os.path.join(source,args.identity+'-neck-skin.png'),base,(neck_radius,neck_radius*.85),args.identity=='male-b')
bpy.data.objects.remove(reference, do_unlink=True)
# Retain the fitted-head naming contract used by both facial controllers.
for obj in parts:
    if not obj.data.shape_keys:
        obj.shape_key_add(name='Basis')
    basis = obj.data.shape_keys.key_blocks[0]
    for name in ['rc_headWidth','rc_noseWidth','rc_jawLength','rc_foreheadHeight']:
        key = obj.shape_key_add(name=name)
        key.value = 0
        for v, base in zip(key.data, basis.data):
            x,y,z = base.co
            if name == 'rc_headWidth':
                v.co.x += x*.14*math.exp(-((z-.56)/.25)**2)*max(0,min(1,(z-.32)/.10))
            elif name == 'rc_noseWidth':
                v.co.x += x*.32*math.exp(-(x/.085)**2-((z-eye_z+.13)/.09)**2)*max(0,min(1,(-y-.1)/.1))
            elif name == 'rc_jawLength':
                v.co.z -= .045*math.exp(-((z-.32)/.13)**2-(x/.23)**2)*max(0,min(1,(z-.24)/.08))*max(0,min(1,(-y-.03)/.14))
            else:
                v.co.z += .03*math.exp(-((z-.90)/.16)**2)
    if args.identity == 'male-b' and obj.name.startswith('Carmela_Teeth'):
        for key in obj.data.shape_keys.key_blocks:
            for v in key.data: v.co.y += .038
    for key in obj.data.shape_keys.key_blocks:
        for v in key.data:
            v.co = v.co*.330+Vector((0,head_y,head_z))
    for v, base in zip(obj.data.vertices, basis.data):
        v.co = base.co
    if obj.name.startswith('Carmela_Eye_'):
        obj['modularDepthOffset'] = -head_y
        obj['modularNeckGuard'] = True
    obj.vertex_groups.clear()
    head = obj.vertex_groups.new(name='mixamorig:Head')
    neck = obj.vertex_groups.new(name='mixamorig:Neck')
    spine = obj.vertex_groups.new(name='mixamorig:Spine2')
    for v in obj.data.vertices:
        t = max(0,min(1,(v.co.z-(head_z+.060))/.025)) if obj.name=='Carmela_Face' else 1
        n = max(0,min(1,(v.co.z-(head_z+.045))/.035))
        head.add([v.index],t,'REPLACE')
        neck.add([v.index],(1-t)*n,'REPLACE')
        spine.add([v.index],(1-t)*(1-n),'REPLACE')
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = obj.modifiers.new('Patient skeleton','ARMATURE')
    modifier.object = rig
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()
scene = bpy.context.scene
cache = os.path.join(source,args.identity+'-assembled.blend')
if args.reuse_motions and os.path.exists(cache):
    motion_cache = os.path.join(tempfile.gettempdir(),args.identity+'-motion-cache.blend')
    shutil.copy2(cache,motion_cache)
    with bpy.data.libraries.load(motion_cache,link=False) as (available,loaded):
        loaded.actions = available.actions
    actions = loaded.actions
    rig.animation_data_create()
else:
    actions = retarget(rig, root, lap_height=.69 if args.identity=='male-a' else .68)
fit_head_to_torso(rig, actions)
rest_hands_on_knees(rig,next(a for a in actions if a.name=='ClinicIdle'))
male_workwear.build(body,rig,next(a for a in actions if a.name=='ClinicIdle'),height,os.path.join(source,'workwear-'+args.identity))
for action in actions:
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name,int(action.frame_range[0]),action)
    if action.slots:
        strip.action_slot = action.slots[0]
rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
rig.data.pose_position = 'REST'
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source,args.identity+'-assembled.blend'))
rig.data.pose_position = 'POSE'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.abspath(args.output),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_optimize_animation_size=False,export_morph=True,export_skins=True,export_yup=True,export_extras=True)
print('MODULAR_MALE_OK',args.identity,args.output)

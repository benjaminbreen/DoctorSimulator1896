"""Reject sleeve and lower-face stretching across the consultation motions."""

import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--blend', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.blend))
rig = bpy.data.objects['Carmela_Rig']
rig.data.pose_position = 'POSE'
for track in rig.animation_data.nla_tracks:
    track.mute = True
body = bpy.data.objects.get('Patient_MaleBody') or bpy.data.objects['Carmela_DayDress']
sleeves = bpy.data.objects.get('Patient_FormalUpper') or body
work = bpy.data.objects.get('Patient_WorkShirt')
male = body.name == 'Patient_MaleBody'
if male:
    skin={i for polygon in body.data.polygons if body.data.materials[polygon.material_index].name in ['Patient_Hands','Patient_WristSkin'] for i in polygon.vertices}
    neighbors={i:[] for i in skin}
    for edge in body.data.edges:
        a,b=edge.vertices
        if a in skin and b in skin:neighbors[a].append(b);neighbors[b].append(a)
    remaining=set(skin);components=[]
    while remaining:
        pending=[remaining.pop()];component=[]
        while pending:
            current=pending.pop();component.append(current)
            for neighbor in neighbors[current]:
                if neighbor in remaining:remaining.remove(neighbor);pending.append(neighbor)
        components.append(component)
    if len(components)!=2:raise RuntimeError(f'Hands contain detached skin or cuff pieces: {list(map(len,components))}')
    print('CONTINUOUS_HANDS_OK',list(map(len,components)))
face = bpy.data.objects['Carmela_Face']
for obj in [body,face,sleeves]:
    for key in obj.data.shape_keys.key_blocks:
        key.value = 0
face_edges = []
head_group = face.vertex_groups.get('mixamorig:Head').index
for edge in face.data.edges:
    a, b = [face.data.vertices[i] for i in edge.vertices]
    rigid = all(any(g.group == head_group and g.weight > .999 for g in v.groups) for v in (a,b))
    if rigid and all(v.co.y < -.035 and (male or 1.395 < v.co.z < 1.48) for v in (a,b)):
        length = (a.co-b.co).length
        if length > .002:
            face_edges.append((a.index, b.index, length))
if not face_edges:
    raise RuntimeError('No lower-face edges were selected for the motion audit')
edges = []
for edge in sleeves.data.edges:
    a, b = [sleeves.data.vertices[i] for i in edge.vertices]
    center = (a.co+b.co)/2
    length = (a.co-b.co).length
    if abs(center.x) > .22 and .65 < center.z < 1.3 and length > .005:
        edges.append((a.index, b.index, length))
work_edges=[]
if work:
    for edge in work.data.edges:
        a,b=[work.data.vertices[i] for i in edge.vertices]
        length=(a.co-b.co).length
        if abs(((a.co+b.co)/2).x)>.23 and length>.005:
            work_edges.append((a.index,b.index,length))
samples = []
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    start, end = action.frame_range
    for fraction in [0, .25, .5, .75, 1]:
        bpy.context.scene.frame_set(round(start+(end-start)*fraction))
        bpy.context.view_layer.update()
        evaluated = sleeves.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        stretch = max((mesh.vertices[a].co-mesh.vertices[b].co).length/length for a, b, length in edges)
        evaluated.to_mesh_clear()
        evaluated = face.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        ratios = [(mesh.vertices[a].co-mesh.vertices[b].co).length/length for a, b, length in face_edges]
        samples.append({'clip': action.name, 'fraction': fraction, 'maxSleeveEdgeStretch': round(stretch, 4),
                        'minLowerFaceStretch': round(min(ratios), 4), 'maxLowerFaceStretch': round(max(ratios), 4)})
        evaluated.to_mesh_clear()
        if work_edges:
            evaluated=work.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
            samples[-1]['maxWorkSleeveStretch']=max((mesh.vertices[a].co-mesh.vertices[b].co).length/length for a,b,length in work_edges)
            evaluated.to_mesh_clear()
            if samples[-1]['maxWorkSleeveStretch']>4:raise RuntimeError(f'Work sleeve stretches excessively: {samples[-1]}')
        if male and action.name == 'ClinicIdle':
            errors = []
            for side in ['Left','Right']:
                knee = rig.pose.bones[f'mixamorig:{side}Leg'].matrix.translation
                hip = rig.pose.bones[f'mixamorig:{side}UpLeg'].matrix.translation
                target = knee+(hip-knee).normalized()*.095+Vector((0,0,.112))
                wrist = rig.pose.bones[f'mixamorig:{side}Hand'].matrix.translation
                errors.append((wrist-target).length)
            samples[-1]['maxWristTargetError'] = max(errors)
            if max(errors) > .003: raise RuntimeError(f'Hand misses the knee rest: {samples[-1]}')
os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
with open(args.output, 'w') as output:
    json.dump(samples, output, indent=2)
worst = max(samples, key=lambda s: s['maxSleeveEdgeStretch'])
if worst['maxSleeveEdgeStretch'] > 4:
    raise RuntimeError(f'Excessive sleeve deformation: {worst}')
bad_face = next((s for s in samples if s['maxLowerFaceStretch'] > 1.05 or s['minLowerFaceStretch'] < .95), None)
if bad_face:
    raise RuntimeError(f'Lower face changes shape during head motion: {bad_face}')
print('MODULAR_MOTION_OK', len(samples), worst)

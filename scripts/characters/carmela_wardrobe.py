"""Keep the generated bodice and bake a continuous skirt for seated poses."""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def crop(obj, remove):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if remove(f)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()


def build(body, rig, clinic_action, output, waist_z=None, hem_z=.08, shoe_top=.30, skirt_vertices=None, fabric_band=None):
    fitted_waist = waist_z is not None
    waist_z = 1.035 if waist_z is None else waist_z
    os.makedirs(output, exist_ok=True)
    rig.data.pose_position = 'REST'
    cloth = body.data.materials[0]
    cloth.name = 'Patient_DressFabric'
    skin = cloth.copy()
    skin.name = 'Patient_Hands'
    boots = cloth.copy()
    boots.name = 'Patient_Boots'
    body.data.materials.append(skin)
    body.data.materials.append(boots)
    collar = cloth.copy()
    collar.name = 'Patient_Collar'
    body.data.materials.append(collar)
    arm_groups = {g.index for g in body.vertex_groups if any(s in g.name for s in ('Arm', 'Hand'))}
    hand_groups = {g.index for g in body.vertex_groups if 'Hand' in g.name}
    adjacency = [[] for _ in body.data.vertices]
    for edge in body.data.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    seen, shoe_vertices = set(), set()
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
        heights = [body.data.vertices[i].co.z for i in component]
        if len(component) > 100 and min(heights) < .01 and max(heights) < shoe_top:
            shoe_vertices.update(component)
            side = 'Left' if sum(body.data.vertices[i].co.x for i in component) > 0 else 'Right'
            foot = body.vertex_groups[f'mixamorig:{side}Foot']
            for vertex_index in component:
                for group_index in [entry.group for entry in body.data.vertices[vertex_index].groups]:
                    body.vertex_groups[group_index].remove([vertex_index])
                foot.add([vertex_index], 1, 'REPLACE')
    def weight(vertex, groups):
        return sum(e.weight for e in body.data.vertices[vertex].groups if e.group in groups)
    for polygon in body.data.polygons:
        if sum(weight(i, hand_groups) for i in polygon.vertices) / len(polygon.vertices) > .20:
            polygon.material_index = 1
        elif polygon.center.z < .24:
            polygon.material_index = 2
        elif polygon.center.z > 1.32 and abs(polygon.center.x) < .10:
            polygon.material_index = 3
    skirt_faces = set()
    segments = []
    for side in ['Left', 'Right']:
        elbow = rig.data.bones[f'mixamorig:{side}ForeArm'].head_local
        wrist = rig.data.bones[f'mixamorig:{side}Hand'].head_local
        tip = rig.data.bones[f'mixamorig:{side}HandMiddle3'].tail_local
        segments.extend([(elbow, wrist), (wrist, tip)])
    def arm_distance(point):
        distances = []
        for a, b in segments:
            direction = b-a
            t = max(0, min(1, (point-a).dot(direction)/direction.length_squared))
            distances.append((point-(a+direction*t)).length)
        return min(distances)
    for polygon in body.data.polygons:
        center = sum((body.data.vertices[i].co for i in polygon.vertices), Vector()) / len(polygon.vertices)
        arm = arm_distance(center) < .075 and max(weight(i, arm_groups) for i in polygon.vertices) > .35
        shoe = all(i in shoe_vertices for i in polygon.vertices)
        skirt = all(i in skirt_vertices for i in polygon.vertices) if skirt_vertices is not None else center.z < waist_z and not arm and not shoe
        if skirt:
            skirt_faces.add(polygon.index)
    standing = body.copy()
    standing.data = body.data.copy()
    standing.name = 'Patient_SkirtStanding'
    bpy.context.collection.objects.link(standing)
    crop(standing, lambda f: f.index not in skirt_faces)
    crop(body, lambda f: f.index in skirt_faces)
    hips_group = body.vertex_groups['mixamorig:Hips']
    spine_group = body.vertex_groups['mixamorig:Spine']
    foot_groups = {g.index for g in body.vertex_groups if g.name.endswith('Foot')}
    for vertex in body.data.vertices:
        # Inner elbows and boot tops overlap the bodice bounds. Rebinding them
        # to the hips stretches adjacent sleeve edges several times over.
        if .25 < vertex.co.z < waist_z+.125 and abs(vertex.co.x) < .26 and weight(vertex.index, foot_groups) < .5 and arm_distance(vertex.co) > .13 and weight(vertex.index, arm_groups) < .25:
            for index in [entry.group for entry in vertex.groups]:
                body.vertex_groups[index].remove([vertex.index])
            blend = max(0, min(1, (vertex.co.z-waist_z)/.125))
            hips_group.add([vertex.index], 1-blend, 'REPLACE')
            spine_group.add([vertex.index], blend, 'REPLACE')
    surface = BVHTree.FromPolygons([v.co for v in standing.data.vertices], [p.vertices for p in standing.data.polygons])

    rows, columns = 32, 96
    vertices, faces = [], []
    for row in range(rows+1):
        t = row / rows
        z = waist_z - (waist_z-hem_z)*t
        for column in range(columns):
            a = column / columns * math.tau
            direction = Vector((math.sin(a), -math.cos(a), 0))
            hit = surface.ray_cast(Vector((0, 0, z)), direction)
            point = hit[0] if hit[0] else Vector(((.145+.155*t)*math.sin(a), -(.105+.105*t)*math.cos(a), z))
            vertices.append(tuple(point + direction*.001))
    for row in range(rows):
        for column in range(columns):
            a, b = row*columns+column, row*columns+(column+1)%columns
            faces.append((a, a+columns, b+columns, b))
    mesh = bpy.data.meshes.new('Patient_ContinuousSkirt')
    mesh.from_pydata(vertices, [], faces)
    layer = mesh.uv_layers.new(name='SkirtUV')
    for polygon in mesh.polygons:
        indices = [mesh.loops[i].vertex_index for i in polygon.loop_indices]
        seam = max(i % columns for i in indices) - min(i % columns for i in indices) > columns/2
        for loop_index in polygon.loop_indices:
            index = mesh.loops[loop_index].vertex_index
            u = (index % columns) / columns
            if seam and u == 0:
                u = 1
            layer.data[loop_index].uv = (u, 1-index//columns/rows)
    seated = bpy.data.objects.new('Patient_SkirtSeated', mesh)
    bpy.context.collection.objects.link(seated)

    donor_material = cloth.copy()
    nodes = donor_material.node_tree.nodes
    emission = nodes.new('ShaderNodeEmission')
    texture = next(n for n in nodes if n.type == 'TEX_IMAGE')
    output_node = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    donor_material.node_tree.links.new(texture.outputs['Color'], emission.inputs['Color'])
    donor_material.node_tree.links.new(emission.outputs[0], output_node.inputs['Surface'])
    standing.data.materials.clear()
    standing.data.materials.append(donor_material)
    for polygon in standing.data.polygons:
        polygon.material_index = 0
    image = bpy.data.images.new('Patient_SkirtFabric', width=1024, height=1024)
    material = bpy.data.materials.new('Patient_SeatedDressFabric')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .85
    target = material.node_tree.nodes.new('ShaderNodeTexImage')
    target.image = image
    material.node_tree.nodes.active = target
    seated.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    standing.select_set(True)
    seated.select_set(True)
    bpy.context.view_layer.objects.active = seated
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = .025
    scene.render.bake.max_ray_distance = .06
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type='EMIT')
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape((1024, 1024, 4))
    if fabric_band:
        # Some generated skirt maps contain painted cuffs behind the hands.
        # Reuse a clean strip of the same wool instead of baking those ghosts.
        band = pixels[int(fabric_band[0]*1024):int(fabric_band[1]*1024)].copy()
        fabric_rows = np.arange(1024)%(len(band)*2)
        pixels = band[np.minimum(fabric_rows, len(band)*2-1-fabric_rows)].copy()
    valid = pixels[:, :, :3].sum(axis=2) > .015
    if not valid.any():
        raise RuntimeError('The skirt texture bake produced no fabric samples')
    fallback = np.median(pixels[:, :, :3][valid], axis=0)
    for column in range(1024):
        rows_valid = np.flatnonzero(valid[:, column])
        for channel in range(3):
            pixels[:, column, channel] = np.interp(np.arange(1024), rows_valid, pixels[rows_valid, column, channel]) if len(rows_valid) else fallback[channel]
    image.pixels.foreach_set(pixels.ravel())
    material.node_tree.links.new(target.outputs['Color'], shader.inputs['Base Color'])
    image.filepath_raw = os.path.abspath(os.path.join(output, 'skirt-basecolor.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    standing.data.materials.clear()
    standing.data.materials.append(cloth)

    linen = bpy.data.materials.new('Patient_ApronLinen')
    linen.use_nodes = True
    linen.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.57, .51, .41, 1)
    linen.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .95
    apron_standing = seated.copy()
    apron_standing.data = seated.data.copy()
    apron_standing.name = 'Patient_ApronStanding'
    bpy.context.collection.objects.link(apron_standing)
    # Rays from inside find the lining between folds. An apron needs the
    # outside surface and the same skin weights as the dress beneath it.
    for vertex in apron_standing.data.vertices:
        direction = Vector((vertex.co.x,vertex.co.y,0)).normalized()
        hit = surface.ray_cast(Vector((0,0,vertex.co.z))+direction*2,-direction)
        if hit[0] is not None:
            vertex.co = hit[0]+direction*.008

    rig.animation_data.action = clinic_action
    rig.data.pose_position = 'POSE'
    if clinic_action.slots:
        rig.animation_data.action_slot = clinic_action.slots[0]
    scene.frame_set(1)
    bpy.context.view_layer.update()
    hips = rig.pose.bones['mixamorig:Hips']
    position = (rig.matrix_world @ hips.matrix).translation
    into_rest = hips.bone.matrix_local @ hips.matrix.inverted()
    waist_offset = waist_z-hips.bone.head_local.z if fitted_waist else .10
    def interpolate(t, values):
        knots = [0, .18, .40, 1]
        for index in range(3):
            if t <= knots[index+1]:
                f = (t-knots[index])/(knots[index+1]-knots[index])
                f = f*f*(3-2*f)
                return values[index]*(1-f)+values[index+1]*f
        return values[-1]
    waist_points = [v.co.copy() for v in list(seated.data.vertices)[:columns]]
    for index, vertex in enumerate(seated.data.vertices):
        t = (index//columns)/rows
        angle = (index % columns)/columns*math.tau
        c, s = math.cos(angle), math.sin(angle)
        width = interpolate(t, [.145, .22, .29, .31])
        front = interpolate(t, [.105, .30, .46, .62] if fitted_waist else [.105, .30, .45, .49])
        back = interpolate(t, [.105, .15, .16, .17])
        front_z = position.z + interpolate(t, [waist_offset, .09, .05, -.43])
        back_z = position.z + interpolate(t, [waist_offset, -.08, -.23, -.43])
        blend = max(0, min(1, (c+.1)*4))
        fold = (.010 if fitted_waist else .006) * math.sin(angle*16+.4) * t
        drape = c+(math.sqrt(max(0, c))-c)*min(1, t/.40) if fitted_waist and c > 0 else c
        point = Vector((position.x+(width+fold)*s, position.y-(front*drape if c >= 0 else back*c)-fold*c, back_z+(front_z-back_z)*blend))
        if fitted_waist:
            lap = math.exp(-((t-.32)/.18)**2)*max(0, c)
            point.z += (.010*math.exp(-((abs(point.x-position.x)-.17)/.10)**2)-.014*math.exp(-((point.x-position.x)/.09)**2))*lap
            top = waist_points[index%columns].copy()
            top.z += .012
            top = hips.matrix @ hips.bone.matrix_local.inverted() @ top
            join = max(0, min(1, t/.18))
            point = top.lerp(point, join*join*(3-2*join))
        vertex.co = into_rest @ point
    seated.data.update()
    rig.animation_data.action = None
    apron_seated = seated.copy()
    apron_seated.data = seated.data.copy()
    apron_seated.name = 'Patient_ApronSeated'
    bpy.context.collection.objects.link(apron_seated)
    for apron in [apron_standing, apron_seated]:
        def remove(face):
            row = min(v.index//columns for v in face.verts)
            column = next(v.index % columns for v in face.verts if v.index % columns != 0) if any(v.index % columns for v in face.verts) else 0
            return row > 0 and (math.cos(column/columns*math.tau) < .58 or row > rows*.82)
        crop(apron, remove)
        apron.data.materials.clear()
        apron.data.materials.append(linen)
        for vertex in apron.data.vertices:
            vertex.co += vertex.normal*.003
    for group in standing.vertex_groups:
        apron_standing.vertex_groups.new(name=group.name)
    for vertex in apron_standing.data.vertices:
        hit = surface.find_nearest(vertex.co)
        polygon = standing.data.polygons[hit[2]]
        weights = {}
        for index in polygon.vertices:
            source = standing.data.vertices[index]
            proximity = 1/max(.0001,(source.co-hit[0]).length)
            for entry in source.groups:
                weights[entry.group] = weights.get(entry.group,0)+entry.weight*proximity
        total = sum(weights.values())
        for group,value in weights.items():
            apron_standing.vertex_groups[group].add([vertex.index],value/total,'REPLACE')
    for obj in [seated, apron_standing, apron_seated]:
        if obj != apron_standing:
            group = obj.vertex_groups.new(name='mixamorig:Hips')
            group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        obj.parent = rig
        obj.matrix_parent_inverse = rig.matrix_world.inverted()
        modifier = obj.modifiers.new('Patient skeleton', 'ARMATURE')
        modifier.object = rig
        for polygon in obj.data.polygons:
            polygon.material_index = 0
            polygon.use_smooth = True
    print('CARMELA_WARDROBE_OK', len(seated.data.vertices))

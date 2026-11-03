"""A fitted lip ring and oral cavity with three controlled speech shapes."""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


def mouth_boundary(face, width, height):
    uses = {}
    for polygon in face.data.polygons:
        for edge in polygon.edge_keys:
            uses[edge] = uses.get(edge, 0)+1
    adjacency = {}
    for (a,b), count in uses.items():
        center = (face.data.vertices[a].co+face.data.vertices[b].co)/2
        if count != 1 or center.y > -.20 or abs(center.x)>width+.08 or abs(center.z-height)>.09:
            continue
        adjacency.setdefault(a,[]).append(b)
        adjacency.setdefault(b,[]).append(a)
    loops, seen = [], set()
    for start in adjacency:
        if start in seen:
            continue
        loop, previous, current = [], None, start
        while current not in seen:
            seen.add(current)
            loop.append(current)
            choices = [v for v in adjacency[current] if v != previous]
            if len(adjacency[current]) != 2:
                break
            previous, current = current, choices[0]
        if current == start and len(loop)>12:
            loops.append(loop)
    if not loops:
        raise RuntimeError('No closed mouth-patch boundary found')
    # The broad donor also has an inward-facing mouth wall. Only the outer
    # skin boundary can meet the new lips without exposing a second cut edge.
    exterior = [ids for ids in loops if sum(face.data.vertices[i].normal.y for i in ids)/len(ids)<-.3]
    if not exterior:
        raise RuntimeError('No outward-facing mouth-patch boundary found')
    loop = max(exterior,key=lambda ids: max(face.data.vertices[i].co.z for i in ids)-min(face.data.vertices[i].co.z for i in ids))
    area = sum(face.data.vertices[a].co.x*face.data.vertices[b].co.z-face.data.vertices[b].co.x*face.data.vertices[a].co.z for a,b in zip(loop,loop[1:]+loop[:1]))
    if area<0:
        loop.reverse()
    return [face.data.vertices[i] for i in loop]


def prepare(face, width, height, fit_seam=False):
    bm = bmesh.new()
    bm.from_mesh(face.data)
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
        if len(component) < 1500 and all(height-.10 < v.co.z < height+.12 for v in component):
            remove.extend(component)
    bmesh.ops.delete(bm, geom=remove, context='VERTS')
    patches = [p for p in bm.faces if p.calc_center_median().y < (0 if fit_seam else -.20) and (p.calc_center_median().x/(width+.024))**2+((p.calc_center_median().z-height)/.047)**2 < 1]
    bmesh.ops.delete(bm, geom=patches, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(face.data)
    bm.free()
    if fit_seam:
        face.data.update()
        # Keep the donor edge in place. Regularizing it into an ellipse can
        # fold the surrounding face triangles over the edge of the patch.
        return [v.index for v in mouth_boundary(face,width,height)]
    return None


def build(face, sample, image, width, height, expressions, output, fit_seam=False, corner_band=.014, boundary_indices=None, sample_normal=None):
    mouth_y = sample(0, height)[0]

    def jaw(co):
        lower = max(0, min(1, (height+.015-co.z)/.065))
        weight = math.exp(-2*((co.x/.23)**2+((co.y-mouth_y)/.23)**2+((co.z-height+.075)/.22)**2))
        return Vector((0, .018, -.14))*lower*weight

    def wide(co):
        weight = math.exp(-2*((co.x/.21)**2+((co.y-mouth_y)/.16)**2+((co.z-height)/.10)**2))
        return Vector((co.x*.35, 0, 0))*weight

    def rounded(co):
        weight = math.exp(-2*((co.x/.28)**2+((co.y-mouth_y)/.16)**2+((co.z-height)/.10)**2))
        return Vector((-co.x*.80, -.055, 0))*weight

    def shape(obj, name, delta):
        key = obj.shape_key_add(name=name, from_mix=False)
        key.value = 0
        for index, point in enumerate(key.data):
            point.co += delta(point.co, index)

    for name, delta in [('speechOpen', jaw), ('speechWide', wide), ('speechRound', rounded)]:
        shape(face, name, lambda co, i, delta=delta: delta(co))

    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape((image.size[1], image.size[0], 4))
    atlas = np.zeros((256, 512, 4), dtype=np.float32)
    for row in range(256):
        z = height-.10+(row+.5)/256*.20
        for col in range(512):
            x = -.18+(col+.5)/512*.36
            _, uv = sample(x, z)
            atlas[row, col] = pixels[min(image.size[1]-1, int((uv[1] % 1)*image.size[1])), min(image.size[0]-1, int((uv[0] % 1)*image.size[0]))]
    lip_image = bpy.data.images.new('Patient_LipRegion', width=512, height=256)
    lip_image.pixels.foreach_set(atlas.ravel())
    lip_image.filepath_raw = os.path.abspath(os.path.join(output, 'lip-region.png'))
    lip_image.file_format = 'PNG'
    lip_image.save()
    lip_image.pack()
    skin = face.data.materials[0].copy()
    skin.name = 'Patient_Lips'
    next(n for n in skin.node_tree.nodes if n.type == 'TEX_IMAGE').image = lip_image
    shader = skin.node_tree.nodes.get('Principled BSDF')
    for link in list(shader.inputs['Metallic'].links):
        skin.node_tree.links.remove(link)
    shader.inputs['Metallic'].default_value = 0
    if fit_seam:
        skin.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .8

    def solid(name, color, roughness):
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color, 1)
        shader.inputs['Roughness'].default_value = roughness
        return material

    def mesh(name, vertices, faces, material, uvs=None):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.materials.append(material)
        if uvs:
            uv = data.uv_layers.new(name='LipUV')
            for loop in data.loops:
                uv.data[loop.index].uv = uvs[loop.vertex_index]
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        for polygon in data.polygons:
            polygon.use_smooth = True
        obj.shape_key_add(name='Basis', from_mix=False).value = 0
        return obj

    boundary=([face.data.vertices[i] for i in boundary_indices] if boundary_indices is not None else mouth_boundary(face,width,height)) if fit_seam else None
    if boundary:
        boundary_points=[v.co.copy() for v in boundary]
        boundary_normals=[v.normal.copy() for v in boundary]
    angles=np.linspace(0,math.tau,64,endpoint=False)
    columns, rows = len(angles), 10
    vertices, faces, uvs, lip_delta = [], [], [], []
    seam_x = np.linspace(-width, width, 65)
    seam_heights = []
    if fit_seam:
        for x in seam_x:
            col = round((x+.18)/.36*511)
            region = atlas[112:145, max(0,col-3):min(512,col+4), :3].mean(axis=(1,2))
            score = np.convolve(np.pad(region, (1,1), mode='edge'), [1/3]*3, mode='valid')
            row = 112+int(np.argmin(score))
            seam_heights.append(height-.10+(row+.5)/256*.20)
        for _ in range(3):
            seam_heights = np.convolve(np.pad(seam_heights,(2,2),mode='edge'), [.1,.2,.4,.2,.1], mode='valid')
        print('MOUTH_SEAM_FIT', {'center': float(seam_heights[32]), 'old': height,
                               'range': (float(min(seam_heights)),float(max(seam_heights)))})
    rest_gap = 0 if fit_seam else .00035

    def seam_z(x):
        if fit_seam:
            return float(np.interp(x, seam_x, seam_heights))
        return height+.0025*math.exp(-((abs(x)-width*.22)/(width*.13))**2)-.001*math.exp(-(x/(width*.15))**2)-.002*(abs(x)/width)**2

    def seam_depth(x):
        z = seam_z(x)
        band=surface_band(x)
        return (sample(x,z+band)[0]+sample(x,z-band)[0])/2

    def surface_band(x):
        t=max(0,min(1,(abs(x)/width-.55)/.45))
        return .014+(corner_band-.014)*t*t*(3-2*t)

    def external_surface(x, z):
        seam=seam_z(x)
        band=surface_band(x)
        if abs(x)<=width+(.024 if corner_band>.014 else 0) and abs(z-seam)<band:
            t=(z-seam+band)/(2*band)
            return sample(x,seam-band)[0]*(1-t)+sample(x,seam+band)[0]*t
        return sample(x,z)[0]

    for row in range(rows+1):
        t = row/rows
        for col in range(columns):
            a = angles[col]
            c, s = math.cos(a), math.sin(a)
            x = (width+(.012 if boundary else .050)*t)*c
            seam = seam_z(x)
            z = seam*(1-t)+(height+.031*s)*t if boundary else height+(seam-height)*(1-t)**1.8+(rest_gap*(1-t)+.080*t)*s
            sampled_z = z if fit_seam else height+(.014*(1-t)+.080*t)*s
            # Fit depth at the actual vertex height. Sampling the texture's
            # height here pushes the lower lip into a separate projecting shelf.
            if fit_seam:
                # Bridge the recessed donor join while retaining the external
                # lip profile. The outside edge meets the existing face exactly.
                y=external_surface(x,z)-.001*(1-t)
            else:
                y=sample(x,z)[0]-.001
                y-=.0015*math.sin(math.pi*min(1,t/.45))*abs(s)**.8
            vertices.append((x, y, z))
            uvs.append(((x+.18)/.36, (sampled_z-height+.10)/.20))
            inner = Vector((0, .012 if s < 0 else -.002, -.125 if s < 0 else .012))*abs(s)**.7
            lip_delta.append(inner*(1-t)**1.2+jaw(Vector((x, y, z)))*(1-(1-t)**1.2))
    for row in range(rows):
        for col in range(columns):
            a, b = row*columns+col, row*columns+(col+1) % columns
            faces.append((a, a+columns, b+columns, b))
    if boundary:
        # Triangulate the irregular donor edge around a smooth inner ring.
        # Radial strips can cross themselves where that edge doubles back.
        outer_start=len(vertices)
        vertices.extend(tuple(p) for p in boundary_points)
        uvs.extend(((p.x+.18)/.36,(p.z-height+.10)/.20) for p in boundary_points)
        lip_delta.extend(jaw(p) for p in boundary_points)
        outer_ids=list(range(outer_start,len(vertices)))
        inner_ids=list(reversed(range(rows*columns,(rows+1)*columns)))
        planar=lambda ids:[Vector((vertices[i][0],vertices[i][2],0)) for i in ids]
        mapping=outer_ids+inner_ids
        join=[tuple(mapping[i] for i in tri) for tri in tessellate_polygon([planar(outer_ids),planar(inner_ids)])]
        fixed_edges={tuple(sorted((a,b))) for ids in [outer_ids,inner_ids] for a,b in zip(ids,ids[1:]+ids[:1])}

        def surface_vertex(ids):
            x=sum(vertices[i][0] for i in ids)/len(ids)
            z=sum(vertices[i][2] for i in ids)/len(ids)
            p=Vector((x,external_surface(x,z),z))
            vertices.append(tuple(p))
            uvs.append(((x+.18)/.36,(z-height+.10)/.20))
            lip_delta.append(jaw(p))
            return len(vertices)-1

        # Long planar chords cut through the curved face. Refine and project
        # the join, keeping its two existing boundary loops untouched.
        for _ in range(10):
            split={}
            for tri in join:
                for a,b in zip(tri,tri[1:]+tri[:1]):
                    edge=tuple(sorted((a,b)))
                    if edge in fixed_edges or edge in split:continue
                    if math.hypot(vertices[a][0]-vertices[b][0],vertices[a][2]-vertices[b][2])>.012:
                        split[edge]=surface_vertex(edge)
            if not split:break
            refined=[]
            for tri in join:
                points=list(tri)
                mids=[split.get(tuple(sorted((a,b)))) for a,b in zip(tri,tri[1:]+tri[:1])]
                count=sum(mid is not None for mid in mids)
                if not count:refined.append(tri);continue
                while mids[0] is None or (count==2 and mids[1] is None):
                    points=points[1:]+points[:1];mids=mids[1:]+mids[:1]
                a,b,c=points;ab,bc,ca=mids
                if count==1:refined.extend([(a,ab,c),(ab,b,c)])
                elif count==2:refined.extend([(ab,b,bc),(a,ab,c),(ab,bc,c)])
                else:refined.extend([(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)])
            join=refined
        faces.extend(join)
    lips = mesh('Carmela_Lips', vertices, faces, skin, uvs)
    if boundary:
        # The patch shares the donor's real edge and edge normals. Overlapping
        # two independently sampled skin surfaces leaves visible triangles.
        # Transfer the donor's smooth skin normals. Recomputing them on the
        # thin join triangles produces dark bands around the mouth patch.
        normals=[]
        for x,y,z in vertices:
            seam,band=seam_z(x),surface_band(x)
            if abs(x)<=width+(.024 if corner_band>.014 else 0) and abs(z-seam)<band:
                t=(z-seam+band)/(2*band)
                normal=sample_normal(x,seam-band).lerp(sample_normal(x,seam+band),t).normalized()
            else:normal=sample_normal(x,z)
            normals.append(tuple(normal))
        normals[outer_start:outer_start+len(boundary_points)]=[tuple(n) for n in boundary_normals]
        lips.data.normals_split_custom_set_from_vertices(normals)
    for name, function in expressions:
        shape(lips, name, lambda co, i, function=function: function(co))
    shape(lips, 'speechOpen', lambda co, i: lip_delta[i])
    shape(lips, 'speechWide', lambda co, i: wide(co))
    shape(lips, 'speechRound', lambda co, i: rounded(co))

    vertices, faces, opening = [], [], []
    for row in range(7):
        t = row/6
        for col in range(columns):
            a = angles[col]
            c, s = math.cos(a), math.sin(a)
            x = width*(1-.35*t)*c
            z = height-.020*t+(seam_z(x)-height)*(1-t)+(rest_gap*(1-t)+.045*t)*s
            y = (seam_depth(width*c) if fit_seam else sample(width*c, seam_z(width*c))[0])+.006+.115*t
            vertices.append((x, y, z))
            opening.append(Vector((0, .012, (-.125 if s < 0 else .012)*abs(s)**.7))*(1-t)+Vector((0, 0, -.045))*t)
    for row in range(6):
        for col in range(columns):
            a, b = row*columns+col, row*columns+(col+1) % columns
            faces.append((a, b, b+columns, a+columns))
    vertices.append((0, mouth_y+.14, height-.02))
    opening.append(Vector((0, 0, -.045)))
    for col in range(columns):
        faces.append((len(vertices)-1, 6*columns+col, 6*columns+(col+1) % columns))
    cavity = mesh('Carmela_MouthInterior', vertices, faces, solid('Patient_OralCavity', (.035, .006, .009), .86))
    for name, function in expressions:
        shape(cavity, name, lambda co, i, function=function: function(co))
    shape(cavity, 'speechOpen', lambda co, i: opening[i])
    shape(cavity, 'speechWide', lambda co, i: wide(co))
    shape(cavity, 'speechRound', lambda co, i: rounded(co))

    teeth = solid('Patient_Teeth', (.52, .48, .41), .42)
    teeth.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value = .22
    gums = solid('Patient_Gums', (.12, .035, .04), .68)
    parts = [lips, cavity]
    oral_height = seam_z(0) if fit_seam else height
    front_depth = max(sample(0, oral_height+.014)[0], sample(0, oral_height-.014)[0])+.022
    side_depth = max(sample(width*.75, oral_height+.014)[0], sample(width*.75, oral_height-.014)[0])+.018
    if fit_seam:
        front_depth = max(front_depth,seam_depth(0)+.022)
        side_depth = max(side_depth,seam_depth(width*.75)+.018)
    arch_radius = width*1.24
    arch_depth = max(.10, (side_depth-front_depth)/.20)

    def jaw_shape(obj):
        shape(obj, 'speechOpen', lambda co, i: Vector((0, .042, -.125)))

    for lower in [False, True]:
        vertices, faces = [], []
        for sign in [-1, 1]:
            distance = 0
            for tooth, tooth_width in enumerate([.025,.020,.022,.020]):
                tooth_width *= width/.097*(.88 if lower else 1)
                angle = sign*(distance+tooth_width/2)/arch_radius
                distance += tooth_width+.0006
                x = arch_radius*math.sin(angle)
                depth = front_depth+arch_depth*(1-math.cos(angle))+(.022 if lower else 0)
                tip = oral_height+(-.010 if lower else -.0035)+([0,.001,-.001,.0015][tooth])
                root = tip+(-.032 if lower else .039)
                start = len(vertices)
                # Rounded rectangular crowns give a continuous incisal edge;
                # ellipsoids expose isolated pointed beads through the lip gap.
                for row in range(7):
                    t = row/6
                    z = root+(tip-root)*t
                    scale = .76+.24*math.sin(t*math.pi*.68)
                    for col in range(16):
                        a = col/16*math.tau
                        dx = math.copysign(abs(math.cos(a))**.38,math.cos(a))*tooth_width*.48*scale
                        dy = math.copysign(abs(math.sin(a))**.38,math.sin(a))*.007*(.9+.1*math.sin(t*math.pi))
                        inset = (.025 if lower else .004)*(1-t)
                        vertices.append((x+dx*math.cos(angle)+dy*math.sin(angle),depth+inset-dx*math.sin(angle)+dy*math.cos(angle),z))
                for row in range(6):
                    for col in range(16):
                        a, b = start+row*16+col, start+row*16+(col+1)%16
                        faces.append((a,a+16,b+16,b))
                faces.append(tuple(start+6*16+col for col in reversed(range(16))))
                faces.append(tuple(start+col for col in range(16)))
        if lower:
            faces = [tuple(reversed(face)) for face in faces]
        obj = mesh('Carmela_TeethLower' if lower else 'Carmela_TeethUpper', vertices, faces, teeth)
        if lower:
            jaw_shape(obj)
        parts.append(obj)

        vertices, faces = [], []
        for row in range(3):
            for col in range(49):
                angle = -.80+col/48*1.60
                x = arch_radius*math.sin(angle)
                y = front_depth+arch_depth*(1-math.cos(angle))+.002+row*.012+(.047 if lower else .004)
                z = oral_height+(-.041-row*.007 if lower else .030+row*.007)
                vertices.append((x,y,z))
        for row in range(2):
            for col in range(48):
                a = row*49+col
                faces.append((a,a+49,a+50,a+1))
        gum = mesh('Carmela_GumsLower' if lower else 'Carmela_GumsUpper',vertices,faces,gums)
        if lower:
            jaw_shape(gum)
        parts.append(gum)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(0,mouth_y+.09,oral_height-.046))
    tongue = bpy.context.object
    tongue.name = 'Carmela_Tongue'
    tongue.scale = (.055,.040,.009)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    tongue.data.materials.append(solid('Patient_Tongue',(.085,.020,.026),.70))
    for polygon in tongue.data.polygons:
        polygon.use_smooth = True
    tongue.shape_key_add(name='Basis',from_mix=False).value = 0
    shape(tongue,'speechOpen',lambda co,i:Vector((0,.006,-.065)))
    parts.append(tongue)
    return parts

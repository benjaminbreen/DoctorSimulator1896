"""A fitted lip ring and oral cavity with three controlled speech shapes."""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector


def prepare(face, width, height):
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
    patches = [p for p in bm.faces if p.calc_center_median().y < -.20 and (p.calc_center_median().x/(width+.024))**2+((p.calc_center_median().z-height)/.047)**2 < 1]
    bmesh.ops.delete(bm, geom=patches, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(face.data)
    bm.free()


def build(face, sample, image, width, height, expressions, output):
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

    columns, rows = 64, 10
    vertices, faces, uvs, lip_delta = [], [], [], []
    def seam_z(x):
        return height+.0025*math.exp(-((abs(x)-width*.22)/(width*.13))**2)-.001*math.exp(-(x/(width*.15))**2)-.002*(abs(x)/width)**2

    for row in range(rows+1):
        t = row/rows
        for col in range(columns):
            a = col/columns*math.tau
            c, s = math.cos(a), math.sin(a)
            x = (width+.050*t)*c
            seam = seam_z(x)
            z = height+(seam-height)*(1-t)**1.8+(.00035*(1-t)+.080*t)*s
            sampled_z = height+(.014*(1-t)+.080*t)*s
            # Fit depth at the actual vertex height. Sampling the texture's
            # height here pushes the lower lip into a separate projecting shelf.
            y = sample(x, z)[0]-.001
            y -= .0015*math.sin(math.pi*min(1,t/.45))*abs(s)**.8
            vertices.append((x, y, z))
            uvs.append(((x+.18)/.36, (sampled_z-height+.10)/.20))
            inner = Vector((0, .012 if s < 0 else -.002, -.125 if s < 0 else .012))*abs(s)**.7
            lip_delta.append(inner*(1-t)**1.2+jaw(Vector((x, y, z)))*(1-(1-t)**1.2))
    for row in range(rows):
        for col in range(columns):
            a, b = row*columns+col, row*columns+(col+1) % columns
            faces.append((a, a+columns, b+columns, b))
    lips = mesh('Carmela_Lips', vertices, faces, skin, uvs)
    for name, function in expressions:
        shape(lips, name, lambda co, i, function=function: function(co))
    shape(lips, 'speechOpen', lambda co, i: lip_delta[i])
    shape(lips, 'speechWide', lambda co, i: wide(co))
    shape(lips, 'speechRound', lambda co, i: rounded(co))

    vertices, faces, opening = [], [], []
    for row in range(7):
        t = row/6
        for col in range(columns):
            a = col/columns*math.tau
            c, s = math.cos(a), math.sin(a)
            x = width*(1-.35*t)*c
            z = height-.020*t+(seam_z(x)-height)*(1-t)+(.00035*(1-t)+.045*t)*s
            y = sample(width*c, seam_z(width*c))[0]+.006+.115*t
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
    front_depth = max(sample(0, height+.014)[0], sample(0, height-.014)[0])+.022
    side_depth = max(sample(width*.75, height+.014)[0], sample(width*.75, height-.014)[0])+.018
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
                tip = height+(-.010 if lower else -.0035)+([0,.001,-.001,.0015][tooth])
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
                z = height+(-.041-row*.007 if lower else .030+row*.007)
                vertices.append((x,y,z))
        for row in range(2):
            for col in range(48):
                a = row*49+col
                faces.append((a,a+49,a+50,a+1))
        gum = mesh('Carmela_GumsLower' if lower else 'Carmela_GumsUpper',vertices,faces,gums)
        if lower:
            jaw_shape(gum)
        parts.append(gum)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(0,mouth_y+.09,height-.046))
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

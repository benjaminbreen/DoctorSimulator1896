"""Two short, swept grooms fitted to the new male donor skulls."""
import math
import os
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from carmela_hair import flow_images, smooth


def build(reference, root):
    surface = BVHTree.FromPolygons([v.co.copy() for v in reference.data.vertices], [p.vertices[:] for p in reference.data.polygons])
    color, normal, mask, _, _ = flow_images(os.path.join(root, 'assets/source/carmela-russo-2026-10-29'))
    material = bpy.data.materials.new('Carmela_DarkHair')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .75
    shader.inputs['Specular IOR Level'].default_value = .20
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = color
    links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = normal
    bump = nodes.new('ShaderNodeNormalMap')
    bump.inputs['Strength'].default_value = .22
    links.new(tex.outputs['Color'], bump.inputs['Color'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    parts = []
    center = Vector((0, .015, .70))
    for style, recession in [('short_side_part', 0), ('receding_sweep', .11)]:
        def geometry(volume=0, wave=0, part=0, height=0, peak=0, temples=0, asymmetry=0, thin=0):
            vertices, faces, uvs = [], [], []
            columns, rows = 112, 40
            for row in range(rows+1):
                t = max(.0001, row/rows)
                for col in range(columns+1):
                    angle = -math.pi+math.tau*col/columns
                    front = max(0, math.cos(angle))
                    # A natural taper behind the ears, without a shaved arch.
                    border_z = .72+.18*front-.28*max(0, -math.cos(angle))
                    corners = math.exp(-((abs(angle)-.60)/.29)**2)*front
                    centre_peak = math.exp(-(angle/.22)**2)
                    border_z += (.030+temples*.075)*corners-(.025+peak*.025)*centre_peak
                    border_z += recession*front*(.25+.75*abs(math.sin(angle)))
                    border_z += height*.045*front**1.4+asymmetry*.022*math.sin(angle)*front
                    border_z += .0025*math.sin(21*angle)+.0012*math.sin(47*angle)
                    border_z = max(.840 if front>.85 else .40, min(.975,border_z))
                    z = .996-(.996-border_z)*t*t
                    direction = Vector((math.sin(angle),-math.cos(angle),0))
                    hit = surface.ray_cast(Vector((0,.015,z)),direction)
                    p = hit[0] if hit[0] else center+direction*.28
                    direction = Vector((direction.x,direction.y,(z-.70)/.30)).normalized()
                    interior = smooth(0, .18, 1-t)
                    part_mask = 1-.98*math.exp(-((p.x+.09-part*.025)/.016)**2)*smooth(-.20,-.11,p.y)* (1-smooth(.14,.21,p.y))
                    sweep = .035*front*math.exp(-((t-.56)/.30)**2)
                    lift = .006+(.023+volume*.020+sweep)*interior*part_mask
                    lift += (.002+wave*.003)*math.sin(t*29+angle*3)*math.sin(math.pi*t)*interior
                    lift *= max(.15,1-.60*temples*front-.30*height*front)*(1-.85*thin)
                    p += direction*lift
                    vertices.append(tuple(p))
                    uvs.append((col/columns*6+1.8*t*(front+.2), t*1.7))
            for row in range(rows):
                for col in range(columns):
                    a = row*(columns+1)+col
                    faces.append((a,a+1,a+columns+2,a+columns+1))
            pole=len(vertices)
            vertices.append((0,.015,1.028+volume*.020));uvs.append((1.5,0))
            for col in range(columns):faces.append((pole,col+1,col))
            for col in range(columns):
                a = rows*(columns+1)+col
                edge = Vector(vertices[a]).lerp(Vector(vertices[a+1]), .43)
                tangent = (Vector(vertices[a+1])-Vector(vertices[a])).normalized()
                angle = -math.pi+math.tau*(col+.43)/columns
                direction = Vector((math.sin(angle),-math.cos(angle),0))
                z = edge.z-.006-.003*math.sin(angle*37)
                hit = surface.ray_cast(Vector((0,.015,z)),direction)
                if not hit[0]:
                    tip = edge-Vector((0,0,.004))
                else:
                    tip = hit[0]+direction*.003
                start = len(vertices)
                vertices.extend([tuple(edge-tangent*.0011),tuple(edge+tangent*.0011),tuple(tip)])
                uvs.extend([(col/columns*6,1.7),((col+.1)/columns*6,1.7),((col+.05)/columns*6,1.71)])
                faces.append((start,start+1,start+2))
            return vertices, [tuple(reversed(face)) for face in faces], uvs
        vertices, faces, uvs = geometry()
        mesh = bpy.data.meshes.new(style)
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(material)
        layer = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index]
        obj = bpy.data.objects.new('Carmela_HairStyle_'+style, mesh)
        bpy.context.collection.objects.link(obj)
        obj.shape_key_add(name='Basis')
        for name, params in [('rc_hairVolume', dict(volume=1)), ('rc_hairWave', dict(wave=1)), ('rc_hairPartOffset', dict(part=1)), ('rc_hairlineHeight', dict(height=1)), ('rc_hairlinePeak', dict(peak=1)), ('rc_hairlineRecession', dict(temples=1)), ('rc_hairlineAsymmetry', dict(asymmetry=1)), ('rc_hairThinning', dict(thin=1))]:
            key = obj.shape_key_add(name=name)
            key.value = 0
            for vertex, co in zip(key.data, geometry(**params)[0]):
                vertex.co = co
        joint = obj.shape_key_add(name='rc_hairlineHeightRecession')
        high, recessed, combined = geometry(height=1)[0], geometry(temples=1)[0], geometry(height=1,temples=1)[0]
        for vertex, base, a, b, both in zip(joint.data, vertices, high, recessed, combined):
            vertex.co = Vector(both)-Vector(a)-Vector(b)+Vector(base)*2
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        parts.append(obj)
    return parts

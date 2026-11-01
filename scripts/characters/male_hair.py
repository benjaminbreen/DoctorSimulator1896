"""Two short, swept grooms fitted to the new male donor skulls."""
import math
import os
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
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
    scalp = bpy.data.materials.new('Carmela_HairPart')
    scalp.use_nodes = True
    scalp_shader = scalp.node_tree.nodes.get('Principled BSDF')
    scalp_shader.inputs['Roughness'].default_value = .8
    tex = scalp.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = next(n.image for n in reference.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
    scalp.node_tree.links.new(tex.outputs['Color'],scalp_shader.inputs['Base Color'])
    reference.data.calc_loop_triangles()
    triangles = list(reference.data.loop_triangles)
    points = [v.co.copy() for v in reference.data.vertices]
    uv_data = reference.data.uv_layers.active.data
    uv_surface = BVHTree.FromPolygons(points,[t.vertices for t in triangles],all_triangles=True)
    parts = []
    center = Vector((0, .015, .70))
    for style, recession in [('short_side_part', 0), ('receding_sweep', .11)]:
        def geometry(volume=0, wave=0, part=0):
            vertices, faces, uvs = [], [], []
            columns, rows = 112, 40
            for row in range(rows+1):
                t = max(.0001, row/rows)
                for col in range(columns+1):
                    angle = -math.pi+math.tau*col/columns
                    front = max(0, math.cos(angle))
                    # A natural taper behind the ears, without a shaved arch.
                    border_z = .72+.10*front-.28*max(0, -math.cos(angle))
                    border_z += recession*front*(.25+.75*abs(math.sin(angle)))
                    border_z += .003*math.sin(21*angle)+.001*math.sin(47*angle)
                    z = .996-(.996-border_z)*t*t
                    direction = Vector((math.sin(angle),-math.cos(angle),0))
                    hit = surface.ray_cast(Vector((0,.015,z)),direction)
                    p = hit[0] if hit[0] else center+direction*.28
                    direction = Vector((direction.x,direction.y,(z-.70)/.30)).normalized()
                    interior = smooth(0, .18, 1-t)
                    part_angle = -.42+part*.13
                    part_mask = 1-.98*math.exp(-((p.x+.09-part*.025)/.016)**2)*smooth(-.20,-.11,p.y)* (1-smooth(.14,.21,p.y))
                    sweep = .035*front*math.exp(-((t-.56)/.30)**2)
                    lift = .006+(.023+volume*.020+sweep)*interior*part_mask
                    lift += (.002+wave*.003)*math.sin(t*29+angle*3)*math.sin(math.pi*t)*interior
                    p += direction*lift
                    vertices.append(tuple(p))
                    uvs.append((col/columns*3+.9*t*(front+.2), t*1.7))
            for row in range(rows):
                for col in range(columns):
                    a = row*(columns+1)+col
                    faces.append((a,a+1,a+columns+2,a+columns+1))
            pole=len(vertices)
            vertices.append((0,.015,1.028+volume*.020));uvs.append((1.5,0))
            for col in range(columns):faces.append((pole,col+1,col))
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
        for name, params in [('rc_hairVolume', dict(volume=1)), ('rc_hairWave', dict(wave=1)), ('rc_hairPartOffset', dict(part=1))]:
            key = obj.shape_key_add(name=name)
            key.value = 0
            for vertex, co in zip(key.data, geometry(**params)[0]):
                vertex.co = co
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        parts.append(obj)
        vertices, uvs = [], []
        for row in range(45):
            y = -.235+row/44*.40
            for sign in [-1,1]:
                x = -.09+sign*.0035
                hit = uv_surface.ray_cast(Vector((x,y,1.15)),Vector((0,0,-1)))
                p = hit[0] if hit[0] else Vector((x,y,.98))
                triangle = triangles[hit[2]]
                uv = barycentric_transform(p,*[points[i] for i in triangle.vertices],*[Vector((*uv_data[i].uv,0)) for i in triangle.loops])
                vertices.append(tuple(p+Vector((0,0,.008))))
                uvs.append((uv.x,uv.y))
        mesh = bpy.data.meshes.new(style+'_part')
        mesh.from_pydata(vertices,[],[(i*2,i*2+1,i*2+3,i*2+2) for i in range(44)])
        mesh.materials.append(scalp)
        layer = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops: layer.data[loop.index].uv=uvs[loop.vertex_index]
        part = bpy.data.objects.new('Carmela_HairStyle_'+style+'_part',mesh)
        bpy.context.collection.objects.link(part)
        for p in mesh.polygons:p.use_smooth=True
        parts.append(part)
    return parts

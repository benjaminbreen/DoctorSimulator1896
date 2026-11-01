"""Fitted updos, draped waves and curls with live grooming shape keys."""

import math
import os

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


STYLES = {
    'center_chignon': dict(part=0, volume=.010, waves=.18, height=1.495, back=.115, radius=.035, oval=1.24),
    'waved_knot': dict(part=-.010, volume=.018, waves=.80, height=1.565, back=.135, radius=.040, oval=.98),
    'braided_knot': dict(part=.004, volume=.013, waves=.35, height=1.520, back=.126, radius=.038, oval=1.04),
    'soft_side_waves': dict(part=-.003, volume=.012, waves=.75, height=1.500, back=.126, radius=.043, oval=1.18, ear=.036),
    'curled_side_rolls': dict(part=.003, volume=.016, waves=.90, height=1.545, back=.132, radius=.044, oval=1.08, ear=.050, curls=True),
}


def smooth(a, b, x):
    t = max(0, min(1, (x-a)/(b-a)))
    return t*t*(3-2*t)


def fibre_normal(color, source, filename):
    data_color = color.copy()
    data_color.scale(512, 512)
    value = np.array(data_color.pixels[:], dtype=np.float32).reshape(512, 512, 4)[:, :, :3].mean(axis=2)
    bpy.data.images.remove(data_color)
    size = 512
    dx = np.roll(value, -1, axis=1)-np.roll(value, 1, axis=1)
    dy = np.roll(value, -1, axis=0)-np.roll(value, 1, axis=0)
    pixels = np.ones((size, size, 4), dtype=np.float32)
    pixels[:, :, 0] = .5-dx*.9
    pixels[:, :, 1] = .5-dy*.9
    pixels[:, :, 2] = 1
    normal = bpy.data.images.new('Patient_HairNormal', width=size, height=size)
    normal.colorspace_settings.name = 'Non-Color'
    normal.pixels.foreach_set(pixels.ravel())
    normal.filepath_raw = os.path.join(source, 'references/'+filename)
    normal.file_format = 'PNG'
    normal.save()
    normal.pack()
    return normal


def flow_images(source):
    color = bpy.data.images.load(os.path.join(source, 'references/hair-fibres-v2.png'), check_existing=True)
    color.name = 'Patient_HairFibres'
    color.pack()
    normal = fibre_normal(color, source, 'hair-fibres-normal.png')
    curls = bpy.data.images.load(os.path.join(source, 'references/hair-curls-v1.png'), check_existing=True)
    curls.name = 'Patient_HairCurls'
    curls.pack()
    curl_normal = fibre_normal(curls, source, 'hair-curls-normal.png')

    size = 1024
    u, v = np.meshgrid(np.arange(size)/size, np.arange(size)/size)
    rng = np.random.default_rng(1896)
    alpha = np.zeros_like(u)
    for strand in range(112):
        x = (strand+.5+rng.uniform(-.4, .4))/112
        phase = rng.uniform(0, math.tau)
        path = x+.003*np.sin(v*math.tau*rng.uniform(.7, 1.7)+phase)
        strand_width = rng.uniform(.0008, .0022)
        end = rng.uniform(.55, 1.04)
        coverage = np.clip((end-v)/.045, 0, 1)*np.clip(v/.025, 0, 1)
        alpha = np.maximum(alpha, np.exp(-((u-path)/strand_width)**2)*coverage)
    edge = np.clip(np.minimum(u, 1-u)/.12, 0, 1)
    alpha *= edge
    pixels = np.ones((size, size, 4), dtype=np.float32)
    pixels[:, :, :3] = alpha[:, :, None]
    mask = bpy.data.images.new('Patient_HairCoverage', width=size, height=size)
    mask.colorspace_settings.name = 'Non-Color'
    mask.pixels.foreach_set(pixels.ravel())
    mask.filepath_raw = os.path.join(source, 'references/hair-edge-alpha.png')
    mask.file_format = 'PNG'
    mask.save()
    mask.pack()
    return color, normal, mask, curls, curl_normal


def build(reference, source, identity):
    reference.data.calc_loop_triangles()
    triangles = list(reference.data.loop_triangles)
    points = [v.co.copy() for v in reference.data.vertices]
    surface = BVHTree.FromPolygons(points, [t.vertices for t in triangles], all_triangles=True)
    source_uv = [v.uv.copy() for v in reference.data.uv_layers.active.data]
    center = Vector((0, 0, 1.54))
    color, normal, mask, curl_color, curl_normal = flow_images(source)
    hair = bpy.data.materials.new('Carmela_DarkHair')
    hair.use_nodes = True
    nodes, links = hair.node_tree.nodes, hair.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .70
    shader.inputs['Specular IOR Level'].default_value = .20
    shader.inputs['Anisotropic'].default_value = 0
    shader.inputs['Sheen Weight'].default_value = 0
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = color
    links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = normal
    bump = nodes.new('ShaderNodeNormalMap')
    bump.inputs['Strength'].default_value = .24
    links.new(texture.outputs['Color'], bump.inputs['Color'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    curly_hair = hair.copy()
    curly_hair.name = 'Carmela_CurlyHair'
    for node in curly_hair.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image == color:
            node.image = curl_color
        elif node.type == 'TEX_IMAGE' and node.image == normal:
            node.image = curl_normal
    strands = hair.copy()
    strands.name = 'Carmela_HairStrands'
    strands.surface_render_method = 'DITHERED'
    alpha_texture = strands.node_tree.nodes.new('ShaderNodeTexImage')
    alpha_texture.image = mask
    strands.node_tree.links.new(alpha_texture.outputs['Color'], strands.node_tree.nodes.get('Principled BSDF').inputs['Alpha'])
    part_material = bpy.data.materials.new('Carmela_HairPart')
    part_material.use_nodes = True
    part_shader = part_material.node_tree.nodes.get('Principled BSDF')
    part_shader.inputs['Roughness'].default_value = .72
    part_image = part_material.node_tree.nodes.new('ShaderNodeTexImage')
    part_image.image = next(n.image for n in reference.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')
    part_material.node_tree.links.new(part_image.outputs['Color'], part_shader.inputs['Base Color'])

    def project(co, offset=0):
        direction = (co-center).normalized()
        hit = surface.ray_cast(center, direction)
        return (hit[0] if hit[0] else center+direction*.105)+direction*offset

    def skin_uv(co):
        hit = surface.find_nearest(co)
        triangle = triangles[hit[2]]
        uv = barycentric_transform(hit[0], *[points[i] for i in triangle.vertices],
                                   *[Vector((*source_uv[i], 0)) for i in triangle.loops])
        return (uv.x, uv.y)

    def geometry(style, volume=0, wave=0, bun_height=0, part_offset=0, coverage=0):
        vertices, faces, uvs, materials = [], [], [], []
        part = style['part']+part_offset*.013
        waves = style['waves']+wave*.55
        ear_drop = style.get('ear', 0)*(1+.35*coverage)

        def vertex(co, uv):
            vertices.append(tuple(co))
            uvs.append(uv)
            return len(vertices)-1

        def quad(a, b, c, d, material=0):
            faces.append((a, b, c, d))
            materials.append(material)

        def border(angle):
            a = abs(math.atan2(math.sin(angle), math.cos(angle)))
            front = math.cos(angle)
            z = 1.545+.053*max(0, front)-.065*max(0, -front)
            z += .009*math.exp(-((a-.65)/.23)**2)-.005*math.exp(-((angle-part/.085)/.17)**2)
            z += .0005*math.sin(angle*19)+.0003*math.sin(angle*31)
            z -= ear_drop*math.exp(-((a-1.70)/.44)**4)
            if ear_drop:
                z += .0025*math.sin(angle*11)*math.exp(-((a-1.5)/.75)**4)
                if style.get('curls'):
                    z += .0025*math.sin(angle*23)*math.exp(-((a-1.70)/.65)**4)
                # Carry the side hair down into the nape. An upward arch here
                # exposes a bare wedge behind the ear like a shaved undercut.
                nape = 1.47-.020*smooth(2.12, math.pi, a)
                back = smooth(1.72, 2.12, a)
                z = z*(1-back)+nape*back
            return math.acos(max(-1, min(1, (z-center.z)/.115)))

        def cap_point(angle, t):
            phi = max(0, t*border(angle))
            sign = 1 if math.sin(angle) >= 0 else -1
            sagittal = max(0, math.cos(angle))**6
            crown = 1-smooth(0, .22, t)
            raw = center+Vector((.096*math.sin(phi)*math.sin(angle)+part*(sagittal+(1-sagittal)*crown)+sign*.0013*sagittal*(1-crown),
                                 -.104*math.sin(phi)*math.cos(angle), .115*math.cos(phi)))
            interior = smooth(0, .20, 1-t)
            part_fade = 1-.78*(1-smooth(0, .24, abs(math.sin(angle))))*smooth(-.15, .4, math.cos(angle))
            part_fade = part_fade*(1-crown)+crown
            lift = (.005+style['volume']+.010*volume)*interior*part_fade
            roll = (.003+style['waves']*.010)*math.exp(-((abs(angle)-.75)/.65)**2-((t-.77)/.23)**2)
            lift += roll*(1+.3*volume)*(1-crown)
            lift += .0018*waves*math.sin(t*math.pi*9+math.sin(angle)*1.7)*max(0, math.sin(math.pi*t))**.6*interior
            if ear_drop:
                side = math.exp(-((abs(angle)-1.65)/.52)**4)*smooth(.45, .9, t)
                lift += side*(.004+.009*math.exp(-((t-.84)/.13)**2)+.003*volume+.0025*waves*math.sin(t*math.pi*7+abs(angle)*1.5))
                if style.get('curls'):
                    lift += .003*side*math.sin(angle*23+.7*math.sin(t*19))*math.sin(t*32+angle*.8)
            p = project(raw, .001+lift)
            if ear_drop:
                # Hair drapes across the ear rather than inheriting its folds
                # from a surface projection of the scalp.
                p = p.lerp(raw+(raw-center).normalized()*(.008+lift), side)
                back = smooth(1.65, 2.12, abs(angle))*smooth(.70, .97, t)
                if back:
                    # Radial skull projection raises the neck edges and leaves
                    # a centre tail. Fit the nape horizontally at its own height.
                    direction = Vector((math.sin(angle), -math.cos(angle), 0))
                    hit = surface.ray_cast(Vector((0, 0, raw.z)), direction)
                    if hit[0]:
                        p = p.lerp(hit[0]+direction*(.004+lift), back)
            return p

        # Two continuous banks meet at a narrow scalp part. Shared vertices
        # keep the groom smooth instead of layering intersecting solid plates.
        columns, rows = 64, 36
        for sign in [-1, 1]:
            start = len(vertices)
            for row in range(rows+1):
                t = row/rows
                for col in range(columns+1):
                    flow = col/columns
                    a = sign*(.00001+flow*(math.pi-.00002))
                    warped = t+.025*waves*math.sin(a*3+t*2)*math.sin(math.pi*t)
                    vertex(cap_point(a, warped), (t*1.25+.028*math.sin(a*2), flow*2))
            for row in range(rows):
                for col in range(columns):
                    a = start+row*(columns+1)+col
                    if sign == 1:
                        quad(a, a+columns+1, a+columns+2, a+1)
                    else:
                        quad(a, a+1, a+columns+2, a+columns+1)

        start = len(vertices)
        for row in range(61):
            t = row/60
            bank_t = 1-t
            bank_t += .025*waves*math.sin(bank_t*2)*math.sin(math.pi*bank_t)
            for sign in [-1, 1]:
                # Close the part between the banks even when the crown lifts;
                # a strip on the bare skull leaves a dark open wedge in tilt.
                p = cap_point(sign*.00001, bank_t)
                p -= (p-center).normalized()*.0001
                vertex(p, skin_uv(p))
            if row:
                a = start+(row-1)*2
                quad(a, a+2, a+3, a+1, 1)

        at = Vector((0, style['back'], style['height']+.030*bun_height))
        radius = style['radius']*(1+.15*volume)
        start = len(vertices)
        columns, rows = 40, 20
        for row in range(rows+1):
            phi = row/rows*math.pi
            for col in range(columns):
                a = col/columns*math.tau
                r = radius*(1+.035*math.sin(a*9+phi*3))
                p = at+Vector((r*style['oval']*math.sin(phi)*math.cos(a), r*.72*math.cos(phi), r*.84*math.sin(phi)*math.sin(a)))
                vertex(p, (col/columns*2, row/rows*2))
        for row in range(rows):
            for col in range(columns):
                a, b = start+row*columns+col, start+row*columns+(col+1) % columns
                quad(a, b, b+columns, a+columns)

        def tube(path, radius, flattened=1):
            start = len(vertices)
            for row, p in enumerate(path):
                t = row/(len(path)-1)
                tangent = (path[min(row+1, len(path)-1)]-path[max(0, row-1)]).normalized()
                normal = Vector((0, 1, 0))
                if abs(tangent.dot(normal)) > .95:
                    normal = Vector((0, 0, 1))
                across = tangent.cross(normal).normalized()
                depth = tangent.cross(across).normalized()
                taper = .30+.70*math.sin(math.pi*t)**.22
                for col in range(8):
                    a = col/8*math.tau
                    vertex(p+radius*taper*(across*math.cos(a)+depth*math.sin(a)*flattened), (col/8*1.5, t*4))
            for row in range(len(path)-1):
                for col in range(8):
                    a, b = start+row*8+col, start+row*8+(col+1) % 8
                    quad(a, b, b+8, a+8)

        paths = [[], [], []] if style is STYLES['braided_knot'] else [[]]
        for row in range(161):
            t = row/160
            angle = t*math.tau*2.45
            r = radius*(.83-.65*t)
            p = at+Vector((r*style['oval']*math.cos(angle), radius*.68+.003*t, r*.84*math.sin(angle)))
            radial = Vector((math.cos(angle), 0, math.sin(angle)))
            for strand, path in enumerate(paths):
                phase = t*math.tau*15+strand*math.tau/3
                offset = radial*(.0045*math.cos(phase))+Vector((0, .0045*math.sin(phase), 0)) if len(paths) > 1 else Vector()
                path.append(p+offset)
        for path in paths:
            tube(path, .0045 if len(paths) > 1 else .008, .8)

        def card(path, half_width):
            start = len(vertices)
            columns = 4
            for row, p in enumerate(path):
                t = row/(len(path)-1)
                tangent = (path[min(row+1, len(path)-1)]-path[max(0, row-1)]).normalized()
                normal = (p-center).normalized()
                across = tangent.cross(normal).normalized()
                width = half_width*(.35+.65*math.sin(math.pi*t)**.4)
                for col in range(columns+1):
                    u = col/columns
                    vertex(p+across*(u*2-1)*width+normal*.0004*(1-(u*2-1)**2), (u, t))
            for row in range(len(path)-1):
                for col in range(columns):
                    a = start+row*(columns+1)+col
                    quad(a, a+columns+1, a+columns+2, a+1, 2)

        for sign in [-1, 1]:
            for strand in range(18):
                angle = sign*(.28+strand*.09)
                path = []
                for i in range(13):
                    t = i/12
                    p = cap_point(angle+sign*.065*t, .86+.19*t)
                    path.append(p+(p-center).normalized()*.0007)
                card(path, .0025 if ear_drop else .0018)
            if ear_drop:
                for lock in range(9):
                    path = []
                    for i in range(25):
                        t = i/24
                        angle = sign*(.52+lock*.13+.40*t)
                        p = cap_point(angle, .62+.40*t)
                        path.append(p+(p-center).normalized()*(.0015+.0015*math.sin(t*math.pi*2)))
                    card(path, .006)
        return vertices, faces, uvs, materials

    objects = []
    for style_id, style in STYLES.items():
        vertices, faces, uvs, materials = geometry(style)
        data = bpy.data.meshes.new('Hair_'+style_id)
        data.from_pydata(vertices, [], faces)
        data.materials.append(curly_hair if style.get('curls') else hair)
        data.materials.append(part_material)
        data.materials.append(strands)
        uv = data.uv_layers.new(name='HairFlow')
        colors = data.color_attributes.new(name='HairTint', type='FLOAT_COLOR', domain='POINT')
        for index, point in enumerate(vertices):
            grey = max(0, 1-abs(abs(point[0])-.08)/.030)*max(0, 1-abs(point[2]-1.56)/.07)
            base = (.92, .70, .56) if identity == 'seamstress' else (.82, .79, .74)
            grey = 0 if identity == 'seamstress' else grey*.35
            colors.data[index].color = tuple(c*(1-grey)+.96*grey for c in base)+(1,)
        for polygon, material in zip(data.polygons, materials):
            polygon.use_smooth = True
            polygon.material_index = material
            for loop in polygon.loop_indices:
                index = data.loops[loop].vertex_index
                uv.data[loop].uv = uvs[index]
                if material == 1:
                    colors.data[index].color = (1, 1, 1, 1)
        obj = bpy.data.objects.new('Carmela_HairStyle_'+style_id, data)
        bpy.context.collection.objects.link(obj)
        obj.shape_key_add(name='Basis', from_mix=False)
        for name, parameter in [('rc_hairVolume', 'volume'), ('rc_hairWave', 'wave'),
                                ('rc_hairBunHeight', 'bun_height'), ('rc_hairPartOffset', 'part_offset'),
                                ('rc_hairEarCoverage', 'coverage')]:
            posed = geometry(style, **{parameter: 1})[0]
            key = obj.shape_key_add(name=name, from_mix=False)
            for point, co in zip(key.data, posed):
                point.co = co
        obj['hair_style'] = style_id
        objects.append(obj)
    return objects

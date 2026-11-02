"""Add fitted eyes, closing eyelids, and expression shapes to Carmela."""

import argparse
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import carmela_mouth

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--identity', choices=('carmela', 'seamstress', 'male-a', 'male-b'), default='carmela')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.context.preferences.filepaths.save_version = 0
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
source = os.path.join(root, 'assets/source/carmela-russo-2026-10-29')
if args.identity.startswith('male-'):
    source = os.path.join(root, 'assets/source/modular-men-2026-10-31')
os.makedirs(args.output, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
relative = {
    'carmela': 'head-p2-v1/carmela-head-p2-v1.fbx',
    'seamstress': 'second-head-p2-v1/second-identity-head-p2-v1.fbx',
    'male-a': 'male-a-head-p2-v1/male-a-head-p2-v1.fbx',
    'male-b': 'male-b-head-p2-v1/male-b-head-p2-v1.fbx',
}[args.identity]
bpy.ops.import_scene.fbx(filepath=os.path.join(source, relative))
face = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
face.name = 'Carmela_Face'
bpy.context.view_layer.objects.active = face
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if args.identity == 'seamstress':
    face.scale = (1.035, 1.035, 1.035)
    face.location.z = .056
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# These anchors are measured on each donor's frontal projection. Moving a
# fitted face to a different body must not change its texture-space anchors.
eye_z, eye_x, eye_width, mouth_z, mouth_x = {
    'carmela': (.674, .111, .061, .445, .097),
    'seamstress': (.665, .107, .054, .431, .078),
    'male-a': (.656, .0975, .050, .424, .085),
    'male-b': (.645, .116, .050, .399, .100),
}[args.identity]
bm = bmesh.new()
bm.from_mesh(face.data)
brows = [v for v in bm.verts if eye_z+.04 < v.co.z < eye_z+.13 and .025 < abs(v.co.x) < .20 and v.co.y < 0]
for _ in range(4):
    bmesh.ops.smooth_vert(bm, verts=brows, factor=.5, use_axis_x=False, use_axis_y=True, use_axis_z=False)
bm.to_mesh(face.data)
bm.free()
reference = face.copy()
reference.data = face.data.copy()
reference.name = 'Tripo_Surface_Reference'
bpy.context.collection.objects.link(reference)
reference.hide_render = True
reference.hide_set(True)
face.data.calc_loop_triangles()
triangles = [(tuple(t.vertices), tuple(t.loops)) for t in face.data.loop_triangles]
points = [v.co.copy() for v in face.data.vertices]
surface = BVHTree.FromPolygons(points, [t[0] for t in triangles], all_triangles=True)
source_uvs = [v.uv.copy() for v in face.data.uv_layers.active.data]

def sample(x, z):
    hit = surface.ray_cast(Vector((x, -2, z)), Vector((0, 1, 0)))
    if hit[0] is None:
        hit = surface.find_nearest(Vector((x, -.32, z)))
    triangle = triangles[hit[2]]
    uvs = [source_uvs[i] for i in triangle[1]]
    uv = barycentric_transform(hit[0], *[points[i] for i in triangle[0]], *[Vector((v.x, v.y, 0)) for v in uvs])
    return hit[0].y, (uv.x, uv.y)

# Remove the painted eye surfaces. The fitted lid covers the irregular edge
# left by the donor's quad grid, while the eyeball supplies the visible iris.
bm = bmesh.new()
bm.from_mesh(face.data)
remove = []
seen, islands = set(), []
for vertex in bm.verts:
    if vertex in seen:
        continue
    stack, component = [vertex], []
    seen.add(vertex)
    while stack:
        current = stack.pop()
        component.append(current)
        for edge in current.link_edges:
            neighbor = edge.other_vert(current)
            if neighbor not in seen:
                seen.add(neighbor)
                stack.append(neighbor)
    heights = [point.co.z for point in component]
    front_detail=all(abs(v.co.x)<.23 and v.co.y<0 for v in component)
    if len(component) < 2000 and min(heights) > eye_z-.10 and max(heights) < eye_z+.13 and (not args.identity.startswith('male-') or front_detail):
        islands.extend(component)
bmesh.ops.delete(bm, geom=islands, context='VERTS')
for polygon in bm.faces:
    center = polygon.calc_center_median()
    eye = min(((center.x - sign * eye_x) / (eye_width+(.023 if args.identity.startswith('male-') else .019))) ** 2 + ((center.z - eye_z) / (.0415 if args.identity.startswith('male-') else .039)) ** 2 for sign in (-1, 1))
    if center.y < 0 and eye < 1.0:
        remove.append(polygon)
bmesh.ops.delete(bm, geom=remove, context='FACES')
if args.identity.startswith('male-'):
    # Retain the donor's throat and under-jaw curve. Flattening this region
    # before fitting it to a collar turns the lower face into a long shelf.
    bmesh.ops.remove_doubles(bm,verts=[v for v in bm.verts if v.co.z<.30],dist=.00005)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                          plane_co=(0,0,.10),plane_no=(0,0,1),clear_inner=True)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
else:
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < .235 or not v.link_faces], context='VERTS')
    for vertex in bm.verts:
        if vertex.co.z < .29:
            if any(edge.is_boundary for edge in vertex.link_edges):
                vertex.co.z = .17
            radius = math.sqrt((vertex.co.x/.16)**2 + ((vertex.co.y-.03)/.13)**2)
            blend = max(0, min(1, (.29-vertex.co.z)/.12))
            scale = 1 + (min(1, 1/max(radius, .001))-1)*blend
            vertex.co.x *= scale
            vertex.co.y = .03 + (vertex.co.y-.03)*scale
bm.to_mesh(face.data)
bm.free()
carmela_mouth.prepare(face, mouth_x, mouth_z)
face.shape_key_add(name='Basis', from_mix=False).value = 0

def gaussian(co, center, widths):
    return math.exp(-sum(((co[i] - center[i]) / widths[i]) ** 2 for i in range(3)) * 2)

expression_functions = []

def expression(name, function):
    expression_functions.append((name, function))
    key = face.shape_key_add(name=name, from_mix=False)
    key.value = 0
    for vertex in key.data:
        vertex.co += function(vertex.co)

for sign, side in [(1, 'Left'), (-1, 'Right')]:
    mouth_y = sample(sign*mouth_x, mouth_z)[0]
    brow_y = sample(sign*eye_x, eye_z+.073)[0]
    cheek_y = sample(sign*.13, eye_z-.074)[0]
    nose_y = sample(sign*.047, eye_z-.134)[0]
    for name, dz, dx in [('mouthSmile', .055, .018), ('mouthFrown', -.035, .005), ('mouthStretch', -.008, .035)]:
        expression(name + side, lambda co, s=sign, dz=dz, dx=dx, y=mouth_y: Vector((s * dx, 0, dz)) * gaussian(co, (s * mouth_x, y, mouth_z), (.12, .10, .085)))
    expression('browDown' + side, lambda co, s=sign, y=brow_y: Vector((0, -.003, -.033)) * gaussian(co, (s * eye_x, y, eye_z+.073), (.13, .12, .085)))
    expression('mouthPress' + side, lambda co, s=sign, y=mouth_y: Vector((0, 0, (mouth_z+.002 - co.z) * .6)) * gaussian(co, (s * .05, y, mouth_z+.002), (.09, .08, .045)))
    expression('cheekSquint' + side, lambda co, s=sign, y=cheek_y: Vector((0, -.007, .018)) * gaussian(co, (s * .13, y, eye_z-.074), (.11, .1, .1)))
    expression('noseSneer' + side, lambda co, s=sign, y=nose_y: Vector((0, 0, .023)) * gaussian(co, (s * .047, y, eye_z-.134), (.065, .08, .08)))
brow_y = sample(0, eye_z+.084)[0]
mouth_y = sample(0, mouth_z)[0]
expression('browInnerUp', lambda co: Vector((0, -.002, .046)) * gaussian(co, (0, brow_y, eye_z+.084), (.16, .11, .10)))
expression('jawOpen', lambda co: Vector((0, .018, -.16)) * max(0, min(1, (mouth_z+.015-co.z) / .07)) * gaussian(co, (0, mouth_y, mouth_z-.085), (.23, .23, .22)))

skin = face.data.materials[0]
skin.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .68
donor_image = next(n.image for n in skin.node_tree.nodes if n.type == 'TEX_IMAGE')

# Bake the detached brow and lash detail onto the main facial surface.
# Keeping the generated hair shards as deforming skin produces sharp spikes.
donor_material = skin.copy()
reference.data.materials.clear()
reference.data.materials.append(donor_material)
nodes = donor_material.node_tree.nodes
emission = nodes.new('ShaderNodeEmission')
donor_material.node_tree.links.new(next(n for n in nodes if n.type == 'TEX_IMAGE').outputs['Color'], emission.inputs['Color'])
donor_material.node_tree.links.new(emission.outputs[0], next(n for n in nodes if n.type == 'OUTPUT_MATERIAL').inputs['Surface'])
skin = skin.copy()
skin.name = 'Patient_FacialSkin'
face.data.materials.clear()
face.data.materials.append(skin)
image = bpy.data.images.new('Patient_FacialSkin', width=2048, height=2048)
target = next(n for n in skin.node_tree.nodes if n.type == 'TEX_IMAGE')
target.image = image
skin.node_tree.nodes.active = target
shader = skin.node_tree.nodes.get('Principled BSDF')
for link in list(shader.inputs['Base Color'].links):
    skin.node_tree.links.remove(link)
reference.hide_set(False)
reference.hide_render = False
bpy.ops.object.select_all(action='DESELECT')
reference.select_set(True)
face.select_set(True)
bpy.context.view_layer.objects.active = face
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = .04
scene.render.bake.max_ray_distance = .12
scene.render.bake.margin = 12
bpy.ops.object.bake(type='EMIT')
if args.identity.startswith('male-'):
    # Projection is needed for detached brow fibres. Elsewhere the donor UVs
    # are already correct; cage rays around nostrils and ears leave dark seams.
    original=donor_image.copy();original.scale(2048,2048)
    pixels=np.array(original.pixels[:],dtype=np.float32).reshape(2048,2048,4)
    baked=np.array(image.pixels[:],dtype=np.float32).reshape(2048,2048,4)
    bpy.data.images.remove(original)
    mask=np.zeros((2048,2048),dtype=np.float32)
    face.data.calc_loop_triangles()
    uv_data=face.data.uv_layers.active.data
    for triangle in face.data.loop_triangles:
        center=sum((face.data.vertices[i].co for i in triangle.vertices),Vector())/3
        if not (eye_z+.015<center.z<eye_z+.14 and .015<abs(center.x)<.21 and center.y<0):continue
        uv=np.array([uv_data[i].uv[:] for i in triangle.loops])*2048
        x0,y0=np.maximum(0,np.floor(uv.min(axis=0)).astype(int));x1,y1=np.minimum(2047,np.ceil(uv.max(axis=0)).astype(int))
        a,b,c=uv;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-6:continue
        x,y=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
        w1=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
        w2=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
        mask[y0:y1+1,x0:x1+1]=np.maximum(mask[y0:y1+1,x0:x1+1],((w1>=0)&(w2>=0)&(w1+w2<=1)).astype(float))
    for _ in range(3):mask=np.maximum.reduce([mask,np.roll(mask,1,0),np.roll(mask,-1,0),np.roll(mask,1,1),np.roll(mask,-1,1)])
    for _ in range(2):mask=(mask+np.roll(mask,1,0)+np.roll(mask,-1,0)+np.roll(mask,1,1)+np.roll(mask,-1,1))/5
    image.pixels.foreach_set((pixels*(1-mask[:,:,None])+baked*mask[:,:,None]).ravel())
skin.node_tree.links.new(target.outputs['Color'], shader.inputs['Base Color'])
image.filepath_raw = os.path.abspath(os.path.join(args.output, 'skin-basecolor.png'))
image.file_format = 'PNG'
image.save()
image.pack()
reference.hide_set(True)
reference.hide_render = True

def mesh_object(name, vertices, faces, material, uvs=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    if uvs:
        layer = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj

def solid(name, color, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return material

# Reproject the donor's eye region into one continuous atlas. Its UV charts
# cross the lids; interpolating those charts directly creates striped seams.
source_image = donor_image
source_pixels = np.empty(len(source_image.pixels), dtype=np.float32)
source_image.pixels.foreach_get(source_pixels)
source_pixels = source_pixels.reshape((source_image.size[1], source_image.size[0], 4))
male = args.identity.startswith('male-')
atlas_x = -.25 if male else -.21
atlas_width = .50 if male else .42
atlas_z = eye_z-.105 if male else .60
atlas_height = .21 if male else .18
width, height = 768, 384
atlas_pixels = np.zeros((height, width, 4), dtype=np.float32)
for row in range(height):
    z = atlas_z + (row + .5) / height * atlas_height
    for column in range(width):
        x = atlas_x + (column + .5) / width * atlas_width
        _, uv = sample(x, z)
        u, v = uv[0] % 1, uv[1] % 1
        atlas_pixels[row, column] = source_pixels[min(source_image.size[1]-1, int(v*source_image.size[1])), min(source_image.size[0]-1, int(u*source_image.size[0]))]
image = bpy.data.images.new('Carmela_EyeRegion', width=width, height=height)
image.pixels.foreach_set(atlas_pixels.ravel())
image.filepath_raw = os.path.abspath(os.path.join(args.output, 'eye-region.png'))
image.file_format = 'PNG'
image.save()
image.pack()
lid_material = skin.copy()
lid_material.name = 'Carmela_LidSkin'
if male:
    shader=lid_material.node_tree.nodes.get('Principled BSDF')
    for name,value in [('Normal',None),('Metallic',0),('Roughness',.68)]:
        for link in list(shader.inputs[name].links):lid_material.node_tree.links.remove(link)
        if value is not None:shader.inputs[name].default_value=value
    clean=atlas_pixels.copy()
    for row in range(height):
        z=atlas_z+(row+.5)/height*atlas_height
        for col in range(width):
            x=atlas_x+(col+.5)/width*atlas_width
            cx=eye_x if x>=0 else -eye_x
            # Remove the painted eyeball and lashes, while retaining the
            # donor's lid fold instead of replacing the whole socket with cheek.
            radius=math.sqrt(((x-cx)/(eye_width+.006))**2+((z-eye_z)/(.027 if z>=eye_z else .025))**2)
            t=max(0,min(1,(radius-.90)/.35));blend=1-t*t*(3-2*t)
            if blend>0:
                _,skin_uv=sample(cx+(x-cx)*.5,eye_z-.075+(z-eye_z)*.15)
                u,v=skin_uv
                skin_pixel=source_pixels[min(source_image.size[1]-1,int((v%1)*source_image.size[1])),min(source_image.size[0]-1,int((u%1)*source_image.size[0]))]
                clean[row,col]=clean[row,col]*(1-blend)+skin_pixel*blend
            rim=math.sqrt(((x-cx)/(eye_width*.90))**2+((z-eye_z)/(.025 if z>=eye_z else .017))**2)
            side=max(0,1-((x-cx)/(eye_width*1.10))**2)**.5
            edge=math.exp(-((rim-1)/.055)**2)*side
            fold=math.exp(-((rim-1.38)/.08)**2)*side if z>eye_z else 0
            clean[row,col,:3]*=1-edge*np.array([.30,.39,.43])-fold*np.array([.15,.20,.22])
    lid_image=bpy.data.images.new('Patient_CleanLidSkin',width=width,height=height)
    lid_image.pixels.foreach_set(clean.ravel())
    lid_image.filepath_raw=os.path.abspath(os.path.join(args.output,'clean-lid-skin.png'));lid_image.file_format='PNG';lid_image.save();lid_image.pack()
else:
    lid_image=image
next(n for n in lid_material.node_tree.nodes if n.type == 'TEX_IMAGE').image = lid_image
eye_material = lid_material.copy()
eye_material.name = 'Carmela_EyeSurface'
next(n for n in eye_material.node_tree.nodes if n.type=='TEX_IMAGE').image=image
eye_material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .32

def atlas_uv(x, z):
    return ((x-atlas_x)/atlas_width, (z-atlas_z)/atlas_height)

eye_depth=eye_width*1.1 if male else .056
eye_radius=eye_width*.90 if male else .055
for sign, side in [(1, 'Left'), (-1, 'Right')]:
    cx, cz = sign * eye_x, eye_z
    center_y = sample(cx, cz)[0] + eye_depth
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, location=(cx, center_y, cz))
    eye = bpy.context.object
    eye.name = 'Carmela_Eye_' + side
    eye['modularIrisCenter'] = [(cx-atlas_x)/atlas_width, 1-(cz-atlas_z)/atlas_height]
    eye['modularReferenceSpan'] = (eye_z-mouth_z)*.308
    eye.scale = (eye_width*1.1, eye_depth, eye_radius)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    eye.data.materials.append(eye_material)
    layer = eye.data.uv_layers.active
    for loop in eye.data.loops:
        point = eye.data.vertices[loop.vertex_index].co
        layer.data[loop.index].uv = atlas_uv(point.x, point.z)
    for polygon in eye.data.polygons:
        polygon.use_smooth = True
    eye.shape_key_add(name='Basis', from_mix=False).value = 0
    for look, axis, angle in [('In', (0, 0, 1), -.22*sign), ('Out', (0, 0, 1), .22*sign), ('Up', (1, 0, 0), -.20), ('Down', (1, 0, 0), .20)]:
        key = eye.shape_key_add(name='eyeLook'+look+side, from_mix=False)
        key.value = 0
        rotation = Quaternion(Vector(axis), angle)
        center = Vector((cx, center_y, cz))
        for vertex in key.data:
            vertex.co = center + rotation @ (vertex.co-center)

    vertices, closed, uvs, polygons = [], [], [], []
    columns, rows = 64, 8
    for row in range(rows+1):
        t = row / rows
        for column in range(columns):
            a = column / columns * math.tau
            c, s = math.cos(a), math.sin(a)
            dx = ((1-t)*eye_width*(.90 if male else 1) + t*(eye_width+.030)) * c
            radius = (.017 if s>=0 else .011) if male else (.020 if s>=0 else .016)
            opened_z = cz + ((1-t)*radius + t*.047) * s
            closed_line = cz-.003*(1-c*c)
            closed_z = opened_z+(closed_line-opened_z)*(1-t)**1.2
            open_y, _ = sample(cx+dx, opened_z)
            closed_y, _ = sample(cx+dx, closed_z)
            globe = center_y - eye_depth * math.sqrt(max(0, 1-(dx/(eye_width*1.1))**2-((closed_z-cz)/eye_radius)**2))
            if male:
                globe_open=center_y-eye_depth*math.sqrt(max(0,1-(dx/(eye_width*1.1))**2-((opened_z-cz)/eye_radius)**2))
                # Wrap the margin onto the globe, then meet the scanned skin.
                # A flat skin bridge leaves an exposed, detached-looking eye.
                blend=max(0,min(1,t/.5));blend=blend*blend*(3-2*blend)
                wrap=(1-blend)*abs(s)**.5
                rolled=globe_open-.0015-.002*math.exp(-((t-.14)/.09)**2)
                open_y=min(globe_open-.001,min(globe_open,open_y)*(1-wrap)+rolled*wrap)
                offset=.0002
            else:
                offset=.001
            vertices.append((cx+dx, open_y-offset, opened_z))
            closed.append((cx+dx, min(closed_y, globe)-.0015, closed_z))
            safe_z = opened_z + (1-t) * (.008 if s >= 0 else -.006) * abs(s)
            uvs.append(atlas_uv(cx+dx, safe_z))
    for row in range(rows):
        for column in range(columns):
            a, b = row*columns+column, row*columns+(column+1)%columns
            polygons.append((a, a+columns, b+columns, b))
    lid = mesh_object('Carmela_Lid_' + side, vertices, polygons, lid_material, uvs)
    lid.shape_key_add(name='Basis', from_mix=False).value = 0
    # Keep the lid's outside edge attached when brows and cheeks move. The
    # inner rim stays on the eyeball and has its own blink and squint shapes.
    for name, function in expression_functions:
        shape = lid.shape_key_add(name=name, from_mix=False)
        shape.value = 0
        for index, vertex in enumerate(shape.data):
            vertex.co += function(vertex.co)*(index//columns/rows)
            if male:
                dx,dz=vertex.co.x-cx,vertex.co.z-cz
                inside=1-(dx/(eye_width*1.1))**2-(dz/eye_radius)**2
                if inside>0:vertex.co.y=min(vertex.co.y,center_y-eye_depth*math.sqrt(inside)-.0015)
    key = lid.shape_key_add(name='eyeBlink' + side, from_mix=False)
    key.value = 0
    for vertex, co in zip(key.data, closed):
        vertex.co = co
    squint = lid.shape_key_add(name='eyeSquint' + side, from_mix=False)
    squint.value = 0
    for vertex, a, b in zip(squint.data, vertices, closed):
        vertex.co = Vector(a).lerp(Vector(b), .30)
    wide = lid.shape_key_add(name='eyeWide'+side, from_mix=False)
    wide.value = 0
    for vertex, a, b in zip(wide.data, vertices, closed):
        vertex.co = Vector(a).lerp(Vector(b), -.25)

carmela_mouth.build(face, sample, donor_image, mouth_x, mouth_z, expression_functions, args.output)

for polygon in face.data.polygons:
    polygon.use_smooth = True
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or not obj.data.shape_keys:
        continue
    basis = obj.data.shape_keys.key_blocks[0]
    for key in obj.data.shape_keys.key_blocks:
        maximum = max((a.co-b.co).length for a, b in zip(key.data, basis.data))
        if maximum > .22:
            raise RuntimeError(f'{obj.name}/{key.name}: excessive delta {maximum:.4f}')
        key.value = 0
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.output, 'carmela-head.blend')))
print('CARMELA_DIRECT_HEAD_OK')

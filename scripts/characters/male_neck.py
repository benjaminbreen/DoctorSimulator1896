"""Keep the donor throat and add a short neck transition inside the collar."""
import math
import bpy
import bmesh
from mathutils import Vector


def smooth(a, b, x):
    t = max(0, min(1, (x-a)/(b-a)))
    return t*t*(3-2*t)


def fit(face, reference, output, base, neck_radius, repair_nose=False):
    # The extension must descend into the collar. An upward extension folds
    # back through the native cut and exposes a loose flap in profile.
    base = base.copy()
    base.z = min(base.z, .075)
    old = face.data
    cut_z = .18 if repair_nose else .20
    bm = bmesh.new()
    bm.from_mesh(old)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                          plane_co=(0,0,cut_z+.045), plane_no=(0,-.45,1), clear_inner=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(old)
    bm.free()
    key_data = [(k.name, [v.co.copy() for v in k.data]) for k in old.shape_keys.key_blocks]
    points = [p.copy() for p in key_data[0][1]]
    faces = [tuple(p.vertices) for p in old.polygons]
    uvs = [[old.uv_layers.active.data[i].uv.copy() for i in p.loop_indices] for p in old.polygons]
    original_normals = [n.vector.copy() for n in old.corner_normals]
    bm = bmesh.new()
    bm.from_mesh(old)
    border = {v.index for e in bm.edges if e.is_boundary and all(abs(v.co.z-cut_z-.045-.45*v.co.y)<.0001 for v in e.verts) for v in e.verts}
    bm.free()
    if len(border) < 20:
        raise RuntimeError('The native neck cut did not produce a complete ring')
    centre = sum((points[i] for i in border), Vector())/len(border)
    fitted_centre = sum((points[i] for i in border), Vector())/len(border)
    ring = sorted(border, key=lambda i: math.atan2(points[i].y-fitted_centre.y, points[i].x-fitted_centre.x))
    print('NATIVE_NECK_RING', len(ring), tuple(centre), 'BASE', tuple(base))

    previous = ring
    for step in range(1, 9):
        t = step/8
        current = []
        for index in ring:
            p = points[index]
            angle = math.atan2(p.x-fitted_centre.x, p.y-fitted_centre.y)
            target = Vector((base.x+neck_radius[0]*math.sin(angle), base.y+neck_radius[1]*math.cos(angle), base.z))
            current.append(len(points))
            fitted = p.lerp(target, smooth(0,1,t))
            fitted.z = p.z*(1-t)+target.z*t
            points.append(fitted)
        for i in range(len(ring)):
            j = (i+1) % len(ring)
            polygon = (previous[i], current[i], current[j], previous[j])
            faces.append(polygon)
            uvs.append([(0,0)]*4)
        previous = current

    mesh = bpy.data.meshes.new('Patient_HeadWithNativeNeck')
    mesh.from_pydata(points, [], faces)
    mesh.materials.append(old.materials[0])
    layer = mesh.uv_layers.new(name='DonorUV')
    for polygon, polygon_uv in zip(mesh.polygons, uvs):
        polygon.use_smooth = True
        for loop_index, uv in zip(polygon.loop_indices, polygon_uv):
            layer.data[loop_index].uv = uv
    face.data = mesh
    original_count = len(key_data[0][1])
    for name, source in key_data:
        key = face.shape_key_add(name=name)
        key.value = 0
        for i in range(original_count):
            p = points[i]
            neck = smooth(-.23, -.14, p.y)*(1-smooth(.25, .37, p.z))
            key.data[i].co = p+(source[i]-key_data[0][1][i])*(1-neck)
    bpy.data.meshes.remove(old)
    mesh.update()
    normals = []
    for i, loop in enumerate(mesh.loops):
        normal = mesh.corner_normals[i].vector.copy()
        if i < len(original_normals):
            normal = normal.lerp(original_normals[i], smooth(.27, .38, mesh.vertices[loop.vertex_index].co.z)).normalized()
        normals.append(normal)
    mesh.normals_split_custom_set(normals)
    bake_skin(face, reference, output, repair_nose)
    mesh.normals_split_custom_set(normals)



def bake_skin(face, reference, output, repair_nose):
    # Bake from the donor in 3D. Interpolating nearest UVs across new neck
    # quads crosses the donor's UV islands and paints square patches of skin.
    mesh=face.data
    material=mesh.materials[0]
    source_material=reference.data.materials[0].copy()
    reference.data.materials[0]=source_material
    nodes,links=source_material.node_tree.nodes,source_material.node_tree.links
    source=next(n for n in nodes if n.type=='TEX_IMAGE' and n.image)
    emission=nodes.new('ShaderNodeEmission')
    links.new(source.outputs['Color'],emission.inputs['Color'])
    if repair_nose:
        attribute=reference.data.color_attributes.new(name='NostrilRepair',type='FLOAT_COLOR',domain='CORNER')
        for loop in reference.data.loops:
            p=reference.data.vertices[loop.vertex_index].co
            weight=math.exp(-((abs(p.x)-.038)/.026)**4-((p.z-.538)/.026)**4)
            weight*=smooth(.512,.523,p.z)*smooth(.29,.34,-p.y)
            attribute.data[loop.index].color=(weight,weight,weight,1)
        cheek=next(p for p in reference.data.polygons if .09<p.center.x<.16 and .52<p.center.z<.58 and p.center.y<-.15)
        layer=reference.data.uv_layers.active
        cheek_uv=sum((layer.data[i].uv for i in cheek.loop_indices),Vector((0,0)))/len(cheek.loop_indices)
        patch=nodes.new('ShaderNodeTexImage');patch.image=source.image
        vector=nodes.new('ShaderNodeCombineXYZ');vector.inputs['X'].default_value=cheek_uv.x;vector.inputs['Y'].default_value=cheek_uv.y
        links.new(vector.outputs[0],patch.inputs['Vector'])
        mask=nodes.new('ShaderNodeVertexColor');mask.layer_name=attribute.name
        luma=nodes.new('ShaderNodeRGBToBW');links.new(source.outputs['Color'],luma.inputs[0])
        dark=nodes.new('ShaderNodeMapRange');dark.inputs['From Min'].default_value=.035;dark.inputs['From Max'].default_value=.20;dark.inputs['To Min'].default_value=1;dark.inputs['To Max'].default_value=0
        links.new(luma.outputs[0],dark.inputs['Value'])
        factor=nodes.new('ShaderNodeMath');factor.operation='MULTIPLY';links.new(mask.outputs[0],factor.inputs[0]);links.new(dark.outputs[0],factor.inputs[1])
        mix=nodes.new('ShaderNodeMixRGB');links.new(factor.outputs[0],mix.inputs[0]);links.new(source.outputs['Color'],mix.inputs[1]);links.new(patch.outputs['Color'],mix.inputs[2])
        links.new(mix.outputs[0],emission.inputs['Color'])
    output_node=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    links.new(emission.outputs[0],output_node.inputs['Surface'])
    target_nodes=material.node_tree.nodes
    image=bpy.data.images.new('Patient_ProjectedSkin',width=2048,height=2048)
    target=target_nodes.new('ShaderNodeTexImage');target.image=image;target_nodes.active=target
    source_uv_name=mesh.uv_layers.active.name
    target_uv=mesh.uv_layers.new(name='Patient_SkinUV');target_uv.active_render=True
    mesh.uv_layers.active_index=len(mesh.uv_layers)-1
    bpy.ops.object.select_all(action='DESELECT')
    face.select_set(True);bpy.context.view_layer.objects.active=face
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.008)
    bpy.ops.object.mode_set(mode='OBJECT')
    reference.hide_set(False);reference.hide_render=False;reference.select_set(True)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
    scene.render.bake.use_selected_to_active=True
    scene.render.bake.cage_extrusion=.35;scene.render.bake.max_ray_distance=.70
    scene.render.bake.margin=12
    bpy.ops.object.bake(type='EMIT')
    image.filepath_raw=output;image.file_format='PNG';image.save();image.pack()
    shader=target_nodes.get('Principled BSDF')
    material.node_tree.links.new(target.outputs['Color'],shader.inputs['Base Color'])
    for name,value in [('Normal',None),('Metallic',0),('Roughness',.8)]:
        for link in list(shader.inputs[name].links):material.node_tree.links.remove(link)
        if value is not None:shader.inputs[name].default_value=value
    for node in list(target_nodes):
        if node.type=='TEX_IMAGE' and node!=target:target_nodes.remove(node)
    mesh.uv_layers.remove(mesh.uv_layers[source_uv_name]);mesh.uv_layers.active_index=0
    reference.select_set(False)

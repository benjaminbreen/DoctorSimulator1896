"""Surface-fitted sideburns and moustaches that follow the facial shapes."""
import math
import os
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


def build(face, lips, identity):
    face.data.calc_loop_triangles()
    triangles = list(face.data.loop_triangles)
    neutral = [v.co.copy() for v in face.data.shape_keys.key_blocks[0].data]
    surface = BVHTree.FromPolygons(neutral,[t.vertices for t in triangles],all_triangles=True)
    lips.data.calc_loop_triangles()
    lip_triangles=list(lips.data.loop_triangles)
    lip_neutral=[v.co.copy() for v in lips.data.shape_keys.key_blocks[0].data]
    lip_surface=BVHTree.FromPolygons(lip_neutral,[t.vertices for t in lip_triangles],all_triangles=True)
    material = bpy.data.materials.new('Patient_FacialHair')
    material.use_nodes=True
    material.surface_render_method='DITHERED'
    size=512
    u,v=np.meshgrid(np.arange(size)/(size-1),np.arange(size)/(size-1))
    filename=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../assets/source/modular-men-2026-10-31/references/facial-hair-fibres-v1.png'))
    source=bpy.data.images.load(filename,check_existing=True)
    source_pixels=np.array(source.pixels[:],dtype=np.float32).reshape(source.size[1],source.size[0],4)
    # A whole dense beard atlas shrinks to a featureless stripe at game scale.
    # This small group of fibres keeps individual clumps and tapered ends visible.
    x=((.47+u*.06)*source.size[0]).astype(int)
    y=(v*(source.size[1]-1)).astype(int)
    pixels=source_pixels[y,x].copy()
    pixels[:,:,3]*=np.clip(np.minimum(u,1-u)/.12,0,1)
    pixels[:,:,3]*=np.clip((v-.015)/.075,0,1)*np.clip((1-v)/.05,0,1)
    image=bpy.data.images.new('Patient_WhiskerFibres',width=size,height=size)
    image.pixels.foreach_set(pixels.ravel());image.pack()
    detail=image.copy();detail.scale(size,size)
    value=np.array(detail.pixels[:],dtype=np.float32).reshape(size,size,4)[:,:,:3].mean(axis=2)
    bpy.data.images.remove(detail)
    node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.86
    material.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
    material.node_tree.links.new(node.outputs['Alpha'],shader.inputs['Alpha'])
    normal_image=bpy.data.images.new('Patient_WhiskerNormals',width=size,height=size)
    normal_image.colorspace_settings.name='Non-Color'
    normal_pixels=np.ones((size,size,4),dtype=np.float32)
    slope=np.roll(value,-1,axis=1)-np.roll(value,1,axis=1)
    normal_pixels[:,:,0]=np.clip(.5-slope*.65,.05,.95)
    normal_pixels[:,:,1]=.5
    normal_pixels[:,:,2]=.98
    normal_image.pixels.foreach_set(normal_pixels.ravel());normal_image.pack()
    node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=normal_image
    normal=material.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.5
    material.node_tree.links.new(node.outputs['Color'],normal.inputs['Color'])
    material.node_tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    mouth = .424 if identity=='male-a' else .399
    eye = .656 if identity=='male-a' else .645
    parts=[]
    styles=['short_sideburns','long_sideburns','mutton_chops','neat_moustache','full_moustache','handlebar_moustache']
    for style in styles:
        vertices, faces, uvs, samples = [], [], [], []
        moustache = 'moustache' in style
        rows, columns = (12,64) if moustache else (40,12)
        for sign in [-1,1]:
            start=len(vertices)
            for row in range(rows+1):
                t=row/rows
                for col in range(columns+1):
                    u=col/columns
                    if moustache:
                        width=.090 if style=='neat_moustache' else .145 if style=='handlebar_moustache' else .120
                        x=sign*(.0003+u*width)
                        upper=mouth+(.045 if style=='neat_moustache' else .070)-(.025 if style=='neat_moustache' else .046)*u**1.4
                        lower=mouth+.012-.015*u
                        z=upper*(1-t)+lower*t
                        if style=='handlebar_moustache': z+=.035*max(0,(u-.65)/.35)**2
                        edge=math.sin(math.pi*t)**.6*math.sin(math.pi*u)**.3
                        volume=(.006 if style=='neat_moustache' else .012)*edge
                    else:
                        length={'short_sideburns':.22,'long_sideburns':.32,'mutton_chops':.40}[style]
                        z=eye+.15-t*length
                        x=sign*(.23-(.05*t if style=='mutton_chops' else .005*t))
                        width=(.055+.13*math.sin(math.pi*t*.75)**2) if style=='mutton_chops' else .055
                        y=-.02-(.16*t*t if style=='mutton_chops' else 0)+(u-.5)*width
                        hit=surface.find_nearest(Vector((x,y,z)))
                        direction=hit[1].copy()
                        if direction.dot(Vector((x,y-.03,0)))<0:direction.negate()
                        edge=math.sin(math.pi*u)**.7
                        volume=(.018 if style=='mutton_chops' else .004)*edge*math.sin(math.pi*t)**.3
                    if moustache:
                        hit=surface.ray_cast(Vector((x,-.75,z)),Vector((0,1,0)))
                        if not hit[0]:hit=surface.find_nearest(Vector((x,-.25,z)))
                    elif not hit[0]:
                        hit=surface.find_nearest(Vector((sign*.24,-.08,z)))
                    donor, donor_neutral, donor_triangles = face,neutral,triangles
                    if moustache:
                        lip_hit=lip_surface.ray_cast(Vector((x,-.75,z)),Vector((0,1,0)))
                        if lip_hit[0] and (not hit[0] or lip_hit[0].y < hit[0].y):
                            hit=lip_hit
                            donor,donor_neutral,donor_triangles=lips,lip_neutral,lip_triangles
                    point,normal,index,_=hit
                    # A millimetre-scale layer gives bristles volume without
                    # inflating the cheek or covering the lips with a solid slab.
                    p=point+(Vector((0,-1,0)) if moustache else direction)*(.0015+volume)
                    triangle=donor_triangles[index]
                    bary=barycentric_transform(point,*[donor_neutral[i] for i in triangle.vertices],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
                    samples.append((donor,donor_neutral,triangle.vertices[:],bary))
                    vertices.append(tuple(p));uvs.append((u,1-t))
            for row in range(rows):
                for col in range(columns):
                    a=start+row*(columns+1)+col
                    faces.append((a,a+1,a+columns+2,a+columns+1))
        field_vertices,field_samples=vertices,samples
        vertices,faces,uvs,interpolation=hair_clumps(field_vertices,rows,columns,moustache,style)
        mesh=bpy.data.meshes.new(style)
        mesh.from_pydata(vertices,[],faces);mesh.materials.append(material)
        layer=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:layer.data[loop.index].uv=uvs[loop.vertex_index]
        obj=bpy.data.objects.new('Patient_FacialHair_'+style,mesh)
        bpy.context.collection.objects.link(obj)
        obj.shape_key_add(name='Basis').value=0
        for source in list(face.data.shape_keys.key_blocks)[1:]:
            key=obj.shape_key_add(name=source.name);key.value=0
            deltas=[]
            for donor,donor_neutral,indices,bary in field_samples:
                target=donor.data.shape_keys.key_blocks.get(source.name)
                deltas.append(sum(((target.data[i].co-donor_neutral[i])*bary[j] for j,i in enumerate(indices)),Vector()) if target else Vector())
            for vertex,weights in zip(key.data,interpolation):
                vertex.co+=sum((deltas[i]*weight for i,weight in weights),Vector())
        for polygon in mesh.polygons:polygon.use_smooth=True
        parts.append(obj)
    return parts


def hair_clumps(field,rows,columns,moustache,style):
    rng=np.random.default_rng(1896)
    vertices,faces,uvs,samples=[],[],[],[]
    def interpolate(side,t,u):
        r=max(0,min(rows-1,int(t*rows)));c=max(0,min(columns-1,int(u*columns)))
        fr,fc=t*rows-r,u*columns-c
        a=side*(rows+1)*(columns+1)+r*(columns+1)+c
        weights=[(a,(1-fr)*(1-fc)),(a+1,(1-fr)*fc),(a+columns+1,fr*(1-fc)),(a+columns+2,fr*fc)]
        return sum((Vector(field[i])*w for i,w in weights),Vector()),weights
    root_rows,root_columns=(8,48) if moustache else (32,28)
    for side in range(2):
        for row in range(root_rows):
            for col in range(root_columns):
                t=(row+rng.random())/root_rows;u=(col+rng.random())/root_columns
                if rng.random()>math.sin(math.pi*u)**.35:continue
                start=len(vertices)
                length=(.48 if moustache else .115)*rng.uniform(.65,1.2)
                thickness=(.0065 if moustache else .0058)*rng.uniform(.6,1.25)
                for step in range(5):
                    f=step/4;ft=t+f*length;fu=u+f*(.10 if moustache else .015)
                    point,weights=interpolate(side,min(1.025,ft),min(1.015,fu))
                    across=interpolate(side,min(1,ft),min(.99,fu)+.005)[0]-interpolate(side,min(1,ft),min(.99,fu)-.005)[0]
                    along=interpolate(side,min(.99,ft)+.005,min(1,fu))[0]-interpolate(side,min(.99,ft)-.005,min(1,fu))[0]
                    normal=across.cross(along).normalized()
                    outward=Vector((0,-1,0)) if moustache else Vector((point.x,point.y-.03,0))
                    if normal.dot(outward)<0:normal.negate()
                    point+=normal*(.0015+.004*math.sin(math.pi*f))
                    width=thickness*(1-f)**.55
                    for sign in [-1,1]:
                        vertices.append(tuple(point+across.normalized()*sign*width/2))
                        uvs.append((.15 if sign<0 else .85,1-f));samples.append(weights)
                for step in range(4):
                    a=start+step*2;faces.append((a,a+1,a+3,a+2))
    return vertices,faces,uvs,samples

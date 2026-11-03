"""Interchangeable work shirts and aprons fitted to the existing body rig."""
import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from carmela_wardrobe import crop


def smooth(a, b, x):
    t = max(0, min(1, (x-a)/(b-a)))
    return t*t*(3-2*t)


def cloth(name, color, output, leather=False, tape=False):
    size = 1024 if not tape and ('Canvas' in name or 'Leather' in name) else 512
    u, v = np.meshgrid(np.arange(size)/size, np.arange(size)/size)
    rng = np.random.default_rng(1896)
    grain = rng.normal(0, .012, (size, size))
    height_field = .015*np.sin(u*math.tau*230)*np.cos(v*math.tau*256)
    if leather:
        grain += .025*np.sin(u*127+np.sin(v*83))*np.sin(v*173)
        grain += .025*np.sin(u*17+np.sin(v*9))
        height_field = grain*.5
    else:
        grain += height_field+.012*np.sin(u*math.tau*7+np.sin(v*19))
    if 'Canvas' in name or 'Leather' in name:
        edge = .10 if tape else .016
        seam = np.exp(-((u-edge)/(.009 if tape else .002))**2)+np.exp(-((u-1+edge)/(.009 if tape else .002))**2)
        if not tape:
            seam += np.exp(-((v-.012)/.002)**2)+np.exp(-((v-.988)/.002)**2)
        grain -= .065*seam
        stitch = seam*(np.cos(v*math.tau*(48 if tape else 160))>.25)
        grain += .14*stitch
        height_field += .03*seam+.02*stitch
    pixels = np.ones((size, size, 4), dtype=np.float32)
    pixels[:, :, :3] = np.clip(np.array(color)[None, None, :]*(1+grain[:, :, None]), 0, 1)
    image = bpy.data.images.new(name, width=size, height=size)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = os.path.join(output, name+'.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = False
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .80 if leather else .95
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    normal_pixels=np.ones((size,size,4),dtype=np.float32)
    dy, dx = np.gradient(height_field)
    normal_pixels[:,:,0]=.5-np.clip(dx*2,-.15,.15)
    normal_pixels[:,:,1]=.5-np.clip(dy*2,-.15,.15)
    normal_pixels[:,:,2]=1
    normal_image=bpy.data.images.new(name+'_Weave',width=size,height=size)
    normal_image.colorspace_settings.name='Non-Color';normal_image.pixels.foreach_set(normal_pixels.ravel())
    normal_image.filepath_raw=os.path.join(output,name+'-normal.png');normal_image.file_format='PNG';normal_image.save();normal_image.pack()
    normal_texture=material.node_tree.nodes.new('ShaderNodeTexImage');normal_texture.image=normal_image
    normal=material.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35
    material.node_tree.links.new(normal_texture.outputs['Color'],normal.inputs['Color'])
    material.node_tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    return material


def build(body, rig, clinic, height, output):
    os.makedirs(output, exist_ok=True)
    rig.data.pose_position = 'REST'
    body.data.calc_loop_triangles()
    source_points = [v.co.copy() for v in body.data.vertices]
    groups = [g.name for g in body.vertex_groups]
    source_weights = [{e.group:e.weight for e in v.groups} for v in body.data.vertices]
    source_image=next(n.image for n in body.data.materials[1].node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
    source_pixels=np.array(source_image.pixels[:],dtype=np.float32).reshape(source_image.size[1],source_image.size[0],4)
    source_keys = {k.name:[v.co.copy() for v in k.data] for k in body.data.shape_keys.key_blocks if k.name!='Basis'}
    triangles = [(tuple(t.vertices),t.polygon_index) for t in body.data.loop_triangles]
    tree = BVHTree.FromPolygons(source_points, [t[0] for t in triangles], all_triangles=True)
    arm_groups = {i for i, name in enumerate(groups) if 'Arm' in name or 'Shoulder' in name}
    hips_index = groups.index('mixamorig:Hips')
    spine_index = groups.index('mixamorig:Spine2')
    hem = height*.51
    waist = height*.57
    neck = rig.data.bones['mixamorig:Neck'].head_local.copy()
    centre_y = neck.y
    shirt_top = neck.z-.055
    shoulder_width=(rig.data.bones['mixamorig:LeftArm'].head_local.x-rig.data.bones['mixamorig:RightArm'].head_local.x)/2+.020
    bulk=shoulder_width/.225

    def sample(point):
        hit = tree.find_nearest(point)
        indices = triangles[hit[2]][0]
        factors = [1/max(.001, (source_points[i]-hit[0]).length) for i in indices]
        weights, deltas = {}, {}
        for index, factor in zip(indices, factors):
            for group, value in source_weights[index].items():
                weights[group] = weights.get(group, 0)+value*factor
        total = sum(weights.values())
        weights = {g:w/total for g,w in weights.items()}
        for name, key in source_keys.items():
            deltas[name] = sum(((key[i]-source_points[i])*w for i,w in zip(indices,factors)), Vector())/sum(factors)
        return weights, deltas

    def bind(name, points, faces, uvs, material, weights=None, deltas=None):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(points, [], faces)
        mesh.materials.append(material)
        layer = mesh.uv_layers.new(name='ClothUV')
        for loop in mesh.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index]
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        for group in groups:
            obj.vertex_groups.new(name=group)
        if weights is None:
            samples = [sample(Vector(p)) for p in points]
            weights = [s[0] for s in samples]
            deltas = {key:[s[1][key] for s in samples] for key in source_keys}
        for i, values in enumerate(weights):
            for group, value in values.items():
                obj.vertex_groups[group].add([i], value, 'REPLACE')
        obj.shape_key_add(name='Basis').value = 0
        # Use the same continuous body warp on every garment layer. Nearest
        # donor vertices give the shirt and apron different belly movements.
        for key, values in (deltas or {}).items():
            if key in ['rc_bellySize','rc_waistWidth']:
                values=[]
                for x,y,z in points:
                    trunk=math.exp(-((z-height*.56)/(.17*height))**4-(x/.20)**4)
                    trunk*=max(0,min(1,(z-height*.46)/(height*.07)))
                    front=max(0,min(1,(-y+.015)/.09))
                    values.append(Vector((x*(.12 if key=='rc_bellySize' else .17)*trunk,-.085*trunk*front if key=='rc_bellySize' else 0,0)))
            shape = obj.shape_key_add(name=key)
            shape.value = 0
            shape.slider_min = -1
            for vertex, delta in zip(shape.data, values):
                vertex.co += delta
        obj.parent = rig
        obj.matrix_parent_inverse = rig.matrix_world.inverted()
        obj.modifiers.new('Workwear skeleton', 'ARMATURE').object = rig
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        return obj

    upper_faces = set()
    wrists=[rig.data.bones[f'mixamorig:{side}Hand'].head_local for side in ['Left','Right']]
    for p in body.data.polygons:
        arm=sum(sum(w for g,w in source_weights[i].items() if g in arm_groups) for i in p.vertices)/len(p.vertices)
        trouser_cut=height*.45+.055*(1-smooth(.08,.16,abs(p.center.x)))
        if p.material_index!=1 and (p.center.z>trouser_cut or (abs(p.center.x)>.30 and arm>.1)):
            upper_faces.add(p.index)
        elif p.material_index==1 and min((p.center-w).length for w in wrists)<.14:
            side=min(['Left','Right'],key=lambda side:(p.center-rig.data.bones[f'mixamorig:{side}Hand'].head_local).length)
            hand=rig.data.bones[f'mixamorig:{side}Hand'].head_local
            forward=(rig.data.bones[f'mixamorig:{side}HandMiddle1'].head_local-hand).normalized()
            if (p.center-hand).dot(forward)>.025:continue
            uv=sum((body.data.uv_layers.active.data[i].uv for i in p.loop_indices),Vector((0,0)))/len(p.loop_indices)
            r,g,b=source_pixels[int((uv.y%1)*(source_image.size[1]-1)),int((uv.x%1)*(source_image.size[0]-1)),:3]
            if r<g*1.15 or r<b*1.25:upper_faces.add(p.index)
    cotton = cloth('Patient_WorkCotton', (.34,.40,.43), output)
    cotton.use_backface_culling = True
    canvas = cloth('Patient_WorkCanvas', (.66,.57,.43), output)
    leather = cloth('Patient_WorkLeather', (.30,.18,.105), output, True)
    canvas_tape = cloth('Patient_WorkCanvasTape', (.60,.52,.40), output, tape=True)
    leather_tape = cloth('Patient_WorkLeatherTape', (.26,.15,.085), output, True, tape=True)

    formal = body.copy()
    formal.data = body.data.copy()
    formal.name = 'Patient_FormalUpper'
    bpy.context.collection.objects.link(formal)
    crop(formal, lambda f:f.index not in upper_faces)
    # The donor's cuffs are fragmented into skin and shirt patches. Replace
    # them with closed cloth tubes, independent of hand colour and finger bones.
    def native_cuff(face):
        centre=face.calc_center_median()
        side=min(['Left','Right'],key=lambda side:(centre-rig.data.bones[f'mixamorig:{side}Hand'].head_local).length)
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        if (centre-wrist).length>=.15:return False
        axis=(wrist-rig.data.bones[f'mixamorig:{side}ForeArm'].head_local).normalized()
        return face.material_index==1 or (face.material_index==3 and (centre-wrist).dot(axis)>-.055)
    crop(formal,native_cuff)
    cuff_fabric=cloth('Patient_FormalCuffFabric',(.80,.78,.73),output)
    formal.data.materials.append(cuff_fabric)
    bm=bmesh.new();bm.from_mesh(formal.data)
    for side in ['Left','Right']:
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        forward=(wrist-rig.data.bones[f'mixamorig:{side}ForeArm'].head_local).normalized()
        selected={v for v in bm.verts if (v.co-wrist).length<.18}
        geometry=list(selected)+[e for e in bm.edges if all(v in selected for v in e.verts)]+[f for f in bm.faces if all(v in selected for v in f.verts)]
        bmesh.ops.bisect_plane(bm,geom=geometry,plane_co=wrist+forward*.010,plane_no=forward,clear_outer=True)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    deform=bm.verts.layers.deform.verify();uv_layer=bm.loops.layers.uv.active
    shape_layers=list(bm.verts.layers.shape.values())
    for side in ['Left','Right']:
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        axis=(wrist-rig.data.bones[f'mixamorig:{side}ForeArm'].head_local).normalized()
        front=Vector((0,-1,0));front=(front-axis*front.dot(axis)).normalized();across=axis.cross(front).normalized()
        shells=[]
        for inner in [False,True]:
            rings=[]
            for row in range(9):
                t=row/8;ring=[];centre=wrist+axis*(-.075+.099*t)
                rx=.034+.004*(1-t);ry=.029+.004*(1-t)
                if inner:rx-=.0015;ry-=.0015
                for col in range(48):
                    angle=col/48*math.tau;position=centre+front*(rx*math.cos(angle))+across*(ry*math.sin(angle))
                    vertex=bm.verts.new(position)
                    for layer in shape_layers:vertex[layer]=position
                    vertex[deform][groups.index(f'mixamorig:{side}ForeArm')]=1
                    ring.append(vertex)
                rings.append(ring)
            shells.append(rings)
            for row in range(8):
                for col in range(48):
                    nxt=(col+1)%48;corners=(rings[row][col],rings[row][nxt],rings[row+1][nxt],rings[row+1][col])
                    face=bm.faces.new(corners[::-1] if inner else corners)
                    face.material_index=len(formal.data.materials)-1;face.smooth=True
                    for loop in face.loops:
                        vertex=loop.vert;index=corners.index(vertex);u=(col+(index in [1,2]))/48*3;v=(row+(index in [2,3]))/8
                        loop[uv_layer].uv=(u,v)
        for row in [0,8]:
            for col in range(48):
                nxt=(col+1)%48;outer,inside=shells[0][row],shells[1][row]
                face=bm.faces.new((outer[col],inside[col],inside[nxt],outer[nxt]) if row==8 else (outer[nxt],inside[nxt],inside[col],outer[col]))
                face.material_index=len(formal.data.materials)-1;face.smooth=True
                for loop in face.loops:loop[uv_layer].uv=(col/48*3,row/8)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(formal.data);bm.free()
    formal['formalCuffsVersion']=1
    for vertex in formal.data.vertices:
        side=min(['Left','Right'],key=lambda side:(vertex.co-rig.data.bones[f'mixamorig:{side}Hand'].head_local).length)
        if (vertex.co-rig.data.bones[f'mixamorig:{side}Hand'].head_local).length>.15:continue
        for index in [g.group for g in vertex.groups]:formal.vertex_groups[index].remove([vertex.index])
        formal.vertex_groups[f'mixamorig:{side}ForeArm'].add([vertex.index],1,'REPLACE')
    points, faces, uvs, weights = [], [], [], []
    rows, columns = 32, 32
    for side in ['Left','Right']:
        arm=rig.data.bones[f'mixamorig:{side}Arm'].head_local
        elbow=rig.data.bones[f'mixamorig:{side}ForeArm'].head_local
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        start=arm-(elbow-arm).normalized()*.045
        end=wrist-(wrist-elbow).normalized()*.012
        arm_index=groups.index(f'mixamorig:{side}Arm')
        forearm_index=groups.index(f'mixamorig:{side}ForeArm')
        offset=len(points)
        for row in range(rows+1):
            t=row/rows
            center=start.lerp(elbow,t/.52) if t<=.52 else elbow.lerp(end,(t-.52)/.48)
            center.z-=.065*(1-smooth(0,.30,t))
            tangent=(elbow-start if t<=.52 else end-elbow).normalized()
            front=Vector((0,-1,0));front=(front-tangent*front.dot(tangent)).normalized()
            across=tangent.cross(front).normalized()
            radius=(.068+(.047-.068)*t/.52 if t<=.52 else .047+(.036-.047)*(t-.52)/.48)*math.sqrt(bulk)
            radius+=.002*math.sin(t*math.pi*18)*math.sin(math.pi*t)**2
            radius+=.002*smooth(.92,.96,t)
            radius*=.35+.65*smooth(0,.18,t)
            bend=smooth(.38,.65,t);shoulder=(1-smooth(0,.18,t))*.35
            w={spine_index:shoulder,arm_index:(1-bend)*(1-shoulder),forearm_index:bend*(1-shoulder)}
            for col in range(columns+1):
                a=col/columns*math.tau
                fold=1+.025*math.sin(a*7+t*3)*math.sin(math.pi*t)
                p=center+(front*math.cos(a)+across*math.sin(a))*radius*fold
                points.append(tuple(p));uvs.append((col/columns*2,t*4));weights.append(w)
        for row in range(rows):
            for col in range(columns):
                a=offset+row*(columns+1)+col
                faces.append((a,a+1,a+columns+2,a+columns+1))
    samples=[sample(Vector(p)) for p in points]
    sleeves=bind('Patient_WorkSleeves',points,faces,uvs,cotton,weights,
                 {key:[s[1][key] for s in samples] for key in source_keys})
    hand_triangles=[t for t in triangles if body.data.polygons[t[1]].material_index==1]
    triangle_uv=[]
    for tri in body.data.loop_triangles:
        if body.data.polygons[tri.polygon_index].material_index==1:
            triangle_uv.append([Vector((*body.data.uv_layers.active.data[i].uv,0)) for i in tri.loops])
    clean_skin=[]
    for corners in triangle_uv:
        uv=sum(corners,Vector())/3
        color=source_pixels[int((uv.y%1)*(source_image.size[1]-1)),int((uv.x%1)*(source_image.size[0]-1)),:3]
        if color[0]>color[1]*1.25 and color[0]>color[2]*1.35 and .15<float(np.mean(color))<.85:clean_skin.append(color)
    skin_color=np.median(clean_skin,axis=0) if clean_skin else np.array([.72,.45,.38])
    hand_mask=np.zeros(source_pixels.shape[:2],dtype=np.float32)
    for triangle,corners in zip(hand_triangles,triangle_uv):
        coords=[source_points[i] for i in triangle[0]]
        side='Left' if sum(p.x for p in coords)>0 else 'Right'
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        forward=(rig.data.bones[f'mixamorig:{side}HandMiddle1'].head_local-wrist).normalized()
        distances=[(p-wrist).dot(forward) for p in coords]
        if min(distances)>.10 or min((p-wrist).length for p in coords)>.12:continue
        uv=np.array([[p.x*(source_image.size[0]-1),p.y*(source_image.size[1]-1)] for p in corners])
        lo=np.maximum(0,np.floor(uv.min(axis=0)).astype(int));hi=np.minimum(np.array(source_image.size)-1,np.ceil(uv.max(axis=0)).astype(int))
        if np.any(hi<lo):continue
        x,y=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));a,b,c=uv
        denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denominator)<.001:continue
        w0=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator
        w1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator;w2=1-w0-w1
        distance=w0*distances[0]+w1*distances[1]+w2*distances[2]
        t=np.clip((distance-.045)/.055,0,1);amount=(1-t*t*(3-2*t))*((w0>=-.03)&(w1>=-.03)&(w2>=-.03))
        hand_mask[y,x]=np.maximum(hand_mask[y,x],amount)
    padded=hand_mask.copy()
    for dy in [-2,0,2]:
        for dx in [-2,0,2]:padded=np.maximum(padded,np.roll(np.roll(hand_mask,dy,axis=0),dx,axis=1))
    hand_pixels=source_pixels.copy()
    hand_pixels[:,:,:3]=hand_pixels[:,:,:3]*(1-padded[:,:,None])+skin_color[None,None,:]*padded[:,:,None]
    face=bpy.data.objects['Carmela_Face']
    face_image=next(n.image for n in face.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
    face_pixels=np.array(face_image.pixels[:],dtype=np.float32).reshape(face_image.size[1],face_image.size[0],4)
    cheek_colors=[]
    for polygon in face.data.polygons:
        p=polygon.center
        if not (.03<abs(p.x)<.065 and neck.z+.06<p.z<neck.z+.14 and p.y<.015):continue
        for loop in polygon.loop_indices:
            u,v=face.data.uv_layers.active.data[loop].uv
            color=face_pixels[int(v*(face_image.size[1]-1)),int(u*(face_image.size[0]-1)),:3]
            if color[0]>color[1]*1.05 and np.mean(color)>.08:cheek_colors.append(color)
    if cheek_colors:
        matched=np.median(cheek_colors,axis=0)
        hand_pixels[:,:,:3]*=np.clip(matched/np.maximum(.01,skin_color),.5,1.6)
        skin_color=matched
    hand_image=bpy.data.images.new('Patient_CleanHands',width=source_image.size[0],height=source_image.size[1])
    hand_image.pixels.foreach_set(hand_pixels.ravel());hand_image.filepath_raw=os.path.join(output,'hand-skin.png');hand_image.file_format='PNG';hand_image.save();hand_image.pack()
    hand_material=body.data.materials[1]
    next(n for n in hand_material.node_tree.nodes if n.type=='TEX_IMAGE').image=hand_image
    hand_shader=hand_material.node_tree.nodes.get('Principled BSDF')
    for link in list(hand_shader.inputs['Normal'].links):hand_material.node_tree.links.remove(link)
    wrist_pixels=np.ones((128,256,4),dtype=np.float32)
    for hand_number,side in enumerate(['Left','Right']):
        grain=np.random.default_rng(1896+hand_number).normal(0,.005,(128,128))
        for row in range(128):
            for col in range(128):
                t=(row+.5)/128;a=(col+.5)/128*math.tau
                crease=(math.exp(-((t-.55)/.012)**2)+math.exp(-((t-.61)/.010)**2))*max(0,math.cos(a))
                color=skin_color*(.97+.03*t+grain[row,col]-.035*crease)
                wrist_pixels[row,col+hand_number*128,:3]=color
    wrist_image=bpy.data.images.new('Patient_WristSkin',width=256,height=128)
    wrist_image.pixels.foreach_set(wrist_pixels.ravel());wrist_image.filepath_raw=os.path.join(output,'wrist-skin.png');wrist_image.file_format='PNG';wrist_image.save();wrist_image.pack()
    wrist_material=body.data.materials[1].copy();wrist_material.name='Patient_WristSkin'
    shader=wrist_material.node_tree.nodes.get('Principled BSDF')
    next(n for n in wrist_material.node_tree.nodes if n.type=='TEX_IMAGE').image=wrist_image
    for link in list(shader.inputs['Normal'].links):wrist_material.node_tree.links.remove(link)
    crop(body, lambda f:f.index in upper_faces)
    # The donor includes a painted cuff in its hand-weighted geometry.
    # Remove that short overlap; the continuous skin bridge replaces it.
    def cuff_overlap(face):
        if face.material_index!=1:return False
        side=min(['Left','Right'],key=lambda side:(face.calc_center_median()-rig.data.bones[f'mixamorig:{side}Hand'].head_local).length)
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        forward=(rig.data.bones[f'mixamorig:{side}HandMiddle1'].head_local-wrist).normalized()
        center=face.calc_center_median()
        return (center-wrist).length<.11 and (center-wrist).dot(forward)<.024
    crop(body,cuff_overlap)
    body.data.materials.append(wrist_material)
    bm=bmesh.new();bm.from_mesh(body.data);seen=set();fragments=[]
    for vertex in bm.verts:
        if vertex in seen or not any(f.material_index==1 for f in vertex.link_faces):continue
        pending=[vertex];component={vertex};seen.add(vertex)
        while pending:
            for edge in pending.pop().link_edges:
                for neighbor in edge.verts:
                    if neighbor not in seen:component.add(neighbor);seen.add(neighbor);pending.append(neighbor)
        side='Left' if sum(v.co.x for v in component)>0 else 'Right'
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        forward=(rig.data.bones[f'mixamorig:{side}HandMiddle1'].head_local-wrist).normalized()
        if max((v.co-wrist).dot(forward) for v in component)<.10:fragments.extend(component)
    bmesh.ops.delete(bm,geom=fragments,context='VERTS')
    deform=bm.verts.layers.deform.verify();uv_layer=bm.loops.layers.uv.active
    shape_layers=list(bm.verts.layers.shape.values())
    # Extend the hand's own boundary. Overlapping tubes leave an open seam
    # when the wrist bends, even when their colours and weights match.
    for hand_number,side in enumerate(['Left','Right']):
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        forearm=(wrist-rig.data.bones[f'mixamorig:{side}ForeArm'].head_local).normalized()
        forward=(rig.data.bones[f'mixamorig:{side}HandMiddle1'].head_local-wrist).normalized()
        edges={e for e in bm.edges if e.is_boundary and any(f.material_index==1 for f in e.link_faces) and all((v.co-wrist).length<.12 for v in e.verts)}
        neighbors={}
        for edge in edges:
            a,b=edge.verts;neighbors.setdefault(a,[]).append(b);neighbors.setdefault(b,[]).append(a)
        if not neighbors or any(len(n)!=2 for n in neighbors.values()):raise RuntimeError(f'{side}: incomplete native wrist ring')
        ring=[next(iter(neighbors))];previous=None
        while True:
            current=ring[-1];following=next(v for v in neighbors[current] if v!=previous)
            if following==ring[0]:break
            ring.append(following);previous=current
        if len(ring)!=len(neighbors):raise RuntimeError(f'{side}: more than one native wrist ring')
        native=bm.edges.get((ring[0],ring[1])).link_loops[0]
        reverse=native.vert==ring[0]
        front=Vector((0,-1,0));front=(front-forearm*front.dot(forearm)).normalized();across=forearm.cross(front).normalized()
        upper=[v.co.copy() for v in ring];old_weights=[dict(v[deform]) for v in ring]
        lower=[]
        for point in upper:
            radial=point-wrist-forward*(point-wrist).dot(forward)
            angle=math.atan2(radial.dot(across),radial.dot(front))
            lower.append(wrist-forearm*.090+front*(.025*math.cos(angle))+across*(.030*math.sin(angle)))
        previous_ring=ring
        for row in range(1,9):
            t=row/8;current_ring=[]
            for i,point in enumerate(upper):
                position=point.lerp(lower[i],t);vertex=bm.verts.new(position)
                for layer in shape_layers:vertex[layer]=position
                for group,weight in old_weights[i].items():vertex[deform][group]=weight*(1-t)
                group=groups.index(f'mixamorig:{side}ForeArm');vertex[deform][group]=vertex[deform].get(group,0)+t
                current_ring.append(vertex)
            for i in range(len(ring)):
                j=(i+1)%len(ring);a,b=previous_ring[i],previous_ring[j];c,d=current_ring[j],current_ring[i]
                face=bm.faces.new((b,a,d,c) if reverse else (a,b,c,d));face.material_index=len(body.data.materials)-1;face.smooth=True
                mapping={a:(i,(row-1)/8),b:(i+1,(row-1)/8),c:(i+1,t),d:(i,t)}
                for loop in face.loops:
                    column,v=mapping[loop.vert];loop[uv_layer].uv=((hand_number*128+.5+127*column/len(ring))/256,(.5+127*(1-v))/128)
            previous_ring=current_ring
        print('CONTINUOUS_WRIST',side,len(ring))
    bm.to_mesh(body.data);bm.free();body.data.update()
    wool_samples=[]
    for polygon in body.data.polygons:
        if polygon.material_index!=0 or not height*.22<polygon.center.z<height*.40:continue
        uv=sum((body.data.uv_layers.active.data[i].uv for i in polygon.loop_indices),Vector((0,0)))/len(polygon.loop_indices)
        wool_samples.append(source_pixels[int((uv.y%1)*(source_image.size[1]-1)),int((uv.x%1)*(source_image.size[0]-1)),:3])
    wool=cloth('Patient_WorkWool',tuple(np.median(wool_samples,axis=0)),output)
    hip=rig.data.bones['mixamorig:Hips'].head_local
    hip_width=max(abs(rig.data.bones[f'mixamorig:{side}UpLeg'].head_local.x) for side in ['Left','Right'])+.105
    points,faces,uvs,weights=[],[],[],[]
    for row in range(13):
        t=row/12
        for col in range(65):
            a=col/64*math.tau
            bottom=height*.43+.09*math.cos(a)**2
            z=height*.53*(1-t)+bottom*t
            width=min(hip_width,shoulder_width*.88)*(1-t)+(hip_width+.008)*t
            p=Vector((hip.x+width*math.sin(a),hip.y-(.125+.010*t)*math.cos(a),z))
            side='Left' if p.x>hip.x else 'Right';leg=.5*smooth(.5,1,t)
            points.append(tuple(p));uvs.append((col/64*4,t*2));weights.append({hips_index:1-leg,groups.index(f'mixamorig:{side}UpLeg'):leg})
    for row in range(12):
        for col in range(64):a=row*65+col;faces.append((a,a+65,a+66,a+1))
    samples=[sample(Vector(p)) for p in points]
    bind('Patient_WorkTrouserWaist',points,faces,uvs,wool,weights,{key:[s[1][key] for s in samples] for key in source_keys})

    def dimensions(t):
        knots=[0,.13,.30,.65,1]
        widths=[.067,shoulder_width,shoulder_width*.98,shoulder_width*.85,shoulder_width*.91]
        depths=[.060,.125*math.sqrt(bulk),.140*math.sqrt(bulk),.145*math.sqrt(bulk),.180*math.sqrt(bulk)]
        for i in range(4):
            if t<=knots[i+1]:
                k=smooth(knots[i],knots[i+1],t)
                return widths[i]*(1-k)+widths[i+1]*k,depths[i]*(1-k)+depths[i+1]*k
        return widths[-1],depths[-1]

    def shirt_point(t, a):
        z=shirt_top-(shirt_top-hem)*t
        z-=.015*abs(math.sin(a))*math.exp(-((t-.13)/.12)**2)
        rx,ry=dimensions(t)
        return Vector((neck.x+rx*math.sin(a),centre_y-ry*math.cos(a),z))

    spine_names=['mixamorig:Hips','mixamorig:Spine','mixamorig:Spine1','mixamorig:Spine2']
    spine_levels=[rig.data.bones[name].head_local.z for name in spine_names]
    def shirt_weights(point):
        if point.z<=spine_levels[0]:return {hips_index:1}
        for i in range(3):
            if point.z<=spine_levels[i+1]:
                t=smooth(spine_levels[i],spine_levels[i+1],point.z)
                return {groups.index(spine_names[i]):1-t,groups.index(spine_names[i+1]):t}
        return {spine_index:1}

    def work_weights(point):
        side='Left' if point.x>neck.x else 'Right'
        arm=rig.data.bones[f'mixamorig:{side}Arm'].head_local
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        axis=wrist-arm;t=(point-arm).dot(axis)/axis.length_squared
        amount=smooth(.15,.38,abs(point.x));bend=smooth(.35,.67,t)
        values={g:w*(1-amount) for g,w in shirt_weights(point).items()}
        values[groups.index(f'mixamorig:{side}Arm')]=amount*(1-bend)
        values[groups.index(f'mixamorig:{side}ForeArm')]=amount*bend
        return values

    points, faces, uvs = [], [], []
    rows, columns = 32, 64
    for row in range(rows+1):
        for col in range(columns+1):
            t, a = row/rows, col/columns*math.tau
            p = shirt_point(t,a)
            p.y += .002*math.sin(a*9+t*20)*math.sin(math.pi*t)**2*max(0,math.cos(a))
            points.append(tuple(p));uvs.append((col/columns*4, 1-t*3))
    for row in range(rows):
        for col in range(columns):
            a = row*(columns+1)+col
            faces.append((a,a+columns+1,a+columns+2,a+1))
    samples=[sample(Vector(p)) for p in points]
    shirt_surface=BVHTree.FromPolygons([Vector(p) for p in points],faces)
    shirt=bind('Patient_WorkShirt', points, faces, uvs, cotton,[shirt_weights(Vector(p)) for p in points],
         {key:[s[1][key] for s in samples] for key in source_keys})
    # Fuse the sleeve caps into the torso before transferring weights. This
    # removes the hard intersections left by overlapping open tubes.
    all_points,all_faces=[],[]
    for part in [shirt,sleeves]:
        offset=len(all_points)
        all_points.extend(v.co.copy() for v in part.data.vertices)
        all_faces.extend(tuple(offset+i for i in p.vertices) for p in part.data.polygons)
    mesh=bpy.data.meshes.new('Fused work shirt');mesh.from_pydata(all_points,[],all_faces)
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
    bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    fused=bpy.data.objects.new('Fused work shirt',mesh);bpy.context.collection.objects.link(fused)
    bpy.ops.object.select_all(action='DESELECT');fused.select_set(True);bpy.context.view_layer.objects.active=fused
    remesh=fused.modifiers.new('Join shoulder seams','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.007
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    soften=fused.modifiers.new('Soften shoulder seams','SMOOTH');soften.factor=.6;soften.iterations=5
    bpy.ops.object.modifier_apply(modifier=soften.name)
    decimate=fused.modifiers.new('Work shirt density','DECIMATE');decimate.ratio=.45
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    bm=bmesh.new();bm.from_mesh(fused.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,hem+.010),plane_no=(0,0,1),clear_inner=True)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,shirt_top-.010),plane_no=(0,0,1),clear_outer=True)
    for side in ['Left','Right']:
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        forward=(wrist-rig.data.bones[f'mixamorig:{side}ForeArm'].head_local).normalized()
        selected={v for v in bm.verts if (v.co-wrist).length<.18}
        geometry=list(selected)+[e for e in bm.edges if all(v in selected for v in e.verts)]+[f for f in bm.faces if all(v in selected for v in f.verts)]
        bmesh.ops.bisect_plane(bm,geom=geometry,plane_co=wrist-forward*.060,plane_no=forward,clear_outer=True)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(fused.data);bm.free()
    for vertex in fused.data.vertices:
        p=vertex.co
        side='Left' if p.x>neck.x else 'Right'
        elbow=rig.data.bones[f'mixamorig:{side}ForeArm'].head_local
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        axis=wrist-elbow
        t=(p-elbow).dot(axis)/axis.length_squared
        center=elbow+axis*max(-.6,min(1,t))
        radial=p-center
        if abs(p.x)>.22 and radial.length>.01:
            angle=math.atan2(radial.z,radial.y)
            fold=.0018*math.sin(t*28+angle*1.7)*math.exp(-((t-.05)/.38)**2)
            p+=radial.normalized()*fold
    points=[tuple(v.co) for v in fused.data.vertices];faces=[tuple(p.vertices) for p in fused.data.polygons]
    weights=[work_weights(Vector(p)) for p in points]
    for part in [shirt,sleeves,fused]:bpy.data.objects.remove(part,do_unlink=True)
    samples=[sample(Vector(p)) for p in points]
    shirt=bind('Patient_WorkShirt',points,faces,[(p[0]*5,p[2]*5) for p in points],cotton,weights,
               {key:[s[1][key] for s in samples] for key in source_keys})
    shirt_surface=BVHTree.FromPolygons([Vector(p) for p in points],faces)
    points,faces,uvs,weights=[],[],[],[]
    for side in ['Left','Right']:
        wrist=rig.data.bones[f'mixamorig:{side}Hand'].head_local
        axis=(wrist-rig.data.bones[f'mixamorig:{side}ForeArm'].head_local).normalized()
        front=Vector((0,-1,0));front=(front-axis*front.dot(axis)).normalized();across=axis.cross(front).normalized()
        offset=len(points)
        for row in range(7):
            t=row/6;center=wrist+axis*(-.082+t*.078)
            radius=(.046-.010*smooth(0,1,t))*math.sqrt(bulk)+.001*smooth(.65,.9,t)
            for col in range(33):
                a=col/32*math.tau;p=center+(front*math.cos(a)+across*math.sin(a))*radius
                points.append(tuple(p));uvs.append((col/32*2,t*.4));weights.append({groups.index(f'mixamorig:{side}ForeArm'):1})
        for row in range(6):
            for col in range(32):
                a=offset+row*33+col;faces.append((a,a+1,a+34,a+33))
        inner=len(points)
        for i in range(7*33):
            p=Vector(points[offset+i]);center=wrist+axis*(p-wrist).dot(axis)
            points.append(tuple(p-(p-center).normalized()*.002))
            uvs.append(uvs[offset+i]);weights.append(weights[offset+i].copy())
        for row in range(6):
            for col in range(32):
                a=inner+row*33+col;faces.append((a+33,a+34,a+1,a))
        for row in [0,6]:
            for col in range(32):
                a=offset+row*33+col;b=inner+row*33+col
                faces.append((a,b,b+1,a+1) if row==0 else (a,a+1,b+1,b))
    bind('Patient_WorkCuffs',points,faces,uvs,cotton,weights,{})
    points, faces, uvs = [], [], []
    for row in range(25):
        p = shirt_point(.025+row/24*.94,0)
        hit=shirt_surface.ray_cast(Vector((p.x,-2,p.z)),Vector((0,1,0)))
        if hit[0] is not None:p.y=hit[0].y-.0015
        for sign in [-1,1]:
            points.append((p.x+sign*.008,p.y-.003,p.z));uvs.append(((sign+1)/2,row/8))
    for row in range(24):a=row*2;faces.append((a,a+2,a+3,a+1))
    samples=[sample(Vector(p)) for p in points]
    bind('Patient_WorkShirtPlacket',points,faces,uvs,cotton,[work_weights(Vector(p)) for p in points],{key:[s[1][key] for s in samples] for key in source_keys})
    buttons = bpy.data.materials.new('Patient_WorkButtons')
    buttons.use_nodes = True
    buttons.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.42,.38,.29,1)
    points, faces, uvs = [], [], []
    for row in range(6):
        p=shirt_point(.06+row*.145,0)
        hit=shirt_surface.ray_cast(Vector((p.x,-2,p.z)),Vector((0,1,0)))
        if hit[0] is not None:p.y=hit[0].y-.004
        start=len(points);points.append(tuple(p));uvs.append((.5,.5))
        for col in range(13):
            a=col/12*math.tau
            points.append(tuple(p+Vector((.0035*math.cos(a),0,.0035*math.sin(a)))));uvs.append((.5,.5))
        for col in range(12):faces.append((start,start+col+1,start+col+2))
    for name,selected in [('Patient_WorkCollarButton',range(14)),('Patient_WorkShirtButtons',range(14,len(points)))]:
        selected=list(selected);indices={old:new for new,old in enumerate(selected)}
        subset=[points[i] for i in selected];samples=[sample(Vector(p)) for p in subset]
        bind(name,subset,[tuple(indices[i] for i in f) for f in faces if all(i in indices for i in f)],[uvs[i] for i in selected],buttons,
             [work_weights(Vector(p)) for p in subset],{key:[s[1][key] for s in samples] for key in source_keys})
    # A narrow upright band closes the shirt at the neck without retaining
    # the formal outfit's large collar or its tie.
    points, faces, uvs = [], [], []
    for row in range(4):
        for col in range(65):
            a = .025+col/64*(math.tau-.050)
            inside=.0015 if row>=2 else 0
            z=shirt_top-.010+(.016 if row in [1,2] else 0)
            z-=.002*math.exp(-(min(a,math.tau-a)/.25)**2)
            points.append((neck.x+(shoulder_width*.33+.004-inside)*math.sin(a),centre_y-(shoulder_width*.33*.85+.006-inside)*math.cos(a),z))
            uvs.append((col/64*4,(row%2)*.2))
    for row in range(4):
        for col in range(64):
            a=row*65+col;b=((row+1)%4)*65+col;faces.append((a,a+1,b+1,b))
    faces.extend([(0,65,130,195),(64,259,194,129)])
    bind('Patient_WorkCollar', points, faces, uvs, cotton,
         [{spine_index:1} for _ in points], {key:[Vector() for _ in points] for key in source_keys})

    # The standing and seated carriers share a pattern but use different
    # lower-panel drapes. The bib retains the torso's original skin weights.
    pants_rest_points,pants_rest_faces=[],[]
    for part in [body,bpy.data.objects['Patient_WorkTrouserWaist']]:
        offset=len(pants_rest_points);pants_rest_points.extend(v.co.copy() for v in part.data.vertices)
        pants_rest_faces.extend(tuple(offset+i for i in p.vertices) for p in part.data.polygons
                                if part!=body or p.material_index not in [1,len(body.data.materials)-1])
    pants_rest_surface=BVHTree.FromPolygons(pants_rest_points,pants_rest_faces)
    rows, columns = 36, 24
    points, faces, uvs, weights = [], [], [], []
    deltas = {key:[] for key in source_keys}
    bib_top = neck.z-.10
    for row in range(rows+1):
        t = row/rows
        z = bib_top+(waist-bib_top)*min(1,t/.30) if t<=.30 else waist+(height*.30-waist)*(t-.30)/.70
        width = (.102+(.18-.102)*smooth(.03,.30,t))*bulk if t<=.30 else .18*bulk+(.215-.18*bulk)*(t-.30)/.70
        for col in range(columns+1):
            u = col/columns*2-1
            x = u*width
            z_row=z-.006*(1-u*u)*(1-smooth(0,.08,t))+.008*u**6*smooth(.94,1,t)
            hit = tree.ray_cast(Vector((x,-2,z_row)), Vector((0,1,0)))
            if z>=hem:
                shirt_hit=shirt_surface.ray_cast(Vector((x,-2,z_row)),Vector((0,1,0)))
                y=shirt_hit[0].y-.018 if shirt_hit[0] else -.16
            else:
                bottom=min(-.13,hit[0].y-.018) if hit[0] else -.15
                hem_hit=shirt_surface.ray_cast(Vector((x,-2,hem+.020)),Vector((0,1,0)))
                if hem_hit[0] is None:hem_hit=shirt_surface.find_nearest(Vector((x,-.10,hem+.020)))
                upper=hem_hit[0].y-.018 if hem_hit[0] is not None else bottom
                fall=smooth(0,.16,hem-z_row)
                y=upper*(1-fall)+bottom*fall
            y += .002*math.sin(u*15+t*10)+.0035*math.sin(u*8+t*5)*math.exp(-((t-.30)/.10)**2)
            if t>.30:
                pants_hit=pants_rest_surface.ray_cast(Vector((x,-2,z_row)),Vector((0,1,0)))
                if pants_hit[0] is not None:y=min(y,pants_hit[0].y-.020)
            p = Vector((x,y,z_row));points.append(tuple(p));uvs.append(((u+1)/2,1-t))
            w,d = sample(p)
            fold=smooth(.18,.30,t)
            w={g:value*(1-fold) for g,value in shirt_weights(p).items()}
            w[hips_index]=w.get(hips_index,0)+fold
            weights.append(w)
            for key in deltas:deltas[key].append(d[key]*(1-smooth(.30,.65,t)))
    for row in range(rows):
        for col in range(columns):
            a = row*(columns+1)+col
            faces.append((a,a+columns+1,a+columns+2,a+1))
    rig.data.pose_position = 'POSE'
    rig.animation_data.action = clinic
    rig.animation_data.action_slot = clinic.slots[0]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    hips=rig.pose.bones['mixamorig:Hips']
    into_rest=hips.bone.matrix_local @ hips.matrix.inverted()
    pose = {i:rig.pose.bones[name].matrix @ rig.data.bones[name].matrix_local.inverted() for i,name in enumerate(groups)}
    pants_points,pants_faces=[],[]
    for part in [body,bpy.data.objects['Patient_WorkTrouserWaist']]:
        evaluated=part.evaluated_get(bpy.context.evaluated_depsgraph_get());posed_mesh=evaluated.to_mesh()
        offset=len(pants_points);pants_points.extend(v.co.copy() for v in posed_mesh.vertices)
        pants_faces.extend(tuple(offset+i for i in p.vertices) for p in posed_mesh.polygons if part!=body or p.material_index not in [1,len(body.data.materials)-1])
        evaluated.to_mesh_clear()
    pants_surface=BVHTree.FromPolygons(pants_points,pants_faces)
    waist_line=[]
    for col in range(columns+1):
        ends=[]
        for row in [int(rows*.30),int(rows*.30)+1]:
            index=row*(columns+1)+col
            ends.append(sum(((pose[g] @ Vector(points[index]))*w for g,w in weights[index].items()),Vector()))
        waist_line.append(ends[0].lerp(ends[1],rows*.30-int(rows*.30)))
    knee = (rig.pose.bones['mixamorig:LeftLeg'].head+rig.pose.bones['mixamorig:RightLeg'].head)/2+Vector((0,-.025,.105))
    seated_points, seated_weights = [], []
    for i, coords in enumerate(points):
        row, col = divmod(i,columns+1)
        t, u = row/rows, col/columns*2-1
        p = Vector(coords)
        if t<=.30:
            seated_points.append(tuple(p));seated_weights.append(weights[i]);continue
        s = (t-.30)/.70
        # Round the fold over the knees instead of making a square shelf.
        lap_end=knee+Vector((u*(.18*bulk+(.225-.18*bulk)*s),0,0))
        top=waist_line[col].lerp(lap_end,min(1,s/.66))
        front=lap_end+Vector((0,-.01,-.145*max(0,s-.66)/.34))
        target=top.lerp(front,smooth(.54,.76,s))
        target.z -= .018*(1-u*u)*smooth(.2,.65,s)
        target.z += (.018*u**4+.003*math.sin(u*7+.4))*smooth(.72,1,s)
        if s>.60:target.y-=.007*math.sin(u*10+.8)*smooth(.60,.95,s)
        original = sum(((pose[g] @ p)*w for g,w in weights[i].items()), Vector())
        target = original.lerp(target,smooth(0,.055,s))
        unprojected=target.copy()
        for offset in [-.006,0,.006]:
            if s<=.70:
                hit=pants_surface.ray_cast(target+Vector((offset,0,2)),Vector((0,0,-1)))
                if hit[0] is not None:target.z=max(target.z,hit[0].z+.014)
            hit=pants_surface.ray_cast(Vector((target.x+offset,-2,target.z)),Vector((0,1,0)))
            if hit[0] is not None:target.y=min(target.y,hit[0].y-.014)
        target.y-=.020*smooth(.65,.85,s)
        target=unprojected.lerp(target,smooth(.04,.20,s))
        seated_points.append(tuple(into_rest @ target));seated_weights.append(weights[i])
    # A small rolled edge gives the pattern a sewn silhouette. It shares
    # the panel's drape and contact fit, including the fold around the knees.
    border=list(range(columns+1))+[r*(columns+1)+columns for r in range(1,rows+1)]
    border += [rows*(columns+1)+c for c in range(columns-1,-1,-1)]
    border += [r*(columns+1) for r in range(rows-1,0,-1)]
    base_count=len(points)
    for n,index in enumerate(border):
        row,col=divmod(index,columns+1)
        previous,following=border[n-1],border[(n+1)%len(border)]
        for source in [points,seated_points]:
            p=Vector(source[index])
            tangent=(Vector(source[following])-Vector(source[previous])).normalized()
            down=Vector(source[min(rows,row+1)*(columns+1)+col])-Vector(source[max(0,row-1)*(columns+1)+col])
            right=Vector(source[row*(columns+1)+min(columns,col+1)])-Vector(source[row*(columns+1)+max(0,col-1)])
            normal=down.cross(right).normalized();across=normal.cross(tangent).normalized()
            for segment in range(8):
                a=segment/8*math.tau
                source.append(tuple(p+across*(.0015*math.cos(a))+normal*(.0004+.0012*math.sin(a))))
        for _ in range(8):
            weights.append(weights[index].copy());seated_weights.append(weights[index].copy());uvs.append(uvs[index])
            for key in deltas:deltas[key].append(deltas[key][index].copy())
    for n in range(len(border)):
        for segment in range(8):
            a=base_count+n*8+segment;b=base_count+((n+1)%len(border))*8+segment
            faces.append((a,b,base_count+((n+1)%len(border))*8+(segment+1)%8,base_count+n*8+(segment+1)%8))
    standing = bind('Patient_WorkApronStanding', points, faces, uvs, canvas, weights, deltas)
    seated = bind('Patient_WorkApronSeated', seated_points, faces, uvs, canvas, seated_weights, deltas)
    seated_key=standing.shape_key_add(name='rc_workSeated');seated_key.value=0
    for vertex,point in zip(seated_key.data,seated_points):vertex.co=point
    rig.animation_data.action = None
    rig.data.pose_position = 'REST'

    def curved_path(anchors, steps=8):
        result=[]
        anchors=[Vector(p) for p in anchors]
        for i in range(len(anchors)-1):
            a,b,c,d=anchors[max(0,i-1)],anchors[i],anchors[i+1],anchors[min(len(anchors)-1,i+2)]
            for step in range(steps):
                t=step/steps
                result.append(((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)*.5)
        return result+[anchors[-1]]

    def webbing(paths, width, hips_only=False):
        vertices, polygons, texture_uv=[],[],[]
        for path in paths:
            offset=len(vertices);distance=0;last_across=None
            for i,p in enumerate(path):
                if i:distance+=(p-path[i-1]).length
                tangent=(path[min(len(path)-1,i+1)]-path[max(0,i-1)]).normalized()
                normal=Vector((p.x-neck.x,p.y-centre_y,.01)).normalized()
                across=normal.cross(tangent).normalized()
                if last_across is not None and across.dot(last_across)<0:across.negate()
                normal=tangent.cross(across).normalized();last_across=across
                section=[(-.5,-.0003),(-.48,.0012),(.48,.0012),(.5,-.0003),(.48,-.0012),(-.48,-.0012)]
                for x,depth in section:
                    vertices.append(tuple(p+across*(x*width)+normal*depth))
                    texture_uv.append((x+.5,distance/.18))
            for i in range(len(path)-1):
                for j in range(6):
                    a=offset+i*6+j;b=offset+(i+1)*6+j
                    polygons.append((a,b,offset+(i+1)*6+(j+1)%6,offset+i*6+(j+1)%6))
            polygons.extend([tuple(offset+i for i in range(5,-1,-1)),tuple(offset+(len(path)-1)*6+i for i in range(6))])
        samples=[sample(Vector(p)) for p in vertices]
        return bind('Patient_WorkApronWaist' if hips_only else 'Patient_WorkApronStraps',vertices,polygons,texture_uv,canvas_tape,
                    [{hips_index:1} if hips_only else shirt_weights(Vector(p)) for p in vertices],
                    {key:[s[1][key] for s in samples] for key in source_keys})

    left=Vector(points[2]);right=Vector(points[columns-2])
    left.z-=.012;right.z-=.012
    path=curved_path([left,(-.092*bulk,centre_y-.025,neck.z-.067),
        (-.078*bulk,centre_y+.035,neck.z-.057),(-.040,centre_y+.061,neck.z-.054),
        (0,centre_y+.067,neck.z-.054),(.040,centre_y+.061,neck.z-.054),
        (.078*bulk,centre_y+.035,neck.z-.057),(.092*bulk,centre_y-.025,neck.z-.067),right])
    for i,p in enumerate(path):
        if i in [0,len(path)-1]:continue
        hit=shirt_surface.find_nearest(p)
        if hit[0] is not None and p.z<shirt_top-.005:
            p[:]=hit[0]+hit[1]*.004
    straps=webbing([path],.022)

    belt_path=[]
    t=max(0,min(1,(shirt_top-waist)/(shirt_top-hem)))
    for col in range(97):
        a=col/96*math.tau;p=shirt_point(t,a)
        hit=shirt_surface.find_nearest(p)
        if hit[0] is not None:p=hit[0]+hit[1]*.004
        p.z=waist
        belt_path.append(p)
    back=Vector(belt_path[48]);back.y+=.005
    tie_paths=[belt_path]
    for sign in [-1,1]:
        tie_paths.append(curved_path([back+Vector((sign*.008,.002,.002)),
            back+Vector((sign*.028,.012,-.020)),back+Vector((sign*.040,.014,-.070)),
            back+Vector((sign*.026,.018,-.135))],12))
    tie_paths.append(curved_path([back+Vector((-.008,.004,-.002)),back+Vector((0,.012,.006)),
        back+Vector((.008,.005,-.002)),back+Vector((0,.014,-.007)),back+Vector((-.008,.004,-.002))],6))
    belt=webbing(tie_paths,.023,True)

    # Sew the loop ends onto the bib instead of leaving ribbons hovering
    # above it. The small reinforced tabs use the same torso weights.
    tab_points,tab_faces,tab_uv=[],[],[]
    for center in [left,right]:
        offset=len(tab_points)
        for dx,dz in [(-.010,-.020),(.010,-.020),(.010,.009),(-.010,.009)]:
            tab_points.append(tuple(center+Vector((dx,-.002,dz))));tab_uv.append((dx/.028+.5,dz/.033+.6))
        tab_faces.append(tuple(range(offset,offset+4)))
    samples=[sample(Vector(p)) for p in tab_points]
    tabs=bind('Patient_WorkApronTabs',tab_points,tab_faces,tab_uv,canvas_tape,
              [shirt_weights(Vector(p)) for p in tab_points],{key:[s[1][key] for s in samples] for key in source_keys})
    for original in [standing,seated,straps,belt,tabs]:
        is_tape=original in [straps,belt,tabs]
        original.data.materials.clear();original.data.materials.append(canvas_tape if is_tape else canvas)
        duplicate=original.copy();duplicate.data=original.data.copy()
        duplicate.name=original.name.replace('WorkApron','WorkApronLeather')
        duplicate.data.materials.clear();duplicate.data.materials.append(leather_tape if is_tape else leather)
        bpy.context.collection.objects.link(duplicate)
    print('MALE_WORKWEAR_OK',len(formal.data.vertices),len(shirt.data.vertices),len(standing.data.vertices))

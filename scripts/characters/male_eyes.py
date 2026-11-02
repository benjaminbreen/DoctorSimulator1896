"""Give the moving eyeballs their own iris and sclera, without painted lids."""
import math
import os
import bpy
import numpy as np


def build(parts, identity, output):
    eyes=[o for o in parts if o.name.startswith('Carmela_Eye_')]
    left=next(o for o in eyes if o.name=='Carmela_Eye_Left')
    cx=(min(v.co.x for v in left.data.vertices)+max(v.co.x for v in left.data.vertices))/2
    center=left['modularIrisCenter']
    atlas_width=cx/(center[0]-.5)
    atlas_height=.21 if abs(center[1]-.5)<.001 else .18
    radius=np.array([.020/atlas_width,.020/atlas_height])
    original=next(n.image for n in left.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
    source_pixels=np.array(original.pixels[:],dtype=np.float32).reshape(original.size[1],original.size[0],4)
    width,height=1024,512
    u,v=np.meshgrid((np.arange(width)+.5)/width,(np.arange(height)+.5)/height)
    r=np.full((height,width),100.)
    angle=np.zeros((height,width));cu=np.zeros((height,width));cv=np.zeros((height,width))
    for eye in eyes:
        x,z=eye['modularIrisCenter'];z=1-z
        dx,dz=(u-x)/radius[0],(v-z)/radius[1]
        distance=np.sqrt(dx*dx+dz*dz)
        use=distance<r
        angle[use]=np.arctan2(dz[use],dx[use]);r[use]=distance[use];cu[use]=x;cv[use]=z
        eye['modularIrisRadius']=radius.tolist()
    noise=np.random.default_rng(1896).uniform(-.025,.025,r.shape)
    fibre=.78+.12*np.sin(angle*67+r*23)+.07*np.sin(angle*151+r*39)+noise
    limbic=1-.65*np.clip((r-.82)/.18,0,1)
    iris=np.array([.40,.29,.16] if identity=='male-b' else [.34,.44,.48])
    sample_radius=.45+.55*np.clip(r,0,1)
    sx=np.clip(((cu+np.cos(angle)*sample_radius*radius[0])*original.size[0]).astype(int),0,original.size[0]-1)
    sy=np.clip(((cv+np.sin(angle)*sample_radius*radius[1]*.5)*original.size[1]).astype(int),0,original.size[1]-1)
    photo=source_pixels[sy,sx,:3]
    valid=(photo.mean(axis=2)<.62)&(photo.mean(axis=2)>.02)
    color=(np.where(valid[:,:,None],photo*.75+iris[None,None,:]*.25,iris[None,None,:])*limbic[:,:,None])*(.85+.15*fibre[:,:,None])
    pupil=np.clip((r-.38)/.05,0,1)
    color=color*pupil[:,:,None]+np.array([.012,.009,.008])[None,None,:]*(1-pupil[:,:,None])
    edge=np.clip((1-r)/.025,0,1)
    # A little lid occlusion and warm corners keep the sclera from reading
    # as a luminous white insert, even under broad inspection lighting.
    lid_shadow=.88+.10*np.exp(-((v-cv)/(.012/atlas_height))**2)
    corners=np.clip((abs(u-cu)-.030/atlas_width)/(.025/atlas_width),0,1)
    white=np.array([.82,.79,.75])[None,None,:]*lid_shadow[:,:,None]*(1+noise[:,:,None]*.35)
    white=white*(1-corners[:,:,None]*.12)+np.array([.46,.22,.20])[None,None,:]*corners[:,:,None]*.12
    pixels=np.ones((height,width,4),dtype=np.float32)
    color=color*edge[:,:,None]+white*(1-edge[:,:,None])
    glint=np.exp(-((r*np.cos(angle)+.28)/.10)**2-((r*np.sin(angle)-.30)/.13)**2)*.18
    pixels[:,:,:3]=np.clip(color*(1-glint[:,:,None])+np.array([.96,.96,.94])[None,None,:]*glint[:,:,None],0,1)
    image=bpy.data.images.new('Patient_Eyeballs',width=width,height=height)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw=os.path.join(output,identity+'-eyeballs.png');image.file_format='PNG';image.save();image.pack()
    for eye in eyes:
        material=eye.data.materials[0]
        next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE').image=image
        shader=material.node_tree.nodes.get('Principled BSDF')
        for name,value in [('Normal',None),('Metallic',0),('Roughness',.14),('Specular IOR Level',.5),('Coat Weight',.28),('Coat Roughness',.06)]:
            for link in list(shader.inputs[name].links):material.node_tree.links.remove(link)
            if value is not None:shader.inputs[name].default_value=value

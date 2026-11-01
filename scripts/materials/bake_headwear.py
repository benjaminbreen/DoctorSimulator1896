"""Bake neutral hat fabric PBR maps and feather cutouts for both web apps."""
from pathlib import Path
import json
import math
import shutil
import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SIZE = 1024
OUT = ROOT / 'game/public/textures/headwear'
LAB = ROOT / 'character-lab/public/textures/headwear'
SOURCE = ROOT / 'assets/source/renderer-c/fabrics'
KINDS = ['felt', 'wool', 'linen', 'straw', 'straw-coil', 'grosgrain', 'silk', 'velvet', 'leather']


def periodic_noise(rng, n, scale):
    a = rng.normal(0, 1, (scale, scale)).astype(np.float32)
    # Wrap the small noise field before interpolation, including the border.
    a = np.pad(a, 1, mode='wrap')
    im = Image.fromarray(a).resize((n + n*2//scale, n + n*2//scale), Image.Resampling.BICUBIC)
    return np.asarray(im, dtype=np.float32)[n//scale:n//scale+n, n//scale:n//scale+n]


def source_fibres(name, n):
    file = SOURCE / ({'felt':'wool', 'linen':'cotton', 'grosgrain':'silk'}.get(name, name)+'-source.png')
    if not file.exists(): return np.zeros((n, n), np.float32)
    image = Image.open(file).convert('L').resize((n//2, n//2), Image.Resampling.LANCZOS)
    tile = Image.new('L', (n, n))
    for x,y,part in [(0,0,image),(n//2,0,ImageOps.mirror(image)),(0,n//2,ImageOps.flip(image)),(n//2,n//2,ImageOps.flip(ImageOps.mirror(image)))]:tile.paste(part,(x,y))
    values = np.asarray(tile, dtype=np.float32)/255
    return values - values.mean()


def bake(name):
    n=SIZE; rng=np.random.default_rng(1896+KINDS.index(name)*197)
    axis=np.arange(n, dtype=np.float32)/n; x,y=np.meshgrid(axis,axis)
    fine=periodic_noise(rng,n,256); medium=periodic_noise(rng,n,48); slow=periodic_noise(rng,n,8)
    fibres=source_fibres(name,n)
    rough=.9; strength=1.3
    if name=='felt':
        h=fine*.09+medium*.04; value=.83+fibres*.2+fine*.025+slow*.018; rough=.94; strength=1.4
    elif name=='wool':
        # Broken twill, with alternating herringbone direction every 8 threads.
        direction=np.where((np.floor(x*16).astype(int)%2)==0,1,-1)
        warp=np.cos(math.tau*(x*128+direction*y*64)); weft=np.cos(math.tau*y*128)
        chevron=np.cos(math.tau*(np.abs((x*8)%1-.5)*2+y*16))
        h=warp*.15+weft*.055+fine*.035; value=.8+chevron*.055+warp*.025+fibres*.3+medium*.02; rough=.92
    elif name=='linen':
        warp=np.maximum(0,np.cos(math.tau*x*88))**.6; weft=np.maximum(0,np.cos(math.tau*y*88))**.6
        h=(warp+weft)*.15+fine*.04; value=.86+(warp+weft-.8)*.035+fibres*.3+medium*.018; rough=.91
    elif name=='straw':
        row=np.floor(y*28); strand=np.cos(math.tau*(y*28+.025*np.sin(math.tau*x*16)))
        braid=np.sin(math.tau*(x*64+np.where((row.astype(int)%2)==0,1,-1)*y*28))
        h=strand*.22+braid*.055+fine*.018; value=.81+strand*.06+braid*.035+medium*.023; rough=.84; strength=1.8
    elif name=='straw-coil':
        dx=x-.5; dy=y-.5; r=np.sqrt(dx*dx+dy*dy); angle=np.arctan2(dy,dx)
        coil=r*88-angle/math.tau
        strand=np.cos(math.tau*coil)
        braid=np.sin(angle*np.maximum(8,np.round(r*420))+np.sin(math.tau*coil)*1.2)
        h=strand*.18+braid*.065+fine*.012; value=.81+strand*.055+braid*.035+medium*.018; rough=.85; strength=1.9
    elif name=='grosgrain':
        rib=np.cos(math.tau*y*96); thread=np.cos(math.tau*x*256)
        h=rib*.13+thread*.02; value=.83+rib*.045+fibres*.15+fine*.012; rough=.7; strength=1.4
    elif name=='silk':
        thread=np.sin(math.tau*x*240)*np.sin(math.tau*y*96)
        h=thread*.045+fine*.012; value=.9+fibres*.12+medium*.01; rough=.53; strength=.7
    elif name=='velvet':
        h=fine*.025+medium*.025; value=.79+fibres*.3+slow*.027+fine*.02; rough=.93; strength=.8
    else:
        pores=np.maximum(0,fine+.3*medium)**2
        h=-pores*.07+medium*.025; value=.78+slow*.035-pores*.025; rough=.76; strength=1
    dx=(np.roll(h,-1,1)-np.roll(h,1,1))*strength; dy=(np.roll(h,-1,0)-np.roll(h,1,0))*strength
    normal=np.stack((-dx,dy,np.ones_like(h)),axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    albedo=np.clip(value, .4, .99)
    rgb=np.repeat(albedo[...,None],3,axis=2)
    if name.startswith('straw'):
        rgb[...,0]*=1.015;rgb[...,2]*=.94
    maps={'albedo':Image.fromarray(np.uint8(np.clip(rgb,0,1)*255)),
          'normal':Image.fromarray(np.uint8((normal*.5+.5)*255)),
          'orm':Image.fromarray(np.uint8(np.stack((np.clip(1-np.maximum(0,-h)*.25,.82,1),np.clip(rough+medium*.018-h*.04,.35,.99),np.zeros_like(h)),axis=-1)*255))}
    for channel,image in maps.items():
        resolution=1024 if channel=='albedo' and name in ['wool','straw','straw-coil'] else 512 if channel!='orm' else 256
        if resolution!=n:image=image.resize((resolution,resolution),Image.Resampling.LANCZOS)
        if channel=='normal':
            vectors=np.asarray(image,dtype=np.float32)/127.5-1
            vectors/=np.maximum(np.linalg.norm(vectors,axis=-1,keepdims=True),1e-6)
            image=Image.fromarray(np.uint8(np.clip(vectors*.5+.5,0,1)*255))
            image=Image.fromarray((np.asarray(image)//4*4).astype(np.uint8))
        if channel=='orm':image=Image.fromarray((np.asarray(image)//3*3).astype(np.uint8))
        image.save(OUT/f'{name}-{channel}.webp',lossless=channel!='albedo',quality=94,method=6)


def feather():
    # Supersampled tapered barbs give a soft broken edge without a leaf-shaped card.
    w,h=512,1024; scale=2;rng=np.random.default_rng(837)
    im=Image.new('RGBA',(w*scale,h*scale));draw=ImageDraw.Draw(im)
    for i in range(320):
        t=.035+i/340; y=(1-t)*h; width=(math.sin(math.pi*t)**.52)*w*.47
        for sign in [-1,1]:
            end=256+sign*width*rng.uniform(.92,1.03); rise=rng.uniform(12,30)
            pts=[(256,y),(256+(end-256)*.35,y-rise*.45),(256+(end-256)*.78,y-rise),(end,y-rise*.55)]
            shade=int(rng.uniform(172,240));alpha=int(rng.uniform(195,255))
            draw.line([(int(x*scale),int(yy*scale))for x,yy in pts],fill=(shade,shade,shade,alpha),width=int(rng.integers(3,6)))
            for k in range(2):
                end2=end+sign*rng.uniform(2,9); yy=y-rise*.55+rng.uniform(-3,3)
                draw.line([(int(end*scale),int((y-rise*.55)*scale)),(int(end2*scale),int(yy*scale))],fill=(shade,shade,shade,90),width=1)
    draw.line([(256*scale,1024*scale),(256*scale,35*scale)],fill=(225,222,215,255),width=3*scale)
    im.resize((w,h),Image.Resampling.LANCZOS).save(OUT/'feather-albedo.webp',lossless=True,method=6)


def main():
    OUT.mkdir(parents=True,exist_ok=True);LAB.mkdir(parents=True,exist_ok=True)
    for kind in KINDS:bake(kind);print('Baked',kind,flush=True)
    feather()
    files=sorted(OUT.glob('*.webp'))
    for file in files:shutil.copy2(file,LAB/file.name)
    manifest={'albedoSize':'512–1024','normalSize':512,'ormSize':256,'materials':KINDS,'files':[p.name for p in files],'bytes':sum(p.stat().st_size for p in files),'source':'Project-authored weave fields; existing original neutral fabric sources.'}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');shutil.copy2(OUT/'manifest.json',LAB/'manifest.json')
    print(json.dumps(manifest))

if __name__=='__main__':main()

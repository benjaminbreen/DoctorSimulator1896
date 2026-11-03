import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {headwearMaterial} from './headwearMaterials.js';

export const ACCESSORY_DEFAULTS={glassesStyle:'none',glassesMetal:'steel',lensTint:'clear',glassesSize:0,glassesBridge:0,glassesHeight:0,glassesDepth:0,glassesWeight:0,
  neckwearStyle:'original',neckwearColor:'wine',neckwearPattern:'plain',neckwearFabric:'auto',neckwearAccent:'auto',neckwearPatternScale:0,neckwearScale:0,neckwearWear:0,
  broochStyle:'none',earringStyle:'none',locketStyle:'none',jewelryMetal:'brass',jewelryStone:'garnet',tiePin:'none',collarStud:'none',watchChain:'none',accessorySeed:1896};
export const ACCESSORY_CHOICES={
  glassesStyle:{none:'No spectacles',round:'Round wire spectacles',oval:'Oval wire spectacles','pince-nez':'Oval pince-nez',rimless:'Rimless pince-nez'},
  glassesMetal:{steel:'Steel',silver:'Silver',gold:'Gold',black:'Blackened metal'},lensTint:{clear:'Clear',blue:'Blue tinted',smoke:'Smoked',green:'Green tinted'},
  neckwearStyle:{original:'Original garment',none:'No neckwear',bow:'Bow tie',ribbon:'Ribbon bow',tie:'Four-in-hand tie',narrow:'Narrow four-in-hand',cravat:'Full cravat',kerchief:'Work neckerchief'},
  neckwearColor:{black:'Black',wine:'Wine',navy:'Navy',forest:'Forest',cream:'Ivory',ochre:'Ochre',slate:'Slate',brown:'Brown',plum:'Plum',teal:'Teal',rust:'Russet',gray:'Pearl grey'},
  neckwearPattern:{plain:'Plain',stripe:'Fine diagonal stripe',dot:'Small spots',diamond:'Small diamonds',check:'Small checks',floret:'Small floral figures',herringbone:'Fine chevrons'},
  neckwearFabric:{auto:'Style default',silk:'Smooth silk',grosgrain:'Ribbed silk',velvet:'Velvet',linen:'Linen'},
  neckwearAccent:{auto:'Soft contrast',cream:'Ivory motif',ochre:'Gold motif',slate:'Grey motif',wine:'Wine motif',black:'Black motif'},
  broochStyle:{none:'No brooch',oval:'Oval stone brooch',cameo:'Cameo brooch',bar:'Bar brooch',jet:'Faceted black brooch'},
  earringStyle:{none:'No earrings',stud:'Small studs',pearl:'Pearl drops',drop:'Stone drops',jet:'Black drops'},
  locketStyle:{none:'No locket',oval:'Oval locket',round:'Round locket'},
  jewelryMetal:{brass:'Brass',gold:'Gold',silver:'Silver',steel:'Steel'},jewelryStone:{garnet:'Garnet',amber:'Amber',turquoise:'Turquoise',pearl:'Pearl',jet:'Black glass'},
  tiePin:{none:'No tie pin',plain:'Plain stickpin',pearl:'Pearl stickpin',stone:'Stone stickpin'},collarStud:{none:'No collar stud',plain:'Metal collar stud',pearl:'Pearl collar stud',stone:'Stone collar stud'},watchChain:{none:'No watch chain',single:'Single watch chain',double:'Double watch chain'},
};
const metals={steel:'#8b9294',silver:'#d5d3c9',gold:'#bd934b',brass:'#a8874f',black:'#393b3a'};
const stones={garnet:'#5f1823',amber:'#a96119',turquoise:'#287d80',pearl:'#d8d0b7',jet:'#171918'};
const fabrics={black:'#252327',wine:'#5b2934',navy:'#293e51',forest:'#344738',cream:'#bfb5a0',ochre:'#86623c',slate:'#59636b',brown:'#4b3326',plum:'#4d3052',teal:'#1d555b',rust:'#7a3c2a',gray:'#999a92'};
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
function material(color,metal=false){return new THREE.MeshStandardMaterial({color,metalness:metal?.78:0,roughness:metal?.29:.28});}
function batch(name){
  const group=new THREE.Group(),batches=new Map();group.name='Patient_Accessories_'+name;
  return {group,add(name,geometry,material){const key=name;if(!batches.has(key))batches.set(key,{geometries:[],material});batches.get(key).geometries.push(geometry);},finish(){
    for(const [name,{geometries,material}]of batches){
      if(geometries.some(g=>g.hasAttribute('accessoryLoose')))for(const g of geometries)if(!g.hasAttribute('accessoryLoose'))g.setAttribute('accessoryLoose',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
      const indexed=geometries.every(g=>g.index),input=indexed?geometries:geometries.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(input);
      for(const g of new Set([...input,...geometries]))g.dispose();const mesh=new THREE.Mesh(geometry,material);mesh.name='Accessory_'+name;mesh.castShadow=!material.transparent;mesh.frustumCulled=false;group.add(mesh);
    }return group;
  }};
}
function tube(points,radius=.001,segments=32,radial=6,closed=false){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed,'centripetal'),segments,radius,radial,closed);}
function ellipse(rx,ry,center,wire=.0007,segments=48,slope=0,radial=6){return tube(Array.from({length:segments},(_,i)=>{const a=i/segments*Math.PI*2,x=rx*Math.cos(a);return v(x,ry*Math.sin(a),x*slope).add(center);}),wire,segments,radial,true);}
function sphere(at,size,segments=12){const g=new THREE.SphereGeometry(1,segments,8);g.scale(...size);g.translate(...at.toArray());return g;}
function lens(rx,ry,c,slope=0){
  const points=[...c.toArray()],uv=[.5,.5],indices=[];const steps=48;
  for(let row=1;row<=3;row++)for(let i=0;i<steps;i++){const a=i/steps*Math.PI*2,r=row/3,x=rx*r*Math.cos(a);points.push(c.x+x,c.y+ry*r*Math.sin(a),c.z+.0007*(1-r*r)+x*slope);uv.push(.5+.5*r*Math.cos(a),.5+.5*r*Math.sin(a));}
  for(let i=0;i<steps;i++)indices.push(0,1+i,1+(i+1)%steps);
  for(let row=0;row<2;row++)for(let i=0;i<steps;i++){const a=1+row*steps+i,b=1+row*steps+(i+1)%steps;indices.push(a,a+steps,b,b,a+steps,b+steps);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function buildSpectacles(fit,look){
  if(look.glassesStyle==='none')return null;
  const b=batch('Spectacles'),s=fit.scale,size=1+look.glassesSize*.12,rx=.018*s*size,ry=(look.glassesStyle==='round'?.0175:.0135)*s*size;
  const wire=.00065*s*(1+look.glassesWeight*.35),gap=Math.max(rx+.006*s,fit.eyeX+look.glassesBridge*.003*s);
  const y=fit.eyeY+look.glassesHeight*.004*s,z=fit.bridgeZ+.0025*s+look.glassesDepth*.003*s,outerZ=fit.eyeFrontZ+.008*s+look.glassesDepth*.003*s;
  const metal=material(metals[look.glassesMetal]||metals.steel,true);
  const tint={clear:['#d1e0db',.065],blue:['#3b6788',.35],smoke:['#494c46',.43],green:['#4b6c55',.32]}[look.lensTint]||['#d1e0db',.065];
  const glass=new THREE.MeshPhysicalMaterial({color:tint[0],transparent:true,opacity:tint[1],depthWrite:false,roughness:.13,metalness:0,specularIntensity:.18,clearcoat:.5,clearcoatRoughness:.14,side:THREE.DoubleSide});
  for(const sign of [-1,1]){
    const c=v(sign*gap,y,(z+outerZ)/2),slope=-sign*(z-outerZ)/(2*rx);
    if(look.glassesStyle!=='rimless')b.add('SpectacleFrame',ellipse(rx,ry,c,wire,48,slope),metal);
    b.add('SpectacleLenses',lens(rx-wire*.5,ry-wire*.5,c,slope),glass);
    const inner=v(sign*(gap-rx),y+.001*s,z);
    b.add('SpectacleFrame',sphere(inner,[.0014*s,.0015*s,.0012*s],8),metal);
    if(['round','oval'].includes(look.glassesStyle)){
      const hinge=v(sign*(gap+rx),y+.003*s,outerZ),ear=fit.ears[sign===1?1:0].clone();
      const path=[[y+.003*s,outerZ-.008*s],[y+.006*s,(outerZ+ear.z)/2],[ear.y+.040*s,ear.z+.010*s],[ear.y+.032*s,ear.z-.010*s],[ear.y+.017*s,ear.z-.014*s]].map(([y,z])=>v(sign*fit.templeAt(sign,y,z),y,z));
      b.add('SpectacleFrame',tube([hinge,...path],wire*.82,32,5),metal);
      b.add('SpectacleFrame',sphere(hinge,[.0015*s,.0014*s,.0017*s],8),metal);
    }else{
      const pad=v(sign*(gap-rx-.001*s),y-.005*s,z-.0035*s);
      b.add('SpectacleFrame',tube([inner,v(sign*(gap-rx-.002*s),y-.002*s,z-.001*s),pad],wire*.8,8,5),metal);
      b.add('SpectacleFrame',sphere(pad,[.0011*s,.0032*s,.0009*s],8),metal);
    }
  }
  const inner=gap-rx;
  b.add('SpectacleFrame',tube([v(-inner,y+.001*s,z),v(-inner*.5,y+.008*s,z+.001*s),v(0,y+.0095*s,z+.0015*s),v(inner*.5,y+.008*s,z+.001*s),v(inner,y+.001*s,z)],wire,20,6),metal);
  const group=b.finish();group.userData.fit={lensY:y,bridgeZ:z,lensRadiusX:rx,lensRadiusY:ry,halfSpacing:gap};
  for(const mesh of group.children)if(mesh.material.transparent)mesh.renderOrder=2;
  return group;
}

function clothMaterial(look){
  const kind=look.neckwearFabric==='auto'||!look.neckwearFabric?(look.neckwearStyle==='kerchief'?'linen':'silk'):look.neckwearFabric;
  const m=headwearMaterial(fabrics[look.neckwearColor]||fabrics.wine,kind,look.neckwearWear);
  m.name='Accessory_NeckwearFabric';m.normalScale.setScalar({silk:.16,grosgrain:.42,velvet:.10,linen:.32}[kind]||.25);
  m.roughness=1;m.specularIntensity=kind==='silk'?.28:.18;
  // Fold edges have no stable fibre tangent. Anisotropy there caused fireflies
  // under the game's nearby lamps; weave normals and sheen retain the cloth finish.
  m.sheen=kind==='velvet'?.9:kind==='silk'?.45:.25;m.anisotropy=0;
  const ink={value:new THREE.Color(look.neckwearAccent==='auto'?(look.neckwearColor==='cream'||look.neckwearColor==='gray'?'#423c38':'#b0a28b'):fabrics[look.neckwearAccent]||'#b0a28b')};
  const patternSize={value:1/(1+(Number(look.neckwearPatternScale)||0)*.6)};
  const previous=m.onBeforeCompile;
  m.onBeforeCompile=(shader,renderer)=>{previous?.(shader,renderer);const pattern={plain:0,stripe:1,dot:2,diamond:3,check:4,floret:5,herringbone:6}[look.neckwearPattern]||0;
    shader.uniforms.accessoryInk=ink;shader.uniforms.accessoryPatternSize=patternSize;
    shader.fragmentShader='uniform vec3 accessoryInk; uniform float accessoryPatternSize;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    #ifdef USE_MAP
    vec2 accessoryUV=vMapUv*6.0*accessoryPatternSize; float motif=0.0;
    float aa=max(length(fwidth(accessoryUV))*.7,.008);
    ${pattern===1?'float stripe=abs(fract(accessoryUV.x+accessoryUV.y)-.5);motif=1.0-smoothstep(.055-aa,.055+aa,stripe);motif=max(motif,.55*(1.0-smoothstep(.014-aa,.014+aa,abs(stripe-.12))));':pattern===2?'motif=1.0-smoothstep(.10-aa,.10+aa,length(fract(accessoryUV)-.5));':pattern===3?'motif=1.0-smoothstep(.15-aa,.15+aa,abs(fract(accessoryUV.x)-.5)+abs(fract(accessoryUV.y)-.5));':''}
    ${pattern===4?'vec2 cell=abs(fract(accessoryUV)-.5);motif=1.0-smoothstep(.025-aa,.025+aa,min(cell.x,cell.y));':pattern===5?'vec2 q=fract(accessoryUV)-.5;float petals=.13+.045*cos(5.0*atan(q.y,q.x));motif=1.0-smoothstep(petals-aa,petals+aa,length(q));motif*=smoothstep(.025-aa,.025+aa,length(q));':pattern===6?'float chevron=abs(fract(accessoryUV.x)-.5)*2.0+accessoryUV.y;motif=1.0-smoothstep(.045-aa,.045+aa,abs(fract(chevron)-.5));':''}
    diffuseColor.rgb=mix(diffuseColor.rgb,accessoryInk,motif*.48);
    #endif`);};
  m.customProgramCacheKey=()=>`accessory-cloth-v3-${look.neckwearPattern}`;return m;
}
function panel(rows,columns=12){
  const positions=[],uv=[],indices=[];
  for(let r=0;r<rows.length;r++)for(let c=0;c<=columns;c++){const u=c/columns,point=rows[r](u);positions.push(...point.toArray());uv.push(u,r/(rows.length-1));if(r<rows.length-1&&c<columns){const a=r*(columns+1)+c;indices.push(a,a+1,a+columns+1,a+1,a+columns+2,a+columns+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
// UVs are metres / 8 cm, shared by weave maps and printed motifs.
// Closed cloth surfaces retain an edge and a reverse side in profile.
function clothShell(surface,rows=28,columns=12,thickness=.0008){
  const p=[],uv=[],loose=[],idx=[],stride=columns+1,sideCount=(rows+1)*stride;
  for(let side=0;side<2;side++)for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++){
    const t=r/rows,u=c/columns,q=surface(t,u);p.push(q.x,q.y,q.z+(side?-.5:.5)*thickness);uv.push(q.u,q.v);loose.push(q.loose||0,q.ribbon||0);
  }
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
    const a=r*stride+c,b=a+stride;idx.push(a,b,a+1,a+1,b,b+1);const k=sideCount;idx.push(a+k,a+1+k,b+k,a+1+k,b+1+k,b+k);
  }
  const rim=[];for(let c=0;c<=columns;c++)rim.push(c);for(let r=1;r<=rows;r++)rim.push(r*stride+columns);for(let c=columns-1;c>=0;c--)rim.push(rows*stride+c);for(let r=rows-1;r>0;r--)rim.push(r*stride);
  for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];idx.push(a,b,a+sideCount,b,b+sideCount,a+sideCount);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('accessoryLoose',new THREE.Float32BufferAttribute(loose,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function foldedKnot(y,z,scale,bow=false,wide=false){
  const p=[],uv=[],idx=[],rows=12,around=24,height=(bow?.032:.035)*scale;
  for(let r=0;r<=rows;r++)for(let c=0;c<=around;c++){
    const t=r/rows,a=c/around*Math.PI*2,half=(bow?.0105:(.0148*(1-t)+.0095*t+.0025*Math.sin(t*Math.PI)))*(wide?1.25:1)*scale;
    const x=half*Math.cos(a)+(!bow?.0018*Math.sin(t*Math.PI)*scale:0),yy=y+height*(.5-t);
    const depth=.0085*scale*(1-.6*t+.12*Math.sin(t*Math.PI));
    const crease=.00065*scale*Math.sin(a*3+t*4)*Math.sin(t*Math.PI);
    if(bow){
      const gather=.87+.13*Math.sin(t*Math.PI);
      p.push((t-.5)*.020*scale,y+.016*scale*Math.cos(a)*gather,z+.010*scale*Math.sin(a)*gather+crease);
      uv.push(t*.020*scale/.08,a*.013*scale/.08);
    }else{p.push(x,yy,z+depth*Math.sin(a)+crease);uv.push((a*half+.25*(yy-y))/.08,(height*t+.25*x)/.08);}
    if(r<rows&&c<around){const k=r*(around+1)+c;idx.push(k,k+1,k+around+1,k+1,k+around+2,k+around+1);}
  }
  for(const r of [0,rows]){const center=p.length/3;p.push(bow?(r/rows-.5)*.020*scale:0,bow?y:y+height*(.5-r/rows),z);uv.push(.5,.5);for(let c=0;c<around;c++){const a=r*(around+1)+c;idx.push(center,r===0?a+1:a,r===0?a:a+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
export function buildNeckwear(fit,look,backing=null){
  const style=look.neckwearStyle,active=!['none','original'].includes(style);if(!active&&!backing)return null;
  const b=batch('Neckwear'),s=fit.scale,size=1+look.neckwearScale*.15,k=s*size,y=fit.knotY,fabric=active?clothMaterial(look):null;
  const contact=fit.shirtFront||fit.front;
  if(backing){
    const shirt=headwearMaterial('#d8d3c7','linen');shirt.map=null;shirt.normalScale.set(.2,.2);
    const length=(backing==='short'?.080:.17)*s;
    b.add('ShirtFacing',panel(Array.from({length:25},(_,r)=>u=>{const t=r/24,yy=y-.012*s-t*length,x=((u-.5)*.075*(1-t)+(backing==='short'?.010:.004)*t)*s;return v(x,yy,fit.front(x,yy)+.001*s);}),12),shirt);
  }
  if(active){
    const bow=['bow','ribbon'].includes(style),ribbon=style==='ribbon',kerchief=style==='kerchief',cravat=style==='cravat';
    const base=contact.max(0,y,.018*s,.012*s)+.004*s;
    // An oval band passes beneath the collar, with the rear higher than the front.
    b.add('NeckwearCloth',clothShell((t,u)=>{
      const a=t*Math.PI*2,x=.050*k*Math.cos(a),yy=y+(.004+(u-.5)*.012+.030*(1-Math.sin(a))*.5)*k;
      const z=contact(0,y)-.012*s-.052*k+.052*k*Math.sin(a);
      return {x,y:yy,z,u:t*.32*k/.08,v:u*.012*k/.08};
    },40,4,.0008*s),fabric);
    if(bow){
      const bowZ=fit.front.max(0,y,.012*k,.006*k)+.001*s;
      for(const sign of [-1,1])b.add('NeckwearCloth',clothShell((t,u)=>{
        const spread=Math.sin(Math.PI*t),half=(.004+.018*spread**.65)*k;
        const x=sign*(.005+(ribbon?.048:.052)*spread)*k,yy=y+(u-.5)*half*2+sign*.002*k*spread-.003*k*t;
        const gather=Math.cos(u*Math.PI*4)*.0022*k*(1-spread)**2;
        const z=bowZ+(.004+.007*Math.sin(t*Math.PI*2)+.002*Math.sin(u*Math.PI))*k+gather;
        return {x,y:yy,z,u:u*half*2/.08,v:t*.12*k/.08};
      },28,12,.001*s),fabric);
      if(ribbon)for(const sign of [-1,1])b.add('NeckwearCloth',clothShell((t,u)=>{
        const width=.023*k,xx=sign*(.008+.014*t)*k+(u-.5)*width;
        const yy=y-(.009+t*(sign===1?.095:.115))*k+.006*k*Math.abs(u-.5)*Math.max(0,(t-.85)/.15);
        const z=fit.front(xx,yy)+(.004+.003*Math.sin(u*Math.PI)+.002*Math.sin(t*Math.PI*3))*k;
        return {x:xx,y:yy,z,u:u*width/.08,v:t*.115*k/.08,loose:t**1.8,ribbon:sign};
      },24,10,.001*s),fabric);
      b.add('NeckwearCloth',foldedKnot(y,bowZ+.006*k,k,true),fabric);
    }else if(kerchief){
      const top=(fit.neckFront||fit.front).max(0,y,.045*s,.014*s)+.008*s;
      b.add('NeckwearCloth',clothShell((t,u)=>{
        const width=(.13*(1-t)+.020*t)*k,x=(u-.5)*width,yy=y+(.016-.070*t)*k;
        const z=THREE.MathUtils.lerp(top,fit.front(x,yy)+.005*s,t)+.003*k*Math.cos(u*Math.PI*6)*Math.sin(t*Math.PI);
        return {x,y:yy,z,u:u*width/.08,v:t*.09*k/.08};
      },24,20,.001*s),fabric);
      for(const sign of [-1,1])b.add('NeckwearCloth',clothShell((t,u)=>{
        const width=.027*k*(1-.65*t),x=sign*(.006+.017*t)*k+(u-.5)*width,yy=y-(.005+t*(sign===1?.090:.11))*k;
        return {x,y:yy,z:fit.front(x,yy)+(.008+.004*Math.sin(u*Math.PI)+.002*Math.sin(t*Math.PI*2))*k,u:u*width/.08,v:t*.11*k/.08,loose:t**1.8*.65,ribbon:sign};
      },24,10,.001*s),fabric);
      b.add('NeckwearCloth',foldedKnot(y,top+.008*k,k,false,true),fabric);
    }else{
      const narrow=style==='narrow',length=fit.shirtOpening?y-fit.shirtOpening.endY-.010*k:(cravat?.20:.25)*k;
      const top=contact.max(0,y-.010*k,.012*s,.006*s),bottom=contact.max(0,y-.010*k-length,.012*s,.006*s);
      let control=2*contact(0,y-length*.5)-(top+bottom)/2;
      for(let i=1;i<40;i++){
        const t=i/40,yy=y-.010*k-t*length,half=fit.shirtOpening?fit.shirtOpening(yy):.020*s;
        const support=contact.max(0,yy,Math.min(.035*s,half),.004*s);
        control=Math.max(control,(support-(1-t)**2*top-t*t*bottom)/(2*t*(1-t)));
      }
      const line=t=>(1-t)**2*top+2*t*(1-t)*control+t*t*bottom;
      fit.neckwearFront=yy=>line(THREE.MathUtils.clamp((y-.010*k-yy)/length,0,1))+.010*k;
      b.add('NeckwearCloth',clothShell((t,u)=>{
        const yy=y-.010*k-t*length,natural=(cravat?(.034+.050*Math.sin(t*Math.PI*.8)):narrow?(.021+.013*Math.sin(t*Math.PI*.8)):(.027+.031*Math.sin(t*Math.PI*.8)))*k;
        const width=fit.shirtOpening?Math.min(natural,fit.shirtOpening(yy)*2):natural;
        const tip=!fit.shirtOpening&&t>.88?(1-t)/.12:1,x=(u-.5)*width*tip+.002*k*Math.sin(t*Math.PI);
        const fullness=(cravat?.008:.004)*Math.sin(u*Math.PI),dimple=.0045*Math.exp(-(((u-.48)/.15)**2))*Math.exp(-(((t-.05)/.09)**2));
        const folds=cravat?.003*Math.cos(u*Math.PI*6)*Math.sin(t*Math.PI):.0007*Math.sin(t*Math.PI*3+u*3);
        const surface=line(t)-x*x*.8/s;
        return {x,y:yy,z:surface+(.004+fullness-dimple+folds)*k,u:x/.08,v:t*length/.08};
      },40,18,.001*s),fabric);
      b.add('NeckwearCloth',foldedKnot(y,base+.008*k,k,false,cravat),fabric);
    }
  }
  const group=b.finish();group.userData.clothThickness=.001*s;return group;
}

export function buildJewelry(fit,look){
  const head=batch('EarJewelry'),body=batch('BodyJewelry'),s=fit.scale,metal=material(metals[look.jewelryMetal]||metals.brass,true);
  const stone=material(stones[look.jewelryStone]||stones.garnet),pearl=material(stones.pearl),jet=material(stones.jet);
  if(look.earringStyle!=='none')for(const [i,ear]of fit.ears.entries()){
    const p=ear.clone().add(v((i?1:-1)*.0008*s,0,.0015*s));head.add('EarringMetal',sphere(p,[.0024*s,.0024*s,.0015*s],10),metal);
    if(look.earringStyle==='stud')head.add('EarringStone',sphere(p.clone().add(v(0,0,.0015*s)),[.0018*s,.0018*s,.0012*s],10),stone);
    else{
      head.add('EarringMetal',ellipse(.002*s,.003*s,p.clone().add(v(0,-.004*s,.0008*s)),.0004*s,16),metal);
      const at=p.clone().add(v(0,-.012*s,.001*s)),m=look.earringStyle==='pearl'?pearl:look.earringStyle==='jet'?jet:stone;
      head.add('EarringStone',sphere(at,[.0035*s,.005*s,.0025*s],12),m);
      head.add('EarringMetal',sphere(at.clone().add(v(0,.0045*s,0)),[.002*s,.0015*s,.0016*s],8),metal);
    }
  }
  if(look.broochStyle!=='none'){
    const y=fit.knotY-.012*s,z=fit.front.max(0,y,.010*s,.014*s)+.0025*s,p=v(0,y,z),bar=look.broochStyle==='bar';
    if(bar){body.add('BroochMetal',tube([p.clone().add(v(-.017*s,0,0)),p.clone().add(v(.017*s,0,0))],.0011*s,1,8),metal);for(const x of [-.011,0,.011])body.add('BroochStone',sphere(p.clone().add(v(x*s,0,.001*s)),[.0023*s,.0023*s,.0018*s],10),stone);}
    else{
      body.add('BroochMetal',ellipse(.010*s,.013*s,p,.001*s),metal);
      for(let i=0;i<16;i++){const a=i/16*Math.PI*2;body.add('BroochMetal',sphere(p.clone().add(v(.011*s*Math.cos(a),.014*s*Math.sin(a),0)),[.0009*s,.0009*s,.0007*s],6),metal);}
      body.add('BroochStone',sphere(p.clone().add(v(0,0,.0004*s)),[.009*s,.012*s,.0025*s],look.broochStyle==='jet'?8:20),look.broochStyle==='jet'?jet:look.broochStyle==='cameo'?material('#9f624a'):stone);
      if(look.broochStyle==='cameo'){
        const shape=new THREE.Shape();shape.moveTo(-.002,-.009);shape.lineTo(.004,-.009);shape.quadraticCurveTo(.004,-.005,.001,-.003);shape.lineTo(.001,-.001);shape.lineTo(.003,0);shape.lineTo(.003,.002);shape.lineTo(.004,.003);shape.lineTo(.002,.004);shape.quadraticCurveTo(.002,.008,-.002,.008);shape.quadraticCurveTo(-.006,.008,-.005,.003);shape.lineTo(-.003,-.002);shape.lineTo(-.003,-.005);shape.closePath();
        const g=new THREE.ExtrudeGeometry(shape,{depth:.0008,bevelEnabled:true,bevelSize:.0004,bevelThickness:.0003,bevelSegments:1,steps:1,curveSegments:6});g.scale(s,s,s);g.translate(p.x,p.y,p.z+.002*s);body.add('CameoRelief',g,pearl);
      }
    }
  }
  if(look.collarStud!=='none'&&['none','original'].includes(look.neckwearStyle)&&look.broochStyle==='none'){
    const y=(fit.closureY??fit.knotY)-.009*s,p=v(0,y,fit.front.max(0,y,.005*s,.005*s)+.002*s);
    body.add('CollarStudMetal',sphere(p,[.0036*s,.0036*s,.0016*s],12),metal);
    if(look.collarStud!=='plain')body.add('CollarStudStone',sphere(p.clone().add(v(0,0,.0014*s)),[.0025*s,.0025*s,.0014*s],12),look.collarStud==='pearl'?pearl:stone);
  }
  if(look.tiePin!=='none'&&!['none','bow','ribbon','kerchief'].includes(look.neckwearStyle)){
    const y=fit.knotY-.026*s,z=fit.neckwearFront?fit.neckwearFront(y)+.001*s:(fit.shirtFront||fit.front)(0,y)+.011*s,p=v(.002*s,y,z);
    body.add('TiePinMetal',tube([p.clone().add(v(-.001*s,-.018*s,-.001*s)),p],.0004*s,1,6),metal);
    body.add('TiePinMetal',sphere(p,[.0028*s,.003*s,.0018*s],10),metal);
    if(look.tiePin!=='plain')body.add('TiePinStone',sphere(p.clone().add(v(0,0,.0013*s)),[.002*s,.002*s,.0015*s],10),look.tiePin==='pearl'?pearl:stone);
  }
  if(look.locketStyle!=='none'){
    const y=fit.knotY-.13*s,p=v(0,y,fit.front.max(0,y,.009*s,.012*s)+.0025*s),ry=(look.locketStyle==='round'?.009:.012)*s;
    const chain=Array.from({length:49},(_,i)=>{const a=i/48*Math.PI,drop=Math.sin(a),x=.045*s*Math.cos(a),yy=fit.knotY+.008*s-(.136*s-ry)*drop,z=fit.front(x,yy)+.003*s;return v(x,yy,THREE.MathUtils.lerp(z,p.z,drop**8));});
    body.add('LocketMetal',tube(chain,.00055*s,64,5),metal);
    body.add('LocketMetal',ellipse(.002*s,.003*s,p.clone().add(v(0,ry+.002*s,0)),.0005*s,16),metal);
    body.add('LocketMetal',sphere(p,[.009*s,ry,.002*s],16),metal);
    body.add('LocketMetal',ellipse(.008*s,ry*.9,p.clone().add(v(0,0,.0015*s)),.0005*s,32),metal);
    for(const sign of [-1,1])body.add('LocketMetal',tube([p.clone().add(v(0,-ry*.45,.002*s)),p.clone().add(v(sign*.003*s,0,.0025*s)),p.clone().add(v(0,ry*.45,.002*s))],.00035*s,12,4),metal);
  }
  if(look.watchChain!=='none')for(const sign of (look.watchChain==='double'?[-1,1]:[-1])){
    const curve=new THREE.CatmullRomCurve3(Array.from({length:13},(_,i)=>{const t=i/12,x=sign*(.008+.095*t)*s,y=fit.knotY-(.20+.016*t+.046*Math.sin(t*Math.PI))*s;return v(x,y,fit.front(x,y)+.005*s);}),false,'centripetal');
    for(let i=0;i<34;i++){
      const t=(i+.5)/34,p=curve.getPoint(t),tangent=curve.getTangent(t),g=ellipse(.0017*s,.0033*s,v(0,0,0),.00045*s,12,0,4);
      g.rotateY(i%2?Math.PI*.42:0);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0,1,0),tangent));g.translate(...p.toArray());body.add('WatchChainMetal',g,metal);
    }
    const a=curve.getPoint(0);body.add('WatchChainMetal',tube([a.clone().add(v(-.004*s,0,0)),a.clone().add(v(.004*s,0,0))],.0008*s,1,6),metal);
  }
  // Unused palette materials must not accumulate as looks change.
  const groups=[head.finish(),body.finish()],used=new Set(groups.flatMap(g=>g.children.map(m=>m.material)));
  for(const m of [metal,stone,pearl,jet])if(!used.has(m))m.dispose();
  return {head:groups[0],body:groups[1]};
}

export function disposeAccessories(group){if(!group)return;const materials=new Set();group.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});for(const m of materials)m.dispose();group.removeFromParent();}

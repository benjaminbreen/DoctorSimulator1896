import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {headwearMaterial} from './headwearMaterials.js';

export const ACCESSORY_DEFAULTS={glassesStyle:'none',glassesMetal:'steel',lensTint:'clear',glassesSize:0,glassesBridge:0,glassesHeight:0,glassesDepth:0,glassesWeight:0,
  neckwearStyle:'original',neckwearColor:'wine',neckwearPattern:'plain',neckwearScale:0,neckwearWear:0,
  broochStyle:'none',earringStyle:'none',locketStyle:'none',jewelryMetal:'brass',jewelryStone:'garnet',tiePin:'none',watchChain:'none',accessorySeed:1896};
export const ACCESSORY_CHOICES={
  glassesStyle:{none:'No spectacles',round:'Round wire spectacles',oval:'Oval wire spectacles','pince-nez':'Oval pince-nez',rimless:'Rimless pince-nez'},
  glassesMetal:{steel:'Steel',silver:'Silver',gold:'Gold',black:'Blackened metal'},lensTint:{clear:'Clear',blue:'Blue tinted',smoke:'Smoked',green:'Green tinted'},
  neckwearStyle:{original:'Original garment tie',none:'No neckwear',bow:'Small bow tie',tie:'Hanging silk tie',cravat:'Full cravat',kerchief:'Work neckerchief'},
  neckwearColor:{black:'Black',wine:'Wine',navy:'Navy',forest:'Forest',cream:'Ivory',ochre:'Ochre',slate:'Slate'},neckwearPattern:{plain:'Plain weave',stripe:'Fine diagonal stripe',dot:'Small spots',diamond:'Small diamonds'},
  broochStyle:{none:'No brooch',oval:'Oval stone brooch',cameo:'Cameo brooch',bar:'Bar brooch',jet:'Faceted black brooch'},
  earringStyle:{none:'No earrings',stud:'Small studs',pearl:'Pearl drops',drop:'Stone drops',jet:'Black drops'},
  locketStyle:{none:'No locket',oval:'Oval locket',round:'Round locket'},
  jewelryMetal:{brass:'Brass',gold:'Gold',silver:'Silver',steel:'Steel'},jewelryStone:{garnet:'Garnet',amber:'Amber',turquoise:'Turquoise',pearl:'Pearl',jet:'Black glass'},
  tiePin:{none:'No tie pin',plain:'Plain stickpin',pearl:'Pearl stickpin',stone:'Stone stickpin'},watchChain:{none:'No watch chain',single:'Single watch chain',double:'Double watch chain'},
};
const metals={steel:'#8b9294',silver:'#d5d3c9',gold:'#bd934b',brass:'#a8874f',black:'#393b3a'};
const stones={garnet:'#5f1823',amber:'#a96119',turquoise:'#287d80',pearl:'#d8d0b7',jet:'#171918'};
const fabrics={black:'#252327',wine:'#5b2934',navy:'#293e51',forest:'#344738',cream:'#bfb5a0',ochre:'#86623c',slate:'#59636b'};
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
function material(color,metal=false){return new THREE.MeshStandardMaterial({color,metalness:metal?.78:0,roughness:metal?.29:.28});}
function batch(name){
  const group=new THREE.Group(),batches=new Map();group.name='Patient_Accessories_'+name;
  return {group,add(name,geometry,material){const key=name;if(!batches.has(key))batches.set(key,{geometries:[],material});batches.get(key).geometries.push(geometry);},finish(){
    for(const [name,{geometries,material}]of batches){
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
  const m=headwearMaterial(fabrics[look.neckwearColor]||fabrics.wine,look.neckwearStyle==='kerchief'?'linen':'silk',look.neckwearWear);
  m.name='Accessory_NeckwearFabric';m.normalScale.set(.32,.32);
  const previous=m.onBeforeCompile;
  m.onBeforeCompile=(shader,renderer)=>{previous?.(shader,renderer);const pattern={plain:0,stripe:1,dot:2,diamond:3}[look.neckwearPattern]||0;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    #ifdef USE_MAP
    vec2 accessoryUV=vMapUv*vec2(22.0,28.0); float motif=0.0;
    ${pattern===1?'motif=1.0-smoothstep(.08,.15,abs(fract(accessoryUV.x+accessoryUV.y)-.5));':pattern===2?'motif=1.0-smoothstep(.11,.17,length(fract(accessoryUV)-.5));':pattern===3?'motif=1.0-smoothstep(.13,.20,abs(fract(accessoryUV.x)-.5)+abs(fract(accessoryUV.y)-.5));':''}
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.45+vec3(.13),motif*.55);
    #endif`);};
  m.customProgramCacheKey=()=>`accessory-cloth-${look.neckwearPattern}`;return m;
}
function panel(rows,columns=12){
  const positions=[],uv=[],indices=[];
  for(let r=0;r<rows.length;r++)for(let c=0;c<=columns;c++){const u=c/columns,point=rows[r](u);positions.push(...point.toArray());uv.push(u,r/(rows.length-1));if(r<rows.length-1&&c<columns){const a=r*(columns+1)+c;indices.push(a,a+1,a+columns+1,a+1,a+columns+2,a+columns+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function buildNeckwear(fit,look,backing=null){
  const active=!['none','original'].includes(look.neckwearStyle);if(!active&&!backing)return null;
  const b=batch('Neckwear'),s=fit.scale,size=1+look.neckwearScale*.13,y=fit.knotY,z=fit.front(0,y),fabric=active?clothMaterial(look):null;
  let scarfSurface=null;
  if(look.neckwearStyle==='kerchief'){
    const top=(fit.neckFront||fit.front).max(0,y,.040*s,.014*s)+.009*s,bottom=fit.front.max(0,y-.09*s,.020*s,.008*s)+.004*s;
    const middle=Math.max(fit.front.max(0,y-.045*s,.015*s,.006*s)+.004*s,(top+bottom)/2),control=2*middle-(top+bottom)/2;
    scarfSurface=(x,yy)=>{const t=THREE.MathUtils.clamp((y-yy)/(.09*s),0,1);return (1-t)**2*top+2*t*(1-t)*control+t*t*bottom-x*x*7.2/s;};
  }
  if(backing){
    const shirt=headwearMaterial('#d8d3c7','linen');shirt.map=null;shirt.normalScale.set(.2,.2);
    const length=(backing==='short'?.080:.17)*s;
    b.add('ShirtFacing',panel(Array.from({length:25},(_,r)=>u=>{const t=r/24,yy=y-.012*s-t*length,x=((u-.5)*.075*(1-t)+(backing==='short'?.010:.004)*t)*s;return v(x,yy,fit.front(x,yy)+.001*s);}),12),shirt);
  }
  if(active){
    if(scarfSurface)b.add('NeckwearCloth',panel(Array.from({length:13},(_,r)=>u=>{const t=r/12,yy=y+(.014-.050*t)*s,x=(u-.5)*(.100-.070*t)*s;return v(x,yy,scarfSurface(x,yy)+.001*Math.sin(u*Math.PI*4)*s);}),12),fabric);
    if(look.neckwearStyle==='bow'){
      const bowZ=fit.front.max(0,y,.041*s*size,.018*s*size)+.003*s;
      for(const sign of [-1,1])b.add('NeckwearCloth',panel(Array.from({length:13},(_,r)=>u=>{const t=r/12,xx=sign*(.005+.032*t)*s*size,h=(.006+.007*Math.sin(t*Math.PI*.6))*s*size,yy=y+(u-.5)*h*2;return v(xx,yy,bowZ+(.002+.004*Math.sin(u*Math.PI)+.001*Math.cos(t*Math.PI*2))*s);}),8),fabric);
    }else{
      const cravat=look.neckwearStyle==='cravat',kerchief=look.neckwearStyle==='kerchief',length=(kerchief?.090:cravat?.115:.14)*s*size;
      for(let tail=0;tail<(kerchief?2:1);tail++)b.add('NeckwearCloth',panel(Array.from({length:25},(_,r)=>u=>{
        const t=r/24,w=(cravat?(.018+.017*Math.sin(t*Math.PI)):(kerchief?.015:.011+.008*Math.sin(t*Math.PI*.85)))*s*size*(t>.88?(1-t)/.12:1);
        const xx=(u-.5)*w*2+(kerchief?(tail?1:-1)*.012*s*t:0),yy=y-.004*s-t*length*(tail?.86:1);
        const zz=(kerchief?scarfSurface(xx,yy):fit.front(xx,yy))+((kerchief?.001:.005)+Math.sin(u*Math.PI)*.004+(cravat?.003*Math.sin(u*Math.PI*6)*Math.sin(t*Math.PI):.0008*Math.sin(u*Math.PI*4)))*s;
        return v(xx,yy,zz);
      }),12),fabric);
    }
    const knot=new THREE.Shape();knot.moveTo(-.008,.009);knot.lineTo(.008,.008);knot.lineTo(.005,-.009);knot.lineTo(-.006,-.010);knot.closePath();
    const kg=new THREE.ExtrudeGeometry(knot,{depth:.004,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:2,steps:1});
    const ku=kg.attributes.uv,kp=kg.attributes.position;for(let i=0;i<ku.count;i++)ku.setXY(i,(kp.getX(i)+.010)/.020,(kp.getY(i)+.012)/.024);
    const kerchief=look.neckwearStyle==='kerchief',knotZ=look.neckwearStyle==='bow'?fit.front.max(0,y,.041*s*size,.018*s*size)+.003*s:kerchief?scarfSurface(0,y):z;
    kg.scale(s*size*(kerchief?1.35:1),s*size*(kerchief?1.2:1),s);kg.translate(0,y+.002*s,knotZ+.007*s);b.add('NeckwearCloth',kg,fabric);
    if(kerchief)b.add('NeckwearCloth',panel(Array.from({length:25},(_,r)=>u=>{const x=(r/24-.5)*.13*s,yy=y+(.002+u*.012)*s;return v(x,yy,scarfSurface(x,yy)+(.002+.001*Math.sin(u*Math.PI))*s);}),6),fabric);
  }
  return b.finish();
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
  if(look.tiePin!=='none'&&!['none','bow','kerchief'].includes(look.neckwearStyle)){
    const y=fit.knotY-.026*s,z=fit.front(0,y)+.011*s,p=v(.002*s,y,z);
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

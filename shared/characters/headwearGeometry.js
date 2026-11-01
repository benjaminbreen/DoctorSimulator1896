import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {headwearMaterial,headwearFeatherMaterial} from './headwearMaterials.js';

export const HAT_DESIGN_RADIUS = .095;
export const HEADWEAR_STYLES = {
  'cloth-cap': {label:'Cloth work cap',cohort:'men',classes:['working'],form:'cap',fabric:'wool',height:.069,brim:.032,trim:0},
  'panel-cap': {label:'Panelled cloth cap',cohort:'men',classes:['working','middle'],form:'cap',fabric:'wool',height:.076,brim:.034,panels:8,trim:0},
  bowler: {label:'Felt derby / bowler',cohort:'men',classes:['working','middle','affluent'],form:'dome',fabric:'felt',height:.094,brim:.033,curl:.012,trim:0},
  homburg: {label:'Soft felt Homburg',cohort:'men',classes:['middle','affluent'],form:'creased',fabric:'felt',height:.095,brim:.039,curl:.015,trim:0},
  'top-hat': {label:'Silk top hat',cohort:'men',classes:['middle','affluent'],form:'top',fabric:'silk',height:.135,brim:.032,curl:.009,trim:0},
  boater: {label:'Straw boater',cohort:'men',classes:['working','middle','affluent'],form:'flat',fabric:'straw',height:.055,brim:.044,curl:0,trim:0},
  'work-straw': {label:'Broad work straw',cohort:'men',classes:['working'],form:'dome',fabric:'straw',height:.074,brim:.068,curl:-.009,trim:0},
  'peaked-cap': {label:'Service cap',cohort:'men',classes:['working','middle'],form:'peaked',fabric:'wool',height:.050,brim:.038,trim:0},
  'plain-straw': {label:'Plain straw hat',cohort:'women',classes:['working','middle'],form:'dome',fabric:'straw',height:.061,brim:.057,curl:-.006,trim:.2},
  'sailor-hat': {label:'Ribbon sailor hat',cohort:'women',classes:['working','middle','affluent'],form:'flat',fabric:'straw',height:.045,brim:.052,curl:0,trim:.35},
  'walking-hat': {label:'Trimmed walking hat',cohort:'women',classes:['middle','affluent'],form:'creased',fabric:'felt',height:.071,brim:.049,curl:.016,trim:.6,tilt:.10},
  'picture-hat': {label:'Flower-trimmed straw hat',cohort:'women',classes:['middle','affluent'],form:'dome',fabric:'straw',height:.058,brim:.069,curl:.015,trim:1,tilt:.12},
  toque: {label:'Velvet toque',cohort:'women',classes:['middle','affluent'],form:'toque',fabric:'velvet',height:.084,brim:.009,curl:.003,trim:.8,tilt:.08},
  'ribbon-bonnet': {label:'Ribbon capote bonnet',cohort:'women',classes:['middle','affluent'],form:'bonnet',fabric:'velvet',height:.044,brim:.022,curl:.008,trim:.65,fastener:'ties'},
  'mourning-bonnet': {label:'Black mourning bonnet',cohort:'women',classes:['working','middle','affluent'],form:'bonnet',fabric:'velvet',height:.045,brim:.022,curl:.008,trim:.2,fastener:'ties',veil:true},
  'work-bonnet': {label:'Plain cloth work bonnet',cohort:'women',classes:['working'],form:'bonnet',fabric:'linen',height:.055,brim:.027,curl:.006,trim:0,fastener:'ties'},
};

export const HEADWEAR_COLORS = {
  black:'#242322',charcoal:'#42413d',brown:'#594434',navy:'#303d4c',olive:'#62654c',
  wine:'#623b46',plum:'#51435a',ivory:'#ded4bb',straw:'#bea97f',cream:'#d9c9a4',
};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
function random(seed){
  let s=(Number(seed)||1896)>>>0;
  s=Math.imul(s^(s>>>16),0x85ebca6b);s=Math.imul(s^(s>>>13),0xc2b2ae35);s^=s>>>16;
  return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
}

export function headwearVariation(seed,cohort='men',socialClass='working'){
  const rng=random(seed),pick=a=>a[Math.floor(rng()*a.length)];
  const styles=Object.keys(HEADWEAR_STYLES).filter(id=>HEADWEAR_STYLES[id].cohort===cohort&&HEADWEAR_STYLES[id].classes.includes(socialClass));
  const hatStyle=pick(styles),style=HEADWEAR_STYLES[hatStyle];
  return {hatStyle,hatSeed:seed,hatColor:style.veil?'black':style.fabric==='straw'?pick(['straw','cream','ivory']):pick(['black','charcoal','brown','navy','olive']),
    hatBandColor:pick(['black','brown','navy','wine','plum']),hatCrownHeight:rng()*.8-.4,hatBrimWidth:rng()*.8-.4,
    hatTilt:rng()*.6-.3,hatDecoration:style.trim*clamp(.7+rng()*.5,0,1),hatWear:socialClass==='working'?.25+rng()*.5:rng()*.25};
}

let netTexture;
function surfaceTexture(){
  if(netTexture)return netTexture;
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,n=(x%16<2||y%16<2)?255:0;
    data[i]=data[i+1]=data[i+2]=210;data[i+3]=n;
  }
  netTexture=new THREE.DataTexture(data,size,size);netTexture.wrapS=netTexture.wrapT=THREE.RepeatWrapping;
  netTexture.generateMipmaps=true;netTexture.minFilter=THREE.LinearMipmapLinearFilter;netTexture.needsUpdate=true;return netTexture;
}

function cloth(color,kind,wear=0){
  return headwearMaterial(HEADWEAR_COLORS[color]||color||'#34302b',kind,wear);
}

function ribbonGeometry(points,width,segments=24,twist=0){
  const curve=new THREE.CatmullRomCurve3(points),positions=[],uvs=[],indices=[];
  for(let i=0;i<=segments;i++){
    const t=i/segments,p=curve.getPoint(t),tangent=curve.getTangent(t);
    const across=new THREE.Vector3(0,0,1).cross(tangent).normalize();
    if(across.lengthSq()<.1)across.set(1,0,0);
    across.applyAxisAngle(tangent,twist*Math.sin(t*Math.PI));
    for(const sign of [-1,1]){positions.push(...p.clone().addScaledVector(across,width*.5*sign).toArray());uvs.push(sign===-1?0:width/.064,t*curve.getLength()/.064);}
    if(i<segments){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function buildHeadwear(look={}){
  const id=look.hatStyle==='widow-cap'?'mourning-bonnet':look.hatStyle;
  if(!id||id==='none')return null;
  const style=HEADWEAR_STYLES[id];if(!style)throw Error(`Unknown hat style: ${id}`);
  const rng=random(look.hatSeed),wear=clamp(Number(look.hatWear)||0,0,1),trim=clamp(look.hatDecoration??style.trim,0,1);
  const crown=style.height*(1+clamp(Number(look.hatCrownHeight)||0,-1,1)*.25);
  const brim=style.brim*(1+clamp(Number(look.hatBrimWidth)||0,-1,1)*.45);
  const color=look.hatColor||(style.veil?'black':style.fabric==='straw'?'straw':style.fabric==='linen'?'cream':'charcoal');
  const fabric=cloth(color,style.fabric,wear),band=cloth(look.hatBandColor||'black','grosgrain',wear),lining=cloth('#554735','silk');
  const edge=cloth(new THREE.Color(HEADWEAR_COLORS[color]||color).multiplyScalar(.75),style.fabric,wear);
  const thread=new THREE.MeshStandardMaterial({color:fabric.color.clone().lerp(new THREE.Color('#b6a58b'),.14),roughness:.95,side:THREE.DoubleSide});
  const bandThread=thread.clone();bandThread.color.copy(band.color).lerp(new THREE.Color('#95836d'),.12);
  const group=new THREE.Group();group.name='PatientHat';group.userData.style=id;
  const add=(geometry,material,position=[0,0,0])=>{
    if(geometry.attributes.uv)geometry.setAttribute('uv1',geometry.attributes.uv);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const R=HAT_DESIGN_RADIUS;
  const bonnetDrop=(z)=>style.form==='bonnet'?.045*clamp((1-z/R)/2,0,1):0;
  let crownProfile;
  function crownRadiusAt(y){
    if(!crownProfile)return R*.97;
    for(let i=1;i<crownProfile.length;i++){
      const [a,b]=[crownProfile[i-1],crownProfile[i]];if(y<a[1]||y>b[1]||b[1]===a[1])continue;
      return THREE.MathUtils.lerp(a[0],b[0],(y-a[1])/(b[1]-a[1]));
    }return R;
  }
  function stitches(curve,material=edge){
    const positions=[],indices=[],count=Math.ceil(curve.getLength()/.0038);
    for(let i=0;i<count;i++){
      const a=curve.getPoint(i/count),b=curve.getPoint((i+.5)/count),across=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3(0,1,0));
      if(across.lengthSq()<1e-9)across.set(.0002,0,0);else across.normalize().multiplyScalar(.0002);
      const k=positions.length/3;for(const [p,s] of [[a,-1],[a,1],[b,-1],[b,1]])positions.push(...p.clone().addScaledVector(across,s).toArray());
      indices.push(k,k+1,k+2,k+1,k+3,k+2);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();add(g,material===band?bandThread:thread);
  }
  function brimPoint(t,a){
    const extension=style.form==='bonnet'?brim*(.15+.85*(1+Math.cos(a))/2):brim;
    const r=R+extension*t;
    let curl=(style.curl||0);
    if(['bowler','homburg','top-hat','walking-hat'].includes(id))curl*=.3-.7*Math.cos(a*2);
    const wave=(id==='picture-hat'?.007*Math.sin(a*2+.5)+.004*Math.cos(a*3):0)+wear*.002*Math.sin(a*5+1);
    const frill=id==='work-bonnet'?.013*t*t*(.5+.5*Math.cos(a))+.0028*Math.sin(a*24)*Math.sin(t*Math.PI/2):0;
    return new THREE.Vector3(Math.sin(a)*r,curl*t**3+wave*t*t+frill-bonnetDrop(Math.cos(a)*R),Math.cos(a)*r);
  }
  function capPoint(t,a){
    const fullness=style.panels?.12:.055,r=R*Math.sin(t*Math.PI/2)*(1+fullness*Math.sin(t*Math.PI));
    const panels=style.panels?1+.025*Math.cos(a*8)*Math.sin(t*Math.PI):1;
    return new THREE.Vector3(Math.sin(a)*r*panels,
      crown*Math.pow(Math.cos(t*Math.PI/2),.8)*(1-.55*Math.max(0,Math.cos(a)*r/R)),
      Math.cos(a)*r*panels-(style.panels?.008:.018)*(1-t)+.012*Math.max(0,Math.cos(a))*Math.sin(t*Math.PI));
  }
  function lathe(profile,material= fabric){
    const geometry=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),64);
    if(style.form==='bonnet'){
      const p=geometry.attributes.position;
      for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)-bonnetDrop(p.getZ(i))*Math.pow(clamp(1-p.getY(i)/crown,0,1),1.3));
      geometry.computeVertexNormals();
    }
    const uv=geometry.attributes.uv;
    let length=0;for(let i=1;i<profile.length;i++)length+=Math.hypot(profile[i][0]-profile[i-1][0],profile[i][1]-profile[i-1][1]);
    for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*2*R/.064,uv.getY(i)*length/.064);
    return add(geometry,material);
  }
  function bow(position,size=.033){
    const start=group.children.length;
    const geometries=[];
    for(const sign of [-1,1]){
      const p=(x,y,z)=>new THREE.Vector3(position[0]+x*size*sign,position[1]+y*size,position[2]+z*size);
      geometries.push(ribbonGeometry([p(0,0,0),p(.8,.38,.15),p(1.12,.13,-.10),p(.65,-.22,-.16),p(0,0,0)],size*.38,20,.7*sign));
      geometries.push(ribbonGeometry([p(.05,-.03,0),p(.2,-.65,-.03),p(.4,-1.05,.08)],size*.34,12,.4));
    }
    add(mergeGeometries(geometries),band);geometries.forEach(g=>g.dispose());
    add(new THREE.SphereGeometry(size*.18,12,8),band,position).scale.set(.8,1,.7);
    const container=new THREE.Group();container.add(...group.children.slice(start));group.add(container);return container;
  }
  function flowers(count){
    const petals=[],leaves=[];
    crownMesh.updateWorldMatrix(true,false);
    for(let n=0;n<count;n++){
      const angle=-.8+n*.22,origin=new THREE.Vector3(Math.sin(angle)*R,crown*.75+Math.sin(n*2)*.012,Math.cos(angle)*R*.7);
      const surface=new THREE.Raycaster(new THREE.Vector3(origin.x,crown+.08,origin.z),new THREE.Vector3(0,-1,0)).intersectObject(crownMesh)[0];
      origin.y=(surface?.point.y??crown)+.010+Math.sin(n*2)*.002;
      for(let ring=0;ring<4;ring++)for(let j=0;j<5+ring;j++){
        const a=j/(5+ring)*Math.PI*2+n*.6+ring*.4,rad=.001+ring*.0024,width=.003+ring*.0014,positions=[],uvs=[],indices=[],colors=[];
        for(let row=0;row<=5;row++)for(let col=0;col<=4;col++){
          const t=row/5,s=col/4*2-1,along=rad+t*(.008+ring*.0013);
            const p=new THREE.Vector3(Math.cos(a)*along+Math.sin(a)*s*width*Math.sin(Math.PI*t),
            .004+.006*Math.sin(t*Math.PI)+.003*t*t-ring*.0012-s*s*.002,
            Math.sin(a)*along-Math.cos(a)*s*width*Math.sin(Math.PI*t)).applyAxisAngle(new THREE.Vector3(1,0,0),.6).add(origin);
          positions.push(...p.toArray());uvs.push(col/4*.2,t*.2);const shade=.8+ring*.04+t*.06;colors.push(shade,shade,shade);
          if(row<5&&col<4){const k=row*5+col;indices.push(k,k+1,k+5,k+1,k+6,k+5);}
        }
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();petals.push(g);
      }
      const leaf=new THREE.SphereGeometry(.014,12,6);leaf.scale(1,.15,.35);leaf.rotateY(n);leaf.translate(origin.x+.016,origin.y-.01,origin.z);leaves.push(leaf);
    }
    if(petals.length){const material=cloth(['#a87580','#887c9a','#c1ab8b'][Math.floor(rng()*3)],'silk');material.vertexColors=true;add(mergeGeometries(petals),material);petals.forEach(g=>g.dispose());}
    if(leaves.length){add(mergeGeometries(leaves),cloth('#546348','linen'));leaves.forEach(g=>g.dispose());}
  }
  function feather(position,height,angle){
    const material=headwearFeatherMaterial(style.fabric==='straw'?'#45484c':'#a99b85');
    for(const depth of [-.22,.22]){
      const points=[],uvs=[],indices=[];
      for(let i=0;i<=36;i++){
        const t=i/36,center=new THREE.Vector3(.18*height*t*t,t*height,-t*t*height*.48);
        for(const sign of [-1,1]){
          const p=center.clone().add(new THREE.Vector3(sign*height*.22,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),depth));
          p.applyAxisAngle(new THREE.Vector3(0,0,1),angle).add(new THREE.Vector3(...position));points.push(...p.toArray());uvs.push(sign===-1?0:1,t);
        }
        if(i<36){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();add(g,material);
    }
    const shaft=[];for(let i=0;i<=12;i++){const t=i/12;shaft.push(new THREE.Vector3(.18*height*t*t,t*height,-t*t*height*.48).applyAxisAngle(new THREE.Vector3(0,0,1),angle).add(new THREE.Vector3(...position)));}
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(shaft),24,.00035,5,false),new THREE.MeshStandardMaterial({color:style.fabric==='straw'?'#484441':'#766e61',roughness:.85}));
  }
  let crownMesh;
  if(style.form==='cap'){
    const positions=[],uvs=[],indices=[],segments=64,rows=20;
    for(let row=0;row<=rows;row++)for(let col=0;col<=segments;col++){
      const t=row/rows,a=col/segments*Math.PI*2;positions.push(...capPoint(t,a).toArray());
      uvs.push(col/segments*Math.PI*2*R/.064,t*.14/.064);if(row<rows&&col<segments){const k=row*(segments+1)+col;indices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    const normal=g.attributes.normal,average=new THREE.Vector3();for(let i=0;i<=segments;i++)average.add(new THREE.Vector3().fromBufferAttribute(normal,i));average.normalize();
    for(let i=0;i<=segments;i++)normal.setXYZ(i,...average.toArray());crownMesh=add(g,fabric);
    const seams=[];
    for(let n=0;n<(style.panels||4);n++){
      const a=n/(style.panels||4)*Math.PI*2,points=[];
      for(let j=0;j<=16;j++)points.push(capPoint(j/16,a).add(new THREE.Vector3(0,.0005,0)));
      const path=new THREE.CatmullRomCurve3(points);seams.push(new THREE.TubeGeometry(path,16,.0003,4,false));stitches(path,edge);
    }
    add(mergeGeometries(seams),edge);seams.forEach(g=>g.dispose());
    if(style.panels)add(new THREE.SphereGeometry(.003,12,8),fabric,[0,crown+.001,-.008]).scale.y=.55;
  }else{
    let profile;
    if(style.form==='top')profile=[[R,0],[R*.97,crown*.12],[R*.93,crown*.55],[R*1.035,crown*.96],[R*1.035,crown],[0,crown]];
    else if(['flat','peaked'].includes(style.form))profile=[[R,0],[R*1.025,crown*.92],[R,crown],[0,crown]];
    else if(style.form==='toque')profile=[[R,0],[R*1.02,crown*.25],[R*.96,crown*.7],[R*.75,crown*.94],[0,crown]];
    else profile=Array.from({length:20},(_,i)=>{const t=i/19*Math.PI/2;return[R*Math.cos(t),crown*Math.pow(Math.sin(t),.8)];});
    crownProfile=profile;
    const mesh=lathe(profile);
    crownMesh=mesh;
    if(style.form==='creased'){
      const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setY(i,y-.019*smooth(crown*.55,crown*.94,y)*Math.exp(-((x/.023)**2))*Math.max(0,1-(z/R)**4));}mesh.geometry.computeVertexNormals();
    }
    if(style.form==='bonnet'){
      const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),z=p.getZ(i),angle=Math.atan2(x,z),gather=id==='work-bonnet'?(1+Math.sin(angle*18))*.0018:Math.sin(angle*18)*.0017;
        const fold=gather*Math.pow(Math.hypot(x,z)/R,3);
        p.setXYZ(i,x+Math.sin(angle)*fold,p.getY(i)+fold*.4,z+Math.cos(angle)*fold);
      }mesh.geometry.computeVertexNormals();
    }
    if(['top','flat','peaked'].includes(style.form)){
      const original=mesh.geometry,g=original.toNonIndexed(),p=g.attributes.position,uv=g.attributes.uv,normal=g.attributes.normal;
      for(let i=0;i<p.count;i+=3)if([0,1,2].every(j=>p.getY(i+j)>=crown-.00001))for(let j=0;j<3;j++){
        uv.setXY(i+j,p.getX(i+j)/.064,p.getZ(i+j)/.064);normal.setXYZ(i+j,0,1,0);
      }
      mesh.geometry=g;original.dispose();
    }
  }
  if(['cap','peaked'].includes(style.form)){
    const positions=[],uvs=[],indices=[];
    for(let row=0;row<=8;row++)for(let col=0;col<=28;col++){
      const v=row/8,u=col/28*2-1,x=u*R*.90,z=Math.sqrt(R*R-x*x)*.8+(brim+.012)*v*Math.pow(Math.max(0,1-u*u),.6),y=.007*(1-u*u)-.014*v;
      positions.push(x,y,z);uvs.push(x/.064,z/.064);if(row<8&&col<28){const a=row*29+col;indices.push(a,a+1,a+29,a+1,a+30,a+29);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();add(g,style.form==='peaked'?cloth('#292721','leather',wear):fabric).name='PatientHat_Peak';
    const bottom=g.clone();bottom.translate(0,-.002,0);add(bottom,edge);
  }else{
    const positions=[],uvs=[],indices=[],rows=8,segments=80;
    for(let row=0;row<=rows;row++)for(let col=0;col<=segments;col++){
      const t=row/rows,a=col/segments*Math.PI*2;
      const p=brimPoint(t,a);positions.push(...p.toArray());
      const tile=style.fabric==='straw'?Math.max(.36,(R+brim+.003)*2):.064;
      uvs.push(p.x/tile+.5,p.z/tile+.5);
      if(row<rows&&col<segments){const k=row*(segments+1)+col;indices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2);}
    }
    const brimFabric=style.fabric==='straw'?cloth(color,'straw-coil',wear):fabric;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();add(g,brimFabric).name='PatientHat_Brim';
    const underside=g.clone();underside.translate(0,-.0022,0);add(underside,brimFabric);
    const rim=Array.from({length:81},(_,i)=>brimPoint(1,i/80*Math.PI*2).add(new THREE.Vector3(0,-.001,0)));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim),80,.0017,6,false),style.fabric==='straw'?edge:style.form==='bonnet'?edge:band);
    if(style.fabric!=='straw')stitches(new THREE.CatmullRomCurve3(Array.from({length:81},(_,i)=>brimPoint(.91,i/80*Math.PI*2).add(new THREE.Vector3(0,.0007,0)))));
  }
  // A straight inner ring cuts through the crown's taper and gathers.
  lathe(Array.from({length:9},(_,i)=>{const y=-.007+i*.029/8;return [crownRadiusAt(Math.max(0,y))-.0035,y];}),cloth('#725540','leather',wear)).name='PatientHat_Sweatband';
  const inner=crownMesh.geometry.clone(),ip=inner.attributes.position,normal=inner.attributes.normal;
  crownMesh.name='PatientHat_Crown';
  for(let i=0;i<ip.count;i++)ip.setXYZ(i,ip.getX(i)-normal.getX(i)*.0012,ip.getY(i)-normal.getY(i)*.0012,ip.getZ(i)-normal.getZ(i)*.0012);
  const inside=lining.clone();inside.side=THREE.BackSide;add(inner,inside);
  if(style.form!=='cap'&&style.form!=='bonnet'){
    const radiusAt=y=>crownRadiusAt(y)+.001;
    const height=Math.min(.027,crown*.44),profile=Array.from({length:9},(_,i)=>{const y=.004+height*i/8;return [radiusAt(y),y];});
    lathe(profile,band);
    for(const y of [.005,height+.003])stitches(new THREE.CatmullRomCurve3(Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2;return new THREE.Vector3(Math.sin(a)*(radiusAt(y)+.0003),y,Math.cos(a)*(radiusAt(y)+.0003));})),band);
  }
  if(style.form==='peaked')add(new THREE.SphereGeometry(.007,14,10),new THREE.MeshStandardMaterial({color:'#9b7c43',roughness:.5,metalness:.55}),[0,.027,R*1.03]).scale.set(.8,1,.22);
  if(trim>.12&&style.cohort==='women')bow([-.079,crown*.45,.045],.023+trim*.014);
  if(trim>.4){flowers(Math.max(1,Math.round(trim*3)));if(!style.fastener)for(let i=0;i<Math.round(trim*2);i++)feather([-.066+i*.012,crown*.65,-.018],.075+trim*.055,-.25-i*.22);}
  if(style.veil){
    const positions=[],uvs=[],indices=[];
    for(let row=0;row<=12;row++)for(let col=0;col<=32;col++){
      const v=row/12,a=Math.PI/2+col/32*Math.PI,r=R+.012*v;
      positions.push(Math.sin(a)*r,-.115*v,Math.cos(a)*r-.008*v);uvs.push(col/32*8,v*5);
      if(row<12&&col<32){const k=row*33+col;indices.push(k,k+1,k+33,k+1,k+34,k+33);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    add(g,new THREE.MeshStandardMaterial({color:'#25232a',map:surfaceTexture('net'),alphaTest:.4,side:THREE.DoubleSide,roughness:1}));
  }
  const ties=[];let tieBow=null;
  if(style.fastener==='ties'){
    for(const side of [-1,1]){
      const mesh=add(ribbonGeometry([new THREE.Vector3(side*.087,-.020,.012),new THREE.Vector3(side*.073,-.085,.055),new THREE.Vector3(side*.005,-.17,.075)],.018),band);
      ties.push({mesh,side});
    }
    tieBow=bow([0,-.17,.075],.018);
  }
  if(['cap','peaked'].includes(style.form))group.userData.gripPoints={right:[-R*.96,.005,.027],left:[R*.96,.005,.027]};
  else{
    const angle=Math.atan2(R+brim*.55,.027);
    group.updateMatrixWorld(true);
    const grip=a=>{
      const target=brimPoint(.55,a),origin=target.clone().add(new THREE.Vector3(0,.05,0));
      return (new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0)).intersectObject(group.getObjectByName('PatientHat_Brim'))[0]?.point||target).toArray();
    };
    group.userData.gripPoints={right:grip(-angle),left:grip(angle)};
  }
  group.userData.gripPoint=group.userData.gripPoints.right;
  group.userData.crownHeight=crown;group.userData.brimWidth=brim;group.userData.fastener=style.fastener||'pin';
  group.userData.releaseTies=(amount)=>{
    if(tieBow){tieBow.scale.setScalar(1-smooth(0,.6,amount));tieBow.visible=amount<.6;}
    for(const {mesh,side} of ties){
      const end=new THREE.Vector3(side*(.005+.085*amount),-.17+.035*amount,.075-.055*amount);
      const geometry=ribbonGeometry([new THREE.Vector3(side*.087,-.020,.012),new THREE.Vector3(side*(.073+.026*amount),-.085,.055-.028*amount),end],.018);
      mesh.geometry.dispose();mesh.geometry=geometry;
    }
  };
  return group;
}

export function disposeHeadwear(hat){
  const materials=new Set();hat?.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
  materials.forEach(m=>m.dispose());hat?.removeFromParent();
}

// Rebuild the thin blanket from the saved source, with one restrained Loop
// subdivision pass. The sofa and its textures stay in their original form.
import { mkdir, writeFile } from 'node:fs/promises';
import { prune } from '@gltf-transform/functions';
import { createIO, compressAccessors } from '../lib/glb-pipeline.mjs';
const source='assets/source/sofa-blanket-repair-2026-10-31/victorian_style_sofa-before.glb';
const output='game/public/models/props/victorian_style_sofa.glb';
const io=await createIO(),document=await io.read(source),root=document.getRoot();
const mesh=root.listMeshes().find(m=>m.getName().includes('blanket'));
if(!mesh)throw Error('Missing blanket mesh');
const primitive=mesh.listPrimitives()[0],array=primitive.getAttribute('POSITION').getArray();
const positions=Array.from({length:array.length/3},(_,i)=>Array.from(array.slice(i*3,i*3+3)));
const indices=primitive.getIndices().getArray(),faces=Array.from({length:indices.length/3},(_,i)=>Array.from(indices.slice(i*3,i*3+3)));
const neighbors=positions.map(()=>new Set()),edges=new Map();
for(const [a,b,c] of faces)for(const [u,v,w] of [[a,b,c],[b,c,a],[c,a,b]]){
  neighbors[u].add(v);neighbors[v].add(u);
  const key=[u,v].sort((a,b)=>a-b).join(',');
  if(!edges.has(key))edges.set(key,{a:u,b:v,opposite:[]});
  edges.get(key).opposite.push(w);
}
const boundary=positions.map(()=>[]);
for(const edge of edges.values())if(edge.opposite.length===1){boundary[edge.a].push(edge.b);boundary[edge.b].push(edge.a);}
function restrained(origin,target){
  const distance=Math.hypot(...target.map((n,i)=>n-origin[i]));
  return target.map((n,i)=>origin[i]+(n-origin[i])*Math.min(1,.012/Math.max(distance,.000001)));
}
const refined=positions.map((point,i)=>{
  const border=boundary[i],adjacent=[...neighbors[i]],n=adjacent.length;
  const beta=n===3?3/16:3/(8*n);
  return restrained(point,point.map((value,axis)=>border.length===2
    ?value*.75+(positions[border[0]][axis]+positions[border[1]][axis])*.125
    :value*(1-n*beta)+adjacent.reduce((sum,j)=>sum+positions[j][axis]*beta,0)));
});
for(const edge of edges.values()){
  const midpoint=positions[edge.a].map((value,i)=>(value+positions[edge.b][i])/2);
  const target=edge.opposite.length===2?midpoint.map((value,i)=>value*.75+(positions[edge.opposite[0]][i]+positions[edge.opposite[1]][i])*.125):midpoint;
  edge.index=refined.length;refined.push(restrained(midpoint,target));
}
const edgeIndex=(a,b)=>edges.get([a,b].sort((a,b)=>a-b).join(',')).index;
const triangles=[];
for(const [a,b,c] of faces){const ab=edgeIndex(a,b),bc=edgeIndex(b,c),ca=edgeIndex(c,a);triangles.push(a,ab,ca, ab,b,bc, ca,bc,c, ab,bc,ca);}
const normals=refined.map(()=>[0,0,0]);
for(let i=0;i<triangles.length;i+=3){
  const ids=triangles.slice(i,i+3),[a,b,c]=ids.map(j=>refined[j]),u=b.map((n,k)=>n-a[k]),v=c.map((n,k)=>n-a[k]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  for(const j of ids)for(let k=0;k<3;k++)normals[j][k]+=normal[k];
}
for(const normal of normals){const length=Math.hypot(...normal)||1;for(let i=0;i<3;i++)normal[i]/=length;}
const buffer=root.listBuffers()[0];
primitive.setAttribute('POSITION',document.createAccessor().setType('VEC3').setArray(new Float32Array(refined.flat())).setBuffer(buffer));
primitive.setAttribute('NORMAL',document.createAccessor().setType('VEC3').setArray(new Float32Array(normals.flat())).setBuffer(buffer));
primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint16Array(triangles)).setBuffer(buffer));
primitive.getMaterial().setDoubleSided(true).setRoughnessFactor(.95);
await document.transform(prune({keepAttributes:true,keepLeaves:true}));
await compressAccessors(document,null);await io.write(output,document);
await mkdir('artifacts/models/sofa-blanket',{recursive:true});
await writeFile('artifacts/models/sofa-blanket/repair.json',JSON.stringify({source,output,before:faces.length,after:triangles.length/3,maxMovementMetres:.012},null,2));
console.log('SOFA_BLANKET_REFINED',faces.length,triangles.length/3);

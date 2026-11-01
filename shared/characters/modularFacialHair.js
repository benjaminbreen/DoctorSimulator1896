export const MODULAR_SIDEBURNS = { none:'None', 'short-sideburns':'Short sideburns', 'long-sideburns':'Long sideburns', 'mutton-chops':'Mutton chops' };
export const MODULAR_MOUSTACHES = { none:'Clean upper lip', 'neat-moustache':'Neat moustache', 'full-moustache':'Full moustache', 'handlebar-moustache':'Turned moustache' };

export function createModularFacialHair(root) {
  const parts=[];
  root.traverse(mesh=>{
    const id=[...Object.keys(MODULAR_SIDEBURNS),...Object.keys(MODULAR_MOUSTACHES)].find(id=>id!=='none'&&mesh.name?.startsWith('Patient_FacialHair_'+id.replaceAll('-','_')));
    if(id)parts.push({mesh,id,moustache:Boolean(MODULAR_MOUSTACHES[id])});
  });
  return {available:parts.length>0,update({sideburns='short-sideburns',moustache='none'}={}) {
    for(const {mesh,id,moustache:upperLip} of parts)mesh.visible=id===(upperLip?moustache:sideburns);
  }};
}

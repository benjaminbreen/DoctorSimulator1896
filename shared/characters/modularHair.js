import {MeshDepthMaterial,MeshDistanceMaterial,RGBADepthPacking,Float32BufferAttribute} from 'three';

export const MODULAR_HAIR_STYLES = {
  'short-side-part': 'Short side part',
  'receding-sweep': 'Receding sweep',
  bald: 'Bald',
  'center-chignon': 'Centre-parted chignon',
  'waved-knot': 'Waved knot',
  'braided-knot': 'Braided knot',
  'soft-side-waves': 'Soft side waves',
  'curled-side-rolls': 'Curled side rolls',
};

export const MODULAR_HAIR_CONTROLS = {
  hairVolume: { label: 'Hair volume', morph: 'rc_hairVolume', min: -.4, max: 1 },
  hairWave: { label: 'Hair waves', morph: 'rc_hairWave', min: -.3, max: 1 },
  hairBunHeight: { label: 'Bun height', morph: 'rc_hairBunHeight', min: -.5, max: .8 },
  hairPartOffset: { label: 'Part position', morph: 'rc_hairPartOffset', min: -.7, max: .7 },
  hairEarCoverage: { label: 'Ear coverage', morph: 'rc_hairEarCoverage', min: -.7, max: 1 },
  hairlineHeight: { label: 'Hairline height', morph: 'rc_hairlineHeight', min: -.2, max: 1 },
  hairlinePeak: { label: 'Central peak', morph: 'rc_hairlinePeak', min: -.6, max: 1 },
  hairlineRecession: { label: 'Temple recession', morph: 'rc_hairlineRecession', min: -.15, max: 1 },
  hairlineAsymmetry: { label: 'Hairline asymmetry', morph: 'rc_hairlineAsymmetry', min: -1, max: 1 },
  hairThinning: { label: 'Crown hair loss', morph:'rc_hairThinning', min: 0, max: 1 },
};

export function createModularHair(root) {
  const parts = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    const style = Object.keys(MODULAR_HAIR_STYLES).find(id => {
      for (let owner = object; owner && owner !== root; owner = owner.parent) {
        if (owner.name?.startsWith(`Carmela_HairStyle_${id.replaceAll('-', '_')}`)) return true;
      }
      return false;
    });
    if (style && !object.name.startsWith('Carmela_HairStyle_')) object.name = `Carmela_HairStyle_${style.replaceAll('-', '_')}_${object.name}`;
    if (style) parts.push({ object, style });
  });
  const styles = [...new Set(parts.map(part => part.style))];
  if (styles.includes('short-side-part')) styles.push('bald');
  const thinning = {value:0}, depths=[];
  for(const {object,style} of parts){
    if(!['short-side-part','receding-sweep'].includes(style)||(object.name.endsWith('_part_part')||object.name.endsWith('_sweep_part')))continue;
    const uv=object.geometry.attributes.uv;
    if(!uv||!object.material?.map)continue;
    object.geometry.setAttribute('groomRow',new Float32BufferAttribute(Array.from({length:uv.count},(_,i)=>(1-uv.getY(i))/1.7),1));
    const depth=new MeshDepthMaterial({depthPacking:RGBADepthPacking,map:object.material.map});
    const distance=new MeshDistanceMaterial({map:object.material.map});
    object.customDepthMaterial=depth;object.customDistanceMaterial=distance;depths.push(depth,distance);
    for(const material of [object.material,depth,distance]){
      if(material.userData.crownHairLoss)continue;
      material.userData.crownHairLoss=true;
      const previous=material.onBeforeCompile;
      material.onBeforeCompile=(shader,renderer)=>{
        previous?.(shader,renderer);shader.uniforms.groomCrownLoss=thinning;
        shader.vertexShader='attribute float groomRow; varying float vGroomRow;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGroomRow=groomRow;');
        shader.fragmentShader='uniform float groomCrownLoss; varying float vGroomRow;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
#ifdef USE_MAP
float groomRow=clamp(vGroomRow,0.0,1.0);
float groomEdge=.014*sin(vMapUv.x*77.0)+.008*sin(vMapUv.x*133.0);
float groomCut=groomCrownLoss*(.65+groomEdge);
float groomFade=max(.0001,.07*groomCrownLoss);
float groomCoverage=smoothstep(groomCut-groomFade,groomCut+groomFade,groomRow);
float groomNoise=fract(sin(dot(floor(vMapUv*vec2(1800.0,1000.0)),vec2(12.9898,78.233)))*43758.5453);
if(groomCrownLoss>0.0 && groomNoise>groomCoverage)discard;
#endif`);
      };
      material.customProgramCacheKey=()=>`groom-crown-loss-v1-${material.type}`;
      material.needsUpdate=true;
    }
  }
  return {
    available: parts.length > 0,
    styles,
    controls: Object.keys(MODULAR_HAIR_CONTROLS).filter(name=>name==='hairThinning'?styles.includes('bald'):parts.some(({object})=>object.morphTargetDictionary?.[MODULAR_HAIR_CONTROLS[name].morph]!==undefined)),
    dispose(){for(const material of depths)material.dispose();},
    update(look = {}) {
      thinning.value=Math.max(0,Math.min(1,Number(look.hairThinning)||0));
      const selected = styles.includes(look.hairStyle) ? look.hairStyle : styles[0];
      for (const { object, style } of parts) {
        object.visible = style === selected;
        if((object.name.endsWith('_part_part')||object.name.endsWith('_sweep_part'))&&thinning.value>.1)object.visible=false;
        if (!object.morphTargetDictionary) continue;
        const corrective=object.morphTargetDictionary.rc_hairlineHeightRecession;
        if(corrective!==undefined)object.morphTargetInfluences[corrective]=Math.max(0,Math.min(1,Number(look.hairlineHeight)||0))*Math.max(0,Math.min(1,Number(look.hairlineRecession)||0));
        for (const [name, control] of Object.entries(MODULAR_HAIR_CONTROLS)) {
          const index = object.morphTargetDictionary[control.morph];
          if (index !== undefined) object.morphTargetInfluences[index] = Math.max(control.min, Math.min(control.max, Number(look[name]) || 0));
        }
      }
    },
  };
}

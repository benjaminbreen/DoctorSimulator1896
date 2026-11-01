import { MODULAR_FACE_STUDIES, MODULAR_NOSE_STUDIES } from './modularIdentity.js';
import { MODULAR_HAIR_STYLES } from './modularHair.js';

export function createModularVariation(seed = 1, male = false) {
  let state = (Math.trunc(Number(seed)) || 1) >>> 0;
  const pick = (values) => {
    state = (Math.imul(state, 1664525)+1013904223) >>> 0;
    const mixed = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
    return values[((mixed ^ (mixed >>> 16)) >>> 0) % values.length];
  };
  const face = pick(MODULAR_FACE_STUDIES.slice(4));
  const nose = pick(MODULAR_NOSE_STUDIES);
  return {
    seed, identityVariant: 0,
    ...(male ? {bellySize:pick([-.5,0,.3,.7]),waistWidth:pick([-.3,0,.3]),sideburns:pick(['none','short-sideburns','long-sideburns','mutton-chops']),moustache:pick(['none','neat-moustache','full-moustache','handlebar-moustache'])} : {}),
    features: { ...face.features, ...nose.features, earProminence: pick([-.2, 0, .3, .6]) },
    skinTone: pick(['fairCool', 'fairWarm', 'rose', 'golden', 'olive', 'umber', 'deep']),
    hairTone: pick(['black', 'brown', 'chestnut', 'auburn', 'blond', 'mixedGray', 'silver']),
    eyeTone: pick(['brown', 'hazel', 'green', 'blue', 'gray']),
    palette: pick(['original', 'navy', 'forest', 'taupe']),
    outfit: male ? pick(['tailored-clothes','work-shirt','canvas-apron','leather-apron']) : pick(['day-dress', 'work-apron']),
    hairStyle: pick(Object.keys(MODULAR_HAIR_STYLES).filter(id => male === ['short-side-part','receding-sweep','bald'].includes(id))),
    hairVolume: pick([-.2, 0, .25, .5]),
    hairWave: pick([-.2, 0, .3, .7]),
    hairBunHeight: pick([-.3, 0, .3, .6]),
    hairPartOffset: pick([-.4, 0, .4]),
    hairEarCoverage: pick([-.2, 0, .3, .6]),
  };
}

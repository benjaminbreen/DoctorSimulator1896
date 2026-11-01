import {buildHeadwear,disposeHeadwear} from '../../../../shared/characters/headwearGeometry.js';
export {HAT_DESIGN_RADIUS} from '../../../../shared/characters/headwearGeometry.js';
export {fitPatientHat} from '../../../../shared/characters/headwearPerformance.js';

export function buildPatientHat({style='toque',color,band,...look}={}) {
  return buildHeadwear({hatStyle:style,hatColor:color,hatBandColor:band,...look});
}
export const disposePatientHat=disposeHeadwear;

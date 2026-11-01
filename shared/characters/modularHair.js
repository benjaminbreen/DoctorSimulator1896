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
  return {
    available: parts.length > 0,
    styles,
    controls: Object.keys(MODULAR_HAIR_CONTROLS).filter(name=>parts.some(({object})=>object.morphTargetDictionary?.[MODULAR_HAIR_CONTROLS[name].morph]!==undefined)),
    update(look = {}) {
      const selected = styles.includes(look.hairStyle) ? look.hairStyle : styles[0];
      for (const { object, style } of parts) {
        object.visible = style === selected;
        if (!object.morphTargetDictionary) continue;
        for (const [name, control] of Object.entries(MODULAR_HAIR_CONTROLS)) {
          const index = object.morphTargetDictionary[control.morph];
          if (index !== undefined) object.morphTargetInfluences[index] = Math.max(control.min, Math.min(control.max, Number(look[name]) || 0));
        }
      }
    },
  };
}

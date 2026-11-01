export const MODULAR_BODY_CONTROLS = { bellySize: 'Belly size', waistWidth: 'Waist width' };

export function createModularBody(root) {
  const bindings = [];
  root.traverse(mesh => {
    for (const name of Object.keys(MODULAR_BODY_CONTROLS)) {
      const index = mesh.morphTargetDictionary?.[`rc_${name}`];
      if (index !== undefined) bindings.push({ mesh, index, name });
    }
  });
  return {
    available: bindings.length > 0,
    update(look = {}) {
      for (const {mesh,index,name} of bindings) {
        let value = Math.max(-1,Math.min(1,Number(look[name]) || 0));
        // Removing volume needs a smaller range than adding it to a clothed body.
        if (name === 'bellySize' && value < 0) value *= .4;
        mesh.morphTargetInfluences[index] = value;
      }
    },
  };
}

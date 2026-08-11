import { materialFor } from './propMaterials.js';

// Renderers share one material switch so transmission-capable props do not
// silently fall back to an alpha-blended standard material in one view.
export default function PropMaterial({ item, material }) {
  const resolved = material ?? materialFor(item);
  const { materialModel = 'standard', ...props } = resolved;
  if (materialModel === 'physical') return <meshPhysicalMaterial {...props} />;
  return <meshStandardMaterial {...props} />;
}

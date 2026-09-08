export function patientModelPath(recipe, manifest) {
  if (recipe.asset?.path) return recipe.asset.path;
  const leanOutfit = (recipe.cohort === 'men' && ['sack-suit', 'working-clothes'].includes(recipe.presentation?.outfitId)) || recipe.presentation?.outfitId === 'golden-dress';
  return (leanOutfit && manifest.consultationPaths?.[recipe.anchor?.index ?? 0]) || manifest.path;
}

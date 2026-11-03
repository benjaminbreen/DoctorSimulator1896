// Each donor has complete, fitted clothing combinations. Only the selected
// character GLB is loaded; the build script reuses each clothing rig's motions.
export const EXPANSION_HEADS = [
  { id:'female-young', source:'H1', label:'Young woman', sex:'female' },
  { id:'female-older', source:'H3', label:'Older woman', sex:'female' },
  { id:'female-black', source:'H4', label:'Adult Black woman', sex:'female', skinReference:'umber' },
  { id:'male-young', source:'H2', label:'Young man', sex:'male' },
  { id:'male-chinese', source:'H5', label:'Adult Chinese man', sex:'male' },
];
export const EXPANSION_CLOTHING = [
  { id:'shirtwaist-skirt', source:'C1', label:'Shirtwaist and skirt', sex:'female' },
  { id:'working-dress', source:'C2', label:'Working dress', sex:'female' },
  { id:'walking-suit', source:'C3', label:'Walking suit', sex:'female' },
  { id:'work-jacket', source:'C4', label:'Work jacket', sex:'male' },
  { id:'frock-coat', source:'C5', label:'Frock coat', sex:'male' },
];
export const EXPANSION_TEMPLATES = EXPANSION_HEADS.flatMap(head =>
  EXPANSION_CLOTHING.filter(clothing => clothing.sex === head.sex).map(clothing => ({
    id:`${head.id}-${clothing.id}`, head:head.source, body:clothing.source,
    label:`${head.label} — ${clothing.label.toLowerCase()}`, sex:head.sex,
    outfit:clothing.id, path:`/models/characters/${head.id}-${clothing.id}.glb`,
  })));

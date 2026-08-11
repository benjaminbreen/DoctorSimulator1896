// Wardrobe choices exposed by the Character Lab. Every ready-to-wear entry
// maps to a garment system the active Renderer C cohort can render live.

const entry = (id, label, kind, note, values) => Object.freeze({
  id, label, kind, note, values: Object.freeze(values),
});

export const RENDERER_C_WARDROBE = Object.freeze({
  women: Object.freeze([
    entry('golden-dress', 'Golden day dress', 'Skinned garment',
      'A coherent full day-dress prototype with a modest bodice, long sleeves, fitted details and a full skirt.', {
        womenGarmentMode: 'golden-dress', outfitStyle: 'conservative-day',
        dressColor: '#9a6b2f', secondaryColor: '#5f3d23', trimColor: '#c3a56d', fabricType: 'wool',
        dressDetailPattern: 'double-stitch', dressDetailAmount: 0.72, dressDetailScale: 1,
        collarThickness: 0.35, cuffThickness: 0.35,
      }),
    entry('fitted-dress', 'Fitted long dress', 'Skinned garment',
      'The current fitted dress proof. Uses its seated fit surface during stable seated clips.', {
        womenGarmentMode: 'production-dress', outfitStyle: 'fashionable-1896',
      }),
    entry('day-shell', 'Day dress shell', 'Live comparison',
      'Restrained sleeves and a full skirt built around the current body.', {
        womenGarmentMode: 'concept-shell', outfitStyle: 'conservative-day',
      }),
    entry('fashion-shell', 'Full sleeves and skirt', 'Live comparison',
      'The broadest sleeve and skirt study in the current procedural set.', {
        womenGarmentMode: 'concept-shell', outfitStyle: 'fashionable-1896',
      }),
    entry('mourning-shell', 'Mourning dress shell', 'Live comparison',
      'A high collar, quiet sleeve volume and long dark silhouette.', {
        womenGarmentMode: 'concept-shell', outfitStyle: 'mourning-dress',
        dressColor: '#19191b', trimColor: '#343136',
      }),
    entry('working-shell', 'Working dress and apron', 'Live comparison',
      'Narrower skirt, reduced sleeve volume and an apron layer.', {
        womenGarmentMode: 'concept-shell', outfitStyle: 'working-day',
      }),
    entry('visiting-shell', 'Visiting dress shell', 'Live comparison',
      'A fuller day silhouette with added trim.', {
        womenGarmentMode: 'concept-shell', outfitStyle: 'visiting-dress',
      }),
    entry('mpfb-carrier', 'MPFB fitted carrier', 'Source garment',
      'The fitted base garment without the Character Lab outer dress.', {
        womenGarmentMode: 'carrier-only', outfitStyle: 'conservative-day',
      }),
  ]),
  men: Object.freeze([
    entry('sack-suit', 'Sack suit', 'Skinned garment',
      'The fitted everyday suit carrier.', {
        outfitStyle: 'mens-sack-suit', menswearPalette: 'trade-charcoal',
      }),
    entry('shirt-braces', 'Shirt and braces', 'Skinned garment',
      'The working carrier with braces and no jacket.', {
        outfitStyle: 'mens-working-clothes', workingLayer: 'shirt-braces', menswearPalette: 'work-earth',
      }),
    entry('working-waistcoat', 'Working waistcoat', 'Skinned garment',
      'The working carrier with its waistcoat layer visible.', {
        outfitStyle: 'mens-working-clothes', workingLayer: 'waistcoat', menswearPalette: 'work-indigo',
      }),
    entry('work-jacket', 'Work jacket', 'Skinned garment',
      'The working carrier with the jacket layer visible.', {
        outfitStyle: 'mens-working-clothes', workingLayer: 'work-jacket', menswearPalette: 'trade-brown',
      }),
    entry('formal-morning', 'Formal morning suit', 'Authored garment',
      'The authored coat, waistcoat, shirt, neckwear and trousers set.', {
        outfitStyle: 'mens-formal-suit', formalCoatCut: 'morning-cutaway', menswearPalette: 'elite-charcoal-dove',
      }),
    entry('formal-frock', 'Formal frock coat', 'Authored garment',
      'The same authored set with its alternate long coat morph.', {
        outfitStyle: 'mens-formal-suit', formalCoatCut: 'frock-coat', menswearPalette: 'formal-black-grey',
      }),
    entry('mourning-suit', 'Mourning suit', 'Authored garment',
      'The formal set in the restrained black palette.', {
        outfitStyle: 'mens-mourning-suit', formalCoatCut: 'morning-cutaway', menswearPalette: 'mourning',
      }),
    entry('victorian-carrier', 'Victorian suit sample', 'CC0 fitted source',
      'The imported MakeHuman fitted suit carrier with minimal live reshaping.', {
        outfitStyle: 'mens-victorian-sample', menswearPalette: 'trade-charcoal',
      }),
    entry('authored-waistcoat', 'Victorian waistcoat set', 'Authored garment',
      'The authored waistcoat and fitted underlayers already embedded in the male master.', {
        outfitStyle: 'mens-authored-victorian-set', menswearPalette: 'formal-black-grey',
      }),
  ]),
});

export const RENDERER_C_SOURCE_GARMENTS = Object.freeze([
  Object.freeze({ id: 'halter-fluted-dress', cohort: 'women', label: 'Halter dress with fluted skirt', source: 'MakeHuman Dress 01', license: 'CC0', preview: '/models/wardrobe-source/halter-fluted-dress.obj' }),
  Object.freeze({ id: 'bodice-ruffle-dress', cohort: 'women', label: 'Bodice dress with lace ruffle skirt', source: 'MakeHuman Dress 01', license: 'CC0', preview: '/models/wardrobe-source/bodice-ruffle-dress.obj' }),
  Object.freeze({ id: 'tiered-skirt-dress', cohort: 'women', label: 'Dress with tiered skirt', source: 'MakeHuman Dress 01', license: 'CC0', preview: '/models/wardrobe-source/tiered-skirt-dress.obj' }),
  Object.freeze({ id: 'female-ankle-boots', cohort: 'women', label: 'Women’s ankle boots', source: 'MakeHuman Shoes 01', license: 'CC0', preview: '/models/wardrobe-source/female-ankle-boots.obj' }),
  Object.freeze({ id: 'maid-bonnet', cohort: 'women', label: 'Maid bonnet', source: 'MakeHuman Hats 03', license: 'CC-BY', preview: '/models/wardrobe-source/maid-bonnet.obj' }),
  Object.freeze({ id: 'simple-drape-dress', cohort: 'women', label: 'Simple drape Victorian dress test', source: 'Sketchfab · pers', license: 'CC-BY-4.0', preview: '/models/wardrobe-source/simple-drape-dress.glb' }),
  Object.freeze({ id: 'hoop-skirt-dress', cohort: 'women', label: 'Victorian ladies’ hoop-skirt dress', source: 'Sketchfab · pers', license: 'CC-BY-4.0', preview: '/models/wardrobe-source/hoop-skirt-dress.glb' }),
  Object.freeze({ id: 'male-suit-carrier', cohort: 'men', label: 'Male suit, tie and jacket', source: 'MakeHuman Suits 01', license: 'CC0', preview: '/models/wardrobe-source/male-suit-carrier.obj' }),
  Object.freeze({ id: 'double-breasted-suit', cohort: 'men', label: 'Male double-breasted suit', source: 'MakeHuman Suits 01', license: 'CC0', preview: '/models/wardrobe-source/double-breasted-suit.obj' }),
  Object.freeze({ id: 'dinner-jacket-suit', cohort: 'men', label: 'Suit with dinner jacket', source: 'MakeHuman Suits 01', license: 'CC0', preview: '/models/wardrobe-source/dinner-jacket-suit.obj' }),
  Object.freeze({ id: 'male-ankle-boots', cohort: 'men', label: 'Men’s ankle boots', source: 'MakeHuman Shoes 01', license: 'CC0', preview: '/models/wardrobe-source/male-ankle-boots.obj' }),
  Object.freeze({ id: 'bowler-hat', cohort: 'men', label: 'Bowler hat', source: 'MakeHuman Hats 03', license: 'CC-BY', preview: '/models/wardrobe-source/bowler-hat.obj' }),
  Object.freeze({ id: 'flat-cap', cohort: 'men', label: 'Flat cap', source: 'MakeHuman Hats 03', license: 'CC-BY', preview: '/models/wardrobe-source/flat-cap.obj' }),
  Object.freeze({ id: 'top-hat', cohort: 'men', label: 'Top hat', source: 'MakeHuman Hats 03', license: 'CC-BY', preview: '/models/wardrobe-source/top-hat.obj' }),
  Object.freeze({ id: 'newsboy-cap', cohort: 'men', label: 'Newsboy cap', source: 'MakeHuman Hats 01', license: 'CC0', preview: '/models/wardrobe-source/newsboy-cap.obj' }),
  Object.freeze({ id: '1830s-frock-coat', cohort: 'men', label: '1830s frock coat, unbuttoned', source: 'Sketchfab · Digital Dressmaker', license: 'CC-BY-4.0', preview: '/models/wardrobe-source/1830s-frock-coat.glb' }),
  Object.freeze({ id: 'victorian-clothes-set', cohort: 'men', label: 'Victorian clothes set', source: 'Sketchfab · deymar', license: 'CC-BY-4.0', preview: '/models/wardrobe-source/victorian-clothes-set.glb' }),
  Object.freeze({ id: 'round-glasses', cohort: 'all', label: 'Round glasses', source: 'MakeHuman Glasses 01', license: 'CC0', preview: '/models/wardrobe-source/round-glasses.obj' }),
]);

export function wardrobeFor(cohort) {
  return RENDERER_C_WARDROBE[cohort] || RENDERER_C_WARDROBE.women;
}

export function wardrobeEntry(cohort, id) {
  return wardrobeFor(cohort).find((item) => item.id === id) || null;
}

export function wardrobePatch(cohort, id) {
  const selected = wardrobeEntry(cohort, id);
  return selected ? { ...selected.values } : null;
}

export function activeWardrobeId(cohort, values) {
  const matches = wardrobeFor(cohort).filter((item) => Object.entries(item.values)
    .every(([key, value]) => values[key] === value));
  // Prefer the most specific match when two entries share a carrier.
  matches.sort((left, right) => Object.keys(right.values).length - Object.keys(left.values).length);
  return matches[0]?.id || null;
}

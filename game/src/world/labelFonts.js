// These are modern, redistributable revivals of type styles available by the
// game's 1896 setting. They are design options, not claims about a particular
// maker's label; a reference image still decides the final typography.
export const LABEL_FONTS = [
  {
    id: 'caslon',
    label: 'Caslon Text',
    family: 'Libre Caslon Text',
    cssFamily: "'Libre Caslon Text', Georgia, serif",
  },
  {
    id: 'bodoni',
    label: 'Bodoni Display',
    family: 'Bodoni Moda',
    cssFamily: "'Bodoni Moda', 'Times New Roman', serif",
  },
  {
    id: 'old-standard',
    label: 'Old Standard',
    family: 'Old Standard TT',
    cssFamily: "'Old Standard TT', Georgia, serif",
  },
];

export const LABEL_FONT_IDS = LABEL_FONTS.map((font) => font.id);
export const LABEL_FONT_LABELS = Object.fromEntries(LABEL_FONTS.map((font) => [font.id, font.label]));

export function labelFont(id) {
  return LABEL_FONTS.find((font) => font.id === id) ?? LABEL_FONTS[0];
}

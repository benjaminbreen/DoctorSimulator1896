// The paint styles offered in the settings menu. Each lists only what differs
// from the schema defaults, which are the light Hopper look. Choosing a style
// resets every paint slider to its default and then applies these.

export const PAINT_STYLES = {
  off: null,
  'hopper-light': { label: 'Hopper, light', values: {} },
  // The first Hopper look: heavier paint, broader brush.
  hopper: {
    label: 'Hopper, full',
    values: {
      hopperMix: 0.7, hopperKernel: 4, hopperTextureBlur: 3.5, hopperFlatten: 0.6, hopperMatte: 0.5,
      hopperBrushNear: 5, hopperBrushFar: 11, hopperAnisotropy: 0.8, hopperGrain: 0.03, hopperWobble: 2.4,
      hopperStepStrength: 0.45, hopperWarm: 1, hopperCool: 1, hopperSnapGrey: 0.65, hopperSnapSoftness: 0.002,
      hopperSunBoost: 1.16, hopperFillCut: 0.45, hopperFigureAmount: 0.74, hopperFigureTextureBlur: 0.2,
      hopperFigureFlatten: 1, hopperFigureSplit: 0.72, hopperFigureSplitSoftness: 0.15, hopperFigureMix: 0.67,
      hopperFigureDetail: 0.32, hopperFigureContrast: 0.68, hopperFigureSteps: 4.5, hopperFigureStepStrength: 0.54,
      hopperFigureSaturation: 1.35, hopperFigurePull: 0.18, hopperFigureEdge: 0.08,
    },
  },
  // Flat fields of colour with hard edges, and the cheapest filter.
  'hopper-planes': {
    label: 'Flat planes',
    values: {
      paintMethod: 'planes', hopperMix: 0.8, hopperKernel: 4, hopperTextureBlur: 3, hopperMatte: 0.5,
      hopperBrushNear: 4, hopperBrushFar: 9, hopperSteps: 6, hopperStepStrength: 0.6, hopperWobble: 1,
      hopperGrain: 0.015, hopperFigureMix: 0.5,
    },
  },
  // Visible dabs laid along the forms.
  'hopper-strokes': {
    label: 'Brushwork',
    values: {
      paintMethod: 'strokes', hopperMix: 0.85, hopperTextureBlur: 3, hopperMatte: 0.5,
      hopperBrushNear: 5, hopperBrushFar: 9, hopperWobble: 0, hopperGrain: 0.04, hopperStepStrength: 0.3,
      hopperFigureMix: 0.4, hopperFigureBrush: 0.5,
    },
  },
  seurat: {
    label: 'Seurat',
    values: {
      paintMethod: 'dots', hopperTextureBlur: 3, hopperFlatten: 1, hopperMatte: 0.6,
      hopperSunBoost: 1.3, hopperFillCut: 0.3, hopperFigureSplit: 0.4,
    },
  },
};

export function isPaintParameter(id) {
  return id === 'paintMethod' || id.startsWith('hopper') || id.startsWith('seurat');
}

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Uniform, Vector3 } from 'three';
import { BloomEffect, Effect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import {
  EffectComposer, Bloom, DepthOfField, N8AO, ToneMapping, Vignette, wrapEffect,
} from '@react-three/postprocessing';
import { getInteraction, subscribe } from '../world/interaction.js';
import { examinationFocus, subscribeExamination } from '../consultation/examPresentation.js';

// The authored warm cast: period-photograph warmth without disturbing the HDR
// balance that bloom reads from. Outdoors only — the gaslit interiors are
// already warm. Saturation and contrast ride along in the same pass because a
// second full-screen pass would cost as much as this one does and buy nothing.
const WARM_TINT = new Vector3(1.045, 1.0, 0.945);

class WarmGradeEffect extends Effect {
  constructor() {
    super(
      'WarmGradeEffect',
      'uniform vec3 tint;'
        + 'uniform float saturation;'
        + 'uniform float contrast;'
        + 'void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {'
        + '  vec3 c = inputColor.rgb * tint;'
        // Rec. 709 luma: desaturating toward plain average green would go muddy.
        + '  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));'
        + '  c = mix(vec3(luma), c, saturation);'
        + '  c = (c - 0.5) * contrast + 0.5;'
        + '  outputColor = vec4(max(c, 0.0), inputColor.a);'
        + '}',
      {
        uniforms: new Map([
          ['tint', new Uniform(WARM_TINT.clone())],
          ['saturation', new Uniform(1)],
          ['contrast', new Uniform(1)],
        ]),
      },
    );
  }
}
const WarmGrade = wrapEffect(WarmGradeEffect);

const scratchColor = new Color();

// The composer forces the renderer to NoToneMapping and expects a pass of its
// own to do the job, so the panel's selection has to be restated here. Without
// it the whole game renders untonemapped and the exposure slider does nothing.
const TONE_MAPPING_MODES = {
  ACESFilmic: ToneMappingMode.ACES_FILMIC,
  AgX: ToneMappingMode.AGX,
  Neutral: ToneMappingMode.NEUTRAL,
  Linear: ToneMappingMode.LINEAR,
};

// Bloom gives the sun and gaslights their glow; the sky's over-1.0 cloud
// rims are aimed at exactly this pass. Indoors, ambient occlusion does the
// heavy lifting: without it a lamp-lit room reads as flat, with corners as
// bright as the middle of the floor.
//
// Two rules hold this file together, both learned the hard way:
//
// No ref on an effect. @react-three/postprocessing memoises each effect on
// JSON.stringify of its props, and under React 19 the ref is a prop — so the
// moment it holds an effect, the stringify walks three's circular parent
// chain and throws, taking the canvas down on the next re-render.
//
// No live values as props either. Nothing re-renders this component when a
// slider writes into the runtime, so anything passed as JSX is frozen at
// mount. That is why the AO sliders moved and the image did not.
//
// The composer ref is safe, so both are reached through its passes instead.
// The focus of a close examination or of the consultation's examination
// reading, or null. Depth of field is the one pass that runs only for these
// modes, so it is switched in on this rather than left in the chain at zero
// strength. Re-rendering on it is cheap: the value changes twice per
// examination. A prop under the glass wants a razor focus band; the patient
// reading keeps the whole figure sharp and melts the room behind her.
function examineFocusNow() {
  const using = getInteraction().using;
  if (using?.kind === 'examine' && using.framing?.target) {
    return { target: using.framing.target, range: 0.16, bokeh: 5 };
  }
  const reading = examinationFocus();
  // The focus target sits inside the chest, while the face, sleeves, and
  // presented hands may be half a metre nearer. Keep that whole volume clean.
  return reading ? { target: reading, range: 1.8, bokeh: 5.5 } : null;
}

function useExamineFocus() {
  const [focus, setFocus] = useState(examineFocusNow);
  useEffect(() => subscribe(() => setFocus(examineFocusNow())), []);
  useEffect(() => subscribeExamination(() => setFocus(examineFocusNow())), []);
  return focus;
}

export default function Effects({ runtime, indoors }) {
  const composerRef = useRef();
  const examineFocus = useExamineFocus();
  const dpr = useThree((state) => state.viewport.dpr);
  // Retina rendering already supersamples the image. Extra MSAA there adds
  // substantial bandwidth and resolve work without a visible edge benefit.
  // Do not substitute FXAA here: it has twice caused a substantial full-scene
  // quality regression in playtesting. Fix shimmering facade geometry at the
  // asset/LOD level, or evaluate targeted MSAA/SMAA separately.
  const multisampling = dpr >= 1.5 ? 0 : 2;
  const vignetteBase = indoors ? 0.55 : 0.32;

  useFrame(() => {
    const composer = composerRef.current;
    if (!composer) return;
    let bloom = null;
    let ao = null;
    let grade = null;
    let vignette = null;
    for (const pass of composer.passes) {
      for (const effect of pass.effects ?? []) {
        if (effect instanceof BloomEffect) bloom = effect;
        else if (effect instanceof VignetteEffect) vignette = effect;
        else if (effect instanceof WarmGradeEffect) grade = effect;
      }
      // n8ao keeps its settings on a config object rather than on uniforms.
      if (pass.configuration?.aoRadius !== undefined) ao = pass;
    }

    const values = runtime.values;
    if (bloom) {
      bloom.intensity = values.bloomIntensity;
      bloom.luminanceMaterial.threshold = values.bloomThreshold;
    }
    if (ao) {
      const intensity = values.aoIntensity;
      const radius = values.aoRadius;
      // Writes go through n8ao's Proxy, and some of them rebuild render
      // targets, so only push a value that actually changed.
      if (ao.configuration.intensity !== intensity) ao.configuration.intensity = intensity;
      if (ao.configuration.aoRadius !== radius) ao.configuration.aoRadius = radius;
    }
    if (grade) {
      // Warmth scales the authored cast; the tint colour multiplies on top, so
      // leaving it white keeps the look exactly as authored. Indoors the pass
      // carries only the player's contrast setting: warmth and saturation stay
      // neutral so the authored gaslit look does not shift.
      const warmth = indoors ? 0 : values.gradeWarmth;
      scratchColor.set(values.gradeTint);
      grade.uniforms.get('tint').value.set(
        (1 + (WARM_TINT.x - 1) * warmth) * scratchColor.r,
        (1 + (WARM_TINT.y - 1) * warmth) * scratchColor.g,
        (1 + (WARM_TINT.z - 1) * warmth) * scratchColor.b,
      );
      grade.uniforms.get('saturation').value = indoors ? 1 : values.saturation;
      grade.uniforms.get('contrast').value = values.contrast;
    }
    // Indoors and outdoors carry different authored vignettes, so the slider
    // scales whichever one this composer mounted rather than replacing it.
    if (vignette) {
      // Examination adds its own shaped room falloff in the consultation UI.
      // Doubling the full-screen vignette buried the patient and the set.
      const examScale = examineFocus ? 0.62 : 1;
      vignette.darkness = vignetteBase * values.vignetteAmount * examScale;
    }
  });

  return (
    // Keyed on the pixel ratio: adaptive DPR resizes the drawing buffer, but
    // the composer's internal targets (n8ao's especially) keep their old
    // resolution, and stale half-res AO smears dark ghosts on the walls.
    // Steps are rare by design, so a rebuild per step is cheap.
    <EffectComposer key={dpr} ref={composerRef} multisampling={multisampling}>
      {/* Each effect is switched in and out of the chain rather than turned
          down to zero: a pass that still runs still costs its full-screen
          work, which is the whole point when measuring where frames go. */}
      {(indoors || runtime.values.aoOutdoors) && runtime.values.aoEnabled ? (
        <N8AO distanceFalloff={1} halfRes color="#120d08" />
      ) : (
        <></>
      )}
      {runtime.values.bloomEnabled ? <Bloom mipmapBlur luminanceSmoothing={0.24} /> : <></>}
      {/* Close examination throws the room away behind the object. The target
          is the same point the camera orbits, so focus follows the framing and
          never has to be chased. Before the tone map, or the bokeh discs come
          out grey. */}
      {examineFocus ? (
        <DepthOfField
          target={examineFocus.target}
          worldFocusRange={examineFocus.range}
          bokehScale={examineFocus.bokeh}
          resolutionScale={examineFocus.scale}
        />
      ) : (
        <></>
      )}
      {/* Order matters: bloom works on the HDR scene, the tone map compresses
          it, and the vignette darkens the finished image. Exposure rides in on
          the renderer, which FrameSettings keeps current. */}
      <ToneMapping mode={TONE_MAPPING_MODES[runtime.values.toneMapping] ?? ToneMappingMode.AGX} />
      {/* Mounted indoors too so the settings menu's contrast slider works
          everywhere; at default contrast the indoor pass is a no-op. */}
      {runtime.values.gradeEnabled ? <WarmGrade /> : <></>}
      {/* The exterior already has strong edge contrast from sky, buildings,
          and the HUD. A lighter vignette keeps facade detail out of black. */}
      {runtime.values.vignetteEnabled ? (
        <Vignette eskil={false} offset={0.28} darkness={vignetteBase} />
      ) : (
        <></>
      )}
    </EffectComposer>
  );
}

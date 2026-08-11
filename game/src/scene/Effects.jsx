import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Uniform, Vector3 } from 'three';
import { BloomEffect, Effect, ToneMappingMode } from 'postprocessing';
import { EffectComposer, Bloom, N8AO, ToneMapping, Vignette, wrapEffect } from '@react-three/postprocessing';

// Gentle warm multiply after the tone map: period-photograph warmth without
// disturbing the HDR balance that bloom reads from. Outdoors only — the
// gaslit interiors are already warm.
class WarmGradeEffect extends Effect {
  constructor() {
    super(
      'WarmGradeEffect',
      'uniform vec3 tint;' +
        'void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {' +
        '  outputColor = vec4(inputColor.rgb * tint, inputColor.a);' +
        '}',
      { uniforms: new Map([['tint', new Uniform(new Vector3(1.045, 1.0, 0.945))]]) },
    );
  }
}
const WarmGrade = wrapEffect(WarmGradeEffect);

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
export default function Effects({ runtime, indoors }) {
  const composerRef = useRef();

  useFrame(() => {
    const composer = composerRef.current;
    if (!composer) return;
    let bloom = null;
    let ao = null;
    for (const pass of composer.passes) {
      for (const effect of pass.effects ?? []) if (effect instanceof BloomEffect) bloom = effect;
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
  });

  return (
    <EffectComposer ref={composerRef} multisampling={4}>
      {indoors && runtime.values.aoEnabled ? (
        <N8AO distanceFalloff={1} halfRes color="#120d08" />
      ) : (
        <></>
      )}
      <Bloom mipmapBlur luminanceSmoothing={0.24} />
      {/* Order matters: bloom works on the HDR scene, the tone map compresses
          it, and the vignette darkens the finished image. Exposure rides in on
          the renderer, which FrameSettings keeps current. */}
      <ToneMapping mode={TONE_MAPPING_MODES[runtime.values.toneMapping] ?? ToneMappingMode.AGX} />
      {indoors ? <></> : <WarmGrade />}
      <Vignette eskil={false} offset={0.28} darkness={0.55} />
    </EffectComposer>
  );
}

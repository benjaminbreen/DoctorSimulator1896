import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, N8AO, Vignette } from '@react-three/postprocessing';

// Bloom gives the sun and gaslights their glow; the sky's over-1.0 cloud
// rims are aimed at exactly this pass. Indoors, ambient occlusion does the
// heavy lifting: without it a lamp-lit room reads as flat, with corners as
// bright as the middle of the floor.
export default function Effects({ runtime, indoors }) {
  const bloomRef = useRef();

  useFrame(() => {
    const bloom = bloomRef.current;
    if (!bloom) return;
    bloom.intensity = runtime.values.bloomIntensity;
    bloom.luminanceMaterial.threshold = runtime.values.bloomThreshold;
  });

  const ao = indoors && runtime.values.aoEnabled;
  return (
    <EffectComposer multisampling={4}>
      {ao ? (
        <N8AO
          aoRadius={runtime.values.aoRadius}
          intensity={runtime.values.aoIntensity}
          distanceFalloff={1}
          halfRes
          color="#120d08"
        />
      ) : (
        <></>
      )}
      <Bloom ref={bloomRef} mipmapBlur intensity={0.55} luminanceThreshold={0.72} luminanceSmoothing={0.24} />
      <Vignette eskil={false} offset={0.28} darkness={0.55} />
    </EffectComposer>
  );
}

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

// Bloom gives the sun and gaslights their glow; the sky's over-1.0 cloud
// rims are aimed at exactly this pass.
export default function Effects({ runtime }) {
  const bloomRef = useRef();

  useFrame(() => {
    const bloom = bloomRef.current;
    if (!bloom) return;
    bloom.intensity = runtime.values.bloomIntensity;
    bloom.luminanceMaterial.threshold = runtime.values.bloomThreshold;
  });

  return (
    <EffectComposer multisampling={4}>
      <Bloom ref={bloomRef} mipmapBlur intensity={0.55} luminanceThreshold={0.72} luminanceSmoothing={0.24} />
      <Vignette eskil={false} offset={0.28} darkness={0.55} />
    </EffectComposer>
  );
}

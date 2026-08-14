import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import RendererCActor from '../scene/characters/RendererCActor.jsx';

const MANIFEST_PATH = '/models/characters/renderer-c-cohorts.json';

function PatientFigure({ patient }) {
  const source = useLoader(THREE.FileLoader, MANIFEST_PATH);
  const manifest = useMemo(() => JSON.parse(source), [source]);
  const authored = patient.actor.recipe.asset?.kind === 'authored-character';
  const recipe = useMemo(() => ({
    ...patient.actor.recipe,
    animation: {
      ...patient.actor.recipe.animation,
      body: 'clinic-idle',
      expression: 'neutral',
      gaze: 'doctor',
      speaking: false,
    },
    placement: {
      // Nora's authored mesh is offset from its scene origin. Re-centre the
      // mesh here so the portrait route frames her like the procedural cast.
      position: [authored ? -0.26 : 0, 0, 0],
      rotation: [0, 0, 0],
      scale: patient.actor.recipe.placement?.scale ?? 1,
    },
  }), [authored, patient]);
  const cohort = manifest.cohorts?.[recipe.cohort];
  return cohort ? <RendererCActor recipe={recipe} manifest={cohort} paused /> : null;
}

function PortraitCamera({ patient }) {
  const { camera } = useThree();
  useEffect(() => {
    const authored = patient.actor.recipe.asset?.kind === 'authored-character';
    const isSamuel = patient.id === 'samuel-taylor-1896';
    const targetY = authored ? 0.9 : isSamuel ? 1.16 : 1.04;
    camera.position.set(0, targetY + 0.015, authored ? 2 : isSamuel ? 1.1 : 1.05);
    camera.lookAt(0, targetY, 0);
    camera.fov = authored ? 31 : 30;
    camera.updateProjectionMatrix();
  }, [camera, patient]);
  return null;
}

function PortraitStage({ patient }) {
  return (
    <>
      <color attach="background" args={['#8d887c']} />
      <fog attach="fog" args={['#8d887c', 2.2, 5]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={['#f4ead8', '#2c2926', 1.2]} />
      <directionalLight position={[2.4, 3.8, 3.2]} intensity={2.7} />
      <directionalLight position={[-2.8, 1.8, 2.3]} color="#b8c5c1" intensity={1.05} />
      <directionalLight position={[0, 1.8, 4]} color="#f5dfbd" intensity={2.1} />
      <pointLight position={[0, 2.6, -1.6]} color="#d7b884" intensity={1.1} />
      <PortraitCamera patient={patient} />
      <Suspense fallback={null}>
        <PatientFigure patient={patient} />
      </Suspense>
    </>
  );
}

// A deterministic art-review route used to regenerate the Casebook portraits
// from the same recipes and models that appear in consultation mode.
export default function PatientPortraitPanel({ patients }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, overflow: 'auto',
      background: '#111512', color: '#ead9bc', padding: 30,
      fontFamily: "'Cormorant', Georgia, serif",
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 480px)', gap: 20, width: 'max-content' }}>
        {patients.map((patient) => (
          <figure key={patient.id} style={{ margin: 0 }}>
            <div style={{ width: 480, height: 600, overflow: 'hidden', border: '1px solid #96774a' }}>
              <Canvas
                data-patient-portrait={patient.id}
                dpr={2}
                frameloop="always"
                camera={{ fov: 26, near: 0.01, far: 20 }}
                gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
                onCreated={({ gl }) => {
                  gl.toneMapping = THREE.ACESFilmicToneMapping;
                  gl.toneMappingExposure = 1.08;
                  gl.outputColorSpace = THREE.SRGBColorSpace;
                }}
              >
                <PortraitStage patient={patient} />
              </Canvas>
            </div>
            <figcaption style={{ padding: '10px 2px', fontSize: 20 }}>{patient.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

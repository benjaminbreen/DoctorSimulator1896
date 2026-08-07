// Tuning parameter schema. The panel, runtime store, and tests all read this.
// mode: 'live' params are read every frame; 'rebuild' params remount the canvas.
// Defaults are Ben's tuned values (2026-08-07).

export const settingsSchema = {
  version: 1,
  groups: [
    {
      id: 'world',
      label: 'World',
      parameters: [
        { id: 'zone', label: 'Zone (fast travel)', type: 'select', options: ['consulting-office', 'waiting-room', 'central-park'], default: 'central-park', mode: 'rebuild' },
      ],
    },
    {
      id: 'movement',
      label: 'Movement',
      parameters: [
        { id: 'walkSpeed', label: 'Walk speed', type: 'range', min: 0.5, max: 14, step: 0.05, default: 8.85 },
        { id: 'runSpeed', label: 'Run speed', type: 'range', min: 1, max: 20, step: 0.05, default: 12.9 },
        { id: 'gravity', label: 'Gravity', type: 'range', min: 4, max: 30, step: 0.1, default: 11.9 },
        { id: 'groundAcceleration', label: 'Acceleration', type: 'range', min: 4, max: 60, step: 0.5, default: 47 },
        { id: 'groundDeceleration', label: 'Deceleration', type: 'range', min: 4, max: 60, step: 0.5, default: 46.5 },
        { id: 'turnDamping', label: 'Turn damping', type: 'range', min: 4, max: 40, step: 0.5, default: 25.5 },
        { id: 'jumpVelocity', label: 'Jump velocity', type: 'range', min: 0, max: 12, step: 0.1, default: 6.8 },
        { id: 'coyoteTime', label: 'Coyote time', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.2 },
        { id: 'jumpBufferTime', label: 'Jump buffer', type: 'range', min: 0, max: 0.4, step: 0.01, default: 0.16 },
        { id: 'fallGravityMultiplier', label: 'Fall gravity boost', type: 'range', min: 1, max: 3, step: 0.02, default: 1.28 },
        { id: 'jumpReleaseGravityMultiplier', label: 'Short-hop gravity', type: 'range', min: 1, max: 4, step: 0.05, default: 2.05 },
        { id: 'capsuleRadius', label: 'Capsule radius', type: 'range', min: 0.2, max: 0.6, step: 0.01, default: 0.28, mode: 'rebuild' },
        { id: 'capsuleHalfHeight', label: 'Capsule half height', type: 'range', min: 0.4, max: 1.2, step: 0.01, default: 0.56, mode: 'rebuild' },
        { id: 'autostepHeight', label: 'Autostep height', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.32, mode: 'rebuild' },
        { id: 'snapToGround', label: 'Ground snap', type: 'range', min: 0, max: 1, step: 0.01, default: 0.46, mode: 'rebuild' },
        { id: 'maxSlopeClimbDeg', label: 'Max climb slope', type: 'range', min: 20, max: 70, step: 1, default: 42, mode: 'rebuild' },
        { id: 'minSlopeSlideDeg', label: 'Min slide slope', type: 'range', min: 25, max: 80, step: 1, default: 50, mode: 'rebuild' },
      ],
    },
    {
      id: 'camera',
      label: 'Camera',
      parameters: [
        { id: 'cameraMode', label: 'Camera mode (M cycles)', type: 'select', options: ['shoulder', 'first', 'overhead', 'hero'], default: 'shoulder' },
        { id: 'shoulderSide', label: 'Shoulder side', type: 'range', min: -2, max: 2, step: 0.05, default: 1.05 },
        { id: 'shoulderUp', label: 'Shoulder up', type: 'range', min: 0.5, max: 4, step: 0.05, default: 2.55 },
        { id: 'shoulderBack', label: 'Shoulder back', type: 'range', min: 1, max: 8, step: 0.05, default: 4.8 },
        { id: 'pitchMin', label: 'Pitch min', type: 'range', min: -1.4, max: 0, step: 0.01, default: -0.48 },
        { id: 'pitchMax', label: 'Pitch max', type: 'range', min: 0, max: 1.55, step: 0.01, default: 1.45 },
        { id: 'positionDamping', label: 'Position damping', type: 'range', min: 1, max: 20, step: 0.1, default: 10.2 },
        { id: 'yDamping', label: 'Vertical damping', type: 'range', min: 0.5, max: 15, step: 0.1, default: 6.7 },
        { id: 'lookSensitivity', label: 'Look sensitivity', type: 'range', min: 0.0005, max: 0.008, step: 0.0001, default: 0.0021 },
        { id: 'invertY', label: 'Invert Y', type: 'toggle', default: false },
        { id: 'occlusionPullIn', label: 'Occlusion pull-in', type: 'range', min: 5, max: 60, step: 1, default: 26 },
        { id: 'occlusionReturn', label: 'Occlusion return', type: 'range', min: 0.5, max: 10, step: 0.1, default: 2.6 },
        { id: 'minDistance', label: 'Min distance', type: 'range', min: 0.5, max: 3, step: 0.05, default: 1.5 },
        { id: 'collisionPadding', label: 'Collision padding', type: 'range', min: 0.05, max: 0.8, step: 0.01, default: 0.33 },
        { id: 'fov', label: 'Field of view', type: 'range', min: 30, max: 90, step: 1, default: 66 },
        { id: 'overheadHeight', label: 'Overhead height', type: 'range', min: 8, max: 45, step: 0.5, default: 24 },
        { id: 'heroFollowRate', label: 'Hero follow rate', type: 'range', min: 0.5, max: 8, step: 0.1, default: 2.5 },
      ],
    },
    {
      id: 'lighting',
      label: 'Lighting',
      parameters: [
        { id: 'ambientIntensity', label: 'Ambient', type: 'range', min: 0, max: 2, step: 0.01, default: 0.39 },
        { id: 'hemisphereIntensity', label: 'Hemisphere', type: 'range', min: 0, max: 2, step: 0.01, default: 0.74 },
        { id: 'windowIntensity', label: 'Window light', type: 'range', min: 0, max: 4, step: 0.05, default: 2.2 },
        { id: 'windowElevationDeg', label: 'Window sun elevation', type: 'range', min: 5, max: 80, step: 1, default: 36 },
        { id: 'windowColor', label: 'Window color', type: 'color', default: '#a7b8d8' },
        { id: 'gaslightIntensity', label: 'Gaslight', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
        { id: 'gaslightFlicker', label: 'Gaslight flicker ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
        { id: 'gaslightColor', label: 'Gaslight color', type: 'color', default: '#ffb45e' },
        { id: 'shadowsEnabled', label: 'Shadows', type: 'toggle', default: true },
        { id: 'shadowRadius', label: 'Shadow softness', type: 'range', min: 0, max: 10, step: 0.5, default: 8 },
      ],
    },
    {
      id: 'environment',
      label: 'Environment (outdoor)',
      parameters: [
        { id: 'timeOfDay', label: 'Time of day', type: 'range', min: 5, max: 21, step: 0.1, default: 15.5 },
        { id: 'sunIntensity', label: 'Sun intensity', type: 'range', min: 0, max: 3, step: 0.05, default: 0.95 },
        { id: 'skyTurbidity', label: 'Sky turbidity', type: 'range', min: 0.1, max: 10, step: 0.05, default: 6.65 },
        { id: 'skyRayleigh', label: 'Sky rayleigh', type: 'range', min: 0.3, max: 4, step: 0.05, default: 0.4 },
        { id: 'skyMie', label: 'Sky haze (mie)', type: 'range', min: 0, max: 0.01, step: 0.0001, default: 0.009 },
        { id: 'cloudCover', label: 'Cloud cover', type: 'range', min: 0, max: 1, step: 0.02, default: 0.86 },
        { id: 'cloudCumulus', label: 'Cloud puffiness', type: 'range', min: 0, max: 1, step: 0.02, default: 0.78 },
        { id: 'cloudScale', label: 'Cloud scale', type: 'range', min: 0.4, max: 2.5, step: 0.05, default: 1.8 },
        { id: 'cloudSpeed', label: 'Cloud drift', type: 'range', min: 0, max: 5, step: 0.1, default: 1.6 },
        { id: 'fogDensity', label: 'Fog density', type: 'range', min: 0, max: 0.05, step: 0.001, default: 0.004 },
        { id: 'envIntensity', label: 'Environment light', type: 'range', min: 0, max: 2, step: 0.05, default: 0.45 },
      ],
    },
    {
      id: 'renderer',
      label: 'Renderer',
      parameters: [
        { id: 'exposure', label: 'Exposure', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 1.05 },
        { id: 'postEnabled', label: 'Post-processing', type: 'toggle', default: true, mode: 'rebuild' },
        { id: 'bloomIntensity', label: 'Bloom intensity', type: 'range', min: 0, max: 2, step: 0.05, default: 0.9 },
        { id: 'bloomThreshold', label: 'Bloom threshold', type: 'range', min: 0.2, max: 1, step: 0.02, default: 0.98 },
        { id: 'toneMapping', label: 'Tone mapping', type: 'select', options: ['ACESFilmic', 'AgX', 'Neutral', 'Linear'], default: 'Neutral', mode: 'rebuild' },
        { id: 'shadowMapSize', label: 'Shadow map size', type: 'select', options: ['512', '1024', '2048'], default: '2048', mode: 'rebuild' },
        { id: 'pixelRatioCap', label: 'Pixel ratio cap', type: 'range', min: 0.5, max: 2, step: 0.25, default: 2 },
        { id: 'antialias', label: 'Antialias', type: 'toggle', default: true, mode: 'rebuild' },
        { id: 'showColliders', label: 'Show colliders', type: 'toggle', default: false },
        { id: 'showAvatarGlb', label: 'Show avatar GLB', type: 'toggle', default: false, mode: 'rebuild' },
      ],
    },
  ],
};

export function schemaParameters(schema) {
  return schema.groups.flatMap((group) =>
    group.parameters.map((parameter) => ({ mode: 'live', ...parameter, group: group.id })),
  );
}

export function schemaDefaults(schema) {
  const values = {};
  for (const parameter of schemaParameters(schema)) values[parameter.id] = parameter.default;
  return values;
}

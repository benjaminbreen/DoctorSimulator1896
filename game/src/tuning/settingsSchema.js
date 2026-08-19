// Tuning parameter schema. The panel, runtime store, and tests all read this.
// mode: 'live' params are read every frame; 'rebuild' params remount the canvas.
// Defaults are Ben's tuned values (2026-08-09).

export const STARTING_ZONE = 'central-park';
export const STARTING_TIME = 9.5;

export const settingsSchema = {
  version: 5,
  groups: [
    {
      id: 'world',
      label: 'World',
      parameters: [
        {
          id: 'zone',
          label: 'Zone (fast travel)',
          type: 'select',
          options: [
            'consulting-office',
            'waiting-room',
            'foyer',
            'cattell-lab',
            'metropolitan-club-lobby',
            'new-netherland-lobby',
            'central-park',
            'interior:fifth-east-a-0',
            'interior:fifth-east-a-2',
            'interior:navarro-flats-b',
          ],
          default: STARTING_ZONE,
          mode: 'rebuild',
        },
        // 0 keeps the normal seeded schedule (a few events a day). Above 0,
        // an extra street event fires every N game-minutes, for testing.
        { id: 'eventTestMinutes', label: 'Street event gap (min, 0=normal)', type: 'range', min: 0, max: 30, step: 1, default: 0 },
        // Lawn tuft scatter in the park. Amount multiplies the planting
        // chance, size the clump scale; both rebuild the zone.
        { id: 'tuftAmount', label: 'Grass amount ×', type: 'range', min: 0, max: 2.5, step: 0.1, default: 1, mode: 'rebuild' },
        { id: 'tuftSize', label: 'Grass size ×', type: 'range', min: 0.5, max: 2, step: 0.05, default: 2, mode: 'rebuild' },
      ],
    },
    {
      id: 'interiors',
      label: 'Interiors',
      parameters: [
        { id: 'interiorScaleS', label: 'Small scale ×', type: 'range', min: 0.6, max: 1.8, step: 0.05, default: 1, mode: 'rebuild' },
        { id: 'interiorScaleM', label: 'Medium scale ×', type: 'range', min: 0.6, max: 1.8, step: 0.05, default: 1, mode: 'rebuild' },
        { id: 'interiorScaleL', label: 'Large scale ×', type: 'range', min: 0.6, max: 1.8, step: 0.05, default: 1, mode: 'rebuild' },
        { id: 'interiorScaleXL', label: 'Atrium scale ×', type: 'range', min: 0.6, max: 1.8, step: 0.05, default: 1, mode: 'rebuild' },
        { id: 'interiorDensity', label: 'Prop density', type: 'range', min: 0.4, max: 1.6, step: 0.05, default: 1, mode: 'rebuild' },
        { id: 'aoEnabled', label: 'Ambient occlusion', type: 'toggle', default: true, mode: 'rebuild' },
        { id: 'aoIntensity', label: 'AO strength', type: 'range', min: 0, max: 6, step: 0.1, default: 3.7 },
        { id: 'aoRadius', label: 'AO radius', type: 'range', min: 0.1, max: 3, step: 0.05, default: 1.75 },
      ],
    },
    {
      id: 'movement',
      label: 'Movement',
      parameters: [
        { id: 'walkSpeed', label: 'Walk speed', type: 'range', min: 0.5, max: 14, step: 0.05, default: 4.1 },
        { id: 'runSpeed', label: 'Run speed', type: 'range', min: 1, max: 20, step: 0.05, default: 8 },
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
        { id: 'pushProps', label: 'Push loose furniture', type: 'toggle', default: true, mode: 'rebuild' },
        // Sets how hard a walk into loose furniture shoves it. A real 80kg at
        // walking speed throws a chair across the room; this is a shove knob,
        // not a weight.
        { id: 'characterMass', label: 'Push strength (kg)', type: 'range', min: 2, max: 120, step: 1, default: 2, mode: 'rebuild' },
      ],
    },
    {
      id: 'camera',
      label: 'Camera',
      parameters: [
        { id: 'cameraMode', label: 'Camera mode (M cycles)', type: 'select', options: ['shoulder', 'first', 'overhead', 'hero'], default: 'shoulder' },
        { id: 'shoulderSide', label: 'Shoulder side', type: 'range', min: -2, max: 2, step: 0.05, default: 1.05 },
        { id: 'shoulderUp', label: 'Shoulder up', type: 'range', min: 0.5, max: 4, step: 0.05, default: 2.55 },
        { id: 'shoulderBack', label: 'Shoulder back', type: 'range', min: 1, max: 8, step: 0.05, default: 4 },
        // Scales the whole boom. The mouse wheel writes this same value.
        { id: 'cameraZoom', label: 'Camera zoom', type: 'range', min: 0.35, max: 2.5, step: 0.01, default: 0.69 },
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
        { id: 'overheadHeight', label: 'Overhead height', type: 'range', min: 8, max: 45, step: 0.5, default: 16 },
        // Overhead gets its own wheel range: 16 x 16 = 256m, enough to frame
        // the whole park for map cross-reference.
        { id: 'overheadZoom', label: 'Overhead zoom', type: 'range', min: 0.5, max: 16, step: 0.05, default: 2.5 },
        // Hero is a distinct follow-camera profile. It must not inherit a
        // shoulder framing change made for a cramped interior.
        { id: 'heroSide', label: 'Hero side', type: 'range', min: -1, max: 1, step: 0.05, default: 0.25 },
        { id: 'heroUp', label: 'Hero height', type: 'range', min: 1.2, max: 3.5, step: 0.05, default: 2.05 },
        { id: 'heroBack', label: 'Hero distance', type: 'range', min: 2, max: 7, step: 0.05, default: 4.2 },
        { id: 'heroZoom', label: 'Hero zoom', type: 'range', min: 0.65, max: 1.6, step: 0.01, default: 1 },
        { id: 'heroDefaultPitch', label: 'Hero starting pitch', type: 'range', min: -0.3, max: 0.6, step: 0.01, default: 0 },
        { id: 'heroFov', label: 'Hero field of view', type: 'range', min: 45, max: 75, step: 1, default: 60 },
        { id: 'heroRunFovBoost', label: 'Hero running FOV +', type: 'range', min: 0, max: 10, step: 0.5, default: 4 },
        { id: 'heroFollowRate', label: 'Hero follow rate', type: 'range', min: 0.5, max: 8, step: 0.1, default: 3.5 },
        { id: 'heroRecenterDelay', label: 'Hero recenter delay', type: 'range', min: 0, max: 3, step: 0.05, default: 0.9 },
        { id: 'heroLookAhead', label: 'Hero look-ahead', type: 'range', min: 0, max: 2, step: 0.05, default: 0.65 },
        { id: 'heroPositionDamping', label: 'Hero follow damping', type: 'range', min: 1, max: 20, step: 0.1, default: 9 },
        { id: 'heroYDamping', label: 'Hero vertical damping', type: 'range', min: 0.5, max: 15, step: 0.1, default: 5 },
        { id: 'heroOcclusionReturn', label: 'Hero obstruction return', type: 'range', min: 0.5, max: 10, step: 0.1, default: 4 },
        { id: 'heroCollisionRadius', label: 'Hero camera radius', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.22 },
      ],
    },
    {
      id: 'lighting',
      label: 'Lighting',
      parameters: [
        { id: 'ambientIntensity', label: 'Ambient', type: 'range', min: 0, max: 2, step: 0.01, default: 0.37 },
        { id: 'hemisphereIntensity', label: 'Hemisphere', type: 'range', min: 0, max: 2, step: 0.01, default: 0.21 },
        { id: 'windowIntensity', label: 'Window light', type: 'range', min: 0, max: 4, step: 0.05, default: 1 },
        { id: 'windowElevationDeg', label: 'Window sun elevation', type: 'range', min: 5, max: 80, step: 1, default: 57 },
        { id: 'windowColor', label: 'Window color', type: 'color', default: '#a7b8d8' },
        { id: 'gaslightIntensity', label: 'Gaslight', type: 'range', min: 0, max: 3, step: 0.05, default: 2.25 },
        { id: 'gaslightFlicker', label: 'Gaslight flicker ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1.2 },
        { id: 'gaslightColor', label: 'Gaslight color', type: 'color', default: '#ffb45e' },
        { id: 'interiorEnvIntensity', label: 'Interior reflections', type: 'range', min: 0, max: 2, step: 0.05, default: 0.5 },
        { id: 'glassSheen', label: 'Window glass sheen', type: 'range', min: 0, max: 2, step: 0.05, default: 0.7 },
        { id: 'glassGrime', label: 'Window glass dirt', type: 'range', min: 0, max: 1, step: 0.05, default: 1 },
        { id: 'shadowsEnabled', label: 'Shadows', type: 'toggle', default: true },
        { id: 'shadowRadius', label: 'Shadow softness', type: 'range', min: 0, max: 10, step: 0.5, default: 6 },
        // Multipliers on the beam and its dust, so the two can be pushed
        // apart. Both default to 1: the room looks the same until moved.
        { id: 'shaftIntensity', label: 'Light shaft ×', type: 'range', min: 0, max: 3, step: 0.05, default: 2.55 },
        { id: 'moteDensity', label: 'Dust motes ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1.7 },
      ],
    },
    {
      // The procedural view through an interior window: sky graded to the
      // hour, and three ranks of brownstones beyond it. Everything here is
      // live except the sample count, which changes the shader.
      id: 'windowSky',
      label: 'Window view',
      parameters: [
        { id: 'skyBlur', label: 'Defocus', type: 'range', min: 0, max: 0.03, step: 0.0005, default: 0.0025 },
        { id: 'skyBlurTaps', label: 'Defocus samples', type: 'select', options: ['1', '4', '8'], default: '4', mode: 'rebuild' },
        // Where the street is relative to the floor: the knob that decides
        // how high up the window the roofline crosses.
        { id: 'skyGroundDrop', label: 'Street below floor (m)', type: 'range', min: 0, max: 60, step: 0.5, default: 7 },
        { id: 'skyHeight', label: 'Building height ×', type: 'range', min: 0.2, max: 3, step: 0.05, default: 0.55 },
        { id: 'skyFrontage', label: 'Frontage width ×', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1.1 },
        { id: 'skyDistance', label: 'Block distance ×', type: 'range', min: 0.3, max: 3, step: 0.05, default: 0.7 },
        { id: 'skyHaze', label: 'Smoke haze ×', type: 'range', min: 0, max: 2, step: 0.05, default: 0.4 },
        { id: 'skyGradient', label: 'Sky gradient span', type: 'range', min: 0.15, max: 1.5, step: 0.05, default: 0.2 },
        { id: 'skyBrightness', label: 'Sky brightness ×', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 0.75 },
        { id: 'skyLitWindows', label: 'Lit windows ×', type: 'range', min: 0, max: 2, step: 0.05, default: 0.5 },
      ],
    },
    {
      id: 'environment',
      label: 'Environment (outdoor)',
      parameters: [
        { id: 'timeOfDay', label: 'Time of day (0–24h)', type: 'range', min: 0, max: 24, step: 0.1, default: STARTING_TIME },
        { id: 'sunIntensity', label: 'Sun intensity', type: 'range', min: 0, max: 3, step: 0.05, default: 0.75 },
        { id: 'sunDiscSize', label: 'Sun disc size', type: 'range', min: 0, max: 3, step: 0.05, default: 0.95 },
        { id: 'sunGlow', label: 'Sun glow', type: 'range', min: 0, max: 3, step: 0.05, default: 2.6 },
        { id: 'skyTurbidity', label: 'Sky turbidity', type: 'range', min: 0.1, max: 10, step: 0.05, default: 4.85 },
        { id: 'skyRayleigh', label: 'Sky rayleigh', type: 'range', min: 0.1, max: 6, step: 0.05, default: 1.7 },
        { id: 'skyMie', label: 'Sky haze (mie)', type: 'range', min: 0, max: 0.01, step: 0.0001, default: 0.0012 },
        { id: 'skyGain', label: 'Sky brightness', type: 'range', min: 0.1, max: 3, step: 0.05, default: 1.45 },
        { id: 'skySaturation', label: 'Sky saturation', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1.15 },
        { id: 'nightSkyBrightness', label: 'Night sky brightness ×', type: 'range', min: 0.3, max: 2.5, step: 0.05, default: 1 },
        { id: 'citySkyGlow', label: 'City horizon glow ×', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1 },
        { id: 'starBrightness', label: 'Star brightness ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
        { id: 'moonSize', label: 'Moon size ×', type: 'range', min: 0.5, max: 3, step: 0.05, default: 1 },
        { id: 'moonlightIntensity', label: 'Moonlight ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
        { id: 'cloudCover', label: 'Cloud cover', type: 'range', min: 0, max: 1, step: 0.02, default: 0.56 },
        { id: 'cloudCumulus', label: 'Cloud puffiness', type: 'range', min: 0, max: 1, step: 0.02, default: 0.68 },
        { id: 'cloudScale', label: 'Cloud scale', type: 'range', min: 0.4, max: 2.5, step: 0.05, default: 1 },
        { id: 'cloudSpeed', label: 'Cloud drift', type: 'range', min: 0, max: 5, step: 0.1, default: 1.6 },
        { id: 'windStrength', label: 'Wind strength', type: 'range', min: 0, max: 3, step: 0.05, default: 0.75 },
        { id: 'windSpeed', label: 'Wind speed', type: 'range', min: 0, max: 4, step: 0.05, default: 1.1 },
        // Procedural pigeons stay one instanced draw regardless of count.
        // Size defaults above life scale so the distant silhouettes survive fog.
        { id: 'pigeonCount', label: 'Pigeon count', type: 'range', min: 0, max: 14, step: 1, default: 14 },
        { id: 'pigeonSize', label: 'Pigeon size ×', type: 'range', min: 0.5, max: 4, step: 0.05, default: 1.3 },
        { id: 'pigeonSpeed', label: 'Pigeon speed ×', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 0.7 },
        { id: 'pigeonAltitude', label: 'Pigeon altitude + (m)', type: 'range', min: -15, max: 20, step: 0.5, default: -0.5 },
        { id: 'pigeonContinuous', label: 'Continuous pigeons', type: 'toggle', default: true },
        { id: 'pigeonSoloCount', label: 'Solo pigeons', type: 'range', min: 0, max: 2, step: 1, default: 2 },
        { id: 'beeCount', label: 'Bee count', type: 'range', min: 0, max: 44, step: 1, default: 33 },
        { id: 'beeSize', label: 'Bee size ×', type: 'range', min: 0.1, max: 4, step: 0.05, default: 0.4 },
        { id: 'beeSpeed', label: 'Bee speed ×', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 1 },
        { id: 'beeSpread', label: 'Bee spread ×', type: 'range', min: 0.25, max: 3, step: 0.05, default: 1.5 },
        { id: 'butterflyCount', label: 'Butterfly count', type: 'range', min: 0, max: 32, step: 1, default: 18 },
        { id: 'butterflySize', label: 'Butterfly size ×', type: 'range', min: 0.4, max: 3, step: 0.05, default: 1 },
        { id: 'butterflySpeed', label: 'Butterfly speed ×', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 1 },
        { id: 'butterflySpread', label: 'Butterfly spread ×', type: 'range', min: 0.4, max: 2.5, step: 0.05, default: 1 },
        { id: 'fireflyCount', label: 'Firefly count', type: 'range', min: 0, max: 88, step: 1, default: 55 },
        { id: 'fireflySize', label: 'Firefly glow ×', type: 'range', min: 0.4, max: 3, step: 0.05, default: 1 },
        { id: 'fireflySpeed', label: 'Firefly speed ×', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 1 },
        { id: 'fireflySpread', label: 'Firefly spread ×', type: 'range', min: 0.4, max: 2.5, step: 0.05, default: 1 },
        // Separate from the interior slider: the sun's shadow map covers ~50m,
        // so the same texel radius blurs a metre wide outdoors and a few cm in.
        { id: 'sunShadowRadius', label: 'Sun shadow softness', type: 'range', min: 0, max: 6, step: 0.25, default: 1 },
        { id: 'outdoorShadowDistance', label: 'Outdoor shadow distance (m)', type: 'range', min: 10, max: 80, step: 1, default: 25 },
        { id: 'fogDensity', label: 'Fog density', type: 'range', min: 0, max: 0.05, step: 0.001, default: 0.004 },
        { id: 'envIntensity', label: 'Environment light', type: 'range', min: 0, max: 3, step: 0.05, default: 0.45 },
        // Outdoor fill: multipliers on the zone's hemisphere light. skyFill
        // lifts everything the sun misses; groundBounce is the sunlit-lawn
        // component, so it fades with daylight and warms faces from below.
        { id: 'skyFill', label: 'Sky fill ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1.5 },
        { id: 'groundBounce', label: 'Ground bounce ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1.4 },
      ],
    },
    {
      id: 'water',
      label: 'Water',
      parameters: [
        { id: 'waterReflectivity', label: 'Reflectivity', type: 'range', min: 0, max: 2, step: 0.02, default: 0.76 },
        { id: 'waterMirrorStrength', label: 'Scene reflection', type: 'range', min: 0, max: 1, step: 0.02, default: 0.84 },
        { id: 'waterReflectionBlur', label: 'Reflection blur', type: 'range', min: 0, max: 0.02, step: 0.0005, default: 0.0065 },
        { id: 'waterReflectionDistortion', label: 'Reflection distortion', type: 'range', min: 0, max: 1.5, step: 0.02, default: 0.42 },
        { id: 'waterRefraction', label: 'Refraction / transmission', type: 'range', min: 0, max: 1, step: 0.02, default: 0.42 },
        { id: 'waterAbsorption', label: 'Depth absorption', type: 'range', min: 0.1, max: 3, step: 0.05, default: 3 },
        { id: 'waterRippleOctaves', label: 'Ripple octaves', type: 'range', min: 1, max: 4, step: 1, default: 3 },
        { id: 'waterRippleScale', label: 'Ripple scale', type: 'range', min: 0.25, max: 2.5, step: 0.05, default: 0.35 },
        { id: 'waterRippleStrength', label: 'Ripple strength', type: 'range', min: 0, max: 2, step: 0.02, default: 1.48 },
        { id: 'waterRippleSpeed', label: 'Ripple drift', type: 'range', min: 0, max: 3, step: 0.05, default: 2.55 },
        { id: 'waterRippleFarStrength', label: 'Distant ripples', type: 'range', min: 0, max: 1, step: 0.02, default: 0.16 },
        { id: 'waterShoreWidth', label: 'Shallow margin width', type: 'range', min: 0.03, max: 0.8, step: 0.01, default: 0.64 },
        { id: 'waterShoreTint', label: 'Shallow margin tint', type: 'range', min: 0, max: 1, step: 0.02, default: 0.94 },
        { id: 'waterShoreFoam', label: 'Waterline breakup', type: 'range', min: 0, max: 2, step: 0.02, default: 0.76 },
        { id: 'waterShoreColor', label: 'Shallow margin colour', type: 'color', default: '#2a2414' },
        { id: 'waterInteractionStrength', label: 'Movement response', type: 'range', min: 0, max: 3, step: 0.05, default: 2.35 },
        { id: 'waterWaveSpeed', label: 'Movement wave speed', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1.2 },
        { id: 'waterWaveDamping', label: 'Movement wave damping', type: 'range', min: 0.2, max: 4, step: 0.05, default: 0.95 },
      ],
    },
    {
      id: 'renderer',
      label: 'Renderer',
      parameters: [
        { id: 'exposure', label: 'Exposure', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 1.05 },
        { id: 'postEnabled', label: 'Post-processing (all)', type: 'toggle', default: true, mode: 'rebuild' },
        // Per-effect switches, so a frame cost can be attributed to one pass
        // instead of to the whole chain. Each removes its pass from the
        // composer; turning an effect down to zero still pays for it.
        { id: 'bloomEnabled', label: '· Bloom', type: 'toggle', default: true, mode: 'rebuild' },
        { id: 'bloomIntensity', label: 'Bloom intensity', type: 'range', min: 0, max: 2, step: 0.05, default: 0.9 },
        { id: 'bloomThreshold', label: 'Bloom threshold', type: 'range', min: 0.2, max: 1, step: 0.02, default: 0.98 },
        { id: 'vignetteEnabled', label: '· Vignette', type: 'toggle', default: true, mode: 'rebuild' },
        { id: 'vignetteAmount', label: 'Vignette ×', type: 'range', min: 0, max: 2, step: 0.05, default: 1 },
        { id: 'aoOutdoors', label: '· Ambient shading outdoors', type: 'toggle', default: false, mode: 'rebuild' },
        { id: 'toneMapping', label: 'Tone mapping', type: 'select', options: ['ACESFilmic', 'AgX', 'Neutral', 'Linear'], default: 'ACESFilmic', mode: 'rebuild' },
        // The one shadow-casting window portal doubles this; see LightingRig.
        { id: 'shadowMapSize', label: 'Shadow map size', type: 'select', options: ['512', '1024', '2048'], default: '1024', mode: 'rebuild' },
        { id: 'pixelRatioCap', label: 'Pixel ratio cap', type: 'range', min: 0.5, max: 2, step: 0.25, default: 2 },
        { id: 'antialias', label: 'Antialias', type: 'toggle', default: true, mode: 'rebuild' },
        { id: 'showColliders', label: 'Show colliders', type: 'toggle', default: false },
        { id: 'showAvatarGlb', label: 'Rigged player figure', type: 'toggle', default: true, mode: 'rebuild' },
      ],
    },
    {
      id: 'grade',
      label: 'Colour grade',
      parameters: [
        // Outdoors only, matching where the warm cast is authored. All four
        // ride in one shader pass, so moving them costs nothing extra.
        { id: 'gradeEnabled', label: 'Colour grade', type: 'toggle', default: true, mode: 'rebuild' },
        { id: 'gradeWarmth', label: 'Warmth ×', type: 'range', min: 0, max: 3, step: 0.05, default: 1.2 },
        { id: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.02, default: 1.08 },
        { id: 'contrast', label: 'Contrast', type: 'range', min: 0.5, max: 1.8, step: 0.02, default: 1 },
        // White is a no-op multiplier; anything else tints the finished image.
        { id: 'gradeTint', label: 'Tint', type: 'color', default: '#ffffff' },
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

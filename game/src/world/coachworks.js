// Recipe-driven 1890s coachwork for the props workshop. The five presets
// share this builder; horses, harness, drivers, and traffic belong to the
// moving-team layer added in the next phase.

const TYPES = ['utility', 'hansom', 'brougham', 'landau', 'omnibus', 'horsecar'];
const TYPE_LABELS = {
  utility: 'Coal / delivery wagon',
  hansom: 'Hansom cab',
  brougham: 'Brougham',
  landau: 'Landau',
  omnibus: 'Omnibus',
  horsecar: 'Street railway horsecar',
};

export const COACHWORKS_SCHEMA = {
  version: 1,
  groups: [
    {
      id: 'pattern',
      label: 'Coach pattern',
      parameters: [
        {
          id: 'vehicleType', label: 'Vehicle type', type: 'select', options: TYPES,
          optionLabels: TYPE_LABELS, default: 'utility', vary: false,
        },
        {
          id: 'team', label: 'Horse team', type: 'select', options: ['single', 'pair'],
          optionLabels: { single: 'Single horse — shafts', pair: 'Pair — pole' },
          default: 'single', vary: false,
        },
        {
          id: 'load', label: 'Wagon load', type: 'select', options: ['coal', 'crates', 'empty'],
          optionLabels: { coal: 'Coal', crates: 'Crates', empty: 'Empty' },
          default: 'coal', vary: false,
        },
      ],
    },
    {
      id: 'proportions',
      label: 'Proportions',
      parameters: [
        { id: 'bodyLength', label: 'Body length (m)', type: 'range', min: 1.65, max: 4.6, step: 0.05, default: 2.3 },
        { id: 'bodyWidth', label: 'Body width (m)', type: 'range', min: 1.2, max: 2.1, step: 0.025, default: 1.48 },
        { id: 'bodyHeight', label: 'Body height (m)', type: 'range', min: 0.55, max: 2.5, step: 0.05, default: 0.85 },
        { id: 'rideHeight', label: 'Floor height (m)', type: 'range', min: 0.72, max: 1.25, step: 0.025, default: 0.94 },
        { id: 'axleSpread', label: 'Axle spread (m)', type: 'range', min: 1.25, max: 3.4, step: 0.05, default: 1.75 },
        { id: 'trackWidth', label: 'Wheel track (m)', type: 'range', min: 1.35, max: 2.2, step: 0.025, default: 1.62 },
        { id: 'frontWheelRadius', label: 'Front wheel radius (m)', type: 'range', min: 0.38, max: 0.82, step: 0.025, default: 0.55 },
        { id: 'rearWheelRadius', label: 'Rear wheel radius (m)', type: 'range', min: 0.5, max: 1.18, step: 0.025, default: 0.78 },
      ],
    },
    {
      id: 'equipment',
      label: 'Equipment',
      parameters: [
        { id: 'hoodRaised', label: 'Landau hood raised', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55, vary: false },
        { id: 'coachLamps', label: 'Coach lamps', type: 'toggle', default: true, vary: false },
        { id: 'passengerSteps', label: 'Passenger steps', type: 'toggle', default: true, vary: false },
      ],
    },
    {
      id: 'finish',
      label: 'Livery and finish',
      parameters: [
        { id: 'bodyColor', label: 'Body colour', type: 'color', default: '#26372f', vary: false },
        { id: 'trimColor', label: 'Lining colour', type: 'color', default: '#b28a3a', vary: false },
        { id: 'wheelColor', label: 'Wheel colour', type: 'color', default: '#6d4a2e', vary: false },
        { id: 'upholsteryColor', label: 'Upholstery', type: 'color', default: '#5b302b', vary: false },
      ],
    },
  ],
};

const PRESETS = {
  utility: {
    vehicleType: 'utility', team: 'pair', load: 'coal',
    bodyLength: 2.65, bodyWidth: 1.55, bodyHeight: 0.78, rideHeight: 1.02,
    axleSpread: 1.95, trackWidth: 1.72, frontWheelRadius: 0.58, rearWheelRadius: 0.74,
    hoodRaised: 0, coachLamps: false, passengerSteps: false,
    bodyColor: '#4c473d', trimColor: '#242526', wheelColor: '#54422f', upholsteryColor: '#4b382c',
  },
  hansom: {
    vehicleType: 'hansom', team: 'single', load: 'empty',
    bodyLength: 2.05, bodyWidth: 1.42, bodyHeight: 1.52, rideHeight: 0.76,
    axleSpread: 1.35, trackWidth: 1.62, frontWheelRadius: 0.62, rearWheelRadius: 0.98,
    hoodRaised: 0, coachLamps: true, passengerSteps: true,
    bodyColor: '#171f1b', trimColor: '#c39b45', wheelColor: '#b78a31', upholsteryColor: '#4b2b26',
  },
  brougham: {
    vehicleType: 'brougham', team: 'single', load: 'empty',
    bodyLength: 2.58, bodyWidth: 1.5, bodyHeight: 1.6, rideHeight: 0.96,
    axleSpread: 1.85, trackWidth: 1.72, frontWheelRadius: 0.56, rearWheelRadius: 0.84,
    hoodRaised: 0, coachLamps: true, passengerSteps: true,
    bodyColor: '#21352f', trimColor: '#b68b38', wheelColor: '#6b352b', upholsteryColor: '#5a2b2b',
  },
  landau: {
    vehicleType: 'landau', team: 'pair', load: 'empty',
    bodyLength: 3.05, bodyWidth: 1.68, bodyHeight: 1.42, rideHeight: 1.06,
    axleSpread: 2.3, trackWidth: 1.9, frontWheelRadius: 0.62, rearWheelRadius: 0.98,
    hoodRaised: 0.62, coachLamps: true, passengerSteps: true,
    bodyColor: '#263b34', trimColor: '#b79347', wheelColor: '#76412f', upholsteryColor: '#6e3b34',
  },
  omnibus: {
    vehicleType: 'omnibus', team: 'pair', load: 'empty',
    bodyLength: 4.2, bodyWidth: 1.9, bodyHeight: 2.18, rideHeight: 1.12,
    axleSpread: 2.95, trackWidth: 2.05, frontWheelRadius: 0.68, rearWheelRadius: 1.02,
    hoodRaised: 0, coachLamps: true, passengerSteps: true,
    bodyColor: '#3d552f', trimColor: '#d0a84f', wheelColor: '#7a3029', upholsteryColor: '#6a332c',
  },
  // Belt Line crosstown car (Central Park, North & East River R.R.), still
  // horse-drawn in 1896: low floor on small equal wheels tucked under the
  // body at track gauge, platforms and dashes at both ends, clerestory roof.
  horsecar: {
    vehicleType: 'horsecar', team: 'pair', load: 'empty',
    bodyLength: 4.5, bodyWidth: 1.98, bodyHeight: 1.95, rideHeight: 0.72,
    axleSpread: 1.9, trackWidth: 1.5, frontWheelRadius: 0.36, rearWheelRadius: 0.36,
    hoodRaised: 0, coachLamps: true, passengerSteps: false,
    bodyColor: '#7e2a20', trimColor: '#e4d6aa', wheelColor: '#463c34', upholsteryColor: '#5a4534',
  },
};

const IRON = { finish: 'iron' };
const BRASS = { finish: 'brass' };
const WINDOW = { glass: true, color: '#263c43', opacity: 0.62 };
const CANVAS = { finish: 'coachCanvas', color: '#252b28' };

function paint(color) {
  return { finish: 'coachPaint', color };
}

function leather(color) {
  return { finish: 'coachLeather', color };
}

function add(parts, sculptPart, position, size, options = {}) {
  parts.push({ sculptPart, position, size, ...options });
}

function addWheel(parts, id, x, z, radius, paint, phase = 0) {
  const width = 0.075;
  add(parts, `${id}-iron-tyre`, [x, radius, z], [radius * 2, 0.055, radius * 2], {
    shape: 'torus', radialSegments: 24, ...IRON,
  });
  add(parts, `${id}-felloe`, [x, radius, z], [radius * 2 - 0.1, 0.085, radius * 2 - 0.1], {
    shape: 'torus', radialSegments: 24, color: paint, roughness: 0.52,
  });
  add(parts, `${id}-hub`, [x, radius, z], [0.18, width * 2.2, 0.18], {
    shape: 'cylinder', radialSegments: 12, rotation: [Math.PI / 2, 0, 0], color: paint, roughness: 0.48,
  });
  add(parts, `${id}-axle-cap`, [x, radius, z + Math.sign(z || 1) * width * 1.25], [0.075, 0.045, 0.075], {
    shape: 'cylinder', radialSegments: 8, rotation: [Math.PI / 2, 0, 0], ...BRASS,
  });
  for (let spoke = 0; spoke < 6; spoke += 1) {
    add(parts, `${id}-spokes-${spoke}`, [x, radius, z], [0.028, radius * 1.72, 0.028], {
      rotation: [0, 0, phase + (spoke * Math.PI) / 6], color: paint, roughness: 0.58,
    });
  }
}

function addAxle(parts, id, x, radius, track) {
  add(parts, `${id}-axle`, [x, radius, 0], [0.075, track + 0.24, 0.075], {
    shape: 'cylinder', radialSegments: 10, rotation: [Math.PI / 2, 0, 0], ...IRON,
  });
}

function addPoleOrShafts(parts, values, frontX, floorY) {
  const length = values.team === 'pair' ? 2.55 : 2.45;
  const start = frontX + 0.08;
  const centre = start + length / 2;
  if (values.team === 'pair') {
    add(parts, 'pair-pole', [centre, floorY - 0.22, 0], [0.075, length, 0.075], {
      shape: 'cylinder', radialSegments: 10, rotation: [0, 0, Math.PI / 2], color: '#59452f', roughness: 0.72,
    });
    add(parts, 'pair-splinter-bar', [start + length - 0.22, floorY - 0.22, 0], [0.11, 0.075, 1.35], {
      shape: 'roundedBox', bevelRadius: 0.025, color: '#59452f', roughness: 0.72,
    });
    for (const side of [-1, 1]) {
      add(parts, `pair-singletree-${side}`, [start + length - 0.02, floorY - 0.22, side * 0.43], [0.1, 0.055, 0.54], {
        shape: 'roundedBox', bevelRadius: 0.02, color: '#59452f', roughness: 0.72,
      });
    }
  } else {
    for (const side of [-1, 1]) {
      add(parts, `single-shaft-${side}`, [centre, floorY - 0.22, side * 0.48], [length, 0.055, 0.055], {
        shape: 'roundedBox', bevelRadius: 0.018, rotation: [0, 0, side * 0.018],
        color: '#59452f', roughness: 0.72,
      });
      add(parts, `single-shaft-tip-${side}`, [start + length, floorY - 0.22, side * 0.48], [0.09, 0.065, 0.065], {
        shape: 'cylinder', radialSegments: 8, rotation: [0, 0, Math.PI / 2], ...IRON,
      });
    }
  }
  return start + length;
}

function addRunningGear(parts, values, twoWheels = false) {
  const spread = Math.min(values.axleSpread, values.bodyLength * 0.78);
  const frontX = twoWheels ? -values.bodyLength * 0.08 : spread / 2;
  const rearX = twoWheels ? frontX : -spread / 2;
  const floorY = values.rideHeight;
  const track = Math.max(values.trackWidth, values.bodyWidth + 0.1);
  const wheelPaint = values.wheelColor;

  if (!twoWheels) {
    addAxle(parts, 'front', frontX, values.frontWheelRadius, track);
    for (const side of [-1, 1]) {
      addWheel(parts, `front-wheel-${side}`, frontX, side * track / 2, values.frontWheelRadius, wheelPaint, 0.08);
    }
  }
  addAxle(parts, 'rear', rearX, values.rearWheelRadius, track);
  for (const side of [-1, 1]) {
    addWheel(parts, `rear-wheel-${side}`, rearX, side * track / 2, values.rearWheelRadius, wheelPaint, 0.02);
  }

  const railLength = twoWheels ? values.bodyLength * 0.9 : spread + 0.55;
  for (const side of [-1, 1]) {
    add(parts, `chassis-rail-${side}`, [twoWheels ? 0 : 0, floorY - 0.22, side * values.bodyWidth * 0.34], [railLength, 0.11, 0.09], {
      shape: 'roundedBox', bevelRadius: 0.025, ...IRON,
    });
  }
  if (!twoWheels) {
    for (const [name, x, radius] of [['front', frontX, values.frontWheelRadius], ['rear', rearX, values.rearWheelRadius]]) {
      for (const side of [-1, 1]) {
        add(parts, `${name}-spring-${side}`, [x, floorY - 0.12, side * values.bodyWidth * 0.34], [0.64, 0.045, 0.08], {
          shape: 'roundedBox', bevelRadius: 0.018, rotation: [0, 0, side * 0.035], ...IRON,
        });
      }
    }
  }
  const poleEnd = addPoleOrShafts(parts, values, Math.max(frontX, values.bodyLength / 2), floorY);
  return { floorY, frontX, rearX, track, poleEnd };
}

// Street-railway running gear: solid disc wheels at track gauge, tucked
// under the body rather than outside it, no springs worth seeing. The pole
// and swingletrees keep their authored names so the dynamic harness rig
// repositions them like any other pair-drawn vehicle.
function addTramGear(parts, values) {
  const spread = Math.min(values.axleSpread, values.bodyLength * 0.78);
  const frontX = spread / 2;
  const rearX = -spread / 2;
  const floorY = values.rideHeight;
  const track = values.trackWidth;
  const radius = values.frontWheelRadius;
  for (const [name, x] of [['front', frontX], ['rear', rearX]]) {
    add(parts, `${name}-tram-axle`, [x, radius, 0], [0.07, track + 0.1, 0.07], {
      shape: 'cylinder', radialSegments: 8, rotation: [Math.PI / 2, 0, 0], ...IRON,
    });
    for (const side of [-1, 1]) {
      add(parts, `${name}-tram-wheel-${side}`, [x, radius, side * track / 2], [radius * 2, 0.06, radius * 2], {
        shape: 'cylinder', radialSegments: 18, rotation: [Math.PI / 2, 0, 0],
        color: values.wheelColor, roughness: 0.55, metalness: 0.6,
      });
      add(parts, `${name}-tram-hub-${side}`, [x, radius, side * track / 2], [0.16, 0.09, 0.16], {
        shape: 'cylinder', radialSegments: 10, rotation: [Math.PI / 2, 0, 0], ...IRON,
      });
    }
  }
  for (const side of [-1, 1]) {
    add(parts, `tram-frame-rail-${side}`, [0, floorY - 0.14, side * values.bodyWidth * 0.36], [values.bodyLength * 0.92, 0.1, 0.08], {
      shape: 'roundedBox', bevelRadius: 0.02, ...IRON,
    });
  }
  const poleEnd = addPoleOrShafts(parts, values, values.bodyLength / 2 + 0.85, floorY);
  return { floorY, frontX, rearX, track, poleEnd };
}

function addCoachLamp(parts, id, x, y, z) {
  add(parts, `${id}-post`, [x, y - 0.16, z], [0.045, 0.28, 0.045], {
    shape: 'cylinder', radialSegments: 8, ...BRASS,
  });
  add(parts, `${id}-case`, [x, y, z], [0.18, 0.28, 0.15], {
    shape: 'roundedBox', bevelRadius: 0.025, color: '#202524', roughness: 0.42, metalness: 0.55,
  });
  add(parts, `${id}-glass`, [x + 0.091, y, z], [0.015, 0.17, 0.1], {
    color: '#ffe5a0', emissive: '#b66b2d', roughness: 0.2,
  });
  add(parts, `${id}-cap`, [x, y + 0.17, z], [0.14, 0.09, 0.14], {
    shape: 'cone', radialSegments: 8, ...BRASS,
  });
}

function addDriverBox(parts, values, floorY, x, y = 0.48) {
  add(parts, 'driver-footboard', [x + 0.16, floorY + 0.05, 0], [0.56, 0.08, values.bodyWidth * 0.82], {
    shape: 'roundedBox', bevelRadius: 0.025, ...paint(values.bodyColor),
  });
  add(parts, 'driver-seat', [x, floorY + y, 0], [0.45, 0.14, values.bodyWidth * 0.78], {
    shape: 'roundedBox', bevelRadius: 0.04, ...leather(values.upholsteryColor),
  });
  add(parts, 'driver-seat-back', [x - 0.18, floorY + y + 0.28, 0], [0.12, 0.54, values.bodyWidth * 0.76], {
    shape: 'roundedBox', bevelRadius: 0.035, ...paint(values.bodyColor),
  });
}

function addPassengerSteps(parts, values, floorY, x = 0) {
  if (!values.passengerSteps) return;
  for (const side of [-1, 1]) {
    add(parts, `passenger-step-${side}`, [x, floorY - 0.34, side * (values.bodyWidth / 2 + 0.2)], [0.62, 0.07, 0.28], {
      shape: 'roundedBox', bevelRadius: 0.025, ...IRON,
    });
    add(parts, `passenger-step-bracket-${side}`, [x, floorY - 0.19, side * (values.bodyWidth / 2 + 0.09)], [0.05, 0.32, 0.05], {
      ...IRON,
    });
  }
}

function addTrimBand(parts, values, id, x, y, z, size) {
  add(parts, id, [x, y, z], size, { color: values.trimColor, roughness: 0.38, metalness: 0.28 });
}

function utilityBody(parts, values, gear) {
  const L = values.bodyLength;
  const W = values.bodyWidth;
  const H = values.bodyHeight;
  const y = gear.floorY;
  const plank = { finish: 'plank', color: values.bodyColor };
  add(parts, 'wagon-bed', [0, y, 0], [L, 0.14, W], plank);
  for (const side of [-1, 1]) {
    add(parts, `wagon-sideboard-${side}`, [0, y + H / 2, side * (W / 2 - 0.035)], [L, H, 0.07], plank);
    for (let stake = 0; stake < 4; stake += 1) {
      const x = -L / 2 + 0.2 + (stake * (L - 0.4)) / 3;
      add(parts, `wagon-stake-${side}-${stake}`, [x, y + H / 2, side * (W / 2 + 0.01)], [0.085, H + 0.18, 0.085], {
        color: values.trimColor, roughness: 0.72,
      });
    }
  }
  for (const end of [-1, 1]) {
    add(parts, `wagon-endboard-${end}`, [end * (L / 2 - 0.035), y + H / 2, 0], [0.07, H, W - 0.12], plank);
  }
  addDriverBox(parts, values, y + H * 0.4, L * 0.36, 0.42);

  if (values.load === 'coal') {
    const coalProfile = [[0.68, 0], [0.7, 0.08], [0.58, 0.25], [0.36, 0.42], [0.08, 0.55], [0.001, 0.58]];
    for (const x of [-L * 0.24, L * 0.2]) {
      add(parts, `coal-mound-${x}`, [x, y + 0.1, 0], [1.25, 0.58, 1.25], {
        shape: 'lathe', profile: coalProfile, radialSegments: 14, color: '#17181b', roughness: 0.42, metalness: 0.14,
      });
    }
    for (let lump = 0; lump < 12; lump += 1) {
      const t = lump / 11;
      const x = -L * 0.38 + t * L * 0.76;
      const z = ((lump * 7) % 5 - 2) * W * 0.09;
      const d = 0.1 + ((lump * 11) % 4) * 0.018;
      add(parts, `coal-lump-${lump}`, [x, y + H * 0.55 + ((lump * 3) % 4) * 0.055, z], [d, d, d], {
        shape: 'sphere', radialSegments: 7, color: '#15171a', roughness: 0.38, metalness: 0.18,
      });
    }
  } else if (values.load === 'crates') {
    for (let crate = 0; crate < 5; crate += 1) {
      const row = crate > 2 ? 1 : 0;
      const index = row ? crate - 3 : crate;
      add(parts, `cargo-crate-${crate}`, [-L * 0.28 + index * 0.72, y + 0.34 + row * 0.5, (row ? -1 : 1) * 0.18], [0.62, 0.58, W * 0.46], {
        shape: 'roundedBox', bevelRadius: 0.025, finish: 'plank', color: '#826c4d',
      });
    }
  }
}

function hansomBody(parts, values, gear) {
  const L = values.bodyLength;
  const W = values.bodyWidth;
  const H = values.bodyHeight;
  const y = gear.floorY;
  const cabinL = L * 0.72;
  add(parts, 'hansom-lower-body', [0.12, y + 0.36, 0], [cabinL, 0.72, W], {
    shape: 'roundedBox', bevelRadius: 0.16, color: values.bodyColor, roughness: 0.38,
  });
  add(parts, 'hansom-cab-back', [-cabinL * 0.34, y + H * 0.58, 0], [0.24, H * 0.88, W], {
    shape: 'roundedBox', bevelRadius: 0.12, color: values.bodyColor, roughness: 0.38,
  });
  add(parts, 'hansom-roof', [-0.02, y + H, 0], [cabinL * 0.86, 0.16, W + 0.1], {
    shape: 'roundedBox', bevelRadius: 0.07, color: values.bodyColor, roughness: 0.38,
  });
  for (const side of [-1, 1]) {
    add(parts, `hansom-side-panel-${side}`, [0.08, y + H * 0.68, side * (W / 2 - 0.035)], [cabinL * 0.7, H * 0.58, 0.07], {
      shape: 'roundedBox', bevelRadius: 0.07, color: values.bodyColor, roughness: 0.38,
    });
    add(parts, `hansom-side-window-${side}`, [0.02, y + H * 0.76, side * (W / 2 + 0.006)], [cabinL * 0.38, H * 0.32, 0.025], WINDOW);
    addTrimBand(parts, values, `hansom-window-line-${side}`, 0.02, y + H * 0.76, side * (W / 2 + 0.023), [0.035, H * 0.38, 0.035]);
  }
  add(parts, 'hansom-front-apron', [cabinL * 0.46, y + 0.47, 0], [0.12, 0.82, W * 0.76], {
    shape: 'roundedBox', bevelRadius: 0.05, color: values.bodyColor, roughness: 0.42,
  });
  add(parts, 'hansom-passenger-seat', [-0.12, y + 0.42, 0], [0.58, 0.16, W * 0.76], {
    shape: 'roundedBox', bevelRadius: 0.05, color: values.upholsteryColor, roughness: 0.82,
  });
  addDriverBox(parts, values, y + H * 0.48, -L * 0.45, 0.34);
  addPassengerSteps(parts, values, y, L * 0.22);
}

function broughamBody(parts, values, gear) {
  const L = values.bodyLength;
  const W = values.bodyWidth;
  const H = values.bodyHeight;
  const y = gear.floorY;
  const cabinL = L * 0.74;
  const cabinX = -L * 0.11;
  const front = cabinX + cabinL / 2;
  const rear = cabinX - cabinL / 2;
  add(parts, 'brougham-sill', [cabinX, y + 0.16, 0], [cabinL + 0.12, 0.32, W], {
    shape: 'roundedBox', bevelRadius: 0.11, ...paint(values.bodyColor),
  });
  add(parts, 'brougham-lower-body', [cabinX, y + H * 0.34, 0], [cabinL, H * 0.54, W], {
    shape: 'roundedBox', bevelRadius: 0.2, ...paint(values.bodyColor),
  });
  add(parts, 'brougham-upper-body', [cabinX - L * 0.035, y + H * 0.7, 0], [cabinL * 0.88, H * 0.56, W * 0.97], {
    shape: 'roundedBox', bevelRadius: 0.17, ...paint(values.bodyColor),
  });
  add(parts, 'brougham-roof', [cabinX - L * 0.06, y + H + 0.045, 0], [cabinL * 0.96, 0.16, W + 0.14], {
    shape: 'roundedBox', bevelRadius: 0.07, ...leather('#161b19'),
  });
  for (const side of [-1, 1]) {
    const z = side * (W / 2 + 0.012);
    add(parts, `brougham-door-panel-${side}`, [cabinX + cabinL * 0.08, y + H * 0.32, z], [cabinL * 0.44, H * 0.39, 0.035], {
      shape: 'roundedBox', bevelRadius: 0.04, ...paint(values.bodyColor),
    });
    add(parts, `brougham-door-window-${side}`, [cabinX + cabinL * 0.11, y + H * 0.73, z], [cabinL * 0.36, H * 0.36, 0.022], WINDOW);
    add(parts, `brougham-quarter-window-${side}`, [rear + cabinL * 0.15, y + H * 0.74, z], [cabinL * 0.17, H * 0.32, 0.022], WINDOW);
    for (const x of [rear + cabinL * 0.25, cabinX - cabinL * 0.08, front - cabinL * 0.15]) {
      addTrimBand(parts, values, `brougham-window-post-${side}-${x}`, x, y + H * 0.73, side * (W / 2 + 0.032), [0.045, H * 0.44, 0.045]);
    }
    addTrimBand(parts, values, `brougham-belt-${side}`, cabinX, y + H * 0.5, side * (W / 2 + 0.036), [cabinL * 0.93, 0.055, 0.04]);
    addTrimBand(parts, values, `brougham-lower-line-${side}`, cabinX, y + H * 0.15, side * (W / 2 + 0.036), [cabinL * 0.8, 0.035, 0.04]);
    add(parts, `brougham-door-handle-${side}`, [front - cabinL * 0.28, y + H * 0.45, z + side * 0.025], [0.12, 0.035, 0.035], BRASS);
  }
  add(parts, 'brougham-front-window', [front - cabinL * 0.06, y + H * 0.73, 0], [0.022, H * 0.33, W * 0.54], WINDOW);
  add(parts, 'brougham-rear-window', [rear - 0.012, y + H * 0.73, 0], [0.022, H * 0.3, W * 0.5], WINDOW);
  add(parts, 'brougham-interior-seat', [rear + cabinL * 0.28, y + 0.47, 0], [0.55, 0.18, W * 0.76], {
    shape: 'roundedBox', bevelRadius: 0.06, ...leather(values.upholsteryColor),
  });
  addDriverBox(parts, values, y, L * 0.42, 0.57);
  addPassengerSteps(parts, values, y, cabinX + cabinL * 0.08);
  if (values.coachLamps) {
    for (const side of [-1, 1]) addCoachLamp(parts, `brougham-lamp-${side}`, L * 0.31, y + H * 0.78, side * (W / 2 + 0.11));
  }
}

function landauBody(parts, values, gear) {
  const L = values.bodyLength;
  const W = values.bodyWidth;
  const H = values.bodyHeight;
  const y = gear.floorY;
  const tubL = L * 0.82;
  add(parts, 'landau-sill', [0, y + 0.13, 0], [tubL + 0.12, 0.26, W], {
    shape: 'roundedBox', bevelRadius: 0.1, ...paint(values.bodyColor),
  });
  add(parts, 'landau-lower-tub', [0, y + 0.38, 0], [tubL, 0.64, W], {
    shape: 'roundedBox', bevelRadius: 0.2, ...paint(values.bodyColor),
  });
  add(parts, 'landau-waist', [0, y + 0.68, 0], [tubL * 0.92, 0.3, W * 0.97], {
    shape: 'roundedBox', bevelRadius: 0.12, ...paint(values.bodyColor),
  });
  for (const side of [-1, 1]) {
    const z = side * (W / 2 + 0.015);
    add(parts, `landau-door-panel-${side}`, [0, y + 0.46, z], [L * 0.36, 0.5, 0.04], {
      shape: 'roundedBox', bevelRadius: 0.055, ...paint(values.bodyColor),
    });
    addTrimBand(parts, values, `landau-belt-${side}`, 0, y + 0.71, side * (W / 2 + 0.038), [L * 0.7, 0.05, 0.04]);
    for (const x of [-L * 0.2, L * 0.2]) {
      add(parts, `landau-door-pillar-${side}-${x}`, [x, y + 0.68, side * (W / 2 + 0.03)], [0.055, 0.72, 0.055], {
        shape: 'roundedBox', bevelRadius: 0.02, ...paint(values.bodyColor),
      });
    }
    add(parts, `landau-door-handle-${side}`, [L * 0.1, y + 0.57, z + side * 0.025], [0.12, 0.035, 0.035], BRASS);
  }
  for (const end of [-1, 1]) {
    add(parts, `landau-seat-${end}`, [end * L * 0.22, y + 0.62, 0], [0.7, 0.18, W * 0.78], {
      shape: 'roundedBox', bevelRadius: 0.06, ...leather(values.upholsteryColor),
    });
    add(parts, `landau-seat-back-${end}`, [end * L * 0.34, y + 0.95, 0], [0.17, 0.7, W * 0.78], {
      shape: 'roundedBox', bevelRadius: 0.06, rotation: [0, 0, -end * 0.1], ...leather(values.upholsteryColor),
    });
  }
  const raised = values.hoodRaised;
  const hoodH = 0.14 + raised * H * 0.7;
  for (const end of [-1, 1]) {
    const hoodX = end * L * 0.32;
    add(parts, `landau-folded-hood-${end}`, [end * L * 0.37, y + 1.04, 0], [0.17 + (1 - raised) * 0.16, W * 0.9, 0.17 + (1 - raised) * 0.16], {
      shape: 'cylinder', radialSegments: 12, rotation: [Math.PI / 2, 0, 0], ...CANVAS,
    });
    if (raised > 0.05) {
      const hoodTop = y + 1.08 + hoodH;
      for (let rib = 0; rib < 4; rib += 1) {
        const t = rib / 3;
        add(parts, `landau-hood-rib-${end}-${rib}`, [hoodX - end * t * L * 0.23, y + 1.04 + Math.sin(t * Math.PI / 2) * hoodH, 0], [0.055, 0.055, W * 0.96], {
          shape: 'roundedBox', bevelRadius: 0.018, ...BRASS,
        });
      }
      const canopyLength = L * (0.18 + raised * 0.22);
      const canopyX = end * L * (0.28 - raised * 0.08);
      add(parts, `landau-hood-canopy-${end}`, [canopyX, hoodTop, 0], [canopyLength, 0.08, W * 0.99], {
        shape: 'roundedBox', bevelRadius: 0.04, ...CANVAS,
      });
      for (const side of [-1, 1]) {
        add(parts, `landau-hood-stay-${end}-${side}`, [hoodX, y + 1.03 + hoodH / 2, side * W * 0.46], [0.035, hoodH, 0.035], {
          shape: 'cylinder', radialSegments: 7, ...BRASS,
        });
      }
    }
  }
  addDriverBox(parts, values, y, L * 0.43, 0.56);
  addPassengerSteps(parts, values, y, 0);
  if (values.coachLamps) {
    for (const side of [-1, 1]) addCoachLamp(parts, `landau-lamp-${side}`, L * 0.34, y + H * 0.75, side * (W / 2 + 0.1));
  }
}

function omnibusBody(parts, values, gear) {
  const L = values.bodyLength;
  const W = values.bodyWidth;
  const H = values.bodyHeight;
  const y = gear.floorY;
  const cabinL = L * 0.86;
  const cabinX = -L * 0.06;
  const rear = cabinX - cabinL / 2;
  add(parts, 'omnibus-lower-body', [cabinX, y + H * 0.3, 0], [cabinL, H * 0.6, W], {
    shape: 'roundedBox', bevelRadius: 0.13, ...paint(values.bodyColor),
  });
  add(parts, 'omnibus-upper-body', [cabinX, y + H * 0.72, 0], [cabinL * 0.98, H * 0.48, W * 0.98], {
    shape: 'roundedBox', bevelRadius: 0.08, ...paint(values.bodyColor),
  });
  add(parts, 'omnibus-roof', [cabinX, y + H + 0.07, 0], [cabinL + 0.12, 0.16, W + 0.12], {
    shape: 'roundedBox', bevelRadius: 0.06, ...leather('#202522'),
  });
  const windows = 5;
  for (const side of [-1, 1]) {
    for (let window = 0; window < windows; window += 1) {
      const x = cabinX - cabinL * 0.38 + (window * cabinL * 0.76) / (windows - 1);
      add(parts, `omnibus-window-${side}-${window}`, [x, y + H * 0.68, side * (W / 2 + 0.014)], [cabinL * 0.13, H * 0.32, 0.026], WINDOW);
      addTrimBand(parts, values, `omnibus-post-${side}-${window}`, x - cabinL * 0.078, y + H * 0.68, side * (W / 2 + 0.03), [0.045, H * 0.4, 0.04]);
    }
    addTrimBand(parts, values, `omnibus-belt-${side}`, cabinX, y + H * 0.45, side * (W / 2 + 0.032), [cabinL * 0.95, 0.055, 0.04]);
    addTrimBand(parts, values, `omnibus-letterboard-${side}`, cabinX, y + H * 0.94, side * (W / 2 + 0.032), [cabinL * 0.88, 0.2, 0.04]);
  }
  add(parts, 'omnibus-roof-seat-left', [cabinX, y + H + 0.3, -0.22], [cabinL * 0.78, 0.12, 0.34], {
    shape: 'roundedBox', bevelRadius: 0.04, ...leather(values.upholsteryColor),
  });
  add(parts, 'omnibus-roof-seat-right', [cabinX, y + H + 0.3, 0.22], [cabinL * 0.78, 0.12, 0.34], {
    shape: 'roundedBox', bevelRadius: 0.04, ...leather(values.upholsteryColor),
  });
  add(parts, 'omnibus-roof-seat-back', [cabinX, y + H + 0.54, 0], [cabinL * 0.78, 0.48, 0.08], {
    shape: 'roundedBox', bevelRadius: 0.03, ...paint(values.bodyColor),
  });
  for (const side of [-1, 1]) {
    add(parts, `omnibus-roof-rail-${side}`, [cabinX, y + H + 0.48, side * (W / 2 - 0.08)], [cabinL * 0.88, 0.055, 0.055], {
      ...BRASS,
    });
    for (let post = 0; post < 5; post += 1) {
      const x = cabinX - cabinL * 0.4 + post * cabinL * 0.2;
      add(parts, `omnibus-roof-rail-post-${side}-${post}`, [x, y + H + 0.32, side * (W / 2 - 0.08)], [0.04, 0.34, 0.04], BRASS);
    }
  }
  add(parts, 'omnibus-rear-platform', [rear - 0.24, y - 0.02, 0], [0.48, 0.1, W * 0.84], {
    shape: 'roundedBox', bevelRadius: 0.025, finish: 'plank', color: '#50463a',
  });
  // A compact staircase rises along the left rear quarter. Every tread is
  // tied into the same side rails, avoiding the detached floating ladder.
  const stairZ = -W * 0.28;
  const stairCount = 8;
  for (let step = 0; step < stairCount; step += 1) {
    const t = step / (stairCount - 1);
    add(parts, `omnibus-rear-step-${step}`, [rear - 0.28 + t * 0.26, y + 0.08 + t * (H + 0.08), stairZ], [0.3, 0.065, W * 0.3], {
      shape: 'roundedBox', bevelRadius: 0.018, finish: 'plank', color: '#50463a',
    });
  }
  for (const railZ of [stairZ - W * 0.16, stairZ + W * 0.16]) {
    add(parts, `omnibus-stair-stringer-${railZ}`, [rear - 0.15, y + H * 0.54, railZ], [0.07, H * 1.08, 0.07], {
      shape: 'roundedBox', bevelRadius: 0.018, rotation: [0, 0, -0.1], ...IRON,
    });
  }
  add(parts, 'omnibus-roof-landing', [rear - 0.02, y + H + 0.02, stairZ], [0.42, 0.08, W * 0.42], {
    shape: 'roundedBox', bevelRadius: 0.018, finish: 'plank', color: '#50463a',
  });
  add(parts, 'omnibus-rear-door', [rear - 0.012, y + H * 0.5, 0], [0.035, H * 0.86, W * 0.42], {
    shape: 'roundedBox', bevelRadius: 0.035, ...paint(values.bodyColor),
  });
  add(parts, 'omnibus-rear-window', [rear - 0.034, y + H * 0.72, 0], [0.025, H * 0.29, W * 0.28], WINDOW);
  for (const side of [-1, 1]) {
    add(parts, `omnibus-rub-rail-${side}`, [cabinX, y + 0.24, side * (W / 2 + 0.05)], [cabinL * 0.95, 0.09, 0.08], {
      shape: 'roundedBox', bevelRadius: 0.02, ...IRON,
    });
  }
  add(parts, 'omnibus-route-board', [cabinX, y + H * 0.94, W / 2 + 0.056], [cabinL * 0.72, 0.19, 0.018], {
    castShadow: false,
    label: { text: 'FIFTH AVENUE', font: 'caslon', paper: '#d3ad55', ink: '#382311', paperAge: 0.42, surface: 'agedPaper' },
  });
  addDriverBox(parts, values, y, L * 0.45, 0.62);
  if (values.coachLamps) {
    for (const side of [-1, 1]) addCoachLamp(parts, `omnibus-lamp-${side}`, L * 0.4, y + H * 0.6, side * (W / 2 + 0.11));
  }
}

// An 1890s crosstown horsecar: platforms and dashes at both ends under a
// roof that runs the car's full length, seven-window sides over deep skirt
// panels, a lettered board above the windows, and a clerestory deck light.
function horsecarBody(parts, values, gear) {
  const L = values.bodyLength;
  const W = values.bodyWidth;
  const H = values.bodyHeight;
  const y = gear.floorY;
  const platform = 0.85;
  const roofY = y + H;

  add(parts, 'horsecar-floor', [0, y - 0.03, 0], [L + platform * 2, 0.07, W], {
    shape: 'roundedBox', bevelRadius: 0.02, ...paint('#3a3230'),
  });
  // Skirt panels drop below the floor and hide the wheel tops from the side.
  for (const side of [-1, 1]) {
    add(parts, `horsecar-skirt-${side}`, [0, y - 0.18, side * (W / 2 - 0.03)], [L * 0.96, 0.3, 0.045], {
      shape: 'roundedBox', bevelRadius: 0.015, ...paint(values.bodyColor),
    });
    // Solid panel band below the windows.
    add(parts, `horsecar-waist-${side}`, [0, y + H * 0.24, side * (W / 2 - 0.012)], [L * 0.98, H * 0.48, 0.035], {
      shape: 'roundedBox', bevelRadius: 0.02, ...paint(values.bodyColor),
    });
    addTrimBand(parts, values, `horsecar-belt-${side}`, 0, y + H * 0.485, side * (W / 2 + 0.008), [L * 0.98, 0.05, 0.035]);
    // Window band: seven lights with posts between.
    const windows = 7;
    for (let window = 0; window < windows; window += 1) {
      const x = -L * 0.42 + (window * L * 0.84) / (windows - 1);
      add(parts, `horsecar-window-${side}-${window}`, [x, y + H * 0.63, side * (W / 2 + 0.006)], [L * 0.09, H * 0.26, 0.024], WINDOW);
      add(parts, `horsecar-post-${side}-${window}`, [x - L * 0.06, y + H * 0.63, side * (W / 2 + 0.012)], [0.05, H * 0.3, 0.03], {
        ...paint(values.bodyColor),
      });
    }
    // Letterboard above the windows; the company lettering is applied by the
    // traffic renderer as a one-time canvas texture.
    add(parts, `horsecar-letterboard-${side}`, [0, y + H * 0.865, side * (W / 2 + 0.01)], [L * 0.98, H * 0.19, 0.03], {
      ...paint(values.bodyColor),
    });
  }
  // Cabin end bulkheads with a door light each.
  for (const end of [-1, 1]) {
    add(parts, `horsecar-bulkhead-${end}`, [end * (L / 2 - 0.02), y + H * 0.5, 0], [0.045, H, W * 0.98], {
      shape: 'roundedBox', bevelRadius: 0.02, ...paint(values.bodyColor),
    });
    add(parts, `horsecar-door-light-${end}`, [end * (L / 2 + 0.005), y + H * 0.62, 0], [0.02, H * 0.26, W * 0.26], WINDOW);
  }
  // Interior benches run the car's length, visible through the lights.
  for (const side of [-1, 1]) {
    add(parts, `horsecar-bench-${side}`, [0, y + 0.42, side * (W / 2 - 0.26)], [L * 0.88, 0.09, 0.4], {
      shape: 'roundedBox', bevelRadius: 0.03, ...leather(values.upholsteryColor),
    });
  }
  // Platforms, dashes, steps, and corner posts at both ends.
  for (const end of [-1, 1]) {
    const dashX = end * (L / 2 + platform - 0.04);
    add(parts, `horsecar-dash-${end}`, [dashX, y + 0.48, 0], [0.05, 0.95, W * 0.88], {
      shape: 'roundedBox', bevelRadius: 0.03, rotation: [0, 0, -end * 0.1], ...paint(values.bodyColor),
    });
    add(parts, `horsecar-dash-rail-${end}`, [dashX - end * 0.05, y + 0.99, 0], [0.04, 0.04, W * 0.88], {
      shape: 'cylinder', radialSegments: 8, rotation: [Math.PI / 2, 0, 0], ...BRASS,
    });
    add(parts, `horsecar-step-${end}`, [end * (L / 2 + platform * 0.55), y - 0.32, 0], [0.7, 0.06, W * 0.5], {
      shape: 'roundedBox', bevelRadius: 0.02, ...IRON,
    });
    for (const side of [-1, 1]) {
      add(parts, `horsecar-corner-post-${end}-${side}`, [end * (L / 2 + platform - 0.1), y + H * 0.5, side * (W / 2 - 0.07)], [0.045, H, 0.045], {
        shape: 'cylinder', radialSegments: 8, ...paint(values.bodyColor),
      });
    }
    // Brake staff on the right-hand platform corner, as mounted in practice.
    add(parts, `horsecar-brake-staff-${end}`, [end * (L / 2 + platform - 0.22), y + 0.62, -end * (W / 2 - 0.16)], [0.035, 1.15, 0.035], {
      shape: 'cylinder', radialSegments: 8, ...BRASS,
    });
  }
  // Roof over the whole car, then the clerestory deck raised above it.
  add(parts, 'horsecar-roof', [0, roofY + 0.05, 0], [L + platform * 2 + 0.1, 0.12, W + 0.1], {
    shape: 'roundedBox', bevelRadius: 0.05, ...leather('#232624'),
  });
  add(parts, 'horsecar-clerestory', [0, roofY + 0.19, 0], [L * 0.82, 0.17, W * 0.44], {
    shape: 'roundedBox', bevelRadius: 0.05, ...paint(values.trimColor),
  });
  add(parts, 'horsecar-clerestory-roof', [0, roofY + 0.3, 0], [L * 0.86, 0.06, W * 0.52], {
    shape: 'roundedBox', bevelRadius: 0.025, ...leather('#232624'),
  });
  if (values.coachLamps) {
    for (const end of [-1, 1]) {
      addCoachLamp(parts, `horsecar-lamp-${end}`, end * (L / 2 + platform - 0.16), y + 1.3, 0.62);
    }
  }
  // A low stool on each platform; the rig seats the driver on the leading one.
  add(parts, 'driver-seat', [L / 2 + platform * 0.5, y + 0.4, 0], [0.36, 0.1, 0.42], {
    shape: 'roundedBox', bevelRadius: 0.03, ...leather(values.upholsteryColor),
  });
}

const BODY_BUILDERS = {
  utility: utilityBody,
  hansom: hansomBody,
  brougham: broughamBody,
  landau: landauBody,
  omnibus: omnibusBody,
  horsecar: horsecarBody,
};

export function buildCoachwork(id, origin, recipe) {
  const values = { ...PRESETS.utility, ...(recipe?.values ?? {}) };
  const parts = [];
  const twoWheels = values.vehicleType === 'hansom';
  const gear = values.vehicleType === 'horsecar'
    ? addTramGear(parts, values)
    : addRunningGear(parts, values, twoWheels);
  BODY_BUILDERS[values.vehicleType](parts, values, gear);

  const width = Math.max(gear.track + 0.24, values.bodyWidth + 0.5);
  const roofExtra = values.vehicleType === 'omnibus' ? 0.72
    : values.vehicleType === 'horsecar' ? 0.38
    : values.vehicleType === 'landau' ? values.hoodRaised * 0.65 : 0.28;
  const height = Math.max(values.rearWheelRadius * 2, values.rideHeight + values.bodyHeight + roofExtra);
  const rear = -Math.max(values.bodyLength / 2 + 0.45, gear.rearX + values.rearWheelRadius + 0.15);
  const front = gear.poleEnd + 0.08;
  return [{
    id,
    kind: 'furniture',
    position: origin,
    boundsSize: [front - rear, height, width],
    boundsCenter: [(front + rear) / 2, height / 2, 0],
    coachworkType: values.vehicleType,
    team: values.team,
    parts,
    collider: false,
  }];
}

// Runtime traffic consumes the same presets as the workbench. Keep this
// helper plain so a saved recipe can replace the defaults in a later pass.
export function coachworkRecipe(type, overrides = {}) {
  const preset = PRESETS[type];
  if (!preset) throw new Error(`Unknown coachwork preset '${type}'`);
  return {
    kind: 'procedural-asset',
    family: `coachworks-${type}`,
    seed: 189600 + TYPES.indexOf(type) + 1,
    values: { ...preset, ...overrides },
    historicalStatus: '1890s New York working preset',
  };
}

export function buildCoachworkPreset(type, id, origin = [0, 0, 0], overrides = {}) {
  return buildCoachwork(id, origin, coachworkRecipe(type, overrides));
}

function entry(type, label, note, seed) {
  return {
    label,
    note,
    family: `coachworks-${type}`,
    schema: COACHWORKS_SCHEMA,
    defaultSeed: seed,
    defaultValues: PRESETS[type],
    historicalStatus: '1890s New York working preset',
    performanceBudget: { maxParts: 140, maxMaterials: 20 },
    build: (id, origin, recipe) => buildCoachwork(id, origin, recipe),
  };
}

export const COACHWORKS = {
  'utility-wagon': entry('utility', 'Coal and delivery wagon', 'Four-wheel working wagon with selectable coal, crate, or empty body.', 189601),
  'hansom-cab': entry('hansom', 'Hansom cab', 'Two-wheel cab with low passenger body and the driver perched behind.', 189602),
  brougham: entry('brougham', 'Brougham', 'Enclosed private carriage with a raised exterior driver box.', 189603),
  landau: entry('landau', 'Landau', 'Open four-wheel carriage with facing seats and adjustable folding hoods.', 189604),
  omnibus: entry('omnibus', 'Horse omnibus', 'Large paired-horse city coach with roof seating and a rear stair.', 189605),
  horsecar: entry('horsecar', 'Street railway horsecar', 'Belt Line crosstown car: low floor on tram wheels, end platforms, clerestory roof.', 189606),
};

export const COACHWORKS_PRESETS = PRESETS;

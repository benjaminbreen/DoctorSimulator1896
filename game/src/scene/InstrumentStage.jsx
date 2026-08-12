import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getInteraction, subscribe, useInstrument } from '../world/interaction.js';
import { createTachistoscope, step as stepTachistoscope } from '../instruments/tachistoscope.js';
import { createColourWheel, step as stepColourWheel } from '../instruments/colourWheel.js';
import { createInductionCoil, step as stepInductionCoil, shockCurrent } from '../instruments/inductionCoil.js';
import { createSecondsPendulum, stepSecondsPendulum } from '../instruments/secondsPendulum.js';
import { instrumentBus } from '../instruments/bus.js';
import {
  tachistoscope as buildTachistoscope,
  colourWheel as buildColourWheel,
  inductionCoil as buildInductionCoil,
  secondsPendulum as buildSecondsPendulum,
  TACHISTOSCOPE_FRAME,
  COLOUR_WHEEL_FRAME,
  COIL_FRAME,
  SECONDS_PENDULUM_FRAME,
} from '../world/instruments.js';
import PropShape from './PropShape.jsx';
import PropMaterial from './PropMaterial.jsx';
import { gameDebug } from '../debug.js';
import { notice } from '../world/notices.js';
import { harm } from '../world/player.js';

// The 3D half of instrument mode: the apparatus in use, drawn from its own
// simulation state rather than animated.
//
// The instrument in the room stays where it is and keeps being set dressing;
// this draws a working copy at the same spot, so the shutter can move without
// the room's furniture needing a channel for it.
//
// The working copy is the *same builder* as the room's. A part marked
// `channel: 'shutter'` goes in a group this file moves; everything else is
// drawn where the builder put it. That is the whole contract, and it means
// polishing a prop in the workbench polishes the thing you use.

const BUILDERS = {
  tachistoscope: createTachistoscope,
  'colour-wheel': createColourWheel,
  'induction-coil': createInductionCoil,
  'seconds-pendulum': createSecondsPendulum,
};

const STEP = {
  tachistoscope: stepTachistoscope,
  'colour-wheel': stepColourWheel,
  'induction-coil': stepInductionCoil,
  'seconds-pendulum': stepSecondsPendulum,
};

const GEOMETRY = {
  tachistoscope: (id) => buildTachistoscope(id, 0, 0, 0, 0),
  'colour-wheel': (id) => buildColourWheel(id, 0, 0, 0, 0),
  'induction-coil': (id) => buildInductionCoil(id, 0, 0, 0, 0),
  'seconds-pendulum': (id) => buildSecondsPendulum(id, 0, 0, 0, 0),
};

// How much of the model to draw the working copy at. The tachistoscope is
// stood in front of; the colour wheel is leaned over, so it needs less.
const SCALE = {
  tachistoscope: 1.6,
  'colour-wheel': 1.35,
  'induction-coil': 1.5,
  'seconds-pendulum': 1.08,
};

// Split a built instrument into its static parts and its moving channels.
function byChannel(parts) {
  const groups = new Map([['', []]]);
  for (const part of parts) {
    const key = part.channel ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
  }
  return groups;
}

function Parts({ items }) {
  return items.map((item) => (
    <mesh
      key={item.id}
      position={item.position}
      rotation={item.rotation ?? [0, 0, 0]}
      renderOrder={item.renderOrder ?? 0}
      castShadow={item.castShadow ?? true}
      receiveShadow={item.receiveShadow ?? true}
    >
      <PropShape item={item} />
      <PropMaterial item={item} />
    </mesh>
  ));
}

// The card face. Letters have to be real letters — the whole test is whether
// you can read them in twenty milliseconds, so a blank rectangle would be a
// different game.
function cardTexture(letters) {
  const element = document.createElement('canvas');
  element.width = 768;
  element.height = 320;
  const context = element.getContext('2d');
  context.fillStyle = '#fff8df';
  context.fillRect(0, 0, element.width, element.height);
  context.fillStyle = '#080604';
  context.font = '900 205px Georgia, "Times New Roman", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(letters || '', element.width / 2, element.height / 2 + 12, 720);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function Card({ item, instrument }) {
  const ref = useRef();
  const [letters, setLetters] = useState('');
  const texture = useMemo(() => cardTexture(letters), [letters]);
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    const s = instrument.state;
    if (s.card !== letters) setLetters(s.card);
    if (ref.current) ref.current.visible = s.exposed;
  });

  return (
    <mesh ref={ref} position={item.position} visible={false}>
      <PropShape item={item} />
      {/* Faintly self-lit: the card sat in a lit box behind the aperture, and
          at twenty milliseconds an unlit one is not read at all. */}
      <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={1.1} roughness={0.9} />
    </mesh>
  );
}

// A channel is a group of parts that moves together. `pivot` is what makes it
// general: a shutter slides about the model origin, but a disc turns about its
// own spindle, and a group rotated about the wrong point is a wobble.
function localise(items, pivot) {
  return items.map((item) => ({ ...item, position: item.position.map((v, i) => v - pivot[i]) }));
}

function Channel({ items, pivot, groupRef, children }) {
  const at = pivot ?? [0, 0, 0];
  const local = useMemo(() => localise(items, at), [items, at[0], at[1], at[2]]);
  return (
    <group ref={groupRef} position={at}>
      <Parts items={local} />
      {children}
    </group>
  );
}

// The disc of coloured papers, redrawn as it fuses. Quantised into steps so a
// canvas is not rebuilt sixty times a second for a difference nobody sees.
function Disc({ item, instrument }) {
  const [blur, setBlur] = useState(0);
  useFrame(() => {
    const next = Math.round(instrument.state.fusion * 12) / 12;
    if (next !== blur) setBlur(next);
  });
  const sectors = instrument.colours.map((color, index) => ({
    color,
    fraction: instrument.state.fractions[index],
  }));
  return (
    <mesh position={item.position} rotation={item.rotation ?? [0, 0, 0]} castShadow receiveShadow>
      <PropShape item={item} />
      <PropMaterial item={{ ...item, disc: sectors, discBlur: blur }} />
    </mesh>
  );
}

// The chip the fused colour is matched against. It is the task, so it is drawn
// from the target rather than left the colour the builder painted it.
function Chip({ item, instrument }) {
  return (
    <mesh position={item.position} rotation={item.rotation ?? [0, 0, 0]} receiveShadow>
      <PropShape item={item} />
      <meshStandardMaterial color={instrument.state.target.colour} roughness={0.94} metalness={0} />
    </mesh>
  );
}

function Tachistoscope({ groups, instrument }) {
  const shutter = useRef();
  useFrame(() => {
    if (!shutter.current) return;
    // The builder authored the slot `slotFoot - apertureTop` above the
    // aperture; the setting wants it `drop` above. The difference is where the
    // shutter hangs, and the fall comes off that.
    const authored = TACHISTOSCOPE_FRAME.slotFoot - TACHISTOSCOPE_FRAME.apertureTop;
    shutter.current.position.y = instrument.state.drop - authored - instrument.state.fallen;
  });
  return (
    <>
      <Channel items={groups.get('shutter') ?? []} groupRef={shutter} />
      {(groups.get('card') ?? []).map((item) => (
        <Card key={item.id} item={item} instrument={instrument} />
      ))}
    </>
  );
}

function ColourWheel({ groups, instrument }) {
  const disc = useRef();
  const drive = useRef();
  useFrame(() => {
    const turns = instrument.state.angle * Math.PI * 2;
    // Both turn on the same belt, so the crank is always in the phase the disc
    // speed says it should be — you can see the gearing.
    if (disc.current) disc.current.rotation.z = -turns;
    if (drive.current) drive.current.rotation.z = -turns / COLOUR_WHEEL_FRAME.ratio;
  });
  const discParts = groups.get('disc') ?? [];
  return (
    <>
      <Channel
        items={discParts.filter((item) => !item.disc)}
        pivot={COLOUR_WHEEL_FRAME.discPivot}
        groupRef={disc}
      >
        {/* The papers ride the same spindle, so they turn with it — but their
            face comes from the state, not from what the builder painted. */}
        {localise(discParts.filter((item) => item.disc), COLOUR_WHEEL_FRAME.discPivot).map((item) => (
          <Disc key={item.id} item={item} instrument={instrument} />
        ))}
      </Channel>
      <Channel items={groups.get('drive') ?? []} pivot={COLOUR_WHEEL_FRAME.drivePivot} groupRef={drive} />
      {(groups.get('chip') ?? []).map((item) => (
        <Chip key={item.id} item={item} instrument={instrument} />
      ))}
    </>
  );
}

function SecondsPendulum({ groups, instrument }) {
  const pendulum = useRef();
  const catchLever = useRef();

  useFrame(() => {
    if (pendulum.current) pendulum.current.rotation.z = instrument.state.angle;
    if (catchLever.current) {
      catchLever.current.rotation.z = instrument.state.phase === 'reference' ? -0.12 : 0.18;
    }
  });

  return (
    <>
      <Channel
        items={groups.get('pendulum') ?? []}
        pivot={SECONDS_PENDULUM_FRAME.pivot}
        groupRef={pendulum}
      />
      <Channel
        items={groups.get('catch') ?? []}
        pivot={SECONDS_PENDULUM_FRAME.catchPivot}
        groupRef={catchLever}
      />
    </>
  );
}

// A spark, drawn as a jagged filament between two points and rebuilt on every
// break of the interrupter.
//
// Not a texture and not a particle system: a discharge is a thin bright
// crooked line, and the thing that sells it is that the crookedness is
// different every time. The bloom pass does the glow, which is why the core
// can be a hairline.
function Spark({ from, to, live, intensity, seed, colour = '#dbe9ff' }) {
  const lineRef = useRef();
  const lightRef = useRef();
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  const object = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(colour),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Line(geometry, material);
  }, [geometry, colour]);
  useEffect(() => () => {
    geometry.dispose();
    object.material.dispose();
  }, [geometry, object]);

  useMemo(() => {
    const span = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) || 1e-6;
    // Wander sideways by a fraction of the gap, never along it: an arc bows
    // out of line, it does not stretch.
    const wander = span * 0.35;
    const steps = 7;
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const ends = i === 0 || i === steps ? 0 : 1;
      const jitter = (axis) => {
        const n = Math.sin((seed + i * 37.7 + axis * 91.3) * 12.9898) * 43758.5453;
        return (n - Math.floor(n) - 0.5) * wander * ends;
      };
      points.push(
        from[0] + (to[0] - from[0]) * t + jitter(1),
        from[1] + (to[1] - from[1]) * t + jitter(2),
        from[2] + (to[2] - from[2]) * t + jitter(3),
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
  }, [geometry, from, to, seed]);

  // The discharge is a pulse, not a steady lamp: it flares on the break and
  // dies inside a few milliseconds, so the eye reads a hard flicker.
  useFrame((_, delta) => {
    const decay = Math.exp(-delta * 26);
    if (object.material) {
      object.material.opacity = live
        ? Math.min(1, object.material.opacity * decay + Math.max(0.08, intensity) * 0.9)
        : 0;
    }
    if (lightRef.current) {
      lightRef.current.intensity = live ? object.material.opacity * intensity * 9 : 0;
    }
    void lineRef;
  });

  return (
    <group visible={live}>
      <primitive object={object} ref={lineRef} />
      <pointLight
        ref={lightRef}
        position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]}
        distance={0.9}
        decay={2}
        color="#bcd8ff"
      />
    </group>
  );
}

// Electrical current through the player is not a free-floating lightning
// bolt. The visible response is kept at the metal contacts: tiny intermittent
// corona points and a brief local flash, scaled by the same current that the
// simulation uses for sensation and injury.
function ShockField({ instrument }) {
  const group = useRef();
  const light = useRef();
  const particles = useRef([]);
  const points = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const ring = Math.floor(index / 2);
    return {
      base: [0.29 + Math.sin(ring * 2.3) * 0.014, 0.075 + Math.cos(ring * 1.7) * 0.018, side * 0.085],
      phase: index * 1.91,
      size: 0.0025 + (index % 3) * 0.0012,
    };
  }), []);

  useFrame((frame) => {
    const level = instrument.state.shockIntensity ?? 0;
    const time = frame.clock.elapsedTime;
    if (group.current) group.current.visible = level > 0.005;
    if (light.current) {
      const pulse = 0.55 + Math.abs(Math.sin(time * 97)) * 0.45;
      light.current.intensity = level * 16 * pulse;
    }
    particles.current.forEach((mesh, index) => {
      if (!mesh) return;
      const point = points[index];
      const flicker = Math.max(0, Math.sin(time * (51 + index * 2.7) + point.phase));
      mesh.position.set(
        point.base[0] + Math.sin(time * 23 + point.phase) * 0.004 * level,
        point.base[1] + Math.cos(time * 29 + point.phase) * 0.005 * level,
        point.base[2],
      );
      mesh.scale.setScalar(0.5 + level * (0.6 + flicker));
      mesh.material.opacity = level * flicker;
    });
  });

  return (
    <group ref={group} visible={false}>
      {points.map((point, index) => (
        <mesh
          key={point.phase}
          ref={(mesh) => { particles.current[index] = mesh; }}
          position={point.base}
        >
          <sphereGeometry args={[point.size, 6, 6]} />
          <meshBasicMaterial
            color="#dcecff"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      <pointLight ref={light} position={[0.29, 0.09, 0]} color="#c9e1ff" distance={0.9} decay={2} intensity={0} />
    </group>
  );
}

function InductionCoil({ groups, instrument }) {
  const carriage = useRef();
  const hammer = useRef();
  const key = useRef();
  const gap = useRef();
  // The break the spark is drawn for. Re-rendering on every break at sixty a
  // second is fine — it is four numbers and a line.
  const [strike, setStrike] = useState(0);
  const told = useRef({ shocks: 0, warned: false, band: null });

  useFrame(() => {
    const s = instrument.state;
    // A shock is a discrete event, so it is reported here rather than sampled:
    // the console polls at sixteen hertz and would miss it.
    if (s.shocks !== told.current.shocks && s.lastShock) {
      told.current.shocks = s.shocks;
      const effect = s.lastShock.effect;
      if (effect && (effect.health > 0 || effect.neurasthenia > 0)) {
        harm({
          amount: effect.health,
          neurasthenia: effect.neurasthenia,
          down: effect.down,
          source: 'induction-coil',
          label: effect.label,
          note: `${s.lastShock.milliamps.toFixed(1)} mA`,
        });
      }
      // The meter may change every second during a held exposure; announce
      // its onset and meaningful band changes, not an identical toast on
      // every damage tick.
      if (s.lastShock.onset || s.lastShock.band !== told.current.band) {
        notice(s.lastShock.text, {
          tone: s.lastShock.tone,
          detail: `${Math.round(s.lastShock.volts)} V peak · ${s.lastShock.milliamps.toFixed(1)} mA through you`,
          seconds: s.lastShock.tone === 'hurt' ? 9 : 6,
        });
        told.current.band = s.lastShock.band;
      }
    }
    // One warning, the first time it is run up somewhere it could hurt you.
    // The machine gives no sign of this itself, which is the point.
    if (!told.current.warned && s.running && shockCurrent(s.volts) >= 10) {
      told.current.warned = true;
      notice('The coil is buzzing hard and the balls are snapping over.', {
        tone: 'warn',
        key: 'coil-danger',
        detail: 'At this setting the electrodes would take your hands off the bench',
        seconds: 7,
      });
    }
    if (carriage.current) carriage.current.position.x = (s.distance - COIL_FRAME.carriageRest) / 100;
    // The screw runs the moving ball out from touching to two millimetres.
    // Its authored place is already one diameter clear of the fixed ball, so
    // the offset is the gap itself and nothing else.
    if (gap.current) gap.current.position.x = s.gap / 1000;
    if (key.current) key.current.rotation.z = s.running ? -0.11 : 0;
    if (hammer.current) {
      // Pulled down hard against the spring, then let go: not a sine, because
      // a Wagner hammer does not move like one.
      const t = s.hammer;
      hammer.current.rotation.z = s.running ? -0.055 * (t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65) : 0;
    }
    if (s.struck) setStrike((n) => n + 1);
  });

  const s = instrument.state;
  const [gx, gy, gz] = COIL_FRAME.gapFixed;
  const R = COIL_FRAME.gapBallRadius;
  // Surface to surface, so the spark starts where the brass ends.
  const gapFrom = [gx + R, gy, gz];
  const gapTo = [gx + R + s.gap / 1000, gy, gz];
  // The contact spark at the hammer is the one that is always there while it
  // runs: every break of a current through a coil arcs across the platinum,
  // and it is why those contacts burned out and were sold as spares.
  const contact = [-0.205, 0.121, 0.045];

  return (
    <>
      <Channel items={groups.get('carriage') ?? []} groupRef={carriage} />
      <Channel items={groups.get('gap') ?? []} groupRef={gap} />
      <Channel items={groups.get('key') ?? []} pivot={[-0.118, 0.09, -0.062]} groupRef={key} />
      <Channel items={groups.get('hammer') ?? []} pivot={COIL_FRAME.hammerPivot} groupRef={hammer} />
      <Spark
        from={gapFrom}
        to={gapTo}
        live={s.sparking}
        intensity={Math.min(1, s.volts / 4000)}
        seed={strike}
      />
      <Spark
        from={[contact[0], contact[1] - 0.004, contact[2]]}
        to={[contact[0], contact[1] + 0.004, contact[2]]}
        live={s.running}
        intensity={s.cells / 3}
        seed={strike * 7 + 3}
        colour="#ffd9a8"
      />
      <ShockField instrument={instrument} />
    </>
  );
}

function BuiltInstrument({ kind, instrument }) {
  const groups = useMemo(() => byChannel(GEOMETRY[kind]('view')), [kind]);
  const step = STEP[kind];

  useFrame((_, delta) => {
    step(instrument, Math.min(delta, 1 / 30), instrumentBus.drain());
  });
  // The running instrument, for the debug handle: when a control does nothing,
  // the alternative to reading the state is guessing.
  useEffect(() => {
    gameDebug.instrument = instrument;
    return () => {
      gameDebug.instrument = null;
    };
  }, [instrument]);

  return (
    <group scale={SCALE[kind] ?? 1.5}>
      <Parts items={groups.get('') ?? []} />
      {kind === 'tachistoscope' && <Tachistoscope groups={groups} instrument={instrument} />}
      {kind === 'colour-wheel' && <ColourWheel groups={groups} instrument={instrument} />}
      {kind === 'induction-coil' && <InductionCoil groups={groups} instrument={instrument} />}
      {kind === 'seconds-pendulum' && <SecondsPendulum groups={groups} instrument={instrument} />}
    </group>
  );
}

export default function InstrumentStage() {
  const [using, setUsing] = useState(() => getInteraction().using);
  useEffect(() => subscribe((state) => setUsing(state.using)), []);

  // Keyed on which instrument at which item, not on `using` itself: the
  // effect below writes the framing back into `using`, and rebuilding the
  // instrument on that would loop and reset the apparatus every frame.
  const kind = using?.instrument ?? null;
  const itemId = using?.id ?? null;
  const instrument = useMemo(() => {
    if (!kind) return null;
    const build = BUILDERS[kind];
    if (!build) return null;
    const made = build();
    instrumentBus.instrument = made;
    return made;
  }, [kind, itemId]);

  // Work out the framing from the instrument's own pose and hand it back to
  // the interaction store, which is what CameraRig eases toward.
  const item = using?.item ?? null;
  useEffect(() => {
    if (!instrument || !item) return;
    const [x, y, z] = item.position;
    const yaw = item.yaw ?? 0;
    const { offset, target, fov } = instrument.framing;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    useInstrument({
      id: itemId,
      item,
      instrument: kind,
      runtime: instrument,
      framing: {
        position: [x + offset[0] * cos + offset[2] * sin, y + offset[1], z - offset[0] * sin + offset[2] * cos],
        target: [x + target[0] * cos + target[2] * sin, y + target[1], z - target[0] * sin + target[2] * cos],
        fov,
      },
    });
  }, [instrument, item, itemId, kind]);

  useEffect(
    () => () => {
      instrumentBus.instrument = null;
    },
    [instrument],
  );

  if (!instrument || !item || !GEOMETRY[kind]) return null;
  const [x, y, z] = item.position;
  return (
    <group position={[x, y, z]} rotation={[0, item.yaw ?? 0, 0]}>
      {/* Fill, so the working copy is not lit only by the room. Kept soft and
          off to one side: a hard point close in blows a specular hole through
          the french polish. */}
      <pointLight position={[1.1, 1.9, 1.6]} intensity={5} distance={6} decay={1.6} color="#ffe9c8" />
      <pointLight position={[-1.2, 0.9, 1.3]} intensity={2} distance={5} decay={1.6} color="#c9d8e8" />
      <BuiltInstrument kind={kind} instrument={instrument} />
    </group>
  );
}

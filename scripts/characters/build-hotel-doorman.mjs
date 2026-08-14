import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
} from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const LOCAL_MIXAMO_SOURCE = path.join(ROOT, 'assets-local/mixamo/pedestrians');

function sourcePath(filename) {
  if (path.isAbsolute(filename)) return filename;
  if (filename.includes('/')) return path.join(ROOT, filename);
  const local = path.join(LOCAL_MIXAMO_SOURCE, filename);
  return existsSync(local) ? local : path.join(ROOT, filename);
}

const PROFILES = Object.freeze({
  doorman: Object.freeze({
    label: 'Hotel doorman',
    generated: 'hotel-doorman',
    source: 'Idle Hotel Doorman Skinned.fbx',
    modelRaw: 'hotel-doorman.raw.glb',
    motionsRaw: 'hotel-doorman-motions.raw.glb',
    modelOutput: 'hotel-doorman.glb',
    motionOutput: 'hotel-doorman-motions.glb',
    modelClip: 'DoormanIdle',
    expectedBones: 65,
    // The first nine are doorman-specific. The final two are useful standing
    // motions already used by the pedestrian cast.
    motions: Object.freeze([
      ['Lengthy Head Nod.fbx', 'HeadNod'],
      ['Cocky Head Turn.fbx', 'CockyHeadTurn'],
      ['Thoughtful Head Shake.fbx', 'ThoughtfulHeadShake'],
      ['Acknowledging.fbx', 'Acknowledging'],
      ['Waving.fbx', 'Waving'],
      ['Standing Idle Mildly Annoyed.fbx', 'MildlyAnnoyed'],
      ['Standing Holding Sign Idle.fbx', 'HoldingSignIdle'],
      ['Standing Arguing.fbx', 'StandingArguing'],
      ['Standing Holding Object One Hand.fbx', 'HoldingObjectOneHand'],
      ['Standing Leaning on Wall.fbx', 'StandingLeaningWall'],
      ['Standing Idle.fbx', 'StandingIdleAlternate'],
    ]),
  }),
  policeman: Object.freeze({
    label: 'Street policeman',
    generated: 'street-policeman',
    source: 'Policeman Idle Skinned.fbx',
    modelRaw: 'street-policeman.raw.glb',
    motionsRaw: 'street-policeman-motions.raw.glb',
    modelOutput: 'street-policeman.glb',
    motionOutput: 'street-policeman-motions.glb',
    modelClip: 'PolicemanIdle',
    expectedBones: 57,
    motions: Object.freeze([
      ['Blow A Kiss.fbx', 'BlowAKiss'],
      ['Arms Crossed Fidget.fbx', 'ArmsCrossedFidget'],
      ['Right Turn.fbx', 'RightTurn'],
      ['Left Turn.fbx', 'LeftTurn'],
    ]),
    compatibleMotionOutput: 'hotel-doorman-motions.glb',
  }),
  dandy: Object.freeze({
    label: 'Top-hat dandy',
    generated: 'tophat-dandy',
    source: 'Tophat Dandy Standing Idle Skinned.fbx',
    modelRaw: 'tophat-dandy.raw.glb',
    motionsRaw: 'tophat-dandy-motions.raw.glb',
    modelOutput: 'tophat-dandy.glb',
    motionOutput: 'tophat-dandy-motions.glb',
    modelClip: 'DandyIdle',
    expectedBones: 65,
    motions: Object.freeze([
      ['Walk With Walking Stick.fbx', 'WalkingStickWalk'],
      ['Standing with Walking Stick Idle.fbx', 'WalkingStickIdle'],
      ['Standing Acknowledging.fbx', 'StandingAcknowledging'],
      ['Cocky Head Turn.fbx', 'CockyHeadTurn'],
    ]),
  }),
  teddy: Object.freeze({
    label: 'Theodore Roosevelt street speaker',
    generated: 'teddy-roosevelt',
    source: 'Teddy Roosevelt Standing Idle Skinned.fbx',
    modelRaw: 'teddy-roosevelt.raw.glb',
    motionsRaw: 'teddy-roosevelt-motions.raw.glb',
    modelOutput: 'teddy-roosevelt.glb',
    motionOutput: 'teddy-roosevelt-motions.glb',
    modelClip: 'RooseveltIdle',
    expectedBones: 65,
    motions: Object.freeze([
      ['Gesticulating Speach.fbx', 'GesticulatingSpeech'],
      ['Giviing a Speach.fbx', 'GivingSpeech'],
      ['Strawhat-Walking.fbx', 'Walking'],
    ]),
  }),
  gardener: Object.freeze({
    label: 'Central Park gardener',
    generated: 'central-park-gardener',
    source: 'Gardener Idle Skinned.fbx',
    modelRaw: 'central-park-gardener.raw.glb',
    motionsRaw: 'central-park-gardener-motions.raw.glb',
    modelOutput: 'central-park-gardener.glb',
    motionOutput: 'central-park-gardener-motions.glb',
    modelClip: 'GardenerIdle',
    expectedBones: 65,
    motions: Object.freeze([
      ['Strawhat-Walking.fbx', 'Walking'],
      ['Iv Pole Walking.fbx', 'WalkingCarry'],
      ['Watering.fbx', 'Watering'],
      ['Dig And Plant Seeds.fbx', 'DigAndPlantSeeds'],
      ['Kneeling Down.fbx', 'KneelingDown'],
      ['Strawhat Sitting Idle.fbx', 'BenchRest'],
    ]),
  }),
  sailorboy: Object.freeze({
    label: 'Sailor-suit boy',
    generated: 'sailorsuit-boy',
    source: 'Sailorsuit Boy Idle with Skin.fbx',
    modelRaw: 'sailorsuit-boy.raw.glb',
    motionsRaw: 'sailorsuit-boy-motions.raw.glb',
    modelOutput: 'sailorsuit-boy.glb',
    motionOutput: 'sailorsuit-boy-motions.glb',
    modelClip: 'SailorBoyIdle',
    expectedBones: 65,
    motions: Object.freeze([
      ['Chicken Dance.fbx', 'ChickenDance'],
      ['assets/source/tripo-victorian-player/Slow Run.fbx', 'Running'],
      ['Standing Acknowledging.fbx', 'Pointing'],
      ['Kneeling Down.fbx', 'KneelingDown'],
      ['Punching.fbx', 'PlayPunching'],
    ]),
  }),
});
const PROFILE_NAME = process.argv[2] ?? 'doorman';
const PROFILE = PROFILES[PROFILE_NAME];
if (!PROFILE) throw new Error(`Unknown Mixamo NPC profile: ${PROFILE_NAME}`);
const GENERATED = path.join(ROOT, 'character-lab/.generated', PROFILE.generated);
const MODEL_SOURCE = sourcePath(PROFILE.source);
const RAW_MODEL = path.join(GENERATED, PROFILE.modelRaw);
const RAW_MOTIONS = path.join(GENERATED, PROFILE.motionsRaw);
const MODEL_OUTPUT = path.join(ROOT, 'game/public/models', PROFILE.modelOutput);
const MOTION_OUTPUT = path.join(ROOT, 'game/public/models', PROFILE.motionOutput);
const MOTIONS = PROFILE.motions;
const MOTION_SOURCES = MOTIONS.map(([filename, name]) => [sourcePath(filename), name]);

function runBlender(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(BLENDER, [
      '--factory-startup', '--background', '--python-exit-code', '1',
      '--python', script, '--', ...args,
    ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log = `${log}${chunk}`.slice(-30000); });
    child.stderr.on('data', (chunk) => { log = `${log}${chunk}`.slice(-30000); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0
      ? resolve(log)
      : reject(new Error(log || `Blender exited with code ${code}`)));
  });
}

async function compress(source, output) {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  const document = await io.read(source);
  await document.transform(
    dedup(),
    prune({ keepAttributes: true }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({
      quantizationVolume: 'mesh',
      quantizePosition: 16,
      quantizeNormal: 12,
      quantizeTexcoord: 14,
      quantizeColor: 10,
      quantizeWeight: 12,
      quantizeGeneric: 16,
    }),
  );
  document.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(output, document);
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function validate() {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const [model, motions] = await Promise.all([io.read(MODEL_OUTPUT), io.read(MOTION_OUTPUT)]);
  const modelRoot = model.getRoot();
  const motionRoot = motions.getRoot();
  if (modelRoot.listMeshes().length < 1 || modelRoot.listSkins().length !== 1) {
    throw new Error(`${PROFILE.label} model must contain one skin and at least one mesh`);
  }
  for (const material of modelRoot.listMaterials()) {
    if (material.getAlphaMode() !== 'OPAQUE') {
      throw new Error(`${PROFILE.label} material ${material.getName()} must be opaque`);
    }
  }
  if (motionRoot.listSkins().length !== 1) {
    throw new Error(`${PROFILE.label} motion pack must contain its Mixamo skeleton carrier`);
  }

  const modelJoints = modelRoot.listSkins()[0].listJoints().map((joint) => joint.getName());
  const motionJoints = motionRoot.listSkins()[0].listJoints().map((joint) => joint.getName());
  if (modelJoints.length !== PROFILE.expectedBones || !sameValues(modelJoints, motionJoints)) {
    throw new Error(`${PROFILE.label} skeleton mismatch: model=${modelJoints.length}, motions=${motionJoints.length}`);
  }

  const modelClips = modelRoot.listAnimations().map((clip) => clip.getName());
  if (!sameValues(modelClips, [PROFILE.modelClip])) {
    throw new Error(`Unexpected ${PROFILE.label} model clips: ${modelClips.join(', ')}`);
  }
  const expectedMotions = MOTIONS.map(([, name]) => name).sort();
  const actualMotions = motionRoot.listAnimations().map((clip) => clip.getName()).sort();
  if (!sameValues(actualMotions, expectedMotions)) {
    throw new Error(`Unexpected hotel doorman motion clips: ${actualMotions.join(', ')}`);
  }

  const modelNodes = new Set(modelRoot.listNodes().map((node) => node.getName()));
  for (const animation of motionRoot.listAnimations()) {
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode()?.getName();
      if (target && !modelNodes.has(target)) {
        throw new Error(`${animation.getName()} targets missing model node ${target}`);
      }
    }
    for (const sampler of animation.listSamplers()) {
      for (const accessor of [sampler.getInput(), sampler.getOutput()]) {
        const values = accessor?.getArray();
        if (values && Array.from(values).some((value) => !Number.isFinite(value))) {
          throw new Error(`${animation.getName()} contains a non-finite keyframe`);
        }
      }
    }
  }

  if (PROFILE.compatibleMotionOutput) {
    const compatible = await io.read(path.join(
      ROOT,
      'game/public/models',
      PROFILE.compatibleMotionOutput,
    ));
    const compatibleJoints = compatible.getRoot().listSkins()[0]?.listJoints()
      .map((joint) => joint.getName()) ?? [];
    const missingCompatibilityJoints = compatibleJoints.filter((name) => !modelJoints.includes(name));
    const onlyUnusedPinkyJoints = missingCompatibilityJoints.every((name) => /HandPinky[1-4]$/.test(name));
    const sharedOrder = compatibleJoints.filter((name) => modelJoints.includes(name));
    if (!sameValues(modelJoints, sharedOrder) || !onlyUnusedPinkyJoints) {
      throw new Error(`${PROFILE.label} cannot share ${PROFILE.compatibleMotionOutput}`);
    }
  }

  return {
    bones: modelJoints.length,
    modelBytes: (await stat(MODEL_OUTPUT)).size,
    motionBytes: (await stat(MOTION_OUTPUT)).size,
    motions: actualMotions,
  };
}

for (const file of [MODEL_SOURCE, ...MOTION_SOURCES.map(([filename]) => filename)]) {
  try {
    await readFile(file);
  } catch (error) {
    throw new Error(
      `Missing character source ${path.relative(ROOT, file)}. `
      + 'Put local FBX inputs under assets-local/mixamo/pedestrians/.',
      { cause: error },
    );
  }
}
await mkdir(GENERATED, { recursive: true });
await runBlender(path.join(ROOT, 'scripts/characters/export_mixamo_character.py'), [
  '--source', MODEL_SOURCE,
  '--output', RAW_MODEL,
  '--clip-name', PROFILE.modelClip,
  '--texture-size', '1024',
]);
await runBlender(path.join(ROOT, 'scripts/characters/convert_mixamo_motion.py'), [
  '--source-dir', ROOT,
  '--output', RAW_MOTIONS,
  '--in-place',
  ...MOTION_SOURCES.flatMap(([filename, name]) => ['--clip', `${filename}=${name}`]),
]);
await Promise.all([
  compress(RAW_MODEL, MODEL_OUTPUT),
  compress(RAW_MOTIONS, MOTION_OUTPUT),
]);
const result = await validate();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

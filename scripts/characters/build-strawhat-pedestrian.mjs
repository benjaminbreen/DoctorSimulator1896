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
  KHRMeshQuantization,
} from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const LOCAL_MIXAMO_SOURCE = path.join(ROOT, 'assets-local/mixamo/pedestrians');

function sourcePath(filename) {
  const local = path.join(LOCAL_MIXAMO_SOURCE, filename);
  return existsSync(local) ? local : path.join(ROOT, filename);
}

const GENERATED = path.join(ROOT, 'character-lab/.generated/strawhat-pedestrian');
const MODEL_SOURCE = sourcePath('Strawhat Standing Idle Skin.fbx');
const RAW_MODEL = path.join(GENERATED, 'strawhat-pedestrian.raw.glb');
const RAW_MOTIONS = path.join(GENERATED, 'strawhat-motions.raw.glb');
const MODEL_OUTPUT = path.join(ROOT, 'game/public/models/strawhat-pedestrian.glb');
const MOTION_OUTPUT = path.join(ROOT, 'game/public/models/strawhat-motions.glb');

const MOTIONS = Object.freeze([
  ['Strawhat-Walking.fbx', 'Walk'],
  ['Strawhat-Reacting.fbx', 'Collision Reaction'],
  ['Standing Acknowledging.fbx', 'StandingAcknowledging'],
  ['Standing Leaning on Wall.fbx', 'StandingLeaningWall'],
  ['Strawhat Crossed Leg Sitting Talking.fbx', 'SittingCrossedLegTalking'],
  ['Strawhat Sitting And Gesticulating.fbx', 'SittingGesticulating'],
  ['Strawhat Sitting Angry.fbx', 'SittingAngry'],
  ['Strawhat Sitting Disapproval.fbx', 'SittingDisapproval'],
  ['Strawhat Sitting Fidgeting Idle.fbx', 'SittingFidgeting'],
  ['Strawhat Sitting Hit Reaction.fbx', 'SittingHitReaction'],
  ['Strawhat Sitting Hopeless.fbx', 'SittingHopeless'],
  ['Strawhat Sitting Idle.fbx', 'SittingIdle'],
  ['Strawhat Sitting Thinking.fbx', 'SittingThinking'],
  ['Strawhat Smoking or Eating.fbx', 'SmokingOrEating'],
  ['Talking Intensely Sitting.fbx', 'SittingTalkingIntensely'],
  ['Driving.fbx', 'Driving'],
  ['Honking Horn.fbx', 'HonkingHorn'],
  // Exported now so phase two only needs the stroller model and route logic.
  ['Strawhat Pushing Stroller Idle.fbx', 'StrollerIdle'],
  ['Strawhat Pushing Stroller Walk.fbx', 'StrollerWalk'],
  // Standing gestures the crowd quirks need: a quarrel, a gallant's bow, and
  // the brush-off that usually answers it.
  ['Standing Arguing.fbx', 'StandingArguing'],
  ['Quick Formal Bow.fbx', 'QuickFormalBow'],
  ['Annoyed Head Shake.fbx', 'AnnoyedHeadShake'],
  ['Playing The Violin.fbx', 'PlayingViolin'],
]);
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
    throw new Error('Strawhat model must contain one skin and at least one mesh');
  }
  for (const material of modelRoot.listMaterials()) {
    if (material.getAlphaMode() !== 'OPAQUE') {
      throw new Error(`Strawhat material ${material.getName()} must be opaque`);
    }
  }
  if (motionRoot.listSkins().length !== 1) {
    throw new Error('Strawhat motion pack must contain its Mixamo skeleton carrier');
  }

  const modelJoints = modelRoot.listSkins()[0].listJoints().map((joint) => joint.getName());
  const motionJoints = motionRoot.listSkins()[0].listJoints().map((joint) => joint.getName());
  if (modelJoints.length !== 65 || !sameValues(modelJoints, motionJoints)) {
    throw new Error(`Strawhat skeleton mismatch: model=${modelJoints.length}, motions=${motionJoints.length}`);
  }

  const modelClips = modelRoot.listAnimations().map((clip) => clip.getName());
  if (!sameValues(modelClips, ['StandingIdle'])) {
    throw new Error(`Unexpected Strawhat model clips: ${modelClips.join(', ')}`);
  }
  const expectedMotions = MOTIONS.map(([, name]) => name).sort();
  const actualMotions = motionRoot.listAnimations().map((clip) => clip.getName()).sort();
  if (!sameValues(actualMotions, expectedMotions)) {
    throw new Error(`Unexpected Strawhat motion clips: ${actualMotions.join(', ')}`);
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
  '--clip-name', 'StandingIdle',
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

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { chapters, lectureAt, lectureStage, lessons } from '../world/jamesLecture.js';
import { aimBoneToward } from './characters/restingHands.js';
import StaticColliders from './lib/StaticColliders.jsx';

// Pen paths on a five-by-seven grid. Separate paths lift the chalk between strokes.
const letters = {
  A:'06 20 46/14 34', B:'06 00 30 41 42 33 03/33 44 45 36 06',
  C:'41 30 10 01 05 16 36 45', D:'06 00 20 41 45 26 06', E:'40 00 06 46/03 33',
  F:'06 00 40/03 33', G:'41 30 10 01 05 16 36 45 43 23', H:'00 06/40 46/03 43',
  I:'10 30/20 26/16 36', J:'10 40 45 36 16 05', K:'00 06/40 03 46',
  L:'00 06 46', M:'06 00 23 40 46', N:'06 00 46 40', O:'10 30 41 45 36 16 05 01 10',
  P:'06 00 30 41 42 33 03', Q:'10 30 41 45 36 16 05 01 10/24 47', R:'06 00 30 41 42 33 03/23 46',
  S:'41 30 10 01 02 13 33 44 45 36 16 05', T:'00 40/20 26', U:'00 05 16 36 45 40',
  V:'00 26 40', W:'00 16 23 36 40', X:'00 46/40 06', Y:'00 23 40/23 26', Z:'00 40 06 46',
  0:'10 30 41 45 36 16 05 01 10', 1:'02 20 26/06 46', 2:'01 10 30 41 42 06 46',
  5:'40 00 03 33 44 45 36 06', '→':'03 53/31 53 35', '—':'03 43','·':'23 24',
  '?':'01 10 30 41 42 23 24/26 27',
};
// Lower-case hand for the explanations, with ascenders, loops and descenders.
// Sample these pen paths once so the physical chalk follows the same curves.
const handwriting = {
  a: 'M3.9 2.7 Q2 1.4 .9 3.6 Q-.2 6.6 1.9 5.8 Q3.5 5.2 4 2.4 L3.6 5.4 Q3.7 6.5 4.8 5.4',
  b: 'M.4 6 Q.7 2.4 2.2 .3 Q3 -1.1 2.6 .7 L.8 4.5 Q3 1.3 4 2.6 Q5 4.4 2.4 5.8 Q1.5 6.3 .8 5.5',
  c: 'M3.9 2.8 Q2.9 1.7 1.6 2.9 Q-.5 5 .8 5.9 Q2.1 6.8 4.1 4.9',
  d: 'M3.5 2.7 Q1.4 1.7 .6 4.3 Q.2 6.9 2.4 5.5 Q4 4.1 4.8 -.5 L3.5 5.1 Q3.3 6.5 4.6 5.6',
  e: 'M.4 4.5 Q3.7 4.4 3.3 2.8 Q2.8 1.8 1.4 3 Q-.4 5 .9 5.9 Q2.5 6.6 4.4 5',
  f: 'M.4 7.6 Q1.3 3.6 2.6 .5 Q3.8 -1.4 4 .1 M.2 3.3 L3.7 3.1',
  g: 'M4 2.6 Q2.2 1.8 1 3.4 Q-.1 6.8 2 5.8 Q3.7 4.9 4.1 2.5 L3 7.5 Q2.1 9.4 .8 8.7 Q-.1 7.9 2.7 6.5 L4.7 5.3',
  h: 'M.4 5.9 Q1.4 1.6 2.8 -.3 Q3.4 .3 1 4.5 Q4.4 .7 3.9 3.9 L3.5 5.3 Q3.3 6.4 4.6 5.6',
  i: 'M1.2 2.6 L.7 5.1 Q.6 6.4 2.4 5.6 M1.5 .9 l.12 -.1',
  j: 'M3.5 2.5 L2.3 7.5 Q1.5 9.4 .1 8.4 M3.8 .9 l.12 -.1',
  k: 'M.5 6 L2.4 -.4 M1.1 4.5 Q3.2 1.7 4.1 2.5 Q4.1 3.5 1.9 4.2 Q3 6.3 4.6 5.7',
  l: 'M.4 5 Q3.4 1.6 2.8 .1 Q2.3 -.7 1.4 1.5 Q-.1 5.6 1 6 Q2 6.5 3.1 5.4',
  m: 'M.3 6 L1 2.5 M.8 4.6 Q3.5 .8 3 3.6 L2.5 5.8 Q5 1.1 5.4 3 L5 5.3 Q4.8 6.4 6 5.6',
  n: 'M.4 6 L1.1 2.5 M.9 4.6 Q4.5 .5 4.1 3.2 L3.6 5.2 Q3.4 6.5 4.9 5.4',
  o: 'M3.9 2.7 Q2.5 1.7 1.2 3 Q-.5 5.6 1.4 6 Q3.7 6.4 4.1 3.3 Q4 2.3 3 2.5 Q3.8 3.9 4.8 3.4',
  p: 'M.1 8.6 L1.9 2.4 M1.4 4.6 Q4.3 .7 4.6 3 Q4.8 5.2 2.9 5.9 Q1.9 6.4 1.3 5.6',
  r: 'M.4 6 L1.3 2.5 M.9 4.4 Q2.5 2.1 3.4 2.6 Q3.9 3.1 4.5 2.8',
  s: 'M3.9 2.8 Q3 1.7 1.7 2.6 Q.7 3.3 2.3 4 Q4.4 5.1 2.3 5.9 Q1.2 6.4 .4 5.6',
  t: 'M3 .5 L1.4 5 Q1 6.7 3.8 5.5 M.2 3.1 L4.4 2.9',
  u: 'M1.2 2.6 L.6 4.7 Q.1 7 2.3 5.5 Q3.5 4.4 4 2.5 L3.4 5.4 Q3.4 6.3 4.6 5.5',
  v: 'M.7 2.4 Q1.2 3.5 1.3 5.9 Q3.2 5.1 4.2 2.6', w: 'M.5 2.6 Q1 3.6 1 6 Q2.2 5.3 3 3.2 L3.3 6 Q5.5 4.8 5.8 2.6',
  x: 'M.8 2.6 Q2 3.5 3.7 5.9 M4.3 2.4 Q2.8 3.5 .3 6',
  y: 'M.7 2.6 Q.1 6.8 2.3 5.6 Q3.6 4.7 4.2 2.5 L3 7.2 Q2.3 9.3 .8 8.6 Q-.1 7.8 3.1 6.3 L4.8 5.3',
  O: 'M3.2 .1 C.8 -.4 -.5 2.9 .2 4.9 C.9 7.2 3.7 6.2 4.4 3.3 Q5 .2 3.2 .1',
  P: 'M.4 6.3 L1.2 .2 M.2 .5 Q5 -1 4.5 1.9 Q4.4 3.5 1 3.6',
  '0': 'M3.1 .1 C.8 0 -.1 3.6 .6 5.2 Q2 7.5 3.8 4.4 Q5.1 .3 3.1 .1',
};
function penPaths(letter) {
  if (!handwriting[letter]) return (letters[letter.toUpperCase()] || '').split('/').filter(Boolean)
    .map(stroke => stroke.split(' ').map(pair => [Number(pair[0]), Number(pair[1])]));
  return handwriting[letter].split(/(?=M)/).filter(Boolean).map(d => {
    const pen = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pen.setAttribute('d', d);
    const length = pen.getTotalLength(), n = Math.max(2, Math.ceil(length * 1.8));
    return Array.from({length:n+1}, (_,i) => {
      const p = pen.getPointAtLength(i*length/n);
      return [p.x,p.y];
    });
  });
}
const bx = -3.91, bz = -4.20, by = 1.34, width = 2.62, height = 1.15;
const W = 1024, H = 448;
const colliders = [{ type:'box', p:[bx,.97,bz], size:[width+.12,1.94,.48] }];
function pathsFor(chapter, row) {
  const title = chapters[chapter].board[row];
  const step = Math.min(row === 0 ? 13 : 9, (chapter === 5 && row === 0 ? 545 : 885) / (title.length * 6));
  const y = [46,171,299][row];
  const paths = [];
  for (let i = 0; i < title.length; i++) {
    const glyph = penPaths(title[i]);
    const slope = .085 + .035*Math.sin(i*2.71);
    for (const stroke of glyph) {
      paths.push(stroke.map(([u,v]) =>
        [60 + (i*6 + u + (6-v)*slope)*step, y + v*step + 2.2*Math.sin(i*.93)]));
    }
  }
  // The branching figure follows the two circles and alternative paths on notebook image 39.
  if (chapter === 5 && row === 0) {
    const ring = (x,y) => Array.from({length:23}, (_,i) => [x+12*Math.cos(i*Math.PI/11),y+12*Math.sin(i*Math.PI/11)]);
    paths.push(ring(690,95), [[702,95],[748,65],[805,62],[855,94]],
      [[702,95],[750,88],[804,100],[855,94]], [[702,95],[746,125],[808,115],[855,94]],ring(867,94));
  }
  const segments = [];
  let length = 0;
  for (const path of paths) for (let j = 1; j < path.length; j++) {
    const a = path[j-1], b = path[j];
    const dist = Math.hypot(b[0]-a[0],b[1]-a[1]);
    segments.push({a,b, start:length, dist}); length += dist;
  }
  return {segments, length};
}

function makeSlate() {
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const ctx = base.getContext('2d');
  const rgba = ctx.createImageData(W,H);
  let seed = 41;
  for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const shade = 40 + 5*Math.sin(y*.018+x*.0017) + 3*Math.cos(y*.077+x*.003) + (seed/4294967296)*12;
    const k = (y*W+x)*4;
    rgba.data[k]=shade; rgba.data[k+1]=shade+6; rgba.data[k+2]=shade+4; rgba.data[k+3]=255;
  }
  ctx.putImageData(rgba,0,0);
  const canvas = base.cloneNode();
  const draw = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy=4;
  const writing = chapters.map((_,i) => [0,1,2].map(j => pathsFor(i,j)));
  let last = '';
  return { texture, update(chapter, time, tip) {
    const rows = writing[chapter];
    const starts = lessons[chapter].marks.map(mark => chapters[chapter].starts[mark]);
    const fractions = rows.map(({length},i) => THREE.MathUtils.clamp((time-starts[i]) / (length/270+1),0,1));
    const key = chapter + '/' + fractions.map(v=>Math.floor(v*220)).join('/');
    const due = starts.some((start,i) => time >= start-1.4 && fractions[i] < 1);
    if (last === key && !due) return false;
    if (last !== key) draw.drawImage(base,0,0);
    let reaching = false;
    for (let r=0;r<3;r++) {
      const progress = fractions[r];
      if (last === key && progress === 1) continue;
      if (progress===0 && time < starts[r]-1.4) continue;
      const row = rows[r], limit = row.length * progress;
      for (const {a,b,start,dist} of row.segments) {
        if (start > limit) break;
        const f = Math.min(1,(limit-start)/dist);
        const x=a[0]+(b[0]-a[0])*f, y=a[1]+(b[1]-a[1])*f;
        if (last !== key && f>0) {
          draw.lineWidth = 4.4 + .65*Math.sin(start*.15);
          draw.strokeStyle = 'rgba(242,238,217,' + (.79+.13*Math.cos(start*.13)) + ')';
          draw.lineCap='round'; draw.beginPath(); draw.moveTo(...a); draw.lineTo(x,y); draw.stroke();
        }
        if (progress < 1 && time>=starts[r]-1.4) {
          tip.set(bx+(x/W-.5)*width,by+(.5-y/H)*height,bz+.057);
          reaching = true;
        }
      }
    }
    if (last!==key) { texture.needsUpdate = true; last=key; }
    return reaching;
  }};
}

const shoulder = new THREE.Vector3(), wrist = new THREE.Vector3(), dir = new THREE.Vector3();
const elbow = new THREE.Vector3(), pole = new THREE.Vector3();
function writeWithChalk(bones, tip, blend) {
  const arm=bones.RightArm, fore=bones.RightForeArm, hand=bones.RightHand, finger=bones.RightHandIndex1;
  arm.getWorldPosition(shoulder); fore.getWorldPosition(elbow); hand.getWorldPosition(wrist);
  const upper = shoulder.distanceTo(elbow), lower = elbow.distanceTo(wrist);
  // The wrist stays back from the tip. Bend the elbow down and out, then
  // turn the knuckles toward the chalk without twisting the upper arm.
  wrist.copy(tip); wrist.z += .12; wrist.y -= .055;
  dir.copy(wrist).sub(shoulder);
  const d = THREE.MathUtils.clamp(dir.length(),Math.abs(upper-lower)+.001,upper+lower-.001);
  dir.normalize();
  pole.set(-.8,-1,.35); pole.addScaledVector(dir,-pole.dot(dir)).normalize();
  const along = (upper*upper + d*d - lower*lower)/(2*d);
  elbow.copy(shoulder).addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,upper*upper-along*along)));
  aimBoneToward(arm,fore,elbow,blend);
  aimBoneToward(fore,hand,wrist,blend);
  if (finger) aimBoneToward(hand,finger,tip,blend);
}

export default function DaneLectureBoard({ lecturer, grain }) {
  const slate = useMemo(makeSlate, []);
  const bytes = useLoader(THREE.FileLoader, '/audio/dane-hall/articulation.bin', loader => loader.setResponseType('arraybuffer'));
  const articulation = useMemo(() => new Uint8Array(bytes), [bytes]);
  const openness = useRef(0);
  const tip = useMemo(()=>new THREE.Vector3(),[]);
  const chalk = useRef(null), weight=useRef(0);
  useEffect(()=>()=>slate.texture.dispose(),[slate]);
  useFrame(({camera,clock},dt)=>{
    const audio = lectureStage.media;
    const t = audio?.currentTime || 0;
    const {chapter,line} = lectureAt(t);
    const reaching = slate.update(chapter,t,tip) && !lectureStage.answering && !lectureStage.returning;
    const {pivot,bones,faces,yawCorrection} = lecturer;
    const blend = 1-Math.exp(-Math.min(dt,.15)*6);
    weight.current = THREE.MathUtils.lerp(weight.current,reaching?1:0,blend);
    const speaking = audio && !audio.paused;
    const aside = lectureStage.aside;
    const talkingAside = (aside && !aside.paused) || (lectureStage.answering && window.speechSynthesis?.speaking);
    const beat = clock.elapsedTime;
    const level = speaking ? articulation[Math.min(articulation.length-1,Math.floor(t*20))]/255
      : talkingAside ? .24+.19*Math.sin(beat*15) : 0;
    openness.current = THREE.MathUtils.damp(openness.current,level,21,dt);
    const blink = Math.max(0,1-Math.abs((beat%4.62)-2.7)*9);
    for (const face of faces) {
      const keys = face.morphTargetDictionary, values = face.morphTargetInfluences;
      values[keys.jawOpen] = openness.current*.68;
      values[keys.eyeBlinkLeft] = values[keys.eyeBlinkRight] = blink;
      values[keys.browInnerUp] = .04 + openness.current*.15;
    }
    const audience = lectureStage.answering ? Math.atan2(camera.position.x-pivot.position.x,camera.position.z-pivot.position.z)
      : .27 + (speaking ? .18*Math.sin(t*.16) : 0);
    const desired = (reaching ? -2.91 : audience) + yawCorrection;
    pivot.rotation.y += Math.atan2(Math.sin(desired-pivot.rotation.y),Math.cos(desired-pivot.rotation.y))*blend;
    bones.RightArm.getWorldPosition(shoulder);
    const targetX = reaching ? pivot.position.x + tip.x + .035 - shoulder.x : bx+.77;
    const targetZ = reaching ? Math.max(bz+.17,pivot.position.z + tip.z + .24 - shoulder.z) : bz+.81;
    pivot.position.x = THREE.MathUtils.damp(pivot.position.x,targetX,9,dt);
    pivot.position.z = THREE.MathUtils.damp(pivot.position.z,targetZ,7,dt);
    pivot.updateWorldMatrix(true,false);
    if (!reaching && speaking && (line%5 === 1 || line%5 === 4)) {
      // Let the open hand rise with a phrase, then settle before the next one.
      const phase = t-chapters[chapter].starts[line];
      const lift = Math.sin(Math.PI*Math.min(1,phase/3.2))*.78;
      bones.LeftArm.getWorldPosition(elbow);
      elbow.x += .06; elbow.y -= .20; elbow.z += .18;
      aimBoneToward(bones.LeftArm,bones.LeftForeArm,elbow,lift);
      bones.LeftForeArm.getWorldPosition(wrist);
      wrist.x += .08; wrist.y += .06; wrist.z += .24;
      aimBoneToward(bones.LeftForeArm,bones.LeftHand,wrist,lift);
    }
    if (weight.current > .015) writeWithChalk(bones,tip,weight.current);
    const finger = bones.RightHandIndex2 ?? bones.RightHand;
    finger.getWorldPosition(chalk.current.position);
    if (reaching && t>=0) {
      dir.copy(tip).sub(chalk.current.position);
      const length = Math.min(.065,dir.length());
      chalk.current.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP,dir.normalize());
      chalk.current.position.addScaledVector(dir,length*.5);
      chalk.current.scale.y = length;
    } else { chalk.current.scale.y=.048; }
  });
  function rail(x,y,z,w,h,d) {
    return <mesh key={[x,y,z].join('/')} position={[x,y,z]} castShadow receiveShadow>
      <boxGeometry args={[w,h,d]}/><meshStandardMaterial map={grain} color="#785339" roughness={.48}/>
    </mesh>;
  }
  return <>
    <group position={[bx,by,bz]}>
      <mesh><boxGeometry args={[width,height,.09]}/><meshStandardMaterial color="#393d36"/></mesh>
      <mesh position={[0,0,.047]}><planeGeometry args={[width,height]}/><meshStandardMaterial map={slate.texture} roughness={.93}/></mesh>
      {[-1,1].map(side=>rail(0,side*(height/2+.024),0,width+.12,.06,.115))}
      {[-1,1].map(side=>rail(side*(width/2+.028),-.34,-.04,.075,height+.78,.13))}
      {[-1,1].map(side=>rail(side*(width/2+.028),-by+.09,0,.13,.105,.55))}
      {rail(0,-height/2-.04,.09,width+.04,.045,.18)}
      <mesh position={[.88,-height/2+.012,.13]}><boxGeometry args={[.21,.07,.09]}/><meshStandardMaterial color="#68513d"/></mesh>
    </group>
    <mesh ref={chalk}><cylinderGeometry args={[.008,.006,1,8]}/><meshStandardMaterial color="#f4eee0"/></mesh>
    <StaticColliders entries={colliders}/>
  </>;
}

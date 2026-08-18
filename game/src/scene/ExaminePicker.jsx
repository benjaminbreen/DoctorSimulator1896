import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import {
  armPicking, cancelPicking, getInteraction, useInstrument,
} from '../world/interaction.js';
import { isGameplayInputBlocked } from '../input/uiMode.js';
import { pickSubject, pickableItems, surfaceClassAt } from '../examine/picking.js';
import { classifySubject, subjectRecord } from '../examine/subjects.js';
import { examineFraming } from '../examine/framing.js';
import { buildParkRocks } from '../world/parkRocks.js';
import { parkLandmark } from '../hud/landmarks.js';
import { gameDebug } from '../debug.js';

// Enter arms the eye; the next click on the world opens a close examination of
// whatever was clicked.
//
// The ray goes against the rendered scene because that is what the player can
// see, but only to get a point in the world. What that point *is* comes from
// the item list — see examine/picking.js — so the answer is the bench the
// builders placed, not whichever mesh happened to be nearest the lens.

// A drag turns the camera. Anything that moves further than this between press
// and release was a look, not a click.
const CLICK_SLOP = 5;
// Past this the ray is looking at the skyline or the sky itself, neither of
// which is a thing to be examined.
const MAX_RANGE = 60;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const scratchNormal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();

// Rocks are drawn as instanced meshes and never enter the item list, so their
// builder is read directly. It is pure and cheap, and this runs once per zone.
function rockCandidates() {
  const { boulders, pebbles } = buildParkRocks();
  return [...boulders, ...pebbles].map((rock, index) => ({
    id: `schist-${index}`,
    position: rock.p,
    size: [rock.s[0] * 2, rock.s[1] * 2, rock.s[2] * 2],
    subjectClass: 'stone',
  }));
}

// Where the player is standing, phrased the way the top bar phrases it.
function placeLine(position) {
  const zone = gameDebug.zoneLabel ?? '';
  const landmark = position ? parkLandmark(position[0], position[2]) : null;
  if (!landmark) return zone;
  return `${zone.split(' — ')[0]} · ${landmark}`;
}

// Ground, or something standing up. A surface that is not roughly level is a
// wall, a trunk or a railing, and those only get examined when the item list
// knows what they are.
function facesUp(hit) {
  if (!hit.face) return true;
  normalMatrix.getNormalMatrix(hit.object.matrixWorld);
  scratchNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
  return Math.abs(scratchNormal.y) > 0.6;
}

// The first hit the player could actually see: skip anything hidden, and skip
// the player's own figure, which stands between the lens and most of the world.
function visibleHit(hits) {
  for (const hit of hits) {
    let node = hit.object;
    let hidden = false;
    while (node) {
      if (node.visible === false || node === gameDebug.avatarRoot) {
        hidden = true;
        break;
      }
      node = node.parent;
    }
    if (!hidden) return hit;
  }
  return null;
}

export default function ExaminePicker({ room, zone }) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const canvas = useThree((state) => state.gl.domElement);

  const candidates = useMemo(() => {
    const items = pickableItems(room.furnitureBoxes).map((item) => ({
      id: item.id,
      position: item.position,
      size: item.size,
      item,
    }));
    const rocks = zone.features?.includes('schist-outcrops') ? rockCandidates() : [];
    return [...items, ...rocks];
  }, [room, zone]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.code === 'Escape') {
        cancelPicking();
        return;
      }
      if (event.code !== 'Enter' || event.repeat) return;
      if (isGameplayInputBlocked() || getInteraction().using) return;
      if (getInteraction().picking) {
        cancelPicking();
        return;
      }
      event.preventDefault();
      armPicking();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let pressed = null;

    const open = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      raycaster.far = MAX_RANGE;
      const hit = visibleHit(raycaster.intersectObjects(scene.children, true));
      if (!hit) return;

      const point = [hit.point.x, hit.point.y, hit.point.z];
      const found = pickSubject(candidates, point);
      // With nothing in the item list to answer for it, all that can honestly
      // be described is what the player is standing on. A wall or a trunk that
      // resolved to nothing gets no examination rather than a wrong one.
      if (!found && !facesUp(hit)) return;
      const className = found
        ? (found.subjectClass ?? classifySubject(found.item))
        : surfaceClassAt(point, zone.water);
      const subjectId = found ? found.id : `ground:${point[0].toFixed(0)},${point[2].toFixed(0)}`;
      const place = placeLine(gameDebug.player.position);
      const record = subjectRecord({ item: found?.item ?? null, id: subjectId, place, className });

      // Big things are framed where the player pointed; small ones on their own
      // centre, so a clicked stone sits in the middle of the picture.
      const size = found?.size ?? [0.6, 0.1, 0.6];
      const reach = Math.max(...size);
      const item = {
        position: reach > 1.2 || !found ? point : found.position,
        size,
        affordance: { span: reach },
      };
      cancelPicking();
      useInstrument({
        id: `examine:${subjectId}`,
        kind: 'examine',
        item,
        subject: subjectId,
        record,
        framing: examineFraming(item, gameDebug.player.position),
      });
    };

    const onDown = (event) => {
      if (!getInteraction().picking || event.button !== 0) return;
      pressed = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event) => {
      if (!pressed) return;
      const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
      pressed = null;
      if (moved > CLICK_SLOP || !getInteraction().picking) return;
      open(event);
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, canvas, candidates, scene, zone]);

  return null;
}

"""Report Renderer C garment and Mixamo bind landmarks."""

from __future__ import annotations

import os
import sys

import bpy
from mathutils import Vector


BONES = (
    "mixamorigLeftShoulder",
    "mixamorigLeftArm",
    "mixamorigLeftForeArm",
    "mixamorigLeftHand",
    "mixamorigRightShoulder",
    "mixamorigRightArm",
    "mixamorigRightForeArm",
    "mixamorigRightHand",
    "mixamorigHips",
    "mixamorigLeftUpLeg",
    "mixamorigLeftLeg",
    "mixamorigLeftFoot",
    "mixamorigSpine",
    "mixamorigSpine1",
    "mixamorigSpine2",
    "mixamorigNeck",
)


def args():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return low, high


def main():
    values = args()
    if len(values) != 1:
        raise SystemExit("usage: blender --background --python inspect_renderer_c_bind.py -- MODEL.glb")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(values[0]))
    rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    print("RENDERER_C_BIND_RIG", rig.name, tuple(round(value, 6) for row in rig.matrix_world for value in row))
    for requested in BONES:
        bone = rig.data.bones.get(requested) or rig.data.bones.get(requested.replace("mixamorig", "mixamorig:"))
        if not bone:
            print("RENDERER_C_BIND_MISSING_BONE", requested)
            continue
        head = rig.matrix_world @ bone.head_local
        tail = rig.matrix_world @ bone.tail_local
        print("RENDERER_C_BIND_BONE", bone.name, tuple(round(v, 6) for v in head), tuple(round(v, 6) for v in tail))
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not (
            obj.name.startswith("RendererC_Authored")
            or obj.name in {"RendererC_BaseGarment", "Human_Body"}
        ):
            continue
        low, high = bounds(obj)
        print("RENDERER_C_BIND_MESH", obj.name, tuple(round(v, 6) for v in low), tuple(round(v, 6) for v in high))


if __name__ == "__main__":
    main()

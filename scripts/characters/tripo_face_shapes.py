"""Bake a named expression shape-key set onto a Tripo/Mixamo head.

The game's face controller drives morph targets by ARKit name and ignores
missing ones, so a character becomes expressive the moment its mesh carries
shapes with the right names. Landmarks are estimated from the skeleton and
head geometry; magnitudes are fractions of the skull span so the same
recipe fits any humanoid. Verify with the debug renders before shipping.
"""

import math
import os

import bpy
from mathutils import Vector


HEAD = "mixamorig:Head"
HEAD_TOP = "mixamorig:HeadTop_End"


def _weight(mesh, group_index, vertex):
    for entry in vertex.groups:
        if entry.group == group_index:
            return entry.weight
    return 0.0


def _falloff(distance, radius):
    if distance >= radius:
        return 0.0
    x = distance / radius
    return (1.0 - x * x) ** 2


class FaceFrame:
    """Head-local frame: origin at eye midpoint, axes up/facing/right."""

    def __init__(self, mesh_obj, rig):
        mesh = mesh_obj.data
        into_local = mesh_obj.matrix_world.inverted()
        head_world = rig.matrix_world @ rig.data.bones[HEAD].head_local
        top_world = rig.matrix_world @ rig.data.bones[HEAD_TOP].head_local
        self.head = into_local @ head_world
        top = into_local @ top_world
        self.up = (top - self.head).normalized()
        self.span = (top - self.head).length

        group = mesh_obj.vertex_groups.get(HEAD)
        if group is None:
            raise RuntimeError(f"{mesh_obj.name} has no {HEAD} vertex group")
        self.head_verts = [
            v.index for v in mesh.vertices if _weight(mesh, group.index, v) >= 0.5
        ]
        if len(self.head_verts) < 200:
            raise RuntimeError("Too few head vertices; check skin weights")

        # Facing comes from the skeleton: toes point forward on a humanoid,
        # which no hat can confuse.
        foot_world = rig.matrix_world @ rig.data.bones["mixamorig:LeftFoot"].head_local
        toe_world = rig.matrix_world @ rig.data.bones["mixamorig:LeftToeBase"].head_local
        forward = (into_local @ toe_world) - (into_local @ foot_world)
        forward -= self.up * forward.dot(self.up)
        self.facing = forward.normalized()
        self.right = self.facing.cross(self.up).normalized()

        # The nose is the most frontal, near-centreline point in the
        # lower-face band; a hat brim lives higher, the chin lower.
        best = None
        for index in self.head_verts:
            co = mesh.vertices[index].co
            offset = co - self.head
            h = offset.dot(self.up)
            if not (0.14 * self.span <= h <= 0.34 * self.span):
                continue
            if abs(offset.dot(self.right)) > 0.08 * self.span:
                continue
            frontal = offset.dot(self.facing)
            if best is None or frontal > best[0]:
                best = (frontal, co.copy(), h)
        if best is None:
            raise RuntimeError("Could not locate the nose")
        self.nose = best[1]
        nose_h = best[2]

        # Anchor every landmark to the actual surface: centroid of the head
        # vertices inside a height/lateral window on the front of the face.
        # Fractions are anthropometric guesses; the debug render is the
        # authority and these were tuned against it.
        S = self.span

        def window(h_lo, h_hi, lat_lo, lat_hi, min_front=0.25):
            # Quad meshes are sparse; a window that lands between edge loops
            # widens until it holds real surface.
            for attempt in range(4):
                grow = 1.0 + attempt * 0.4
                front = min_front - attempt * 0.07
                mid_h = (h_lo + h_hi) / 2
                mid_lat = (lat_lo + lat_hi) / 2
                points = []
                for index in self.head_verts:
                    co = mesh.vertices[index].co
                    offset = co - self.head
                    if abs(offset.dot(self.up) - mid_h) > (h_hi - h_lo) / 2 * grow:
                        continue
                    if abs(offset.dot(self.right) - mid_lat) > (lat_hi - lat_lo) / 2 * grow:
                        continue
                    if offset.dot(self.facing) < front * S:
                        continue
                    points.append(co)
                if points:
                    total = Vector((0, 0, 0))
                    for point in points:
                        total += point
                    return total / len(points)
            raise RuntimeError(
                f"Face window is empty (h {h_lo:.3f}..{h_hi:.3f}, lat {lat_lo:.3f}..{lat_hi:.3f})"
            )

        def snap(point):
            # A window centroid averages across the socket depth and sinks
            # beneath the skin; the falloff sphere must sit on the surface.
            best = min(self.head_verts, key=lambda i: (mesh.vertices[i].co - point).length)
            return mesh.vertices[best].co.copy()

        eye_h = nose_h + 0.090 * S
        brow_h = nose_h + 0.145 * S
        self.mouth_h = mouth_h = nose_h - 0.165 * S
        self.eye_l = snap(window(eye_h - 0.045 * S, eye_h + 0.045 * S, 0.06 * S, 0.22 * S))
        self.eye_r = snap(window(eye_h - 0.045 * S, eye_h + 0.045 * S, -0.22 * S, -0.06 * S))
        self.mouth = snap(window(mouth_h - 0.045 * S, mouth_h + 0.045 * S, -0.05 * S, 0.05 * S))
        self.mouth_l = snap(window(mouth_h - 0.05 * S, mouth_h + 0.05 * S, 0.055 * S, 0.16 * S))
        self.mouth_r = snap(window(mouth_h - 0.05 * S, mouth_h + 0.05 * S, -0.16 * S, -0.055 * S))
        self.nose_wing_l = snap(window(nose_h - 0.06 * S, nose_h + 0.01 * S, 0.02 * S, 0.10 * S, min_front=0.35))
        self.nose_wing_r = snap(window(nose_h - 0.06 * S, nose_h + 0.01 * S, -0.10 * S, -0.02 * S, min_front=0.35))
        self.brow_c = snap(window(brow_h - 0.035 * S, brow_h + 0.035 * S, -0.06 * S, 0.06 * S))
        self.brow_l = snap(window(brow_h - 0.035 * S, brow_h + 0.035 * S, 0.06 * S, 0.20 * S))
        self.brow_r = snap(window(brow_h - 0.035 * S, brow_h + 0.035 * S, -0.20 * S, -0.06 * S))
        self.eye_dx = 0.145 * S
        self.jaw_pivot = self.head + self.up * (nose_h - 0.05 * S)

    def landmarks(self):
        return {
            "nose": self.nose, "eyeL": self.eye_l, "eyeR": self.eye_r,
            "mouth": self.mouth, "mouthL": self.mouth_l, "mouthR": self.mouth_r,
            "browC": self.brow_c, "browL": self.brow_l, "browR": self.brow_r,
            "jawPivot": self.jaw_pivot,
        }


def _add_shape(mesh_obj, name, displace, allowed):
    """displace(co) -> delta vector or None, in mesh local space."""
    mesh = mesh_obj.data
    if mesh.shape_keys is None or "Basis" not in mesh.shape_keys.key_blocks:
        mesh_obj.shape_key_add(name="Basis", from_mix=False)
    if name in mesh.shape_keys.key_blocks:
        mesh_obj.shape_key_remove(mesh.shape_keys.key_blocks[name])
    key = mesh_obj.shape_key_add(name=name, from_mix=False)
    moved = 0
    for index in allowed:
        point = key.data[index]
        delta = displace(mesh.vertices[index].co)
        if delta is not None and delta.length > 1e-7:
            point.co = point.co + delta
            moved += 1
    print(f"FACE_SHAPE_OK name={name} vertices={moved}")
    return moved


def build_face_shapes(mesh_obj, rig):
    frame = FaceFrame(mesh_obj, rig)
    S = frame.span
    up, right, facing = frame.up, frame.right, frame.facing

    def frontal(co):
        return (co - frame.head).dot(facing) > 0.10 * S

    def around(center, radius):
        def select(co):
            d = (co - center).length
            return _falloff(d, radius)
        return select

    shapes = {}

    def register(name, displace):
        shapes[name] = displace

    # --- jaw -------------------------------------------------------------
    def jaw_open(co):
        if not frontal(co):
            return None
        # Only the lower lip and chin hinge; the seam is the boundary, so
        # the mouth actually parts instead of rotating shut.
        h_mouth = (co - frame.head).dot(up) - frame.mouth_h
        if h_mouth > 0.015 * S:
            return None
        reach = min(1.0, max(0.0, (0.015 * S - h_mouth) / (0.12 * S)))
        angle = math.radians(20.0) * reach
        offset = co - frame.jaw_pivot
        rotated = offset * math.cos(angle) + right.cross(offset) * math.sin(angle)
        return rotated - offset

    register("jawOpen", jaw_open)

    # --- eyes ------------------------------------------------------------
    def blink(eye_center):
        radius = 0.075 * S
        def displace(co):
            w = _falloff((co - eye_center).length, radius)
            if w <= 0:
                return None
            h = (co - eye_center).dot(up)
            # Upper lid sweeps down and the lower lid rises to meet it, so a
            # full blink actually closes rather than half-covering the eye.
            if h > -0.008 * S:
                return up * (-min(max(h, 0.0) + 0.014 * S, 0.05 * S)) * w
            return up * (0.012 * S) * w
        return displace

    register("eyeBlinkLeft", blink(frame.eye_l))
    register("eyeBlinkRight", blink(frame.eye_r))

    def squint(eye_center):
        radius = 0.10 * S
        def displace(co):
            w = _falloff((co - eye_center).length, radius)
            if w <= 0:
                return None
            h = (co - eye_center).dot(up)
            if h >= 0:
                return None
            return up * (0.028 * S) * w
        return displace

    register("eyeSquintLeft", squint(frame.eye_l))
    register("eyeSquintRight", squint(frame.eye_r))

    def wide(eye_center):
        radius = 0.10 * S
        def displace(co):
            w = _falloff((co - eye_center).length, radius)
            if w <= 0:
                return None
            h = (co - eye_center).dot(up)
            if h <= 0:
                return None
            return up * (0.024 * S) * w
        return displace

    register("eyeWideLeft", wide(frame.eye_l))
    register("eyeWideRight", wide(frame.eye_r))

    # --- brows -----------------------------------------------------------
    def brow_inner_up(co):
        w = _falloff((co - frame.brow_c).length, 0.13 * S)
        if w <= 0:
            return None
        # Strongest at the centreline, fading outward.
        lateral = abs((co - frame.brow_c).dot(right))
        centre = _falloff(lateral, 0.10 * S)
        return up * (0.035 * S) * w * centre

    register("browInnerUp", brow_inner_up)

    def brow_down(center):
        def displace(co):
            w = _falloff((co - center).length, 0.085 * S)
            if w <= 0:
                return None
            return (up * (-0.028 * S) + facing * (0.006 * S)) * w
        return displace

    register("browDownLeft", brow_down(frame.brow_l))
    register("browDownRight", brow_down(frame.brow_r))

    # --- mouth -----------------------------------------------------------
    def corner(center, lift, spread):
        def displace(co):
            w = _falloff((co - center).length, 0.09 * S)
            if w <= 0:
                return None
            side = 1 if (co - frame.mouth).dot(right) >= 0 else -1
            return (up * lift + right * side * spread) * S * w
        return displace

    register("mouthSmileLeft", corner(frame.mouth_l, 0.050, 0.030))
    register("mouthSmileRight", corner(frame.mouth_r, 0.050, 0.030))
    register("mouthFrownLeft", corner(frame.mouth_l, -0.050, 0.010))
    register("mouthFrownRight", corner(frame.mouth_r, -0.050, 0.010))
    register("mouthStretchLeft", corner(frame.mouth_l, -0.014, 0.048))
    register("mouthStretchRight", corner(frame.mouth_r, -0.014, 0.048))

    def press(side):
        center = frame.mouth + right * side * 0.05 * S
        def displace(co):
            w = _falloff((co - center).length, 0.06 * S)
            if w <= 0:
                return None
            h = (co - frame.mouth).dot(up)
            # Lips close toward the seam.
            return up * (-h * 0.6) * w if abs(h) < 0.035 * S else None
        return displace

    register("mouthPressLeft", press(1))
    register("mouthPressRight", press(-1))

    def sneer(center):
        def displace(co):
            w = _falloff((co - center).length, 0.06 * S)
            if w <= 0:
                return None
            return up * (0.02 * S) * w
        return displace

    register("noseSneerLeft", sneer(frame.nose_wing_l))
    register("noseSneerRight", sneer(frame.nose_wing_r))

    allowed = frame.head_verts
    for name, displace in shapes.items():
        _add_shape(mesh_obj, name, displace, allowed)
    print(f"FACE_SHAPES_DONE count={len(shapes)} span={S:.4f}")
    return frame


def render_debug(mesh_obj, rig, frame, out_dir, shapes=None):
    """Render the head with landmark markers, then each shape at weight 1."""
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    # Workbench renders geometry regardless of material state, which is all
    # a deformation check needs.
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("FaceDebugWorld") if scene.world is None else scene.world
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.28, 0.28, 0.3, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

    # The armature's rest deform relocates the mesh away from its stored
    # local coordinates, so markers and camera are placed via the deformed
    # world position of the raw vertex nearest each landmark.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh_obj.evaluated_get(depsgraph)
    raw = mesh_obj.data.vertices

    def deformed(local):
        best = min(frame.head_verts, key=lambda i: (raw[i].co - local).length)
        return evaluated.matrix_world @ evaluated.data.vertices[best].co

    world_marks = {name: deformed(local) for name, local in frame.landmarks().items() if name != "jawPivot"}
    eye_l_w, eye_r_w = world_marks["eyeL"], world_marks["eyeR"]
    eye_mid = (eye_l_w + eye_r_w) / 2
    interocular = max((eye_l_w - eye_r_w).length, 1e-4)
    right_w = (eye_l_w - eye_r_w).normalized()
    up_w = (world_marks["browC"] - world_marks["mouth"]).normalized()
    facing_w = right_w.cross(up_w).normalized()
    nose_dir = (world_marks["nose"] - eye_mid).normalized()
    if facing_w.dot(nose_dir) < 0:
        facing_w = -facing_w
    center = (eye_mid + world_marks["mouth"]) / 2
    camera_pos = center + facing_w * interocular * 4.2

    camera_data = bpy.data.cameras.new("FaceDebugCam")
    camera = bpy.data.objects.new("FaceDebugCam", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = camera_pos
    direction = (center - camera_pos).normalized()
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera_data.lens = 60
    camera_data.clip_start = 0.001
    scene.camera = camera
    mesh_obj.hide_render = False
    mesh_obj.hide_set(False)

    light_data = bpy.data.lights.new("FaceDebugLight", type="SUN")
    light = bpy.data.objects.new("FaceDebugLight", light_data)
    bpy.context.collection.objects.link(light)
    light.rotation_euler = camera.rotation_euler
    light_data.energy = 3.0

    markers = []
    for name, world in world_marks.items():
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06 * interocular, location=world)
        marker = bpy.context.object
        marker.name = f"Landmark_{name}"
        markers.append(marker)
    scene.render.filepath = os.path.join(out_dir, "00-landmarks.png")
    bpy.ops.render.render(write_still=True)
    for marker in markers:
        bpy.data.objects.remove(marker, do_unlink=True)

    keys = mesh_obj.data.shape_keys.key_blocks
    names = shapes or [key.name for key in keys if key.name != "Basis"]
    for key in keys:
        key.value = 0.0
    for index, name in enumerate(names):
        keys[name].value = 1.0
        scene.render.filepath = os.path.join(out_dir, f"{index + 1:02d}-{name}.png")
        bpy.ops.render.render(write_still=True)
        keys[name].value = 0.0
    print(f"FACE_DEBUG_RENDERS out={out_dir} count={len(names) + 1}")

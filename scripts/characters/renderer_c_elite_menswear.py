"""Authored, skinned elite menswear for the Renderer C male master.

The fitted MPFB suit remains a useful source for sleeves, trousers, bind
space, body-build morphs, and skin weights. The visible coat, waistcoat,
collar, neckwear, and tailoring details are rebuilt here as period geometry.
"""

import math

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree


MATERIAL_SLOTS = (
    ("RendererC_Elite_Coat", "#1d2023", 0.86),
    ("RendererC_Elite_Trousers", "#454649", 0.88),
    ("RendererC_Elite_Waistcoat", "#696760", 0.82),
    ("RendererC_Elite_Shirt", "#ded9cd", 0.76),
    ("RendererC_Elite_Neckwear", "#4c2c32", 0.78),
    ("RendererC_Elite_Lining", "#38272d", 0.82),
    ("RendererC_Elite_Hardware", "#927a4f", 0.56),
)

COAT = 0
TROUSERS = 1
WAISTCOAT = 2
SHIRT = 3
NECKWEAR = 4
LINING = 5
HARDWARE = 6


def _connected_components(mesh):
    adjacency = [set() for _vertex in mesh.vertices]
    faces_by_vertex = [[] for _vertex in mesh.vertices]
    for polygon in mesh.polygons:
        indices = list(polygon.vertices)
        for offset, vertex in enumerate(indices):
            adjacency[vertex].add(indices[(offset + 1) % len(indices)])
            adjacency[vertex].add(indices[(offset - 1) % len(indices)])
            faces_by_vertex[vertex].append(polygon.index)

    seen = set()
    components = []
    for seed in range(len(mesh.vertices)):
        if seed in seen:
            continue
        stack = [seed]
        seen.add(seed)
        vertices = set()
        polygons = set()
        while stack:
            vertex = stack.pop()
            vertices.add(vertex)
            polygons.update(faces_by_vertex[vertex])
            for other in adjacency[vertex]:
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
        coordinates = [mesh.vertices[index].co for index in vertices]
        minimum = Vector((
            min(point.x for point in coordinates),
            min(point.y for point in coordinates),
            min(point.z for point in coordinates),
        ))
        maximum = Vector((
            max(point.x for point in coordinates),
            max(point.y for point in coordinates),
            max(point.z for point in coordinates),
        ))
        components.append({
            "vertices": vertices,
            "polygons": polygons,
            "minimum": minimum,
            "maximum": maximum,
            "center": (minimum + maximum) * 0.5,
        })
    return components


def _normalize_weights(weights):
    total = sum(max(0.0, value) for value in weights.values())
    if total <= 0.000001:
        return {"mixamorigHips": 1.0}
    return {
        name: max(0.0, value) / total
        for name, value in weights.items()
        if value > 0.000001
    }


def add_elite_morning_suit(rig, carrier, material_factory):
    """Create a true SkinnedMesh morning suit around the canonical male.

    The 1894 J.B. Johnstone morning suit in the Metropolitan Museum is the
    silhouette reference. Historical approval remains a separate project gate.
    """
    vertices = []
    faces = []
    face_materials = []
    vertex_weights = []
    source_vertices = []
    vertex_roles = []
    vertex_meta = []

    carrier_basis = carrier.data.shape_keys.key_blocks.get("Basis")
    carrier_keys = carrier.data.shape_keys.key_blocks
    rig_bones = {bone.name for bone in rig.data.bones}
    group_names = {
        group.index: group.name
        for group in carrier.vertex_groups
        if group.name in rig_bones
    }

    torso_source = [
        index for index, point in enumerate(carrier_basis.data)
        if 0.86 <= point.co.z <= 1.47 and abs(point.co.x) <= 0.32
    ]
    torso_tree = KDTree(len(torso_source))
    for tree_index, source_index in enumerate(torso_source):
        torso_tree.insert(carrier_basis.data[source_index].co, tree_index)
    torso_tree.balance()

    def add_vertex(coordinate, weights, role, source_index=None, fit=1.0, **meta):
        index = len(vertices)
        vertices.append(tuple(coordinate))
        vertex_weights.append(_normalize_weights(weights))
        source_vertices.append(source_index)
        vertex_roles.append(role)
        if source_index is None:
            _point, tree_index, _distance = torso_tree.find(Vector(coordinate))
            fit_source = torso_source[tree_index]
        else:
            fit_source = source_index
        vertex_meta.append({"fit_source": fit_source, "fit": fit, **meta})
        return index

    def add_face(indices, material):
        faces.append(tuple(indices))
        face_materials.append(material)

    def add_quad(a, b, c, d, material):
        add_face((a, b, c, d), material)

    def source_weights(source_index):
        return {
            group_names[item.group]: item.weight
            for item in carrier.data.vertices[source_index].groups
            if item.group in group_names
        }

    # Retain the fitted carrier's straight trousers and articulated sleeves.
    # These regions already have clean Mixamo weights and body-build endpoints.
    # MPFB can join garment islands during generation, so component-size tests
    # are not stable across source and exported GLBs. Select fitted regions by
    # their bind-space position instead and retain their exact source weights.
    selected_faces = []
    for polygon in carrier.data.polygons:
        coordinates = [carrier_basis.data[index].co for index in polygon.vertices]
        center = sum(coordinates, Vector()) / len(coordinates)
        minimum_z = min(point.z for point in coordinates)
        maximum_z = max(point.z for point in coordinates)
        role = None
        material = None
        if maximum_z < 1.075 and abs(center.x) < 0.34:
            role = "trousers"
            material = TROUSERS
        elif minimum_z > 1.015 and abs(center.x) > 0.43 and maximum_z < 1.17:
            role = "shirt_cuff"
            material = SHIRT
        elif minimum_z > 1.0 and abs(center.x) > 0.255:
            role = "sleeve"
            material = COAT
        if role:
            selected_faces.append((polygon, role, material))

    remap = {}
    for polygon, role, material in selected_faces:
        indices = []
        for source_index in polygon.vertices:
            key = (role, source_index)
            if key not in remap:
                remap[key] = add_vertex(
                    carrier_basis.data[source_index].co,
                    source_weights(source_index),
                    role,
                    source_index=source_index,
                    fit=1.0,
                )
            indices.append(remap[key])
        add_face(indices, material)

    def torso_weights(z, x=0.0, hem=False):
        if hem or z < 0.96:
            side = max(-1.0, min(1.0, x / 0.22))
            leg_total = 0.22
            return {
                "mixamorigHips": 0.70,
                "mixamorigSpine": 0.08,
                "mixamorigLeftUpLeg": leg_total * (0.5 + side * 0.5),
                "mixamorigRightUpLeg": leg_total * (0.5 - side * 0.5),
            }
        if z < 1.10:
            return {"mixamorigHips": 0.34, "mixamorigSpine": 0.48, "mixamorigSpine1": 0.18}
        if z < 1.26:
            return {"mixamorigSpine": 0.20, "mixamorigSpine1": 0.58, "mixamorigSpine2": 0.22}
        shoulder_weight = max(0.0, min(0.16, (abs(x) - 0.15) * 1.7))
        weights = {"mixamorigSpine1": 0.20, "mixamorigSpine2": 0.80 - shoulder_weight}
        if shoulder_weight:
            weights["mixamorigLeftShoulder" if x > 0 else "mixamorigRightShoulder"] = shoulder_weight
        return weights

    def add_extruded_panel(points, front_y, depth, material, role, fit=0.85):
        front = [
            add_vertex((x, front_y, z), torso_weights(z, x), role, fit=fit)
            for x, z in points
        ]
        back = [
            add_vertex((x, front_y + depth, z), torso_weights(z, x), role, fit=fit)
            for x, z in points
        ]
        add_face(front, material)
        add_face(list(reversed(back)), material)
        for index in range(len(points)):
            nxt = (index + 1) % len(points)
            add_quad(front[index], front[nxt], back[nxt], back[index], material)
        return front, back

    # Open-front coat shell. Each side terminates independently at the center
    # back so the lower skirt has a real vent instead of a painted seam.
    gap = 0.46
    half_segments = 24
    ring_specs = (
        (1.445, 0.225, 0.135),
        (1.325, 0.238, 0.158),
        (1.190, 0.210, 0.157),
        (1.035, 0.188, 0.145),
    )
    coat_hem_indices = []
    for side in (-1, 1):
        if side < 0:
            angles = [math.pi + gap + (math.pi - gap) * index / (half_segments - 1) for index in range(half_segments)]
        else:
            angles = [2.0 * math.pi + (math.pi - gap) * index / (half_segments - 1) for index in range(half_segments)]
        rings = []
        for ring_index, (z, radius_x, radius_y) in enumerate(ring_specs):
            ring = []
            for angle in angles:
                x = radius_x * math.sin(angle)
                y = -0.006 + radius_y * math.cos(angle)
                point_z = z
                if ring_index == 0:
                    # The shoulder edge rises toward the neck and falls toward
                    # the sleeve seam; a level ring reads as a cardboard box.
                    point_z -= 0.080 * (abs(x) / radius_x) ** 1.55
                ring.append(add_vertex((x, y, point_z), torso_weights(point_z, x), "coat_shell", fit=0.90))
            rings.append(ring)

        hem = []
        for angle in angles:
            if side < 0:
                frontness = (2.0 * math.pi - angle) / (math.pi - gap)
            else:
                frontness = (angle - 2.0 * math.pi) / (math.pi - gap)
            frontness = max(0.0, min(1.0, frontness))
            z = 0.665 + 0.345 * (frontness ** 1.55)
            radius_x = 0.218 + 0.014 * frontness
            radius_y = 0.164
            x = radius_x * math.sin(angle)
            y = -0.006 + radius_y * math.cos(angle)
            hem.append(add_vertex(
                (x, y, z), torso_weights(z, x, hem=True), "coat_hem", fit=0.68,
                frontness=frontness,
            ))
        rings.append(hem)
        coat_hem_indices.extend(hem)
        for ring_index in range(len(rings) - 1):
            for segment in range(half_segments - 1):
                add_quad(
                    rings[ring_index][segment],
                    rings[ring_index][segment + 1],
                    rings[ring_index + 1][segment + 1],
                    rings[ring_index + 1][segment],
                    COAT,
                )

        # Dark lining is visible along the cutaway and tail edges.
        front_edge = [ring[0] if side < 0 else ring[-1] for ring in rings]
        for upper, lower in zip(front_edge, front_edge[1:]):
            a = Vector(vertices[upper])
            b = Vector(vertices[lower])
            offset = Vector((0.0, 0.008, 0.0))
            ia = add_vertex(a + offset, vertex_weights[upper], "lining", fit=0.72)
            ib = add_vertex(b + offset, vertex_weights[lower], "lining", fit=0.72)
            add_quad(upper, lower, ib, ia, LINING)

    # Center-back seam above the vent and a narrow facing at its lower edge.
    add_extruded_panel(
        [(-0.010, 1.445), (0.010, 1.445), (0.010, 0.985), (-0.010, 0.985)],
        0.132, 0.010, COAT, "coat_seam", fit=0.82,
    )

    # Shirt front, high waistcoat, broad rolled lapels, and a real stand collar.
    add_extruded_panel(
        [(-0.118, 1.105), (0.118, 1.105), (0.105, 1.485), (-0.105, 1.485)],
        -0.163, 0.010, SHIRT, "shirt", fit=0.95,
    )
    for side in (-1, 1):
        waistcoat_points = [
            (side * 0.016, 1.005),
            (side * 0.172, 0.995),
            (side * 0.180, 1.285),
            (side * 0.108, 1.345),
            (side * 0.044, 1.235),
        ]
        add_extruded_panel(waistcoat_points, -0.174, 0.012, WAISTCOAT, "waistcoat", fit=0.90)
        lapel_points = [
            (side * 0.030, 1.038),
            (side * 0.055, 1.220),
            (side * 0.085, 1.355),
            (side * 0.180, 1.325),
            (side * 0.146, 1.235),
            (side * 0.108, 1.090),
        ]
        add_extruded_panel(lapel_points, -0.187, 0.014, COAT, "lapel", fit=0.84)
        # Crisp shirt collar points sit behind the tie and inside the lapels.
        collar_points = [
            (side * 0.012, 1.352),
            (side * 0.045, 1.505),
            (side * 0.078, 1.410),
            (side * 0.055, 1.330),
        ]
        add_extruded_panel(collar_points, -0.181, 0.010, SHIRT, "collar", fit=0.98)

    # The original fitted garment masks the torso up to its own modern collar.
    # This complete starched neckband closes that mask cleanly and prevents the
    # head from reading as detached above the new coat.
    neck_lower = []
    neck_upper = []
    neck_segments = 28
    neck_weights = {"mixamorigSpine2": 0.30, "mixamorigNeck": 0.70}
    for index in range(neck_segments):
        angle = 2.0 * math.pi * index / neck_segments
        x = 0.078 * math.cos(angle)
        y = -0.002 + 0.067 * math.sin(angle)
        neck_lower.append(add_vertex((x, y, 1.405), neck_weights, "collar", fit=0.98))
        neck_upper.append(add_vertex((x, y, 1.555), neck_weights, "collar", fit=0.98))
    for index in range(neck_segments):
        nxt = (index + 1) % neck_segments
        add_quad(neck_lower[index], neck_lower[nxt], neck_upper[nxt], neck_upper[index], SHIRT)

    # Back collar band. The high front points remain visibly distinct.
    collar_front = []
    collar_back = []
    for index in range(17):
        angle = -math.pi * 0.52 + math.pi * 1.04 * index / 16
        x = 0.108 * math.sin(angle)
        y = 0.010 + 0.100 * math.cos(angle)
        collar_front.append(add_vertex((x, y, 1.470), torso_weights(1.47, x), "coat_collar", fit=0.90))
        collar_back.append(add_vertex((x, y, 1.390), torso_weights(1.39, x), "coat_collar", fit=0.90))
    for index in range(16):
        add_quad(collar_front[index], collar_front[index + 1], collar_back[index + 1], collar_back[index], COAT)

    # A compact four-in-hand knot and blade are built into the layered front.
    add_extruded_panel(
        [(-0.038, 1.362), (0.038, 1.362), (0.026, 1.305), (0.0, 1.280), (-0.026, 1.305)],
        -0.198, 0.014, NECKWEAR, "neckwear", fit=0.96,
    )
    add_extruded_panel(
        [(-0.026, 1.285), (0.026, 1.285), (0.040, 1.115), (0.0, 1.075), (-0.040, 1.115)],
        -0.193, 0.012, NECKWEAR, "neckwear", fit=0.90,
    )

    # Pockets and breast welt are structural details rather than flat decals.
    for side in (-1, 1):
        add_extruded_panel(
            [(side * 0.085, 1.020), (side * 0.190, 1.045), (side * 0.188, 1.010), (side * 0.087, 0.988)],
            -0.168, 0.014, COAT, "pocket", fit=0.82,
        )
    add_extruded_panel(
        [(0.112, 1.286), (0.188, 1.300), (0.185, 1.280), (0.111, 1.269)],
        -0.174, 0.012, COAT, "pocket", fit=0.86,
    )

    def add_button(center, radius, depth, weights, role="hardware"):
        x, y, z = center
        front = []
        back = []
        segments = 10
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            dx = radius * math.cos(angle)
            dz = radius * math.sin(angle)
            front.append(add_vertex((x + dx, y - depth * 0.5, z + dz), weights, role, fit=0.82))
            back.append(add_vertex((x + dx, y + depth * 0.5, z + dz), weights, role, fit=0.82))
        add_face(front, HARDWARE)
        add_face(list(reversed(back)), HARDWARE)
        for index in range(segments):
            nxt = (index + 1) % segments
            add_quad(front[index], front[nxt], back[nxt], back[index], HARDWARE)

    for z in (1.205, 1.145, 1.085, 1.025):
        add_button((0.0, -0.198, z), 0.0105, 0.007, torso_weights(z), "waistcoat_hardware")
    add_button((-0.028, -0.205, 1.015), 0.012, 0.008, torso_weights(1.015), "coat_hardware")

    # A restrained waistcoat watch chain supplies an elite, readable detail.
    chain_points = []
    for index in range(9):
        t = index / 8
        x = 0.010 + 0.125 * t
        z = 1.145 - 0.050 * math.sin(math.pi * t) - 0.018 * t
        chain_points.append((x, z))
    for start, end in zip(chain_points, chain_points[1:]):
        sx, sz = start
        ex, ez = end
        dx = ex - sx
        dz = ez - sz
        length = max(0.0001, math.hypot(dx, dz))
        nx = -dz / length * 0.0024
        nz = dx / length * 0.0024
        add_extruded_panel(
            [(sx - nx, sz - nz), (sx + nx, sz + nz), (ex + nx, ez + nz), (ex - nx, ez - nz)],
            -0.205, 0.005, HARDWARE, "chain", fit=0.86,
        )

    mesh = bpy.data.meshes.new("RendererC_EliteMorningSuit_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    suit = carrier.copy()
    suit.data = mesh
    suit.name = "RendererC_EliteMorningSuit"
    bpy.context.collection.objects.link(suit)
    for group in list(suit.vertex_groups):
        suit.vertex_groups.remove(group)
    suit["renderer_c_role"] = "clothe"
    suit["renderer_c_wardrobe_role"] = "elite-morning-suit"
    suit["renderer_c_skinning"] = "mixamo-weighted"
    suit["renderer_c_reference"] = "Met 2009.300.548a-c, dated 1894; pending historical approval"
    for name, color, roughness in MATERIAL_SLOTS:
        material = material_factory(name, color, roughness)
        material.diffuse_color[3] = 1.0
        material.use_backface_culling = False
        suit.data.materials.append(material)
    for polygon, material_index in zip(suit.data.polygons, face_materials):
        polygon.material_index = material_index
        polygon.use_smooth = material_index not in (HARDWARE,)

    # Authored weight tables write bone names without the "mixamorig:" colon,
    # while the rig's bones carry it. Resolve every name against the rig, or
    # the armature modifier silently ignores the group and the panel freezes
    # in bind pose.
    bone_names = {bone.name.replace(":", ""): bone.name for bone in rig.data.bones}

    def bone_name(name):
        return bone_names.get(name.replace(":", ""), name)

    groups = {}
    for weights in vertex_weights:
        for name in weights:
            actual = bone_name(name)
            if actual not in groups:
                groups[actual] = suit.vertex_groups.new(name=actual)
    for vertex_index, weights in enumerate(vertex_weights):
        for name, weight in weights.items():
            groups[bone_name(name)].add([vertex_index], weight, "REPLACE")
    unmatched = sorted({
        bone_name(name)
        for weights in vertex_weights
        for name in weights
        if bone_name(name) not in {bone.name for bone in rig.data.bones}
    })
    if unmatched:
        raise RuntimeError(f"elite morning suit weights name unknown bones: {unmatched}")
    armature = next((modifier for modifier in suit.modifiers if modifier.type == "ARMATURE"), None)
    if armature is None:
        armature = suit.modifiers.new(name="RendererC_EliteMorningSuit_Armature", type="ARMATURE")
    armature.object = rig
    armature.use_deform_preserve_volume = True

    suit.shape_key_add(name="Basis", from_mix=False)
    for source_key in carrier_keys:
        if source_key.name == "Basis":
            continue
        key = suit.shape_key_add(name=source_key.name, from_mix=False)
        for index, point in enumerate(key.data):
            source_index = source_vertices[index]
            if source_index is not None:
                point.co = source_key.data[source_index].co
                continue
            meta = vertex_meta[index]
            fit_source = meta["fit_source"]
            delta = source_key.data[fit_source].co - carrier_basis.data[fit_source].co
            point.co = Vector(vertices[index]) + delta * meta["fit"]

    def add_garment_key(name, transform):
        key = suit.shape_key_add(name=name, from_mix=False)
        for index, point in enumerate(key.data):
            point.co = transform(index, Vector(vertices[index]), vertex_roles[index], vertex_meta[index])

    add_garment_key(
        "elite_frock_coat",
        lambda _index, point, role, meta: Vector((
            point.x, point.y,
            point.z - (0.345 * meta.get("frontness", 0.0) if role == "coat_hem" else 0.0),
        )),
    )
    add_garment_key(
        "elite_coat_length",
        lambda _index, point, role, _meta: Vector((
            point.x, point.y,
            point.z - (0.10 * max(0.0, min(1.0, (1.08 - point.z) / 0.42)) if role in ("coat_shell", "coat_hem", "lining") else 0.0),
        )),
    )
    add_garment_key(
        "elite_coat_fullness",
        lambda _index, point, role, _meta: Vector((
            point.x * (1.10 if role in ("coat_shell", "coat_hem", "lapel", "coat_collar", "coat_seam", "lining", "pocket") else 1.0),
            point.y * (1.07 if role in ("coat_shell", "coat_hem", "lapel", "coat_collar", "coat_seam", "lining", "pocket") else 1.0),
            point.z,
        )),
    )
    add_garment_key(
        "elite_lapel_width",
        lambda _index, point, role, _meta: Vector((point.x * (1.16 if role == "lapel" else 1.0), point.y, point.z)),
    )
    add_garment_key(
        "elite_trouser_width",
        lambda _index, point, role, _meta: Vector((
            ((0.145 if point.x >= 0 else -0.145) + (point.x - (0.145 if point.x >= 0 else -0.145)) * 1.16) if role == "trousers" else point.x,
            point.y * (1.08 if role == "trousers" else 1.0),
            point.z,
        )),
    )
    add_garment_key(
        "elite_waistcoat_fit",
        lambda _index, point, role, _meta: Vector((
            point.x * (1.08 if role in ("waistcoat", "waistcoat_hardware", "chain") else 1.0),
            point.y * (1.04 if role in ("waistcoat", "waistcoat_hardware", "chain") else 1.0),
            point.z,
        )),
    )
    add_garment_key(
        "elite_collar_height",
        lambda _index, point, role, _meta: Vector((point.x, point.y, point.z + (0.035 if role in ("collar", "coat_collar") and point.z > 1.44 else 0.0))),
    )
    add_garment_key(
        "elite_collar_spread",
        lambda _index, point, role, _meta: Vector((point.x * (1.14 if role in ("collar", "coat_collar") else 1.0), point.y, point.z)),
    )

    print(
        f"ELITE_MORNING_SUIT_OK vertices={len(vertices)} faces={len(faces)} "
        f"morphs={len(suit.data.shape_keys.key_blocks)} materials={len(suit.data.materials)}"
    )
    return suit

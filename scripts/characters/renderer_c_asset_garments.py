"""Fit authored garment GLBs to Renderer C and bind them to its Mixamo rig.

The source garments are real modeled cloth but contain no skeleton.  This
module maps them into the neutral MPFB garment envelope, then transfers the
nearest fitted carrier weights and bounded body-build morphs.
"""

from __future__ import annotations

import os

import bpy
import bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree


BODY_MORPHS = (
    "rc_age_young",
    "rc_age_old",
    "rc_heritage_asian",
    "rc_heritage_african",
    "rc_live_weight_neg",
    "rc_live_weight_pos",
    "rc_live_muscle_neg",
    "rc_live_muscle_pos",
    "rc_live_proportions_neg",
    "rc_live_proportions_pos",
)


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
    )


def expanded_box(low, high, x=1.0, y=1.0, z_low=None, z_high=None):
    center = (low + high) * 0.5
    half = (high - low) * 0.5
    result_low = Vector((center.x - half.x * x, center.y - half.y * y, low.z))
    result_high = Vector((center.x + half.x * x, center.y + half.y * y, high.z))
    if z_low is not None:
        result_low.z = z_low
    if z_high is not None:
        result_high.z = z_high
    return result_low, result_high


def import_meshes(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No garment meshes found in {path}")
    for mesh in meshes:
        mesh.parent = None
    for obj in imported:
        if obj.type != "MESH" and obj.users_collection:
            bpy.data.objects.remove(obj, do_unlink=True)
    return meshes


def map_group_to_box(meshes, target_low, target_high):
    source_low, source_high = bounds(meshes)
    source_size = source_high - source_low
    target_size = target_high - target_low
    scale = Vector(tuple(target_size[axis] / max(source_size[axis], 1e-8) for axis in range(3)))
    for obj in meshes:
        matrix = obj.matrix_world.copy()
        for vertex in obj.data.vertices:
            point = matrix @ vertex.co
            vertex.co = Vector(
                tuple(
                    target_low[axis] + (point[axis] - source_low[axis]) * scale[axis]
                    for axis in range(3)
                )
            )
        obj.matrix_world.identity()


def decimate(obj, ratio):
    if ratio >= 0.999:
        return
    modifier = obj.modifiers.new(name="RendererC_WebDecimate", type="DECIMATE")
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def trim_to_waistcoat(obj, rig):
    hips = named_bone(rig, "", "Hips")
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    unvisited = set(mesh.faces)
    components = []
    while unvisited:
        pending = [unvisited.pop()]
        component = []
        while pending:
            face = pending.pop()
            component.append(face)
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in unvisited:
                        unvisited.remove(linked)
                        pending.append(linked)
        components.append(component)

    remove = []
    for component in components:
        vertices = {vertex for face in component for vertex in face.verts}
        low_x = min(vertex.co.x for vertex in vertices)
        high_x = max(vertex.co.x for vertex in vertices)
        low_z = min(vertex.co.z for vertex in vertices)
        high_z = max(vertex.co.z for vertex in vertices)
        center_x = sum(vertex.co.x for vertex in vertices) / len(vertices)
        center_z = sum(vertex.co.z for vertex in vertices) / len(vertices)
        crosses_center = low_x < 0.08 and high_x > -0.08
        torso_detail = center_z > hips.head_local.z + 0.16 and abs(center_x) < 0.245
        keep = high_z > hips.head_local.z + 0.015 and (crosses_center or torso_detail)
        if not keep or low_z < hips.head_local.z - 0.12:
            remove.extend(component)
    bmesh.ops.delete(mesh, geom=remove, context="FACES")
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()


def normalized_bone_name(name):
    return "".join(character for character in name.lower() if character.isalnum())


def bone_region(name):
    normalized = normalized_bone_name(name)
    if any(part in normalized for part in ("leftshoulder", "leftarm", "leftforearm", "lefthand")):
        return "left_arm"
    if any(part in normalized for part in ("rightshoulder", "rightarm", "rightforearm", "righthand")):
        return "right_arm"
    if any(part in normalized for part in ("leftupleg", "leftleg", "leftfoot", "lefttoebase")):
        return "left_leg"
    if any(part in normalized for part in ("rightupleg", "rightleg", "rightfoot", "righttoebase")):
        return "right_leg"
    return "torso"


def carrier_region_trees(carrier, rig):
    bone_names = set(rig.data.bones.keys())
    group_regions = {
        group.index: bone_region(group.name)
        for group in carrier.vertex_groups
        if group.name in bone_names
    }
    by_region = {name: [] for name in ("torso", "left_arm", "right_arm", "left_leg", "right_leg")}
    for vertex in carrier.data.vertices:
        totals = {}
        for membership in vertex.groups:
            region = group_regions.get(membership.group)
            if region:
                totals[region] = totals.get(region, 0.0) + membership.weight
        region = max(totals, key=totals.get) if totals else "torso"
        by_region[region].append(vertex)

    trees = {}
    for region, vertices in by_region.items():
        if not vertices:
            continue
        tree = KDTree(len(vertices))
        for vertex in vertices:
            tree.insert(vertex.co, vertex.index)
        tree.balance()
        trees[region] = tree
    return trees


def choose_region(point, trees, role):
    distances = {
        region: tree.find(point)[2]
        for region, tree in trees.items()
    }
    side = "left" if point.x >= 0 else "right"
    arm = f"{side}_arm"
    leg = f"{side}_leg"
    torso_distance = distances.get("torso", float("inf"))
    if (
        point.z > 0.91
        and abs(point.x) > 0.155
        and distances.get(arm, float("inf")) < torso_distance * 1.35
    ):
        return arm
    if (
        role == "ensemble"
        and point.z < 1.05
        and abs(point.x) > 0.035
        and distances.get(leg, float("inf")) < torso_distance * 1.55
    ):
        return leg
    return "torso"


def topology_regions(obj, trees, role):
    parents = list(range(len(obj.data.vertices)))

    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left, right):
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    for polygon in obj.data.polygons:
        first = polygon.vertices[0]
        for index in polygon.vertices[1:]:
            union(first, index)

    components = {}
    for vertex in obj.data.vertices:
        components.setdefault(find(vertex.index), []).append(vertex.index)
    regions = [None] * len(obj.data.vertices)
    for indices in components.values():
        raw = [choose_region(obj.data.vertices[index].co, trees, role) for index in indices]
        counts = {region: raw.count(region) for region in set(raw)}
        points = [obj.data.vertices[index].co for index in indices]
        low_x = min(point.x for point in points)
        high_x = max(point.x for point in points)
        low_z = min(point.z for point in points)
        high_z = max(point.z for point in points)
        forced = None
        if low_z > 0.86 and low_x > 0.115 and counts.get("left_arm", 0) > len(indices) * 0.15:
            forced = "left_arm"
        elif low_z > 0.86 and high_x < -0.115 and counts.get("right_arm", 0) > len(indices) * 0.15:
            forced = "right_arm"
        elif role == "ensemble" and high_z < 1.08 and low_x > 0.018 and counts.get("left_leg", 0) > len(indices) * 0.30:
            forced = "left_leg"
        elif role == "ensemble" and high_z < 1.08 and high_x < -0.018 and counts.get("right_leg", 0) > len(indices) * 0.30:
            forced = "right_leg"
        for index, region in zip(indices, raw):
            regions[index] = forced or region
    return regions


def carrier_neighbors(carrier, rig, obj, role, count=4):
    trees = carrier_region_trees(carrier, rig)
    result = []
    counts = {}
    regions = topology_regions(obj, trees, role)
    for vertex, region in zip(obj.data.vertices, regions):
        counts[region] = counts.get(region, 0) + 1
        tree = trees[region]
        nearest = tree.find_n(vertex.co, count)
        weights = [1.0 / max(distance, 0.0002) for _co, _index, distance in nearest]
        total = sum(weights)
        result.append([(item[1], weight / total) for item, weight in zip(nearest, weights)])
    print("AUTHORED_GARMENT_REGIONS", role, " ".join(f"{key}:{value}" for key, value in sorted(counts.items())))
    return result, regions


def named_bone(rig, side, part):
    requested = normalized_bone_name(f"mixamorig{side}{part}")
    return next(
        bone for bone in rig.data.bones
        if normalized_bone_name(bone.name) == requested
    )


def segment_parameter(point, start, end):
    direction = end - start
    length_squared = direction.length_squared
    if length_squared < 1e-10:
        return 0.0, (point - start).length
    parameter = max(0.0, min(1.0, (point - start).dot(direction) / length_squared))
    return parameter, (point - (start + direction * parameter)).length


def limb_influence(point, region, rig):
    side, limb = region.split("_", 1)
    side_name = side.title()
    if limb == "arm":
        upper = named_bone(rig, side_name, "Arm")
        lower = named_bone(rig, side_name, "ForeArm")
        end = named_bone(rig, side_name, "Hand")
    else:
        upper = named_bone(rig, side_name, "UpLeg")
        lower = named_bone(rig, side_name, "Leg")
        end = named_bone(rig, side_name, "Foot")

    upper_t, upper_distance = segment_parameter(point, upper.head_local, upper.tail_local)
    lower_t, lower_distance = segment_parameter(point, lower.head_local, lower.tail_local)
    if upper_distance <= lower_distance:
        blend = max(0.0, min(1.0, (upper_t - 0.68) / 0.32))
        return {upper.name: 1.0 - blend, lower.name: blend}
    end_blend = max(0.0, min(0.22, (lower_t - 0.82) / 0.18 * 0.22))
    return {lower.name: 1.0 - end_blend, end.name: end_blend}


def transfer_skin_weights(obj, carrier, rig, role):
    neighbors, regions = carrier_neighbors(carrier, rig, obj, role)
    bone_names = set(rig.data.bones.keys())
    source_group_names = {
        group.index: group.name for group in carrier.vertex_groups if group.name in bone_names
    }
    influences = []
    for vertex, mapping, region in zip(obj.data.vertices, neighbors, regions):
        if region != "torso":
            influences.append(limb_influence(vertex.co, region, rig))
            continue
        influence = {}
        for source_index, proximity in mapping:
            for membership in carrier.data.vertices[source_index].groups:
                name = source_group_names.get(membership.group)
                if name:
                    influence[name] = influence.get(name, 0.0) + membership.weight * proximity
        total = sum(influence.values()) or 1.0
        influences.append({name: weight / total for name, weight in influence.items()})

    adjacency = [set() for _vertex in obj.data.vertices]
    for edge in obj.data.edges:
        left, right = edge.vertices
        adjacency[left].add(right)
        adjacency[right].add(left)
    for _iteration in range(7):
        smoothed = []
        for index, influence in enumerate(influences):
            neighbors_for_vertex = adjacency[index]
            if not neighbors_for_vertex:
                smoothed.append(influence)
                continue
            average = {}
            for neighbor in neighbors_for_vertex:
                for name, weight in influences[neighbor].items():
                    average[name] = average.get(name, 0.0) + weight / len(neighbors_for_vertex)
            names = set(influence) | set(average)
            blended = {
                name: influence.get(name, 0.0) * 0.58 + average.get(name, 0.0) * 0.42
                for name in names
            }
            smoothed.append(dict(sorted(blended.items(), key=lambda item: item[1], reverse=True)[:8]))
        influences = smoothed

    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    destination_groups = {
        name: obj.vertex_groups.new(name=name) for name in sorted(source_group_names.values())
    }
    for vertex, influence in zip(obj.data.vertices, influences):
        strongest = sorted(influence.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(weight for _name, weight in strongest) or 1.0
        for name, weight in strongest:
            destination_groups[name].add([vertex.index], weight / total, "REPLACE")
    return neighbors


def bind_to_carrier(obj, carrier, rig, role):
    neighbors = transfer_skin_weights(obj, carrier, rig, role)

    obj.shape_key_add(name="Basis", from_mix=False)
    if carrier.data.shape_keys:
        carrier_basis = carrier.data.shape_keys.key_blocks["Basis"]
        for morph_name in BODY_MORPHS:
            source_key = carrier.data.shape_keys.key_blocks.get(morph_name)
            if not source_key:
                continue
            key = obj.shape_key_add(name=morph_name, from_mix=False)
            for point, vertex, mapping in zip(key.data, obj.data.vertices, neighbors):
                offset = Vector()
                for source_index, proximity in mapping:
                    offset += (source_key.data[source_index].co - carrier_basis.data[source_index].co) * proximity
                point.co = vertex.co + offset

    modifier = obj.modifiers.new(name="RendererC_MixamoSkin", type="ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    obj.parent = rig
    obj["renderer_c_skinning"] = "anatomical-nearest-four-from-mpfb-carrier"
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    for material in obj.data.materials:
        if material:
            material.diffuse_color[3] = 1.0
            if hasattr(material, "surface_render_method"):
                material.surface_render_method = "DITHERED"


def add_authored_menswear(rig, carrier, ensemble_path):
    carrier_low, carrier_high = bounds([carrier])
    authored = []

    ensemble = import_meshes(ensemble_path)
    ensemble_low, ensemble_high = expanded_box(carrier_low, carrier_high, x=1.015, y=1.01)
    map_group_to_box(ensemble, ensemble_low, ensemble_high)
    waistcoat = max(ensemble, key=lambda obj: len(obj.data.polygons))
    for obj in ensemble:
        if obj != waistcoat:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
    waistcoat.name = "RendererC_AuthoredVictorianWaistcoat_01"
    trim_to_waistcoat(waistcoat, rig)
    for vertex in waistcoat.data.vertices:
        vertex.co.x *= 1.055
        vertex.co.y = vertex.co.y * 1.10 - 0.045
    # The open armholes and pointed hem are the useful part of this asset.
    # Heavy decimation made both outlines visibly jagged, so retain them and
    # let the final web optimization handle only lossless mesh compression.
    decimate(waistcoat, 0.82)
    bind_to_carrier(waistcoat, carrier, rig, "ensemble")
    waistcoat["renderer_c_wardrobe_role"] = "authored-victorian-waistcoat"
    waistcoat["renderer_c_source_asset"] = os.path.basename(ensemble_path)
    authored.append(waistcoat)

    print(
        "AUTHORED_VICTORIAN_MENSWEAR_OK "
        + " ".join(f"{obj.name}:{len(obj.data.polygons)}" for obj in authored)
    )
    return authored

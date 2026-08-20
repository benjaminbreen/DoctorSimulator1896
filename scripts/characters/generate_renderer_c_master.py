"""Build a reusable, live-parametric Renderer C consultation master.

Each sex-specific master keeps the approved GNM-derived faces as identity
anchors. MPFB targets are sampled into additional relative shape keys so the
Character Lab can tune anatomy without starting Blender again.
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
VICTORIAN_MENSWEAR_ROOT = os.path.join(
    PROJECT_ROOT,
    "assets", "source", "renderer-c", "menswear", "toigo_male_suit_tie_and_jacket",
)
VICTORIAN_WOMENSWEAR_ROOT = os.path.join(
    PROJECT_ROOT,
    "assets", "source", "renderer-c", "womenswear", "toigo_halter_dress_with_fluted_skirt",
)
IMPORTED_VICTORIAN_ROOT = os.path.join(
    PROJECT_ROOT, "assets", "source", "renderer-c", "imported-victorian"
)

import generate_patient as common
import generate_renderer_c as renderer_c
import prove_renderer_c_identity_transfer as proof
import render_mpfb_identity_diversity as identity_gate
import render_renderer_c_face_range_grid as female_gate
import render_renderer_c_male_face_range_grid as male_gate
import renderer_c_asset_garments as asset_garments
import renderer_c_elite_menswear as elite_menswear
import retarget_mixamo_actions as mixamo_actions


PIPELINE = "renderer-c-parametric-master-v1"
NEUTRAL_AGE = 0.555
LIVE_FACE_IDS = (
    "headWidth", "faceHeight", "headDepth",
    "noseWidth", "noseLength", "noseDepth", "noseBridge", "noseCurve",
    "noseTipAngle", "nostrilWidth",
    "jawWidth", "chinHeight", "chinProminence", "chinPrognathism",
    "eyeSize", "eyeSpacing", "eyeVerticalPosition", "eyeDepth",
    "eyeHeightInner", "eyeHeightCenter", "eyeHeightOuter",
    "browHeight", "browAngle",
    "mouthWidth", "mouthDepth", "lipFullness",
    "cheekVolume", "cheekboneProminence", "cheekHeight",
)
LIVE_BODY_IDS = ("weight", "muscle", "proportions")
DEMOGRAPHIC_KEY_NAMES = (
    "rc_age_young", "rc_age_old", "rc_heritage_asian", "rc_heritage_african",
)
AUTHORED_HAIR_KEY_NAMES = (
    *DEMOGRAPHIC_KEY_NAMES,
    "rc_live_headWidth_neg", "rc_live_headWidth_pos",
    "rc_live_faceHeight_neg", "rc_live_faceHeight_pos",
    "rc_live_headDepth_neg", "rc_live_headDepth_pos",
    "rc_live_weight_neg", "rc_live_weight_pos",
    "rc_live_muscle_neg", "rc_live_muscle_pos",
    "rc_live_proportions_neg", "rc_live_proportions_pos",
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cohort", choices=("women", "men"), required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--gnm-npz", default=proof.DEFAULT_GNM)
    parser.add_argument("--semantic-diversity", type=float, default=1.65)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def cohort_definition(cohort):
    if cohort == "men":
        return {
            "sex": "male",
            "gender": 0.94,
            "muscle": 0.38,
            "height": 0.53,
            "cupsize": 0.30,
            "anchors": male_gate.ANCHORS,
            "identity_values": male_gate.identity_values,
            "skin": "young_caucasian_male.mhmat",
            "garment": "male_elegantsuit01.mhclo",
            "work_garment": "male_casualsuit01.mhclo",
            "victorian_garment": os.path.join(
                VICTORIAN_MENSWEAR_ROOT, "toigo_male_suit_tie_and_jacket.mhclo"
            ),
            "hair": ("short01.mhclo", "short02.mhclo"),
            "lashes": ("eyelashes01.mhclo",),
        }
    return {
        "sex": "female",
        "gender": 0.025,
        "muscle": 0.27,
        "height": 0.47,
        "cupsize": 0.42,
        "anchors": female_gate.ANCHORS,
        "identity_values": female_gate.identity_values,
        "skin": "young_caucasian_female.mhmat",
        "garment": "female_elegantsuit01.mhclo",
        "period_garment": os.path.join(
            VICTORIAN_WOMENSWEAR_ROOT, "toigo_halter_dress_with_fluted_skirt.mhclo"
        ),
        "hair": ("authored-victorian-low-bun",),
        "lashes": ("eyelashes01.mhclo", "eyelashes02.mhclo", "eyelashes03.mhclo"),
    }


def neutral_values(definition):
    values = {
        name: 0.0
        for name in (
            *identity_gate.PRIMARY_IDS,
            *identity_gate.DETAIL_IDS,
            *identity_gate.EXTRA_SIGNED_TARGETS.keys(),
            *identity_gate.EXTRA_PAIRED_TARGETS.keys(),
        )
    }
    values.update({
        "gender": definition["gender"],
        "age": NEUTRAL_AGE,
        "muscle": definition["muscle"],
        "weight": 0.48,
        "proportions": 0.50,
        "height": definition["height"],
        "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
        "headShape": "oval",
        "headShapeStrength": 0.0,
        "earShape": "round",
        "earShapeStrength": 0.0,
        "asymTarget": "asym/asym-mouth-1-l.target.gz",
        "asymStrength": 0.0,
        "faceAsymmetry": 0.0,
        "eyeColor": "#6e755f",
        "seated": 1.0,
        "kneesTogether": 0.64,
        "posture": 0.04,
        "headTurn": 0.0,
        "headTilt": 0.0,
        "breathing": 0.22,
        "fidget": 0.10,
    })
    return values


def macro(values, definition):
    return {
        "gender": values["gender"],
        "age": values["age"],
        "muscle": values["muscle"],
        "weight": values["weight"],
        "proportions": values["proportions"],
        "height": values["height"],
        "cupsize": definition["cupsize"],
        "firmness": 0.48,
        "race": values["race"],
    }


def make_endpoint(services, definition, values, name):
    HumanService, TargetService, _AssetService, LocationService, _FaceService, _ExportService = services
    endpoint = HumanService.create_human(macro_detail_dict=macro(values, definition))
    endpoint.name = name
    common.add_face_targets(TargetService, LocationService, endpoint, values)
    identity_gate.add_expanded_targets(TargetService, LocationService, endpoint, values)
    TargetService.bake_targets(endpoint)
    return endpoint


def endpoint_coordinates(endpoint):
    return tuple(vertex.co.copy() for vertex in endpoint.data.vertices)


def remove_endpoint(endpoint):
    mesh = endpoint.data
    bpy.data.objects.remove(endpoint, do_unlink=True)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def add_absolute_shape_key(base, name, coordinates):
    if len(coordinates) != len(base.data.vertices):
        raise RuntimeError(f"{name} topology changed ({len(coordinates)} != {len(base.data.vertices)})")
    key = base.shape_key_add(name=name, from_mix=False)
    key.slider_min = 0.0
    key.slider_max = 1.0
    for point, coordinate in zip(key.data, coordinates):
        point.co = coordinate
    return key


def sampled_key(services, definition, base, neutral, name, changes):
    values = dict(neutral)
    values["race"] = dict(neutral["race"])
    values.update(changes)
    endpoint = make_endpoint(services, definition, values, f"Endpoint_{name}")
    add_absolute_shape_key(base, name, endpoint_coordinates(endpoint))
    remove_endpoint(endpoint)


def add_anchor_keys(services, definition, base, neutral, args, output_dir):
    manifest = []
    for slot, anchor in enumerate(definition["anchors"]):
        values = definition["identity_values"](anchor)
        endpoint = make_endpoint(services, definition, values, f"Anchor_{anchor['id']}")
        target_path = os.path.join(output_dir, f"{args.cohort}-{anchor['id']}-gnm.target")
        donor = anchor.get("donor", anchor.get("gnmDonor"))
        transfer = proof.apply_gnm_transfer(
            endpoint,
            args.gnm_npz,
            donor,
            "semantic",
            args.semantic_diversity,
            definition["sex"],
            anchor["gnmStrength"],
            target_path,
            services[3].get_mpfb_data("targets"),
            "safe",
            {},
        )
        key_name = f"rc_anchor_{slot + 1:02d}"
        add_absolute_shape_key(base, key_name, endpoint_coordinates(endpoint))
        remove_endpoint(endpoint)
        manifest.append({
            "id": anchor["id"],
            "label": anchor["id"].split("-", 1)[-1].replace("-", " "),
            "morph": key_name,
            "browSlot": slot,
            "lashSlot": slot,
            "hairSlot": slot,
            "eyeSlot": slot,
            "teethSlot": slot,
            "eyeColor": anchor["eyeColor"],
            "gnmDonor": donor,
            "gnmStrength": anchor["gnmStrength"],
            "transferRms": transfer["deltaRms"],
        })
        print(f"ANCHOR_OK cohort={args.cohort} id={anchor['id']} morph={key_name}")
    return manifest


def add_demographic_keys(services, definition, base, neutral):
    sampled_key(services, definition, base, neutral, "rc_age_young", {"age": 0.505})
    sampled_key(services, definition, base, neutral, "rc_age_old", {"age": 0.84})
    sampled_key(services, definition, base, neutral, "rc_heritage_asian", {
        "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0},
    })
    sampled_key(services, definition, base, neutral, "rc_heritage_african", {
        "race": {"asian": 0.0, "caucasian": 0.0, "african": 1.0},
    })


def add_live_keys(services, definition, base, neutral):
    for parameter_id in LIVE_FACE_IDS:
        sampled_key(services, definition, base, neutral, f"rc_live_{parameter_id}_pos", {parameter_id: 1.0})
        sampled_key(services, definition, base, neutral, f"rc_live_{parameter_id}_neg", {parameter_id: -1.0})
        print(f"LIVE_KEY_OK {parameter_id}")
    body_ranges = {
        "weight": (0.24, 0.78),
        "muscle": (0.18, 0.72),
        "proportions": (0.28, 0.74),
    }
    for parameter_id in LIVE_BODY_IDS:
        low, high = body_ranges[parameter_id]
        sampled_key(services, definition, base, neutral, f"rc_live_{parameter_id}_neg", {parameter_id: low})
        sampled_key(services, definition, base, neutral, f"rc_live_{parameter_id}_pos", {parameter_id: high})
        print(f"LIVE_KEY_OK {parameter_id}")


def add_authored_hair_keys(HumanService, base, hair):
    """Sample body-driven keys for hair that has no MHCLO correspondence map."""
    if not hair.data.shape_keys:
        hair.shape_key_add(name="Basis", from_mix=False)
    for morph_name in AUTHORED_HAIR_KEY_NAMES:
        base.data.shape_keys.key_blocks[morph_name].value = 1.0
        bpy.context.view_layer.update()
        endpoint_hair = common.add_authored_hair(HumanService, base)
        if len(endpoint_hair.data.vertices) != len(hair.data.vertices):
            raise RuntimeError(f"Authored hair topology changed while fitting {morph_name}")
        hair_key = hair.shape_key_add(name=morph_name, from_mix=False)
        for point, vertex in zip(hair_key.data, endpoint_hair.data.vertices):
            point.co = vertex.co
        endpoint_mesh = endpoint_hair.data
        bpy.data.objects.remove(endpoint_hair, do_unlink=True)
        if endpoint_mesh.users == 0:
            bpy.data.meshes.remove(endpoint_mesh)
        base.data.shape_keys.key_blocks[morph_name].value = 0.0
        print(f"AUTHORED_HAIR_KEY_OK {hair.name} {morph_name}")
    bpy.context.view_layer.update()


def interpolate_custom_keys_to_assets(base, fitted):
    """Transfer Renderer C body deltas through each asset's MHCLO mapping."""
    ClothesService = proof.dynamic_import("mpfb.services.clothesservice", "ClothesService")
    Mhclo = proof.dynamic_import("mpfb.entities.clothes.mhclo", "Mhclo")
    source_keys = [
        key for key in base.data.shape_keys.key_blocks
        if key.name.startswith("rc_") and not key.name.startswith("rc_anchor_")
    ]
    basis = [vertex.co.copy() for vertex in base.data.vertices]
    for child in fitted:
        if child.get("renderer_c_wardrobe_role") in ("production-dress", "elite-morning-suit"):
            # These garments copy a carrier only to inherit its exact bind
            # space. Their custom topology already has sampled body keys and
            # must not be treated as the carrier's MHCLO vertex mapping.
            continue
        path = ClothesService.find_clothes_absolute_path(child)
        if not path:
            continue
        mhclo = Mhclo()
        mhclo.load(path)
        if not child.data.shape_keys:
            child.shape_key_add(name="Basis", from_mix=False)
        for source_key in source_keys:
            if source_key.name in child.data.shape_keys.key_blocks:
                continue
            offsets = []
            for child_index, mapping in mhclo.verts.items():
                if child_index >= len(child.data.vertices):
                    continue
                v0, v1, v2 = mapping["verts"]
                if max(v0, v1, v2) >= len(source_key.data):
                    continue
                w0, w1, w2 = mapping["weights"]
                offset = (
                    (source_key.data[v0].co - basis[v0]) * w0
                    + (source_key.data[v1].co - basis[v1]) * w1
                    + (source_key.data[v2].co - basis[v2]) * w2
                )
                if offset.length > 0.000001:
                    offsets.append((child_index, offset))
            if not offsets:
                continue
            child_key = child.shape_key_add(name=source_key.name, from_mix=False)
            for child_index, offset in offsets:
                child_key.data[child_index].co = child.data.vertices[child_index].co + offset
        print(f"CUSTOM_ASSET_KEYS_OK {child.name}")


def add_garment_asset(HumanService, AssetService, base, source, name):
    if os.path.isabs(source):
        if not os.path.exists(source):
            raise RuntimeError(f"Missing project garment asset: {source}")
        garment = HumanService.add_mhclo_asset(
            source,
            base,
            asset_type="Clothes",
            material_type="GAMEENGINE",
        )
        if garment is None or not hasattr(garment, "name"):
            raise RuntimeError(f"MPFB failed to add project garment {source}")
        garment.name = name
        garment["renderer_c_role"] = "clothe"
        return garment
    return renderer_c.add_named_asset(
        HumanService, AssetService, base, "clothes", source, "Clothes", name
    )


def add_fitted_garment(HumanService, AssetService, base, source, name, color, keep_materials=False):
    """Add one reusable garment carrier and sample its body-build endpoints."""
    garment = add_garment_asset(HumanService, AssetService, base, source, name)
    if not keep_materials:
        renderer_c.set_material_override(garment, f"{name}_Material", color, 0.84)
    garment.shape_key_add(name="Basis", from_mix=False)
    garment_morphs = (
        *DEMOGRAPHIC_KEY_NAMES,
        "rc_live_weight_neg", "rc_live_weight_pos",
        "rc_live_muscle_neg", "rc_live_muscle_pos",
        "rc_live_proportions_neg", "rc_live_proportions_pos",
    )
    for morph_name in garment_morphs:
        for key in base.data.shape_keys.key_blocks[1:]:
            key.value = 0.0
        base.data.shape_keys.key_blocks[morph_name].value = 1.0
        bpy.context.view_layer.update()
        endpoint = add_garment_asset(
            HumanService, AssetService, base, source, f"Endpoint_{name}_{morph_name}"
        )
        if len(endpoint.data.vertices) != len(garment.data.vertices):
            raise RuntimeError(f"{name} topology changed while fitting {morph_name}")
        garment_key = garment.shape_key_add(name=morph_name, from_mix=False)
        for point, vertex in zip(garment_key.data, endpoint.data.vertices):
            point.co = vertex.co
        endpoint_mesh = endpoint.data
        bpy.data.objects.remove(endpoint, do_unlink=True)
        if endpoint_mesh.users == 0:
            bpy.data.meshes.remove(endpoint_mesh)
        print(f"GARMENT_KEY_OK {name} {morph_name}")
    for key in base.data.shape_keys.key_blocks[1:]:
        key.value = 0.0
    bpy.context.view_layer.update()
    return garment


GOLDEN_DRESS_COLORS = {
    "base": "#9a6b2f",
    "secondary": "#5f3d23",
    "accent": "#c3a56d",
}


def mesh_components(mesh):
    """Return connected vertex sets without modifying the source mesh."""
    neighbours = [set() for _vertex in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbours[a].add(b)
        neighbours[b].add(a)
    pending = set(range(len(mesh.vertices)))
    components = []
    while pending:
        first = pending.pop()
        component = {first}
        stack = [first]
        while stack:
            current = stack.pop()
            linked = neighbours[current] & pending
            pending.difference_update(linked)
            component.update(linked)
            stack.extend(linked)
        components.append(component)
    return components


def copy_mesh_subset(source, name, keep_vertices):
    """Copy a skinned mesh subset while retaining UVs, weights and morphs."""
    source_basis = source.data.shape_keys.key_blocks["Basis"]
    ordered = sorted(keep_vertices)
    old_to_new = {old: new for new, old in enumerate(ordered)}
    source_polygons = [
        polygon for polygon in source.data.polygons
        if all(vertex in keep_vertices for vertex in polygon.vertices)
    ]
    vertices = [tuple(source_basis.data[index].co) for index in ordered]
    faces = [tuple(old_to_new[index] for index in polygon.vertices) for polygon in source_polygons]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    for material in source.data.materials:
        mesh.materials.append(material)
    for target, original in zip(mesh.polygons, source_polygons):
        target.material_index = original.material_index
        target.use_smooth = original.use_smooth

    if source.data.uv_layers.active:
        source_uv = source.data.uv_layers.active.data
        target_uv = mesh.uv_layers.new(name=source.data.uv_layers.active.name).data
        for target, original in zip(mesh.polygons, source_polygons):
            for target_loop, source_loop in zip(target.loop_indices, original.loop_indices):
                target_uv[target_loop].uv = source_uv[source_loop].uv

    result = source.copy()
    result.data = mesh
    result.name = name
    bpy.context.collection.objects.link(result)
    for group in list(result.vertex_groups):
        result.vertex_groups.remove(group)
    target_groups = {
        group.index: result.vertex_groups.new(name=group.name)
        for group in source.vertex_groups
    }
    for target_index, source_index in enumerate(ordered):
        for membership in source.data.vertices[source_index].groups:
            target_groups[membership.group].add([target_index], membership.weight, "REPLACE")

    result.shape_key_add(name="Basis", from_mix=False)
    for source_key in source.data.shape_keys.key_blocks[1:]:
        target_key = result.shape_key_add(name=source_key.name, from_mix=False)
        for target_index, source_index in enumerate(ordered):
            target_key.data[target_index].co = source_key.data[source_index].co
    return result


def replace_golden_materials(item):
    item.data.materials.clear()
    item.data.materials.append(common.material(
        "RendererC_GoldenDress_Base", GOLDEN_DRESS_COLORS["base"], 0.86
    ))
    item.data.materials.append(common.material(
        "RendererC_GoldenDress_Secondary", GOLDEN_DRESS_COLORS["secondary"], 0.84
    ))
    item.data.materials.append(common.material(
        "RendererC_GoldenDress_Accent", GOLDEN_DRESS_COLORS["accent"], 0.76
    ))


def add_golden_bodice(carrier, rig):
    """Derive a long-sleeved bodice from the proven fitted carrier."""
    upper_components = [
        component for component in mesh_components(carrier.data)
        if max(carrier.data.vertices[index].co.z for index in component) > 1.05
        and not (
            len(component) < 150
            and min(carrier.data.vertices[index].co.z for index in component) > 1.27
        )
    ]
    keep = set().union(*upper_components)
    bodice = copy_mesh_subset(carrier, "RendererC_GoldenDressBodice", keep)
    replace_golden_materials(bodice)
    for polygon in bodice.data.polygons:
        polygon.material_index = 0
        # Cuffs are separate regular bands in RendererC_GoldenDressDetails.
        # Selecting carrier faces here produced jagged triangular boundaries.
    bodice["renderer_c_role"] = "clothe"
    bodice["renderer_c_wardrobe_role"] = "golden-dress"
    bodice["renderer_c_construction"] = "derived-skinned-bodice"
    print(f"GOLDEN_BODICE_OK vertices={len(bodice.data.vertices)} faces={len(bodice.data.polygons)}")
    return bodice


def add_golden_skirt(period_dress):
    """Copy the full skirt and add stable UVs plus one seated corrective."""
    skirt = period_dress.copy()
    skirt.data = period_dress.data.copy()
    skirt.name = "RendererC_GoldenDressSkirt"
    bpy.context.collection.objects.link(skirt)
    replace_golden_materials(skirt)
    rings = 20
    segments = 64
    uv_layer = skirt.data.uv_layers.get("GoldenDressUV") or skirt.data.uv_layers.new(name="GoldenDressUV")
    for polygon_index, polygon in enumerate(skirt.data.polygons):
        ring = polygon_index // segments
        segment = polygon_index % segments
        u0 = segment / segments
        u1 = (segment + 1) / segments
        if segment == segments - 1:
            u1 = 1.0
        v0 = ring / (rings - 1)
        v1 = (ring + 1) / (rings - 1)
        for loop_index, uv in zip(polygon.loop_indices, ((u0, v0), (u0, v1), (u1, v1), (u1, v0))):
            uv_layer.data[loop_index].uv = uv
        polygon.material_index = 2 if ring in (0, rings - 2) else 0
        polygon.use_smooth = True

    basis = skirt.data.shape_keys.key_blocks["Basis"]
    seated = skirt.shape_key_add(name="rc_seated_lap", from_mix=False)
    for index, point in enumerate(seated.data):
        source = basis.data[index].co
        height = max(0.0, min(1.0, (source.z - 0.02) / 0.88))
        radius_y = 0.128 + 0.292 * ((1.0 - height) ** 0.88)
        center_y = -0.020 + 0.026 * (1.0 - height)
        front = max(0.0, min(1.0, (center_y - source.y) / max(radius_y, 0.001)))
        lower = 1.0 - height
        point.co.x += math.copysign(0.020 * front * lower, source.x)
        point.co.y -= 0.035 * front * (0.35 + 0.65 * lower)
        point.co.z += 0.045 * front * lower
    skirt["renderer_c_role"] = "clothe"
    skirt["renderer_c_wardrobe_role"] = "golden-dress"
    skirt["renderer_c_construction"] = "skinned-gored-skirt"
    print(f"GOLDEN_SKIRT_OK vertices={len(skirt.data.vertices)} faces={len(skirt.data.polygons)}")
    return skirt


def add_golden_seated_skirt(period_source):
    """Keep only the lower fitted-gown surface for stable seated poses."""
    basis = period_source.data.shape_keys.key_blocks["Basis"]
    keep = {index for index, point in enumerate(basis.data) if point.co.z < 0.94}
    skirt = copy_mesh_subset(period_source, "RendererC_GoldenDressSeatedSkirt", keep)
    replace_golden_materials(skirt)
    for polygon in skirt.data.polygons:
        low = min(skirt.data.vertices[index].co.z for index in polygon.vertices)
        high = max(skirt.data.vertices[index].co.z for index in polygon.vertices)
        polygon.material_index = 2 if low < 0.035 or high > 0.905 else 0
        polygon.use_smooth = True
    skirt["renderer_c_role"] = "clothe"
    skirt["renderer_c_wardrobe_role"] = "golden-dress-seated"
    skirt["renderer_c_construction"] = "fitted-lower-gown"
    print(f"GOLDEN_SEATED_SKIRT_OK vertices={len(skirt.data.vertices)} faces={len(skirt.data.polygons)}")
    return skirt


def add_cylinder(vertices, faces, materials, center, axis, radius, depth, material, segments=16):
    """Append a closed low-poly cylinder oriented around an arbitrary axis."""
    axis = Vector(axis).normalized()
    guide = Vector((0.0, 0.0, 1.0)) if abs(axis.z) < 0.85 else Vector((1.0, 0.0, 0.0))
    across = axis.cross(guide).normalized()
    up = axis.cross(across).normalized()
    first = len(vertices)
    for side in (-1.0, 1.0):
        origin = Vector(center) + axis * depth * 0.5 * side
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            vertices.append(tuple(origin + across * math.cos(angle) * radius + up * math.sin(angle) * radius))
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((first + segment, first + nxt, first + segments + nxt, first + segments + segment))
        materials.append(material)
    faces.append(tuple(first + segment for segment in reversed(range(segments))))
    materials.append(material)
    faces.append(tuple(first + segments + segment for segment in range(segments)))
    materials.append(material)


def front_surface_y(source, x, z):
    """Estimate the fitted front surface without snapping to the neck or jaw."""
    basis = source.data.shape_keys.key_blocks["Basis"]
    candidates = sorted(
        (point.co for point in basis.data if point.co.y < 0.02),
        key=lambda point: (point.x - x) ** 2 + (point.z - z) ** 2,
    )[:24]
    if not candidates:
        return -0.17
    return sum(point.y for point in sorted(candidates, key=lambda point: point.y)[:4]) / 4


def add_golden_details(rig, body, carrier):
    """Build fitted dress details as skinned geometry, not shader masks."""
    vertices = []
    faces = []
    face_materials = []
    explicit_bones = {}
    bust_targets = {}
    collar_targets = {}
    cuff_targets = {}
    collar_thickness_targets = {}
    cuff_thickness_targets = {}

    # A dense inset follows the fitted front from collar to waist. It overlaps
    # both neighbouring shells so animation cannot open a crack at the seam.
    columns = 13
    rows = 15
    bib_start = len(vertices)
    def collar_front_y(x):
        normalized = min(0.999, abs(x) / 0.103)
        return -0.016 - 0.082 * math.sqrt(max(0.0, 1.0 - normalized * normalized)) - 0.002

    for row in range(rows):
        fraction_z = row / (rows - 1)
        z = 0.965 + 0.375 * fraction_z
        profile = 0.102 + 0.026 * math.sin(math.pi * fraction_z)
        half_width = profile * 0.86
        join = max(0.0, min(1.0, (fraction_z - 0.76) / 0.24))
        join = join * join * (3.0 - 2.0 * join)
        for column in range(columns):
            x = -half_width + 2.0 * half_width * column / (columns - 1)
            point_index = len(vertices)
            surface_y = front_surface_y(carrier, x, z) - 0.010
            y = surface_y * (1.0 - join) + collar_front_y(x) * join
            vertices.append((x, y, z))
            expanded_z = 0.925 + 0.415 * fraction_z
            expanded_half_width = profile * (1.15 - 0.24 * (fraction_z ** 6))
            expanded_x = -expanded_half_width + 2.0 * expanded_half_width * column / (columns - 1)
            expanded_surface_y = front_surface_y(carrier, expanded_x, expanded_z) - 0.013
            expanded_y = expanded_surface_y * (1.0 - join) + collar_front_y(expanded_x) * join
            bust_targets[point_index] = (
                expanded_x,
                expanded_y,
                expanded_z,
            )
    bib_inner_start = len(vertices)
    for row in range(rows):
        for column in range(columns):
            outer_index = bib_start + row * columns + column
            x, y, z = vertices[outer_index]
            point_index = len(vertices)
            vertices.append((x, y + 0.004, z))
            expanded_x, expanded_y, expanded_z = bust_targets[outer_index]
            bust_targets[point_index] = (expanded_x, expanded_y + 0.004, expanded_z)
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = bib_start + row * columns + column
            b = a + 1
            d = bib_start + (row + 1) * columns + column
            c = d + 1
            faces.append((a, d, c, b))
            face_materials.append(1)
            ia = bib_inner_start + row * columns + column
            ib = ia + 1
            id_ = bib_inner_start + (row + 1) * columns + column
            ic = id_ + 1
            faces.append((ia, ib, ic, id_))
            face_materials.append(1)
    # Close the four outer edges so the inset reads as a shallow sewn layer.
    for row in range(rows - 1):
        for column in (0, columns - 1):
            a = bib_start + row * columns + column
            b = bib_start + (row + 1) * columns + column
            ia = bib_inner_start + row * columns + column
            ib = bib_inner_start + (row + 1) * columns + column
            faces.append((a, ia, ib, b) if column == 0 else (a, b, ib, ia))
            face_materials.append(1)
    for row in (0, rows - 1):
        for column in range(columns - 1):
            a = bib_start + row * columns + column
            b = a + 1
            ia = bib_inner_start + row * columns + column
            ib = ia + 1
            faces.append((a, b, ib, ia) if row == 0 else (a, ia, ib, b))
            face_materials.append(1)

    def add_solid_band(center, axis, outer_radius, inner_radius, depth, material, bone_name, target_depth=None, segments=24):
        """Add a hollow band with outer, inner and edge faces."""
        direction = Vector(axis).normalized()
        guide = Vector((0.0, 0.0, 1.0)) if abs(direction.z) < 0.85 else Vector((1.0, 0.0, 0.0))
        across = direction.cross(guide).normalized()
        up = direction.cross(across).normalized()
        first = len(vertices)
        for shell, radius in enumerate((outer_radius, inner_radius)):
            thickness_radius = radius + (0.012 if shell == 0 else -0.008)
            for side in (-1.0, 1.0):
                origin = Vector(center) + direction * depth * 0.5 * side
                target_origin = Vector(center) + direction * (target_depth or depth) * 0.5 * side
                for segment in range(segments):
                    angle = 2.0 * math.pi * segment / segments
                    radial = across * math.cos(angle) * radius + up * math.sin(angle) * radius
                    point_index = len(vertices)
                    vertices.append(tuple(origin + radial))
                    explicit_bones[point_index] = bone_name
                    if target_depth is not None:
                        cuff_targets[point_index] = tuple(target_origin + radial)
                    thick_radial = across * math.cos(angle) * thickness_radius + up * math.sin(angle) * thickness_radius
                    cuff_thickness_targets[point_index] = tuple(origin + thick_radial)
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((first + segment, first + nxt, first + segments + nxt, first + segments + segment))
            face_materials.append(material)
            inner = first + 2 * segments
            faces.append((inner + segment, inner + segments + segment, inner + segments + nxt, inner + nxt))
            face_materials.append(material)
            for side in (0, 1):
                outer_ring = first + side * segments
                inner_ring = first + (2 + side) * segments
                faces.append((
                    outer_ring + segment,
                    inner_ring + segment,
                    inner_ring + nxt,
                    outer_ring + nxt,
                ))
                face_materials.append(material)

    # A continuous collar covers the former open neck. Its top ring can rise
    # with the existing collar-height control.
    collar_first = len(vertices)
    collar_segments = 32
    collar_center_y = -0.016
    collar_outer = ((0.103, 0.082), (0.086, 0.066))
    collar_inner = ((0.096, 0.075), (0.079, 0.059))
    for shell, radii in enumerate((collar_outer, collar_inner)):
        for ring, z in enumerate((1.323, 1.353)):
            collar_rx, collar_ry = radii[ring]
            thickness_rx = collar_rx + (0.012 if shell == 0 else -0.006)
            thickness_ry = collar_ry + (0.012 if shell == 0 else -0.006)
            for segment in range(collar_segments):
                angle = 2.0 * math.pi * segment / collar_segments
                point_index = len(vertices)
                x = collar_rx * math.cos(angle)
                y = collar_center_y + collar_ry * math.sin(angle)
                vertices.append((x, y, z))
                explicit_bones[point_index] = "mixamorig:Neck"
                collar_targets[point_index] = (x, y, z + (0.030 if ring else 0.0))
                collar_thickness_targets[point_index] = (
                    thickness_rx * math.cos(angle),
                    collar_center_y + thickness_ry * math.sin(angle),
                    z,
                )
    for segment in range(collar_segments):
        nxt = (segment + 1) % collar_segments
        faces.append((
            collar_first + segment,
            collar_first + nxt,
            collar_first + collar_segments + nxt,
            collar_first + collar_segments + segment,
        ))
        face_materials.append(1)
        inner = collar_first + 2 * collar_segments
        faces.append((inner + segment, inner + collar_segments + segment, inner + collar_segments + nxt, inner + nxt))
        face_materials.append(1)
        for ring in (0, 1):
            outer_ring = collar_first + ring * collar_segments
            inner_ring = collar_first + (2 + ring) * collar_segments
            faces.append((
                outer_ring + segment,
                inner_ring + segment,
                inner_ring + nxt,
                outer_ring + nxt,
            ))
            face_materials.append(1)

    # Regular bands replace the old polygon-based cuff coloring.
    for side in ("Left", "Right"):
        bone_name = f"mixamorig:{side}ForeArm"
        bone = rig.data.bones.get(bone_name)
        if not bone:
            continue
        axis = bone.tail_local - bone.head_local
        center = bone.head_local + axis * 0.80
        add_solid_band(center, axis, 0.060, 0.054, 0.028, 2, bone_name, target_depth=0.075)

    # Covered buttons sit on the actual fitted bodice surface.
    for z in (1.095, 1.050, 1.005, 0.960):
        center = Vector((0.0, front_surface_y(carrier, 0.0, z) - 0.011, z))
        add_cylinder(vertices, faces, face_materials, center, (0, -1, 0), 0.008, 0.005, 2, 14)

    mesh = bpy.data.meshes.new("RendererC_GoldenDressDetails_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    details = carrier.copy()
    details.data = mesh
    details.name = "RendererC_GoldenDressDetails"
    bpy.context.collection.objects.link(details)
    for group in list(details.vertex_groups):
        details.vertex_groups.remove(group)
    replace_golden_materials(details)
    for polygon, material_index in zip(details.data.polygons, face_materials):
        polygon.material_index = material_index
        polygon.use_smooth = True

    source_basis = carrier.data.shape_keys.key_blocks["Basis"]
    nearest = [
        min(range(len(source_basis.data)), key=lambda index: (source_basis.data[index].co - Vector(vertex)).length_squared)
        for vertex in vertices
    ]
    target_groups = {
        group.index: details.vertex_groups.new(name=group.name)
        for group in carrier.vertex_groups
    }
    target_groups_by_name = {group.name: group for group in details.vertex_groups}
    for detail_index, source_index in enumerate(nearest):
        bone_name = explicit_bones.get(detail_index)
        if bone_name and bone_name in target_groups_by_name:
            target_groups_by_name[bone_name].add([detail_index], 1.0, "REPLACE")
        else:
            for membership in carrier.data.vertices[source_index].groups:
                target_groups[membership.group].add([detail_index], membership.weight, "REPLACE")
    details.shape_key_add(name="Basis", from_mix=False)
    for source_key in carrier.data.shape_keys.key_blocks[1:]:
        target_key = details.shape_key_add(name=source_key.name, from_mix=False)
        for detail_index, source_index in enumerate(nearest):
            delta = source_key.data[source_index].co - source_basis.data[source_index].co
            target_key.data[detail_index].co = Vector(vertices[detail_index]) + delta
    for name, targets in (
        ("rc_dress_bust_coverage", bust_targets),
        ("rc_dress_collar_height", collar_targets),
        ("rc_dress_cuff_width", cuff_targets),
        ("rc_dress_collar_thickness", collar_thickness_targets),
        ("rc_dress_cuff_thickness", cuff_thickness_targets),
    ):
        target_key = details.shape_key_add(name=name, from_mix=False)
        for detail_index, target in targets.items():
            target_key.data[detail_index].co = target
    armature = next((modifier for modifier in details.modifiers if modifier.type == "ARMATURE"), None)
    if armature is None:
        armature = details.modifiers.new(name="RendererC_GoldenDressDetails_Armature", type="ARMATURE")
    armature.object = rig
    armature.use_deform_preserve_volume = True
    details["renderer_c_role"] = "clothe"
    details["renderer_c_wardrobe_role"] = "golden-dress"
    details["renderer_c_construction"] = "projected-and-solid-details"
    print(f"GOLDEN_DETAILS_OK vertices={len(vertices)} faces={len(faces)}")
    return details


def add_period_gored_skirt(rig, fitted_source):
    """Build a clean A-line skirt and inherit the fitted gown's weights."""
    vertices = []
    faces = []
    face_materials = []
    rings = 20
    segments = 64
    for ring in range(rings):
        fall = ring / (rings - 1)
        shaped = fall ** 0.88
        z = 0.90 - 0.88 * fall
        radius_x = 0.178 + 0.312 * shaped
        radius_y = 0.128 + 0.292 * shaped
        center_y = -0.020 + 0.026 * fall
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            vertices.append((
                radius_x * math.cos(angle),
                center_y + radius_y * math.sin(angle),
                z,
            ))
    for ring in range(rings - 1):
        for segment in range(segments):
            nxt = (segment + 1) % segments
            a = ring * segments + segment
            b = ring * segments + nxt
            c = (ring + 1) * segments + nxt
            d = (ring + 1) * segments + segment
            faces.append((a, d, c, b))
            face_materials.append(1 if ring >= rings - 2 else 0)

    mesh = bpy.data.meshes.new("RendererC_VictorianDress_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    skirt = fitted_source.copy()
    skirt.data = mesh
    skirt.name = "RendererC_VictorianDress"
    bpy.context.collection.objects.link(skirt)
    for group in list(skirt.vertex_groups):
        skirt.vertex_groups.remove(group)
    skirt["renderer_c_role"] = "clothe"
    skirt["renderer_c_wardrobe_role"] = "production-dress"
    skirt["renderer_c_skinning"] = "makeclothes-weight-transfer"
    skirt["renderer_c_period_silhouette"] = "1896-gored-a-line"
    skirt.data.materials.append(common.material("RendererC_VictorianDress_Material", "#4b263b", 0.88))
    skirt.data.materials.append(common.material("RendererC_VictorianDress_Trim", "#b99a67", 0.76))
    for polygon, material_index in zip(skirt.data.polygons, face_materials):
        polygon.material_index = material_index
        polygon.use_smooth = True

    source_basis = fitted_source.data.shape_keys.key_blocks["Basis"]
    nearest = []
    for vertex in vertices:
        nearest.append(min(
            range(len(source_basis.data)),
            key=lambda index: (
                (source_basis.data[index].co.x - vertex[0]) ** 2
                + (source_basis.data[index].co.y - vertex[1]) ** 2
                + (source_basis.data[index].co.z - vertex[2]) ** 2
            ),
        ))
    target_groups = {}
    for group in fitted_source.vertex_groups:
        target_groups[group.index] = skirt.vertex_groups.new(name=group.name)
    for skirt_index, source_index in enumerate(nearest):
        for membership in fitted_source.data.vertices[source_index].groups:
            target_groups[membership.group].add([skirt_index], membership.weight, "REPLACE")

    skirt.shape_key_add(name="Basis", from_mix=False)
    for source_key in fitted_source.data.shape_keys.key_blocks:
        if source_key.name == "Basis":
            continue
        target_key = skirt.shape_key_add(name=source_key.name, from_mix=False)
        for skirt_index, source_index in enumerate(nearest):
            delta = source_key.data[source_index].co - source_basis.data[source_index].co
            vertex = vertices[skirt_index]
            target_key.data[skirt_index].co = (
                vertex[0] + delta.x,
                vertex[1] + delta.y,
                vertex[2] + delta.z,
            )
    armature = next((modifier for modifier in skirt.modifiers if modifier.type == "ARMATURE"), None)
    if armature is None:
        armature = skirt.modifiers.new(name="RendererC_VictorianDress_Armature", type="ARMATURE")
    armature.object = rig
    armature.use_deform_preserve_volume = True
    print(f"PERIOD_SKIRT_OK vertices={len(vertices)} faces={len(faces)}")
    return skirt


def add_period_dress_details(rig, carrier):
    """Add a fitted high collar, closed yoke, waist seam, and front buttons."""
    vertices = []
    faces = []
    face_materials = []

    def add_quad(a, b, c, d, material=0):
        first = len(vertices)
        vertices.extend((a, b, c, d))
        faces.append((first, first + 1, first + 2, first + 3))
        face_materials.append(material)

    def add_oval_band(z_top, z_bottom, radius_x, radius_y, center_y, material, segments=32):
        first = len(vertices)
        for z in (z_top, z_bottom):
            for segment in range(segments):
                angle = 2.0 * math.pi * segment / segments
                vertices.append((radius_x * math.cos(angle), center_y + radius_y * math.sin(angle), z))
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((first + segment, first + nxt, first + segments + nxt, first + segments + segment))
            face_materials.append(material)

    # The yoke closes the modern V-neck. The surface sits just outside the
    # fitted carrier so it reads as one bodice without z-fighting.
    add_quad((-0.066, -0.130, 1.355), (0.066, -0.130, 1.355), (0.092, -0.173, 1.270), (-0.092, -0.173, 1.270), 0)
    first = len(vertices)
    vertices.extend(((-0.092, -0.173, 1.270), (0.092, -0.173, 1.270), (0.0, -0.181, 1.112)))
    faces.append((first, first + 1, first + 2))
    face_materials.append(0)

    add_oval_band(1.405, 1.352, 0.086, 0.065, -0.026, 0)
    add_oval_band(0.920, 0.898, 0.174, 0.122, -0.025, 1)

    # A narrow placket and four low-profile buttons keep the detail legible at
    # game distance without turning the bodice into floating ornament.
    add_quad((-0.009, -0.174, 1.112), (0.009, -0.174, 1.112), (0.009, -0.158, 0.925), (-0.009, -0.158, 0.925), 1)
    for button in range(4):
        z = 1.075 - button * 0.047
        segments = 12
        first = len(vertices)
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            vertices.append((0.009 * math.cos(angle), -0.178, z + 0.009 * math.sin(angle)))
        vertices.append((0.0, -0.181, z))
        center = len(vertices) - 1
        for segment in range(segments):
            faces.append((center, first + segment, first + (segment + 1) % segments))
            face_materials.append(1)

    mesh = bpy.data.meshes.new("RendererC_VictorianDetails_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    details = carrier.copy()
    details.data = mesh
    details.name = "RendererC_VictorianDetails"
    bpy.context.collection.objects.link(details)
    for group in list(details.vertex_groups):
        details.vertex_groups.remove(group)
    details["renderer_c_role"] = "clothe"
    details["renderer_c_wardrobe_role"] = "production-dress"
    details["renderer_c_skinning"] = "torso-segmented"
    details.data.materials.append(common.material("RendererC_VictorianDetails_Material", "#4b263b", 0.86))
    details.data.materials.append(common.material("RendererC_VictorianDetails_Trim", "#b99a67", 0.76))
    for polygon, material_index in zip(details.data.polygons, face_materials):
        polygon.material_index = material_index
        polygon.use_smooth = True

    groups = {
        name: details.vertex_groups.new(name=name)
        for name in ("mixamorig:Neck", "mixamorig:Spine2", "mixamorig:Spine1")
    }
    for detail_index, vertex in enumerate(vertices):
        if vertex[2] >= 1.33:
            group_name = "mixamorig:Neck"
        elif vertex[2] >= 0.94:
            group_name = "mixamorig:Spine2"
        else:
            group_name = "mixamorig:Spine1"
        groups[group_name].add([detail_index], 1.0, "REPLACE")

    details.shape_key_add(name="Basis", from_mix=False)
    for source_key in carrier.data.shape_keys.key_blocks:
        if source_key.name == "Basis":
            continue
        details.shape_key_add(name=source_key.name, from_mix=False)

    armature = next((modifier for modifier in details.modifiers if modifier.type == "ARMATURE"), None)
    if armature is None:
        armature = details.modifiers.new(name="RendererC_VictorianDetails_Armature", type="ARMATURE")
    armature.object = rig
    armature.use_deform_preserve_volume = True
    print(f"PERIOD_DETAILS_OK vertices={len(vertices)} faces={len(faces)}")
    return details


def add_variant_assets(services, definition, base):
    HumanService, _TargetService, AssetService, _LocationService, _FaceService, _ExportService = services
    fitted = []
    for slot, anchor in enumerate(definition["anchors"]):
        for key in base.data.shape_keys.key_blocks[1:]:
            key.value = 0.0
        base.data.shape_keys.key_blocks[f"rc_anchor_{slot + 1:02d}"].value = 1.0
        bpy.context.view_layer.update()

        eyes = renderer_c.add_eyes(HumanService, AssetService, base, {"eyeColor": anchor["eyeColor"]}, "consultation")
        eyes.name = f"RendererC_Eyes_{slot + 1:02d}"
        eyes["renderer_c_variant_role"] = "eyes"
        eyes["renderer_c_variant_slot"] = slot

        brow = renderer_c.add_named_asset(
            HumanService, AssetService, base, "eyebrows", anchor["brow"], "Eyebrows", f"RendererC_Brows_{slot + 1:02d}"
        )
        brow["renderer_c_variant_role"] = "brows"
        brow["renderer_c_variant_slot"] = slot
        renderer_c.configure_alpha_asset(brow, 0.22, False)
        lash_filename = definition["lashes"][slot % len(definition["lashes"])]
        lash = renderer_c.add_named_asset(
            HumanService, AssetService, base, "eyelashes", lash_filename, "Eyelashes", f"RendererC_Lashes_{slot + 1:02d}"
        )
        lash["renderer_c_variant_role"] = "lashes"
        lash["renderer_c_variant_slot"] = slot
        renderer_c.configure_alpha_asset(lash, 0.36, False)
        hair_filename = definition["hair"][slot % len(definition["hair"])]
        if hair_filename == "authored-victorian-low-bun":
            item = common.add_authored_hair(HumanService, base)
            item.name = f"RendererC_Hair_{slot + 1:02d}"
            add_authored_hair_keys(HumanService, base, item)
        else:
            item = renderer_c.add_named_asset(
                HumanService, AssetService, base, "hair", hair_filename, "Hair", f"RendererC_Hair_{slot + 1:02d}"
            )
        item["renderer_c_variant_role"] = "hair"
        item["renderer_c_variant_slot"] = slot
        renderer_c.configure_alpha_asset(item, 0.28, True)
        teeth = renderer_c.add_named_asset(
            HumanService, AssetService, base, "teeth", "teeth_base.mhclo", "Teeth", f"RendererC_Teeth_{slot + 1:02d}"
        )
        teeth["renderer_c_variant_role"] = "teeth"
        teeth["renderer_c_variant_slot"] = slot
        fitted.extend((eyes, brow, lash, item, teeth))

    for key in base.data.shape_keys.key_blocks[1:]:
        key.value = 0.0
    bpy.context.view_layer.update()
    garment = add_fitted_garment(
        HumanService, AssetService, base, definition["garment"], "RendererC_BaseGarment", "#183326"
    )
    garment["renderer_c_wardrobe_role"] = "suit"
    rig = bpy.data.objects.get("Patient_Rig")
    period_dress = (
        add_fitted_garment(
            HumanService,
            AssetService,
            base,
            definition["period_garment"],
            "RendererC_VictorianDress",
            "#4b263b",
        )
        if definition["sex"] == "female"
        else None
    )
    if period_dress:
        period_dress.name = "RendererC_VictorianDressFitSource"
        period_dress["renderer_c_wardrobe_role"] = "production-dress-source"
        period_dress["renderer_c_skinning"] = "makeclothes-fitted-source"
        period_source = period_dress
        period_dress = add_period_gored_skirt(rig, period_source)
        period_details = add_period_dress_details(rig, garment)
        golden_dress = (
            add_golden_bodice(garment, rig),
            add_golden_skirt(period_dress),
            add_golden_seated_skirt(period_source),
            add_golden_details(rig, base, garment),
        )
    else:
        period_source = None
        period_details = None
        golden_dress = ()
    work_garment = None
    if definition.get("work_garment"):
        work_garment = add_fitted_garment(
            HumanService, AssetService, base, definition["work_garment"], "RendererC_WorkGarment", "#4d4638"
        )
        work_garment["renderer_c_wardrobe_role"] = "working"
    authored_menswear = (
        asset_garments.add_authored_menswear(
            rig,
            work_garment or garment,
            os.path.join(IMPORTED_VICTORIAN_ROOT, "a_set_of_victorian_clothes.glb"),
        )
        if definition["sex"] == "male"
        else []
    )
    victorian_garment = None
    if definition.get("victorian_garment"):
        # Keep the asset's own diffuse and normal maps; a flat override was
        # what made the sample suit read as smooth clay.
        victorian_garment = add_fitted_garment(
            HumanService,
            AssetService,
            base,
            definition["victorian_garment"],
            "RendererC_VictorianGarment",
            "#343536",
            keep_materials=definition["sex"] == "male",
        )
        victorian_garment["renderer_c_wardrobe_role"] = "victorian-sample"
    elite_suit = (
        elite_menswear.add_elite_morning_suit(rig, garment, common.material)
        if definition["sex"] == "male"
        else None
    )
    shoes = renderer_c.add_named_asset(HumanService, AssetService, base, "clothes", "shoes05.mhclo", "Clothes", "RendererC_Shoes")
    renderer_c.set_material_override(shoes, "RendererC_Shoes_Material", "#211713", 0.78)
    return [
        *fitted,
        garment,
        *([work_garment] if work_garment else []),
        *([victorian_garment] if victorian_garment else []),
        *([elite_suit] if elite_suit else []),
        *authored_menswear,
        *([period_source] if period_source else []),
        *([period_dress] if period_dress else []),
        *([period_details] if period_details else []),
        *golden_dress,
        shoes,
    ]


def main():
    args = arguments()
    output = os.path.abspath(args.output)
    manifest_path = os.path.abspath(args.manifest)
    output_dir = os.path.dirname(output)
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)

    if not os.path.exists(args.gnm_npz):
        # Cached anchor targets in the output directory rebuild the shipped
        # identities without the external GNM source; a new anchor needs it.
        print(f"GNM model not found at {args.gnm_npz}; relying on cached anchor targets")

    import bl_ext.user_default.mpfb  # noqa: F401

    services = (
        proof.dynamic_import("mpfb.services.humanservice", "HumanService"),
        proof.dynamic_import("mpfb.services.targetservice", "TargetService"),
        proof.dynamic_import("mpfb.services.assetservice", "AssetService"),
        proof.dynamic_import("mpfb.services.locationservice", "LocationService"),
        proof.dynamic_import("mpfb.services.faceservice", "FaceService"),
        proof.dynamic_import("mpfb.services.exportservice", "ExportService"),
    )
    HumanService, _TargetService, AssetService, _LocationService, FaceService, ExportService = services
    definition = cohort_definition(args.cohort)
    neutral = neutral_values(definition)

    common.clear_scene()
    base = make_endpoint(services, definition, neutral, "Human_Body")
    base["renderer_c_pipeline"] = PIPELINE
    base["renderer_c_cohort"] = args.cohort
    skin_path = common.find_asset(AssetService, definition["skin"], "skins")
    HumanService.set_character_skin(skin_path, base, skin_type="GAMEENGINE")
    for polygon in base.data.polygons:
        polygon.use_smooth = True
    base.shape_key_add(name="Basis", from_mix=False)

    anchors = add_anchor_keys(services, definition, base, neutral, args, output_dir)
    add_demographic_keys(services, definition, base, neutral)
    add_live_keys(services, definition, base, neutral)

    if not FaceService.is_faceunits01_installed(force_recheck=True):
        raise RuntimeError("Renderer C requires MPFB's official faceunits01 asset pack")
    FaceService.load_targets(
        base,
        load_microsoft_visemes=False,
        load_meta_visemes=False,
        load_arkit_faceunits=True,
    )

    # Renderer C uses MPFB's native Mixamo rig.  The downloaded actions share
    # this skeleton, so they can be constrained and baked without translating
    # between incompatible bone axes.
    rig = HumanService.add_builtin_rig(base, "mixamo")
    rig.name = "Patient_Rig"
    rig["renderer_c_pipeline"] = PIPELINE
    fitted = add_variant_assets(services, definition, base)
    FaceService.interpolate_targets(base)
    interpolate_custom_keys_to_assets(base, fitted)

    motion_dir = os.path.join(
        output_dir, "..", "..", "assets", "mixamo", "renderer-c-male-doll", "downloads"
    )
    motion_dir = os.path.abspath(motion_dir)
    motion_actions = mixamo_actions.attach_mixamo_actions(rig, motion_dir)
    ExportService.bake_modifiers_remove_helpers(
        base,
        bake_masks=True,
        bake_subdiv=False,
        remove_helpers=True,
        also_proxy=False,
    )

    scene_manifest = {
        "pipeline": PIPELINE,
        "cohort": args.cohort,
        "sex": definition["sex"],
        "rig": "mpfb-mixamo",
        "motionSource": "renderer-c-male-mixamo-doll",
        "motionClips": [action.name for action in motion_actions],
        "neutralAge": NEUTRAL_AGE,
        "anchors": anchors,
        "liveFaceIds": list(LIVE_FACE_IDS),
        "liveBodyIds": list(LIVE_BODY_IDS),
        "demographicMorphs": {
            "ageYoung": "rc_age_young",
            "ageOld": "rc_age_old",
            "asian": "rc_heritage_asian",
            "african": "rc_heritage_african",
        },
        "variantCounts": {
            "brows": len(definition["anchors"]),
            "lashes": len(definition["anchors"]),
            "hair": len(definition["anchors"]),
            "eyes": len(definition["anchors"]),
            "teeth": len(definition["anchors"]),
        },
        "wardrobeCarriers": [
            "RendererC_BaseGarment",
            *(["RendererC_VictorianDress"] if definition["sex"] == "female" else []),
            *(["RendererC_VictorianDetails"] if definition["sex"] == "female" else []),
            *(
                [
                    "RendererC_GoldenDressBodice",
                    "RendererC_GoldenDressSkirt",
                    "RendererC_GoldenDressSeatedSkirt",
                    "RendererC_GoldenDressDetails",
                ]
                if definition["sex"] == "female"
                else []
            ),
            *(["RendererC_WorkGarment"] if definition.get("work_garment") else []),
            *(["RendererC_VictorianGarment"] if definition.get("victorian_garment") else []),
            *(
                [
                    "RendererC_EliteMorningSuit",
                    "RendererC_AuthoredVictorianWaistcoat_01",
                ]
                if definition["sex"] == "male"
                else []
            ),
        ],
    }
    bpy.context.scene["renderer_c_manifest"] = json.dumps(scene_manifest, separators=(",", ":"))
    renderer_c.export_glb(output, [base, rig, *fitted])
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(scene_manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"RENDERER_C_MASTER_OK cohort={args.cohort} output={output} manifest={manifest_path}")


if __name__ == "__main__":
    main()

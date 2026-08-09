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


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
VICTORIAN_WOMENSWEAR_ROOT = os.path.join(
    PROJECT_ROOT,
    "assets", "source", "renderer-c", "womenswear", "toigo_halter_dress_with_fluted_skirt",
)

import generate_patient as common
import generate_renderer_c as renderer_c
import prove_renderer_c_identity_transfer as proof
import render_mpfb_identity_diversity as identity_gate
import render_renderer_c_face_range_grid as female_gate
import render_renderer_c_male_face_range_grid as male_gate
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
        if child.get("renderer_c_wardrobe_role") == "production-dress":
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


def add_fitted_garment(HumanService, AssetService, base, source, name, color):
    """Add one reusable garment carrier and sample its body-build endpoints."""
    garment = add_garment_asset(HumanService, AssetService, base, source, name)
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
    else:
        period_source = None
        period_details = None
    work_garment = None
    if definition.get("work_garment"):
        work_garment = add_fitted_garment(
            HumanService, AssetService, base, definition["work_garment"], "RendererC_WorkGarment", "#4d4638"
        )
        work_garment["renderer_c_wardrobe_role"] = "working"
    shoes = renderer_c.add_named_asset(HumanService, AssetService, base, "clothes", "shoes05.mhclo", "Clothes", "RendererC_Shoes")
    renderer_c.set_material_override(shoes, "RendererC_Shoes_Material", "#211713", 0.78)
    return [
        *fitted,
        garment,
        *([work_garment] if work_garment else []),
        *([period_source] if period_source else []),
        *([period_dress] if period_dress else []),
        *([period_details] if period_details else []),
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
        raise RuntimeError(f"GNM model not found: {args.gnm_npz}")

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
            *(["RendererC_WorkGarment"] if definition.get("work_garment") else []),
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

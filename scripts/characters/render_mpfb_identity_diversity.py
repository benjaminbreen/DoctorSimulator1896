"""Render a repeatable MPFB identity-diversity gate.

The narrow cohort holds demographics and presentation constant so facial
structure has to carry identity. The broad cohort tests the full patient range.
"""

import argparse
import importlib
import json
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Vector


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
import generate_patient as common


BODY_VERTEX_END = 13380
PIPELINE = "mpfb2-identity-diversity-gate-v1"
EYE_ASSET_UUID = "2c12f43b-1303-432c-b7ce-d78346baf2e6"

PRIMARY_IDS = (
    "headWidth", "faceHeight", "headDepth", "noseWidth", "noseLength",
    "noseVolume", "jawWidth", "chinHeight", "chinProminence", "eyeSize",
    "eyeSpacing", "mouthWidth", "lipFullness", "cheekVolume",
    "cheekboneProminence",
)

DETAIL_IDS = (
    "headAngle", "headBackDepth", "noseDepth", "noseBridge", "noseCurve",
    "noseTipAngle", "nostrilWidth", "chinPrognathism", "eyeVerticalPosition",
    "eyeDepth", "eyeHeightInner", "eyeHeightCenter", "eyeHeightOuter",
    "epicanthus", "eyeFold", "browAngle", "mouthVerticalPosition",
    "mouthDepth", "cupidBow", "philtrumVolume", "cheekHeight",
    "cheekInnerVolume",
)

EXTRA_SIGNED_TARGETS = {
    "foreheadHeight": ("forehead/forehead-scale-vert-incr.target.gz", "forehead/forehead-scale-vert-decr.target.gz"),
    "foreheadProminence": ("forehead/forehead-trans-forward.target.gz", "forehead/forehead-trans-backward.target.gz"),
    "templeVolume": ("forehead/forehead-temple-incr.target.gz", "forehead/forehead-temple-decr.target.gz"),
    "browDepth": ("eyebrows/eyebrows-trans-forward.target.gz", "eyebrows/eyebrows-trans-backward.target.gz"),
    "noseBaseHeight": ("nose/nose-base-up.target.gz", "nose/nose-base-down.target.gz"),
    "noseCompression": ("nose/nose-compression-uncompress.target.gz", "nose/nose-compression-compress.target.gz"),
    "noseFlaring": ("nose/nose-flaring-incr.target.gz", "nose/nose-flaring-decr.target.gz"),
    "noseHump": ("nose/nose-hump-incr.target.gz", "nose/nose-hump-decr.target.gz"),
    "nostrilAngle": ("nose/nose-nostrils-angle-up.target.gz", "nose/nose-nostrils-angle-down.target.gz"),
    "noseTipWidth": ("nose/nose-point-width-incr.target.gz", "nose/nose-point-width-decr.target.gz"),
    "septumAngle": ("nose/nose-septumangle-incr.target.gz", "nose/nose-septumangle-decr.target.gz"),
    "noseWidthUpper": ("nose/nose-width1-incr.target.gz", "nose/nose-width1-decr.target.gz"),
    "noseWidthMiddle": ("nose/nose-width2-incr.target.gz", "nose/nose-width2-decr.target.gz"),
    "noseWidthLower": ("nose/nose-width3-incr.target.gz", "nose/nose-width3-decr.target.gz"),
    "mouthHeight": ("mouth/mouth-scale-vert-incr.target.gz", "mouth/mouth-scale-vert-decr.target.gz"),
    "mouthCornerAngle": ("mouth/mouth-angles-up.target.gz", "mouth/mouth-angles-down.target.gz"),
    "cupidBowWidth": ("mouth/mouth-cupidsbow-width-incr.target.gz", "mouth/mouth-cupidsbow-width-decr.target.gz"),
    "dimpleDepth": ("mouth/mouth-dimples-out.target.gz", "mouth/mouth-dimples-in.target.gz"),
    "laughLineDepth": ("mouth/mouth-laugh-lines-out.target.gz", "mouth/mouth-laugh-lines-in.target.gz"),
    "upperLipHeight": ("mouth/mouth-upperlip-height-incr.target.gz", "mouth/mouth-upperlip-height-decr.target.gz"),
    "upperLipWidth": ("mouth/mouth-upperlip-width-incr.target.gz", "mouth/mouth-upperlip-width-decr.target.gz"),
    "lowerLipHeight": ("mouth/mouth-lowerlip-height-incr.target.gz", "mouth/mouth-lowerlip-height-decr.target.gz"),
    "lowerLipWidth": ("mouth/mouth-lowerlip-width-incr.target.gz", "mouth/mouth-lowerlip-width-decr.target.gz"),
    "chinBone": ("chin/chin-bones-incr.target.gz", "chin/chin-bones-decr.target.gz"),
    "chinCleft": ("chin/chin-cleft-incr.target.gz", "chin/chin-cleft-decr.target.gz"),
}

EXTRA_PAIRED_TARGETS = {
    "eyeCornerInner": ("eyes/{side}-eye-corner1-up.target.gz", "eyes/{side}-eye-corner1-down.target.gz"),
    "eyeCornerOuter": ("eyes/{side}-eye-corner2-up.target.gz", "eyes/{side}-eye-corner2-down.target.gz"),
    "eyeBagVolume": ("eyes/{side}-eye-bag-incr.target.gz", "eyes/{side}-eye-bag-decr.target.gz"),
    "eyeBagDepth": ("eyes/{side}-eye-bag-out.target.gz", "eyes/{side}-eye-bag-in.target.gz"),
    "eyeBagHeight": ("eyes/{side}-eye-bag-height-incr.target.gz", "eyes/{side}-eye-bag-height-decr.target.gz"),
    "eyeFoldVertical": ("eyes/{side}-eye-eyefold-up.target.gz", "eyes/{side}-eye-eyefold-down.target.gz"),
    "eyeFoldAngle": ("eyes/{side}-eye-eyefold-angle-up.target.gz", "eyes/{side}-eye-eyefold-angle-down.target.gz"),
    "earScale": ("ears/{side}-ear-scale-incr.target.gz", "ears/{side}-ear-scale-decr.target.gz"),
    "earHeight": ("ears/{side}-ear-scale-vert-incr.target.gz", "ears/{side}-ear-scale-vert-decr.target.gz"),
    "earDepth": ("ears/{side}-ear-scale-depth-incr.target.gz", "ears/{side}-ear-scale-depth-decr.target.gz"),
    "earFlap": ("ears/{side}-ear-flap-incr.target.gz", "ears/{side}-ear-flap-decr.target.gz"),
    "earLobe": ("ears/{side}-ear-lobe-incr.target.gz", "ears/{side}-ear-lobe-decr.target.gz"),
    "earRotation": ("ears/{side}-ear-rot-forward.target.gz", "ears/{side}-ear-rot-backward.target.gz"),
    "earWing": ("ears/{side}-ear-wing-incr.target.gz", "ears/{side}-ear-wing-decr.target.gz"),
}

ARCHETYPES = (
    {
        "id": "fine-oval", "headShape": "oval",
        "headWidth": -0.28, "faceHeight": 0.34, "headDepth": -0.12,
        "jawWidth": -0.38, "chinHeight": 0.22, "chinProminence": 0.06,
        "noseWidth": -0.32, "noseLength": 0.32, "noseDepth": 0.20,
        "eyeSize": -0.06, "eyeSpacing": -0.10, "mouthWidth": -0.22,
        "lipFullness": -0.10, "cheekVolume": -0.16,
        "cheekboneProminence": 0.28, "cupidBow": 0.24,
    },
    {
        "id": "soft-round", "headShape": "round",
        "headWidth": 0.38, "faceHeight": -0.34, "headDepth": 0.22,
        "jawWidth": 0.18, "chinHeight": -0.28, "chinProminence": -0.22,
        "noseWidth": 0.20, "noseLength": -0.30, "noseDepth": -0.18,
        "eyeSize": 0.22, "eyeSpacing": 0.14, "mouthWidth": 0.16,
        "lipFullness": 0.22, "cheekVolume": 0.42,
        "cheekboneProminence": -0.18, "cheekInnerVolume": 0.22,
    },
    {
        "id": "broad-square", "headShape": "square",
        "headWidth": 0.34, "faceHeight": 0.04, "headDepth": 0.18,
        "jawWidth": 0.54, "chinHeight": -0.08, "chinProminence": 0.34,
        "chinPrognathism": 0.22, "noseWidth": 0.26, "noseLength": 0.06,
        "noseVolume": 0.28, "eyeSize": -0.20, "eyeSpacing": 0.12,
        "mouthWidth": 0.34, "lipFullness": -0.16, "cheekVolume": -0.18,
        "cheekboneProminence": 0.22,
    },
    {
        "id": "long-angular", "headShape": "rectangular",
        "headWidth": -0.10, "faceHeight": 0.52, "headDepth": 0.10,
        "jawWidth": 0.18, "chinHeight": 0.36, "chinProminence": 0.28,
        "chinPrognathism": 0.16, "noseWidth": -0.02, "noseLength": 0.50,
        "noseDepth": 0.30, "noseCurve": 0.24, "eyeSize": -0.18,
        "eyeSpacing": -0.12, "mouthWidth": 0.00, "lipFullness": -0.20,
        "cheekVolume": -0.28, "cheekboneProminence": 0.34,
    },
    {
        "id": "high-cheeked", "headShape": "diamond",
        "headWidth": -0.12, "faceHeight": 0.18, "headDepth": -0.06,
        "jawWidth": -0.42, "chinHeight": 0.18, "chinProminence": 0.08,
        "noseWidth": -0.16, "noseLength": 0.12, "eyeSize": 0.12,
        "eyeSpacing": 0.04, "mouthWidth": -0.12, "lipFullness": 0.14,
        "cheekVolume": -0.22, "cheekboneProminence": 0.58,
        "cheekHeight": 0.38, "epicanthus": 0.12,
    },
    {
        "id": "strong-jaw", "headShape": "triangular",
        "headWidth": 0.16, "faceHeight": 0.10, "headDepth": 0.08,
        "jawWidth": 0.46, "chinHeight": -0.10, "chinProminence": 0.12,
        "chinPrognathism": 0.30, "noseWidth": 0.28, "noseLength": -0.08,
        "noseDepth": 0.20, "eyeSize": -0.02, "eyeSpacing": 0.12,
        "mouthWidth": 0.24, "lipFullness": 0.02, "cheekVolume": 0.14,
        "cheekboneProminence": 0.02,
    },
    {
        "id": "tapered", "headShape": "invertedtriangular",
        "headWidth": 0.24, "faceHeight": 0.22, "headDepth": -0.08,
        "jawWidth": -0.52, "chinHeight": 0.32, "chinProminence": 0.06,
        "noseWidth": -0.18, "noseLength": 0.22, "noseDepth": -0.04,
        "eyeSize": 0.18, "eyeSpacing": 0.08, "mouthWidth": -0.16,
        "lipFullness": 0.18, "cheekVolume": -0.08,
        "cheekboneProminence": 0.38, "eyeHeightCenter": 0.18,
    },
    {
        "id": "aquiline", "headShape": "rectangular",
        "headWidth": -0.22, "faceHeight": 0.42, "headDepth": 0.16,
        "headAngle": -0.18, "jawWidth": -0.02, "chinHeight": 0.28,
        "chinProminence": 0.28, "chinPrognathism": 0.12,
        "noseWidth": -0.12, "noseLength": 0.62, "noseVolume": 0.22,
        "noseDepth": 0.56, "noseBridge": 0.42, "noseCurve": 0.44,
        "noseTipAngle": -0.24, "eyeSize": -0.16, "eyeSpacing": -0.08,
        "mouthWidth": -0.06, "lipFullness": -0.12,
        "cheekVolume": -0.22, "cheekboneProminence": 0.26,
    },
)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--cohort", choices=("narrow", "expanded", "broad", "all"), default="all")
    parser.add_argument("--narrow-count", type=int, default=24)
    parser.add_argument("--broad-count", type=int, default=36)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--skip-body", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def dynamic_import(package_suffix, symbol):
    for module_name in list(sys.modules):
        if module_name.endswith(package_suffix):
            module = importlib.import_module(module_name)
            if hasattr(module, symbol):
                return getattr(module, symbol)
    raise RuntimeError(f"MPFB module ending in {package_suffix!r} was not loaded")


def clamp(value, low=-0.82, high=0.82):
    return max(low, min(high, value))


def jittered_values(archetype, rng, strength=1.0):
    values = {name: 0.0 for name in (*PRIMARY_IDS, *DETAIL_IDS)}
    for name in values:
        center = float(archetype.get(name, 0.0)) * strength
        jitter = rng.gauss(0.0, 0.16 if name in PRIMARY_IDS else 0.20)
        values[name] = clamp(center + jitter)
    values["faceAsymmetry"] = clamp(0.035 + abs(rng.gauss(0.0, 0.035)), 0.0, 0.16)
    values["browHeight"] = clamp(rng.gauss(0.0, 0.12), -0.32, 0.32)
    values["headShape"] = archetype["headShape"]
    values["headShapeStrength"] = clamp(0.68 + rng.uniform(-0.08, 0.14), 0.50, 0.86)
    return values


def narrow_identity(index):
    rng = random.Random(f"mpfb-gate:narrow:{index}:1896")
    archetype = ARCHETYPES[index % len(ARCHETYPES)]
    values = jittered_values(archetype, rng, 1.0 + rng.uniform(-0.08, 0.18))
    values.update({
        "gender": 0.035,
        "age": 0.555,
        "muscle": 0.30,
        "weight": 0.49,
        "proportions": 0.49,
        "height": 0.47,
        "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
    })
    return {
        "id": f"N{index + 1:02d}",
        "cohort": "narrow",
        "label": archetype["id"],
        "sex": "female",
        "ageYears": 30,
        "ancestry": "held constant",
        "values": values,
    }


def expanded_identity(index):
    identity = narrow_identity(index)
    identity["id"] = f"E{index + 1:02d}"
    identity["cohort"] = "expanded"
    rng = random.Random(f"mpfb-gate:expanded:{index}:1896")
    values = identity["values"]
    for name in EXTRA_SIGNED_TARGETS:
        values[name] = clamp(rng.gauss(0.0, 0.28), -0.55, 0.55)
    for name in EXTRA_PAIRED_TARGETS:
        deviation = 0.18 if name.startswith("eyeBag") else 0.27
        values[name] = clamp(rng.gauss(0.0, deviation), -0.50, 0.50)
    # Split one broad nose and lip setting into independently varied zones.
    for name in ("noseWidthUpper", "noseWidthMiddle", "noseWidthLower"):
        values[name] = clamp(values["noseWidth"] * 0.38 + values[name] * 0.72, -0.52, 0.52)
    values["upperLipHeight"] = clamp(values["lipFullness"] * 0.34 + values["upperLipHeight"] * 0.74, -0.50, 0.50)
    values["lowerLipHeight"] = clamp(values["lipFullness"] * 0.34 + values["lowerLipHeight"] * 0.74, -0.50, 0.50)
    values["earShape"] = rng.choice(("round", "square", "triangle", "pointed"))
    values["earShapeStrength"] = rng.uniform(0.20, 0.42)
    values["asymTarget"] = rng.choice((
        "asym/asym-eye-2-l.target.gz", "asym/asym-eye-5-r.target.gz",
        "asym/asym-mouth-1-l.target.gz", "asym/asym-nose-2-r.target.gz",
        "asym/asym-jaw-2-l.target.gz", "asym/asym-temple-1-r.target.gz",
    ))
    values["asymStrength"] = rng.uniform(0.035, 0.095)
    return identity


def broad_identity(index):
    rng = random.Random(f"mpfb-gate:broad:{index}:1896")
    archetype = ARCHETYPES[(index * 5 + index // len(ARCHETYPES)) % len(ARCHETYPES)]
    values = jittered_values(archetype, rng, 0.92 + rng.uniform(-0.06, 0.22))
    sex = "female" if index % 2 == 0 else "male"
    ages = (22, 34, 47, 60, 73, 81)
    age_years = ages[(index // 2) % len(ages)]
    ancestries = (
        ("African", {"asian": 0.0, "caucasian": 0.0, "african": 1.0}),
        ("East Asian", {"asian": 1.0, "caucasian": 0.0, "african": 0.0}),
        ("European", {"asian": 0.0, "caucasian": 1.0, "african": 0.0}),
        ("African/European", {"asian": 0.0, "caucasian": 0.46, "african": 0.54}),
        ("Asian/European", {"asian": 0.52, "caucasian": 0.48, "african": 0.0}),
        ("mixed", {"asian": 0.22, "caucasian": 0.48, "african": 0.30}),
    )
    ancestry_label, race = ancestries[(index // 6 + index) % len(ancestries)]
    values.update({
        "gender": 0.035 if sex == "female" else 0.965,
        "age": clamp(0.50 + (age_years - 18) / 78 * 0.44, 0.50, 0.94),
        "muscle": clamp((0.29 if sex == "female" else 0.42) + rng.uniform(-0.12, 0.18), 0.18, 0.72),
        "weight": clamp(0.48 + rng.uniform(-0.24, 0.30), 0.22, 0.80),
        "proportions": clamp(0.50 + rng.uniform(-0.19, 0.19), 0.27, 0.73),
        "height": clamp((0.45 if sex == "female" else 0.55) + rng.uniform(-0.23, 0.23), 0.22, 0.78),
        "race": race,
    })
    return {
        "id": f"B{index + 1:02d}",
        "cohort": "broad",
        "label": archetype["id"],
        "sex": sex,
        "ageYears": age_years,
        "ancestry": ancestry_label,
        "values": values,
    }


def set_material(obj, material):
    if not obj.data.materials:
        obj.data.materials.append(material)
    else:
        for index in range(len(obj.data.materials)):
            obj.data.materials[index] = material


def make_principled(name, color, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    node = material.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1.0)
    node.inputs["Roughness"].default_value = roughness
    return material


def configure_alpha(obj):
    for material in obj.data.materials:
        if not material:
            continue
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        elif hasattr(material, "blend_method"):
            material.blend_method = "HASHED"


def tint_materials(obj, color, roughness):
    """Tint fitted alpha assets without replacing MPFB's fragile material slots."""
    for material in obj.data.materials:
        if not material or not material.use_nodes:
            continue
        node = material.node_tree.nodes.get("Principled BSDF")
        if not node:
            continue
        node.inputs["Base Color"].default_value = (*color, 1.0)
        node.inputs["Roughness"].default_value = roughness


def tag_character(*objects):
    for obj in objects:
        if obj:
            obj["mpfb_identity_gate"] = True


def delete_character():
    for obj in list(bpy.context.scene.objects):
        if obj.get("mpfb_identity_gate"):
            bpy.data.objects.remove(obj, do_unlink=True)


def body_world_coordinates(base):
    matrix = base.matrix_world
    return np.asarray([tuple(matrix @ vertex.co) for vertex in base.data.vertices[:BODY_VERTEX_END]], dtype=np.float64)


def add_expanded_targets(TargetService, LocationService, base, values):
    root = LocationService.get_mpfb_data("targets")
    for name, paths in EXTRA_SIGNED_TARGETS.items():
        common.load_signed_target(TargetService, root, base, name, values.get(name, 0.0), *paths)
    for name, templates in EXTRA_PAIRED_TARGETS.items():
        for side in ("l", "r"):
            paths = tuple(template.format(side=side) for template in templates)
            common.load_signed_target(TargetService, root, base, f"{name}_{side}", values.get(name, 0.0), *paths)
    ear_shape = values.get("earShape", "round")
    for side in ("l", "r"):
        path = os.path.join(root, "ears", f"{side}-ear-shape-{ear_shape}.target.gz")
        TargetService.load_target(base, path, weight=values.get("earShapeStrength", 0.28), name=f"earShape_{side}")
    asymmetry_path = os.path.join(root, values["asymTarget"])
    TargetService.load_target(base, asymmetry_path, weight=values["asymStrength"], name="expandedAsymmetry")


def add_identity(HumanService, TargetService, AssetService, LocationService, identity, materials):
    values = identity["values"]
    base = HumanService.create_human(macro_detail_dict={
        "gender": values["gender"],
        "age": values["age"],
        "muscle": values["muscle"],
        "weight": values["weight"],
        "proportions": values["proportions"],
        "height": values["height"],
        "cupsize": 0.42,
        "firmness": 0.48,
        "race": values["race"],
    })
    base.name = f"Gate_{identity['id']}_Body"
    common.add_face_targets(TargetService, LocationService, base, values)
    if identity["cohort"] == "expanded":
        add_expanded_targets(TargetService, LocationService, base, values)
    TargetService.bake_targets(base)
    set_material(base, materials["skin"])
    for polygon in base.data.polygons:
        polygon.use_smooth = True

    eye_path = common.find_asset(AssetService, "high-poly.mhclo", "eyes")
    eyes = HumanService.add_mhclo_asset(
        eye_path,
        base,
        asset_type="Eyes",
        material_type="GAMEENGINE",
        alternative_materials={EYE_ASSET_UUID: "materials/brown.mhmat"},
    )
    eyes.name = f"Gate_{identity['id']}_Eyes"
    brows = common.add_asset(HumanService, AssetService, base, "eyebrows", "eyebrow004.mhclo", "Eyebrows", f"Gate_{identity['id']}_Brows")
    lashes = common.add_asset(HumanService, AssetService, base, "eyelashes", "eyelashes02.mhclo", "Eyelashes", f"Gate_{identity['id']}_Lashes")
    if eyes:
        for polygon in eyes.data.polygons:
            polygon.use_smooth = True
    if brows:
        tint_materials(brows, (0.065, 0.045, 0.035), 0.88)
        configure_alpha(brows)
    if lashes:
        tint_materials(lashes, (0.025, 0.020, 0.018), 0.82)
        configure_alpha(lashes)
    tag_character(base, eyes, brows, lashes)
    bpy.context.view_layer.update()
    return base, [obj for obj in (eyes, brows, lashes) if obj]


def point_camera(camera, target):
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def render_identity(output_dir, identity, base, attachments, camera, view, skip_body):
    coords = body_world_coordinates(base)
    head_top = float(coords[:, 2].max())
    head_center = Vector((0.0, -0.005, head_top - 0.135))
    if view == "front":
        camera.location = (0.0, -0.72, head_center.z + 0.005)
        camera.data.lens = 76
        resolution = (360, 440)
    elif view == "three-quarter":
        camera.location = (0.43, -0.66, head_center.z + 0.015)
        camera.data.lens = 76
        resolution = (360, 440)
    else:
        if skip_body:
            return
        body_center_z = float((coords[:, 2].min() + coords[:, 2].max()) * 0.5)
        body_center = Vector((0.0, 0.0, body_center_z))
        camera.location = (0.0, -3.65, body_center_z + 0.02)
        camera.data.lens = 62
        resolution = (300, 480)
        point_camera(camera, body_center)
    if view != "body":
        point_camera(camera, head_center)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = os.path.join(output_dir, identity["cohort"], f"{identity['id']}-{view}.png")
    bpy.ops.render.render(write_still=True)


def normalized_head_shape(coords, indices):
    points = coords[indices]
    centered = points - points.mean(axis=0)
    scale = math.sqrt(float(np.mean(np.sum(centered * centered, axis=1))))
    return centered / max(scale, 1e-9)


def shape_metrics(entries, shapes):
    distances = []
    nearest = {}
    for index, left in enumerate(shapes):
        best = None
        for other_index, right in enumerate(shapes):
            if index == other_index:
                continue
            distance = math.sqrt(float(np.mean(np.sum((left - right) ** 2, axis=1))))
            distances.append(distance) if other_index > index else None
            if best is None or distance < best[0]:
                best = (distance, entries[other_index]["id"])
        nearest[entries[index]["id"]] = {"id": best[1], "distance": round(best[0], 6)}
    distances.sort()
    return {
        "pairCount": len(distances),
        "minimum": round(distances[0], 6),
        "median": round(distances[len(distances) // 2], 6),
        "maximum": round(distances[-1], 6),
        "nearest": nearest,
    }


def setup_stage(output_dir):
    common.clear_scene()
    os.makedirs(output_dir, exist_ok=True)
    for cohort in ("narrow", "broad"):
        os.makedirs(os.path.join(output_dir, cohort), exist_ok=True)
    materials = {
        "skin": make_principled("Gate neutral clay", (0.49, 0.39, 0.32), 0.72),
        "brows": make_principled("Gate neutral brows", (0.065, 0.045, 0.035), 0.88),
        "lashes": make_principled("Gate neutral lashes", (0.025, 0.020, 0.018), 0.82),
    }
    bpy.ops.object.camera_add(location=(0.0, -0.72, 1.58))
    camera = bpy.context.object
    camera.data.dof.use_dof = False
    bpy.context.scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(-0.65, -1.05, 2.35))
    key = bpy.context.object
    key.data.energy = 135
    key.data.shape = "DISK"
    key.data.size = 1.15
    key.data.color = (1.0, 0.78, 0.62)
    point_camera(key, Vector((0.0, 0.0, 1.50)))
    bpy.ops.object.light_add(type="AREA", location=(0.75, -0.55, 1.85))
    fill = bpy.context.object
    fill.data.energy = 62
    fill.data.size = 1.35
    fill.data.color = (0.60, 0.72, 1.0)
    point_camera(fill, Vector((0.0, 0.0, 1.48)))
    bpy.ops.object.light_add(type="AREA", location=(0.20, 0.65, 2.10))
    rim = bpy.context.object
    rim.data.energy = 88
    rim.data.size = 0.90
    rim.data.color = (1.0, 0.72, 0.48)
    point_camera(rim, Vector((0.0, 0.0, 1.58)))
    world = bpy.data.worlds.new("Identity gate world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.055, 0.060, 0.067, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.16
    bpy.context.scene.world = world
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    return camera, materials


def main():
    args = arguments()
    output_dir = os.path.abspath(args.output_dir)
    import bl_ext.user_default.mpfb  # noqa: F401
    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")
    AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
    LocationService = dynamic_import("mpfb.services.locationservice", "LocationService")
    camera, materials = setup_stage(output_dir)

    cohorts = []
    if args.cohort in ("narrow", "all"):
        cohorts.append(("narrow", [narrow_identity(index) for index in range(args.narrow_count)]))
    if args.cohort == "expanded":
        cohorts.append(("expanded", [expanded_identity(index) for index in range(args.narrow_count)]))
    if args.cohort in ("broad", "all"):
        cohorts.append(("broad", [broad_identity(index) for index in range(args.broad_count)]))
    if args.limit:
        cohorts = [(name, identities[:args.limit]) for name, identities in cohorts]

    manifest = {"pipeline": PIPELINE, "cohorts": {}, "render": {"hair": "none", "material": "neutral clay", "expression": "neutral"}}
    for cohort_name, identities in cohorts:
        entries = []
        shapes = []
        head_indices = None
        for index, identity in enumerate(identities):
            delete_character()
            base, attachments = add_identity(HumanService, TargetService, AssetService, LocationService, identity, materials)
            coords = body_world_coordinates(base)
            if head_indices is None:
                head_top = float(coords[:, 2].max())
                head_indices = np.flatnonzero(coords[:, 2] > head_top - 0.285)
            shapes.append(normalized_head_shape(coords, head_indices))
            render_identity(output_dir, identity, base, attachments, camera, "front", args.skip_body)
            render_identity(output_dir, identity, base, attachments, camera, "three-quarter", args.skip_body)
            if cohort_name == "broad":
                render_identity(output_dir, identity, base, attachments, camera, "body", args.skip_body)
            entry = {key: value for key, value in identity.items() if key != "values"}
            entry["values"] = identity["values"]
            entries.append(entry)
            print(f"IDENTITY_GATE {cohort_name} {index + 1}/{len(identities)} {identity['id']} {identity['label']}", flush=True)
        manifest["cohorts"][cohort_name] = {
            "count": len(entries),
            "headVertexCount": int(len(head_indices)),
            "geometry": shape_metrics(entries, shapes),
            "entries": entries,
        }
    delete_character()
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"MPFB_IDENTITY_GATE_OK {manifest_path}")


if __name__ == "__main__":
    main()

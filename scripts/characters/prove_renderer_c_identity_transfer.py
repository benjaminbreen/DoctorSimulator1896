"""Run the Renderer C head-identity transfer proof without touching the game.

The proof first renders one complete MPFB patient at head distance. A later
stage applies one GNM-derived deformation to the same MPFB topology before the
eyes, brows, lashes, hair, teeth, rig, and garment are fitted.
"""

import argparse
import importlib
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import generate_patient as common
import generate_renderer_c as renderer_c
import render_mpfb_identity_diversity as identity_gate


PIPELINE = "renderer-c-identity-transfer-proof-v1"
DEFAULT_GNM = "/private/tmp/gnm-head-proof/gnm/shape/data/versions/v3_0/gnm_head.npz"


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--gnm-npz", default=DEFAULT_GNM)
    parser.add_argument("--mode", choices=("baseline", "donors", "transfer", "all"), default="baseline")
    parser.add_argument("--donor-count", type=int, default=12)
    parser.add_argument("--donor-index", type=int, default=8)
    parser.add_argument("--donor-source", choices=("semantic", "raw"), default="semantic")
    parser.add_argument("--semantic-diversity", type=float, default=1.65)
    parser.add_argument("--semantic-gender", choices=("female", "male"), default="female")
    parser.add_argument("--mpfb-identity-index", type=int, default=1)
    parser.add_argument("--mpfb-identity-strength", type=float, default=1.0)
    parser.add_argument("--transfer-strength", type=float, default=0.78)
    parser.add_argument("--eye-mode", choices=("safe", "adaptive", "none"), default="safe")
    parser.add_argument("--expression-mode", choices=("push-forward", "legacy"), default="push-forward")
    parser.add_argument("--blink-scale", type=float, default=1.0)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def dynamic_import(package_suffix, symbol):
    for module_name in list(sys.modules):
        if module_name.endswith(package_suffix):
            module = importlib.import_module(module_name)
            if hasattr(module, symbol):
                return getattr(module, symbol)
    raise RuntimeError(f"MPFB module ending in {package_suffix!r} was not loaded")


def point_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_stage(output_dir):
    common.clear_scene()
    os.makedirs(output_dir, exist_ok=True)

    bpy.ops.object.camera_add(location=(0.0, -0.74, 1.62))
    camera = bpy.context.object
    camera.name = "Proof_Camera"
    camera.data.lens = 80
    camera.data.dof.use_dof = False
    bpy.context.scene.camera = camera

    for name, location, energy, size, color in (
        ("Key", (-0.58, -0.92, 2.12), 115, 0.85, (1.0, 0.78, 0.64)),
        ("Fill", (0.62, -0.50, 1.78), 52, 1.05, (0.64, 0.76, 1.0)),
        ("Rim", (0.30, 0.42, 2.05), 78, 0.75, (1.0, 0.70, 0.48)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = f"Proof_{name}"
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        point_at(light, Vector((0.0, 0.0, 1.63)))

    world = bpy.data.worlds.new("Renderer C proof world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.028, 0.033, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.11
    bpy.context.scene.world = world

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 560
    scene.render.resolution_y = 680
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.72
    return camera


def proof_identity(identity_index=1, identity_strength=1.0):
    if identity_index < 1:
        raise ValueError("MPFB identity indices are one-based")
    identity = identity_gate.expanded_identity(identity_index - 1)
    values = identity["values"]
    structural_ids = (
        *identity_gate.PRIMARY_IDS,
        *identity_gate.DETAIL_IDS,
        *identity_gate.EXTRA_SIGNED_TARGETS.keys(),
        *identity_gate.EXTRA_PAIRED_TARGETS.keys(),
    )
    for parameter_id in structural_ids:
        if parameter_id in values:
            values[parameter_id] = float(values[parameter_id]) * identity_strength
    for parameter_id in ("headShapeStrength", "earShapeStrength", "asymStrength", "faceAsymmetry"):
        if parameter_id in values:
            values[parameter_id] = float(values[parameter_id]) * identity_strength
    identity["id"] = "baseline"
    values.update({
        "gender": 0.025,
        "age": 0.555,
        "muscle": 0.27,
        "weight": 0.48,
        "proportions": 0.49,
        "height": 0.47,
        "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
        # The stock `brown` iris is red-orange. This selects MPFB's more
        # natural brownlight/hazel texture for the proof.
        "eyeColor": "#75502a",
        "browArch": 0.24,
        "browDensity": 0.78,
        "lashDensity": 0.72,
        "hairStyle": "low-bun",
        "hairColor": "#322117",
        "dressColor": "#183326",
        "fabricRoughness": 0.84,
    })
    return identity


def load_gnm(path):
    if not os.path.exists(path):
        raise RuntimeError(f"GNM model not found: {path}")
    data = np.load(path)
    group_names = [str(name) for name in data["vertex_group_names"]]
    groups = data["vertex_groups"]
    return {
        "template": data["template_vertex_positions"].astype(np.float64),
        "identityBasis": data["vertex_identity_basis"].astype(np.float64),
        "triangles": data["triangles"].astype(np.int32),
        "skin": groups[group_names.index("skin_exterior")] > 0.5,
        "eyes": groups[group_names.index("eyes")] > 0.5,
    }


def raw_donor_coefficients(index):
    rng = np.random.default_rng(189600 + index * 7919)
    coefficients = np.zeros(253, dtype=np.float64)
    coefficients[:170] = np.clip(rng.normal(0.0, 0.82, 170), -2.1, 2.1)
    return coefficients


def semantic_decoder_path(gnm_path):
    data_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(gnm_path))))
    return os.path.join(data_root, "semantic_sampler", "identity_decoder_model.h5")


def run_semantic_decoder(latent, gnm_path, semantic_gender="female"):
    """Run GNM's female + White semantic decoder without TensorFlow.

    The released decoder is only a short stack of dense ReLU layers. Reading
    those weights directly keeps this offline proof small and deterministic.
    """
    try:
        import h5py
    except ImportError:
        temporary_h5py = "/private/tmp/gnm-h5py"
        if os.path.isdir(temporary_h5py):
            sys.path.insert(0, temporary_h5py)
            import h5py
        else:
            raise RuntimeError("Semantic GNM sampling requires h5py")

    # GNM label order: female, male, Middle Eastern, Asian, White, Black.
    gender_labels = (1.0, 0.0) if semantic_gender == "female" else (0.0, 1.0)
    labels = np.asarray((*gender_labels, 0.0, 0.0, 1.0, 0.0), dtype=np.float32)
    values = np.concatenate((np.asarray(latent, dtype=np.float32), labels))[None, :]
    decoder_path = semantic_decoder_path(gnm_path)
    with h5py.File(decoder_path, "r") as decoder:
        for layer_index in range(4, 9):
            prefix = f"model_weights/dense_{layer_index}/dense_{layer_index}"
            kernel = decoder[f"{prefix}/kernel:0"][()]
            bias = decoder[f"{prefix}/bias:0"][()]
            values = values @ kernel + bias
            if layer_index < 8:
                values = np.maximum(values, 0.0)
    return values[0].astype(np.float64)


def semantic_donor_coefficients(index, gnm_path, diversity, semantic_gender="female"):
    rng = np.random.default_rng(189600 + index * 7919)
    sample = run_semantic_decoder(rng.normal(size=64), gnm_path, semantic_gender)
    cohort_center = run_semantic_decoder(np.zeros(64, dtype=np.float32), gnm_path, semantic_gender)
    # Amplify individuality around the conditioned cohort mean, not distance
    # from GNM's all-population template. This keeps category conditioning while
    # avoiding a row of nearly identical average faces.
    return cohort_center + (sample - cohort_center) * diversity


def donor_coefficients(index, gnm_path, source, semantic_diversity, semantic_gender="female"):
    if source == "semantic":
        return semantic_donor_coefficients(index, gnm_path, semantic_diversity, semantic_gender)
    return raw_donor_coefficients(index)


def gnm_vertices(gnm, coefficients):
    return gnm["template"] + np.einsum("i,ijk->jk", coefficients, gnm["identityBasis"], optimize=True)


def transform_gnm_vertices(vertices):
    # GNM: X right, Y up, Z forward. MPFB/Blender: X right, Z up, -Y forward.
    transformed = np.column_stack((vertices[:, 0], -vertices[:, 2], vertices[:, 1]))
    skin_center = transformed.mean(axis=0)
    transformed[:, 0] -= skin_center[0]
    transformed[:, 1] -= skin_center[1]
    transformed[:, 2] += 1.63 - skin_center[2]
    return transformed


def make_gnm_object(gnm, coefficients, name):
    vertices = transform_gnm_vertices(gnm_vertices(gnm, coefficients))
    visible = gnm["skin"] | gnm["eyes"]
    triangles = gnm["triangles"]
    triangles = triangles[np.all(visible[triangles], axis=1)]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices.tolist(), [], triangles.tolist())
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    skin_material = common.material("GNM donor clay", "#bb8d78", 0.68)
    obj.data.materials.append(skin_material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj, vertices


def render_donor_candidates(
    output_dir, camera, gnm_path, count, donor_source, semantic_diversity, semantic_gender="female"
):
    gnm = load_gnm(gnm_path)
    scene = bpy.context.scene
    scene.render.resolution_x = 420
    scene.render.resolution_y = 500
    camera.data.lens = 76
    paths = []
    entries = []
    for index in range(count):
        coefficients = donor_coefficients(index, gnm_path, donor_source, semantic_diversity, semantic_gender)
        obj, vertices = make_gnm_object(gnm, coefficients, f"GNM_Donor_{index + 1:02d}")
        camera.location = (0.0, -0.66, 1.64)
        point_at(camera, Vector((0.0, 0.0, 1.63)))
        path = os.path.join(output_dir, f"donor-{index + 1:02d}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        skin_vertices = vertices[gnm["skin"]]
        entries.append({
            "id": f"D{index + 1:02d}",
            "source": donor_source,
            "semanticDiversity": semantic_diversity if donor_source == "semantic" else None,
            "semanticGender": semantic_gender if donor_source == "semantic" else None,
            "coefficientSeed": 189600 + index * 7919,
            "coefficientRms": float(np.sqrt(np.mean(coefficients[:170] ** 2))),
            "bounds": {
                "minimum": skin_vertices.min(axis=0).round(6).tolist(),
                "maximum": skin_vertices.max(axis=0).round(6).tolist(),
            },
            "render": path,
        })
        paths.append(path)
        bpy.data.objects.remove(obj, do_unlink=True)
    return entries, paths


def similarity_transform(source, target):
    source_center = source.mean(axis=0)
    target_center = target.mean(axis=0)
    source_zero = source - source_center
    target_zero = target - target_center
    covariance = source_zero.T @ target_zero / max(1, len(source))
    left, singular, right = np.linalg.svd(covariance)
    rotation = right.T @ left.T
    if np.linalg.det(rotation) < 0:
        right[-1, :] *= -1
        rotation = right.T @ left.T
    variance = float(np.mean(np.sum(source_zero * source_zero, axis=1)))
    scale = float(singular.sum() / max(variance, 1e-12))
    translation = target_center - scale * (rotation @ source_center)
    return scale, rotation, translation


def transform_points(points, scale, rotation, translation):
    return scale * (points @ rotation.T) + translation


def build_kdtree(points):
    tree = KDTree(len(points))
    for index, point in enumerate(points):
        tree.insert(tuple(point), index)
    tree.balance()
    return tree


def align_gnm_to_mpfb(gnm_template, gnm_skin, mpfb_head):
    source = np.column_stack((gnm_template[:, 0], -gnm_template[:, 2], gnm_template[:, 1]))
    source_skin = source[gnm_skin]

    source_range = source_skin.max(axis=0) - source_skin.min(axis=0)
    target_range = mpfb_head.max(axis=0) - mpfb_head.min(axis=0)
    scale = float(target_range[2] / max(source_range[2], 1e-9))
    rotation = np.eye(3)
    translation = mpfb_head.mean(axis=0) - scale * source_skin.mean(axis=0)
    transformed = transform_points(source_skin, scale, rotation, translation)

    target_sample = mpfb_head[:: max(1, len(mpfb_head) // 3200)]
    target_tree = build_kdtree(target_sample)
    source_sample_indices = np.arange(0, len(source_skin), max(1, len(source_skin) // 3200))
    for _ in range(10):
        current_sample = transformed[source_sample_indices]
        matched = []
        distances = []
        for point in current_sample:
            nearest, _, distance = target_tree.find(tuple(point))
            matched.append(tuple(nearest))
            distances.append(distance)
        matched = np.asarray(matched, dtype=np.float64)
        distances = np.asarray(distances, dtype=np.float64)
        cutoff = float(np.quantile(distances, 0.68))
        keep = distances <= cutoff
        incremental_scale, incremental_rotation, incremental_translation = similarity_transform(
            current_sample[keep], matched[keep]
        )
        transformed = transform_points(transformed, incremental_scale, incremental_rotation, incremental_translation)
        rotation = incremental_rotation @ rotation
        translation = incremental_scale * (incremental_rotation @ translation) + incremental_translation
        scale *= incremental_scale

    final_tree = build_kdtree(target_sample)
    final_distances = [final_tree.find(tuple(point))[2] for point in transformed[::8]]
    return {
        "sourceAxis": source,
        "scale": scale,
        "rotation": rotation,
        "translation": translation,
        "rms": float(np.sqrt(np.mean(np.square(final_distances)))),
        "median": float(np.median(final_distances)),
    }


def mesh_adjacency(mesh, allowed):
    allowed_set = set(int(index) for index in allowed)
    adjacency = {int(index): set() for index in allowed}
    for edge in mesh.edges:
        left, right = (int(value) for value in edge.vertices)
        if left in allowed_set and right in allowed_set:
            adjacency[left].add(right)
            adjacency[right].add(left)
    return adjacency


def smooth_deltas(deltas, adjacency, iterations=2, factor=0.24):
    result = deltas.copy()
    for _ in range(iterations):
        previous = result.copy()
        for index, neighbors in adjacency.items():
            if not neighbors:
                continue
            average = previous[list(neighbors)].mean(axis=0)
            result[index] = previous[index] * (1.0 - factor) + average * factor
    return result


def deformation_gradients(points, deltas, adjacency, active_indices):
    """Estimate a local affine derivative for the transferred identity field."""
    gradients = np.zeros((len(points), 3, 3), dtype=np.float64)
    for index in active_indices:
        neighbors = list(adjacency.get(int(index), ()))
        if len(neighbors) < 3:
            continue
        offsets = points[neighbors] - points[index]
        delta_offsets = deltas[neighbors] - deltas[index]
        matrix, _, _, _ = np.linalg.lstsq(offsets, delta_offsets, rcond=None)
        # Nearest-surface transfer can create small local spikes. A conservative
        # derivative limit preserves expression motion without amplifying it.
        magnitude = float(np.linalg.norm(matrix))
        if magnitude > 0.55:
            matrix *= 0.55 / magnitude
        gradients[index] = matrix
    return gradients


def push_forward_face_units(base, gradients):
    """Transport MPFB expression deltas through the new identity geometry."""
    keys = getattr(base.data, "shape_keys", None)
    if not keys:
        return 0
    basis = keys.key_blocks[0]
    changed = 0
    for key in keys.key_blocks[1:]:
        for index, point in enumerate(key.data):
            delta = np.asarray(tuple(point.co - basis.data[index].co), dtype=np.float64)
            if float(np.dot(delta, delta)) < 1e-14:
                continue
            transported = delta + delta @ gradients[index]
            point.co = basis.data[index].co + Vector(tuple(transported))
            changed += 1
    return changed


def eye_blink_protection(targets_root, vertex_count, mode):
    protection = np.zeros(vertex_count, dtype=np.float64)
    if mode == "none":
        return protection
    for filename in ("eyeBlinkLeft.target", "eyeBlinkRight.target"):
        path = os.path.join(targets_root, "faceunits", filename)
        if not os.path.exists(path):
            path = path.replace(f"{os.sep}extensions{os.sep}user_default", f"{os.sep}extensions{os.sep}.user{os.sep}user_default")
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                parts = line.split()
                if len(parts) < 4:
                    continue
                index = int(parts[0])
                if index >= vertex_count:
                    continue
                magnitude = float(np.linalg.norm(np.asarray(parts[1:4], dtype=np.float64)))
                if mode == "safe" and magnitude > 1e-7:
                    protection[index] = 1.0
                elif mode == "adaptive":
                    protection[index] = max(protection[index], np.clip((magnitude - 0.003) / 0.025, 0.0, 1.0))
    return protection


def apply_gnm_transfer(
    base,
    gnm_path,
    donor_index,
    donor_source,
    semantic_diversity,
    semantic_gender,
    strength,
    target_path,
    targets_root,
    eye_mode,
    transfer_state,
):
    if os.path.exists(target_path):
        # The target file stores exactly the deltas a previous run applied, so
        # reusing it reproduces the shipped anchor without the GNM source,
        # which lives outside the repo and does not survive a /tmp wipe.
        applied_deltas = []
        with open(target_path, "r", encoding="utf-8") as handle:
            for line in handle:
                parts = line.split()
                delta = Vector((float(parts[1]), float(parts[2]), float(parts[3])))
                base.data.vertices[int(parts[0])].co += delta
                applied_deltas.append(tuple(delta))
        base.data.update()
        bpy.context.view_layer.update()
        norms = np.linalg.norm(np.asarray(applied_deltas, dtype=np.float64), axis=1) if applied_deltas else np.zeros(1)
        print(f"GNM_TRANSFER_CACHED target={target_path} vertices={len(applied_deltas)}")
        return {
            "donor": f"D{donor_index:02d}",
            "donorSource": donor_source,
            "semanticDiversity": semantic_diversity if donor_source == "semantic" else None,
            "semanticGender": semantic_gender if donor_source == "semantic" else None,
            "strength": strength,
            "target": target_path,
            "appliedVertexCount": int(len(applied_deltas)),
            "deltaRms": float(np.sqrt(np.mean(norms**2))),
            "deltaMaximum": float(norms.max()),
            "alignmentRms": None,
            "alignmentMedian": None,
            "nearestTemplateMedian": None,
            "protectedEyeVertexCount": None,
            "eyeMode": eye_mode,
            "cached": True,
        }

    gnm = load_gnm(gnm_path)
    coefficients = donor_coefficients(
        donor_index - 1, gnm_path, donor_source, semantic_diversity, semantic_gender
    )
    donor = gnm_vertices(gnm, coefficients)
    template = gnm["template"]

    mpfb = np.asarray([tuple(vertex.co) for vertex in base.data.vertices], dtype=np.float64)
    body = mpfb[: identity_gate.BODY_VERTEX_END]
    head_top = float(body[:, 2].max())
    # Include the head and upper neck but exclude shoulders and the hidden helpers.
    head_indices = np.flatnonzero(body[:, 2] > head_top - 0.335)
    mpfb_head = body[head_indices]
    alignment = align_gnm_to_mpfb(template, gnm["skin"], mpfb_head)

    source_template = alignment["sourceAxis"]
    aligned_template = transform_points(
        source_template,
        alignment["scale"],
        alignment["rotation"],
        alignment["translation"],
    )
    source_donor = np.column_stack((donor[:, 0], -donor[:, 2], donor[:, 1]))
    aligned_donor = transform_points(
        source_donor,
        alignment["scale"],
        alignment["rotation"],
        alignment["translation"],
    )
    donor_delta = aligned_donor - aligned_template

    skin_indices = np.flatnonzero(gnm["skin"])
    skin_tree = build_kdtree(aligned_template[skin_indices])
    mapped = np.zeros_like(mpfb)
    nearest_distances = []
    for vertex_index in head_indices:
        _, nearest_local, distance = skin_tree.find(tuple(mpfb[vertex_index]))
        mapped[vertex_index] = donor_delta[skin_indices[nearest_local]]
        nearest_distances.append(distance)

    adjacency = mesh_adjacency(base.data, head_indices)
    mapped = smooth_deltas(mapped, adjacency)
    protection = eye_blink_protection(targets_root, len(mpfb), eye_mode)
    # Feather the protected lid loop into the surrounding orbit. The existing
    # MPFB blink deltas then remain a valid closure rather than crumpling.
    for _ in range(1):
        previous = protection.copy()
        for index, neighbors in adjacency.items():
            if neighbors:
                protection[index] = max(previous[index], max(previous[list(neighbors)]) * 0.48)
    neck_start = head_top - 0.335
    neck_full = head_top - 0.265
    for vertex_index in head_indices:
        fade = np.clip((mpfb[vertex_index, 2] - neck_start) / (neck_full - neck_start), 0.0, 1.0)
        face_height = np.clip((mpfb[vertex_index, 2] - neck_full) / max(head_top - neck_full, 1e-9), 0.0, 1.0)
        # The lower face is where a raw nearest-surface transfer most easily
        # turns a valid donor into an oversized jaw. Preserve useful chin and
        # mouth differences, but let the sockets, nose, cheeks, and skull carry
        # more of the identity signal.
        lower_face_balance = 0.55 + 0.45 * np.clip((face_height - 0.32) / 0.20, 0.0, 1.0)
        upper_skull_balance = 1.0 - 0.18 * np.clip((face_height - 0.82) / 0.18, 0.0, 1.0)
        regional_balance = lower_face_balance * upper_skull_balance
        delta = mapped[vertex_index] * strength * fade * regional_balance * (1.0 - protection[vertex_index])
        length = float(np.linalg.norm(delta))
        if length > 0.018:
            delta *= 0.018 / length
        mapped[vertex_index] = delta
        base.data.vertices[vertex_index].co += Vector(tuple(delta))
    base.data.update()
    bpy.context.view_layer.update()

    with open(target_path, "w", encoding="utf-8") as handle:
        for vertex_index in head_indices:
            delta = mapped[vertex_index]
            if float(np.linalg.norm(delta)) > 1e-7:
                handle.write(f"{vertex_index} {delta[0]:.8f} {delta[1]:.8f} {delta[2]:.8f}\n")

    applied = mapped[head_indices]
    transfer_state["gradients"] = deformation_gradients(mpfb, mapped, adjacency, head_indices)
    return {
        "donor": f"D{donor_index:02d}",
        "donorSource": donor_source,
        "semanticDiversity": semantic_diversity if donor_source == "semantic" else None,
        "semanticGender": semantic_gender if donor_source == "semantic" else None,
        "strength": strength,
        "target": target_path,
        "appliedVertexCount": int(np.count_nonzero(np.linalg.norm(applied, axis=1) > 1e-7)),
        "deltaRms": float(np.sqrt(np.mean(np.sum(applied * applied, axis=1)))),
        "deltaMaximum": float(np.linalg.norm(applied, axis=1).max()),
        "alignmentRms": alignment["rms"],
        "alignmentMedian": alignment["median"],
        "nearestTemplateMedian": float(np.median(nearest_distances)),
        "protectedEyeVertexCount": int(np.count_nonzero(protection > 0.1)),
        "eyeMode": eye_mode,
    }


def add_complete_patient(services, identity, variant, transfer=None, expression_corrector=None):
    HumanService, TargetService, AssetService, LocationService, FaceService = services
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
    base.name = f"Proof_{variant}_Body"
    common.add_face_targets(TargetService, LocationService, base, values)
    identity_gate.add_expanded_targets(TargetService, LocationService, base, values)
    TargetService.bake_targets(base)
    transfer_metrics = transfer(base) if transfer else None

    skin_path = common.find_asset(AssetService, "young_caucasian_female.mhmat", "skins")
    HumanService.set_character_skin(skin_path, base, skin_type="GAMEENGINE")
    for polygon in base.data.polygons:
        polygon.use_smooth = True

    if not FaceService.is_faceunits01_installed(force_recheck=True):
        raise RuntimeError("The proof requires MPFB faceunits01")
    FaceService.load_targets(
        base,
        load_microsoft_visemes=False,
        load_meta_visemes=False,
        load_arkit_faceunits=True,
    )
    corrected_points = expression_corrector(base) if expression_corrector else 0
    rig = HumanService.add_builtin_rig(base, "game_engine")
    rig.name = f"Proof_{variant}_Rig"

    eyes = renderer_c.add_eyes(HumanService, AssetService, base, values, "consultation")
    eyes.name = f"Proof_{variant}_Eyes"
    brows = renderer_c.add_named_asset(
        HumanService, AssetService, base, "eyebrows", "eyebrow003.mhclo", "Eyebrows", f"Proof_{variant}_Brows"
    )
    lashes = renderer_c.add_named_asset(
        HumanService, AssetService, base, "eyelashes", "eyelashes03.mhclo", "Eyelashes", f"Proof_{variant}_Lashes"
    )
    teeth = renderer_c.add_named_asset(
        HumanService, AssetService, base, "teeth", "teeth_base.mhclo", "Teeth", f"Proof_{variant}_Teeth"
    )
    hair = common.add_authored_hair(HumanService, base)
    hair.name = f"Proof_{variant}_Hair"
    garment = renderer_c.add_named_asset(
        HumanService,
        AssetService,
        base,
        "clothes",
        "female_elegantsuit01.mhclo",
        "Clothes",
        f"Proof_{variant}_Garment",
    )
    renderer_c.set_material_override(garment, f"Proof_{variant}_GarmentMaterial", "#183326", 0.84)

    fitted = [eyes, brows, lashes, teeth, hair, garment]
    FaceService.interpolate_targets(base)
    renderer_c.configure_alpha_asset(brows, 0.22, False)
    renderer_c.configure_alpha_asset(lashes, 0.36, False)
    renderer_c.configure_alpha_asset(hair, 0.28, True)
    identity_gate.tint_materials(brows, (0.085, 0.055, 0.035), 0.86)
    identity_gate.tint_materials(lashes, (0.020, 0.014, 0.012), 0.84)
    # Preserve the authored hair texture rather than replacing its color input.
    bpy.context.view_layer.update()
    if transfer_metrics is not None:
        transfer_metrics["expressionPointsCorrected"] = corrected_points
    return base, rig, fitted, transfer_metrics


def set_expression(objects, weights):
    for obj in objects:
        keys = getattr(obj.data, "shape_keys", None) if obj.type == "MESH" else None
        if not keys:
            continue
        for key in keys.key_blocks[1:]:
            key.value = float(weights.get(key.name, 0.0))
    bpy.context.view_layer.update()


def rescale_face_units(objects, names, scale):
    if abs(scale - 1.0) < 1e-6:
        return
    for obj in objects:
        keys = getattr(obj.data, "shape_keys", None) if obj.type == "MESH" else None
        if not keys:
            continue
        basis = keys.key_blocks[0]
        for name in names:
            key = keys.key_blocks.get(name)
            if not key:
                continue
            for index, point in enumerate(key.data):
                point.co = basis.data[index].co + (point.co - basis.data[index].co) * scale
    bpy.context.view_layer.update()


def body_coordinates(base):
    matrix = base.matrix_world
    return np.asarray([tuple(matrix @ vertex.co) for vertex in base.data.vertices[: identity_gate.BODY_VERTEX_END]])


def place_camera(camera, base, view):
    coords = body_coordinates(base)
    head_top = float(coords[:, 2].max())
    target = Vector((0.0, -0.005, head_top - 0.135))
    if view == "front":
        camera.location = (0.0, -0.71, target.z + 0.002)
    elif view == "three-quarter":
        camera.location = (0.42, -0.64, target.z + 0.015)
    elif view == "profile":
        camera.location = (0.69, -0.04, target.z + 0.012)
    else:
        raise ValueError(view)
    point_at(camera, target)


def render_views(output_dir, variant, base, fitted, camera):
    objects = [base, *fitted]
    expressions = {
        "neutral": {},
        "blink": {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0},
        "smile": {
            "mouthSmileLeft": 0.62,
            "mouthSmileRight": 0.62,
            "cheekSquintLeft": 0.28,
            "cheekSquintRight": 0.28,
        },
        "concern": {
            "browInnerUp": 0.58,
            "browDownLeft": 0.18,
            "browDownRight": 0.18,
            "mouthFrownLeft": 0.34,
            "mouthFrownRight": 0.34,
        },
        "speech": {"jawOpen": 0.34, "mouthFunnel": 0.18},
    }
    paths = []
    for expression, weights in expressions.items():
        set_expression(objects, weights)
        views = ("front", "three-quarter", "profile") if expression == "neutral" else ("front",)
        for view in views:
            place_camera(camera, base, view)
            path = os.path.join(output_dir, f"{variant}-{expression}-{view}.png")
            bpy.context.scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            paths.append(path)
    set_expression(objects, {})
    return paths


def object_manifest(base, rig, fitted, paths):
    morphs = []
    keys = getattr(base.data, "shape_keys", None)
    if keys:
        morphs = [key.name for key in keys.key_blocks[1:]]
    objects = [base, rig, *fitted]
    return {
        "objects": [
            {
                "name": obj.name,
                "type": obj.type,
                "vertices": len(obj.data.vertices) if obj.type == "MESH" else None,
                "materials": [material.name if material else None for material in obj.data.materials] if obj.type == "MESH" else [],
            }
            for obj in objects
        ],
        "faceUnitCount": len(morphs),
        "faceUnits": morphs,
        "renders": paths,
    }


def main():
    args = arguments()
    output_dir = os.path.abspath(args.output_dir)
    import bl_ext.user_default.mpfb  # noqa: F401

    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")
    AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
    LocationService = dynamic_import("mpfb.services.locationservice", "LocationService")
    FaceService = dynamic_import("mpfb.services.faceservice", "FaceService")
    services = (HumanService, TargetService, AssetService, LocationService, FaceService)

    camera = setup_stage(output_dir)
    manifest = {
        "pipeline": PIPELINE,
        "mode": args.mode,
        "baseline": None,
        "gnm": {"path": os.path.abspath(args.gnm_npz), "attempted": False},
    }
    if args.mode in ("baseline", "all"):
        identity = proof_identity(args.mpfb_identity_index, args.mpfb_identity_strength)
        base, rig, fitted, _ = add_complete_patient(services, identity, "baseline")
        paths = render_views(output_dir, "baseline", base, fitted, camera)
        manifest["baseline"] = object_manifest(base, rig, fitted, paths)
    if args.mode in ("donors", "all"):
        # Donor renders are a selection aid only; no GNM object is exported.
        common.clear_scene()
        camera = setup_stage(output_dir)
        entries, paths = render_donor_candidates(
            output_dir,
            camera,
            args.gnm_npz,
            args.donor_count,
            args.donor_source,
            args.semantic_diversity,
            args.semantic_gender,
        )
        manifest["gnm"] = {
            "path": os.path.abspath(args.gnm_npz),
            "attempted": False,
            "donorCandidates": entries,
            "renders": paths,
        }
    if args.mode in ("transfer", "all"):
        common.clear_scene()
        camera = setup_stage(output_dir)
        identity = proof_identity(args.mpfb_identity_index, args.mpfb_identity_strength)
        target_path = os.path.join(output_dir, f"gnm-d{args.donor_index:02d}-mpfb.target")
        transfer_state = {}

        def transfer(base):
            return apply_gnm_transfer(
                base,
                args.gnm_npz,
                args.donor_index,
                args.donor_source,
                args.semantic_diversity,
                args.semantic_gender,
                args.transfer_strength,
                target_path,
                LocationService.get_mpfb_data("targets"),
                args.eye_mode,
                transfer_state,
            )

        expression_corrector = None
        if args.expression_mode == "push-forward":
            expression_corrector = lambda body: push_forward_face_units(body, transfer_state["gradients"])
        base, rig, fitted, transfer_metrics = add_complete_patient(
            services,
            identity,
            "transfer",
            transfer=transfer,
            expression_corrector=expression_corrector,
        )
        rescale_face_units([base, *fitted], ("eyeBlinkLeft", "eyeBlinkRight"), args.blink_scale)
        transfer_metrics["blinkScale"] = args.blink_scale
        transfer_metrics["expressionMode"] = args.expression_mode
        transfer_metrics["mpfbIdentityIndex"] = args.mpfb_identity_index
        transfer_metrics["mpfbIdentityStrength"] = args.mpfb_identity_strength
        paths = render_views(output_dir, "transfer", base, fitted, camera)
        manifest["transfer"] = {
            **object_manifest(base, rig, fitted, paths),
            "metrics": transfer_metrics,
        }
        manifest["gnm"] = {
            **manifest["gnm"],
            "attempted": True,
            "selectedDonor": f"D{args.donor_index:02d}",
        }
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"RENDERER_C_PROOF_OK mode={args.mode} {manifest_path}")


if __name__ == "__main__":
    main()

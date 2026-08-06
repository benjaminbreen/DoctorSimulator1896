"""Build the Character Lab's authored Victorian card-hair asset.

Run through Blender, opening Daniel Bystedt's free Hair Cards from Curves file::

    blender --background "Geometry nodes - hair cards from curves - blender 3.6.blend" \
      --python scripts/hair/build_victorian_cards.py -- \
      --output character-lab/public/models/victorian-low-bun.glb \
      --texture character-lab/public/textures/victorian-hair-card.png \
      --authoring character-lab/authoring/hair/victorian-low-bun.blend

The third-party .blend is an authoring dependency only and is intentionally
gitignored.  The output is a project-owned groom made from reshaped guide
curves.  No code from the legacy Three.js procedural hair generator is touched.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


SAMPLE_HEAD_CENTRE = Vector((0.0, -0.055, 1.535))
SAMPLE_HEAD_ANCHOR = Vector((0.0, -0.00612446, 1.50157))
BUN_CENTRE = Vector((0.0, 0.073, 1.445))
SCALP_RADII = Vector((0.096, 0.110, 0.116))


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def cubic_bezier(a: Vector, b: Vector, c: Vector, d: Vector, t: float) -> Vector:
    inv = 1.0 - t
    return a * (inv**3) + b * (3.0 * inv * inv * t) + c * (3.0 * inv * t * t) + d * (t**3)


def reshape_guides(object_name: str, layer_bias: float) -> None:
    """Pull Bystedt's naturally distributed roots into a period low bun.

    The original sample is a centre-parted bob.  Its roots and hairline are
    excellent, so they remain fixed.  Only the flow after the root is replaced
    with a swept-back cubic path.  This is the crucial distinction from the old
    runtime shell: the output remains many independently curved cards.
    """

    obj = bpy.data.objects[object_name]
    for modifier in obj.modifiers:
        modifier.show_viewport = False
        modifier.show_render = False

    positions = obj.data.attributes["position"].data
    offsets = obj.data.curve_offset_data
    for curve_index in range(len(obj.data.curves)):
        start = offsets[curve_index].value
        stop = offsets[curve_index + 1].value
        count = stop - start
        if count < 2:
            continue

        root = Vector(positions[start].vector)
        side = -1.0 if root.x < 0 else 1.0
        if abs(root.x) < 0.002:
            side = -1.0 if curve_index % 2 else 1.0

        frontness = smoothstep((-root.y + 0.005) / 0.145)
        crownness = smoothstep((root.z - 1.53) / 0.095)
        side_extent = min(1.0, abs(root.x) / 0.09)

        # First control moves away from the centre part before sweeping back,
        # preserving the visible forehead and a clean, tapered parting.
        control_one = root + Vector((
            side * (0.012 + 0.010 * frontness + 0.004 * layer_bias),
            0.042 + 0.022 * frontness,
            0.008 + 0.018 * frontness,
        ))
        # The second control provides the soft side volume seen in restrained
        # 1890s arrangements without creating a mathematically round helmet.
        control_two = Vector((
            side * (0.036 + 0.018 * side_extent + 0.004 * layer_bias),
            0.040 + 0.012 * crownness,
            1.493 + 0.020 * frontness - 0.007 * layer_bias,
        ))
        anchor = BUN_CENTRE + Vector((
            side * (0.005 + 0.005 * side_extent),
            -0.004 * layer_bias,
            0.006 * (crownness - 0.5),
        ))

        phase = curve_index * 1.61803398875
        for point_index in range(count):
            t = point_index / (count - 1)
            point = cubic_bezier(root, control_one, control_two, anchor, smoothstep(t))
            # Sub-millimetre-to-millimetre separation prevents coincident-card
            # moire while keeping the groom composed rather than frizzy.
            envelope = math.sin(math.pi * t)
            point.x += math.sin(phase + t * math.pi * 2.0) * 0.0015 * envelope
            point.z += math.cos(phase * 0.73 + t * math.pi) * 0.0010 * envelope
            positions[start + point_index].vector = point


def make_bun_guides() -> bpy.types.Collection:
    collection = bpy.data.collections.new("Victorian Bun Guides")
    bpy.context.scene.collection.children.link(collection)
    curve_data = bpy.data.curves.new("Victorian_Bun_GuideCurves", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2
    curve_obj = bpy.data.objects.new("Victorian_Bun_GuideCurves", curve_data)
    collection.objects.link(curve_obj)

    # Interlocking elliptical loops create a woven coil rather than a sphere.
    loop_count = 34
    segment_count = 18
    for loop_index in range(loop_count):
        spline = curve_data.splines.new("POLY")
        spline.points.add(segment_count - 1)
        band = (loop_index / (loop_count - 1) - 0.5) * 2.0
        start_angle = band * 0.58 + (loop_index % 3) * 0.16
        arc = math.pi * (1.45 + 0.22 * math.cos(loop_index * 1.7))
        for segment in range(segment_count):
            t = segment / (segment_count - 1)
            angle = start_angle + arc * t
            radius_x = 0.057 * (1.0 - 0.10 * abs(band))
            radius_z = 0.049 * (1.0 - 0.08 * abs(band))
            depth = 0.019 * math.cos(angle * 0.82 + band * 1.4)
            point = BUN_CENTRE + Vector((
                math.sin(angle) * radius_x,
                0.012 + depth + band * 0.006,
                math.cos(angle) * radius_z,
            ))
            spline.points[segment].co = (*point, 1.0)
    return collection


def ellipsoid_position(direction: Vector, lift: float = 0.0) -> Vector:
    direction = direction.normalized()
    point = SAMPLE_HEAD_CENTRE + Vector((
        direction.x * SCALP_RADII.x,
        direction.y * SCALP_RADII.y,
        direction.z * SCALP_RADII.z,
    ))
    normal = Vector((
        direction.x / SCALP_RADII.x,
        direction.y / SCALP_RADII.y,
        direction.z / SCALP_RADII.z,
    )).normalized()
    return point + normal * lift


def swept_surface_path(root: Vector, end: Vector, side: float, phase: float, layer: int) -> list[Vector]:
    points = []
    count = 14
    for index in range(count):
        t = index / (count - 1)
        eased = smoothstep(t)
        direction = (root * (1.0 - eased) + end * eased).normalized()
        # A tangent-side bow creates restrained temple fullness without the
        # spherical silhouette of the former procedural shell.
        direction.x += side * math.sin(math.pi * t) * (0.055 + layer * 0.012)
        direction = direction.normalized()
        lift = 0.0034 + layer * 0.0016 + math.sin(math.pi * t) * (0.0045 + layer * 0.0008)
        point = ellipsoid_position(direction, lift)
        envelope = math.sin(math.pi * t)
        point.x += math.sin(phase + t * math.pi * 1.7) * 0.00065 * envelope
        point.z += math.cos(phase * 0.71 + t * math.pi) * 0.00045 * envelope
        points.append(point)
    return points


def add_poly_spline(curve_data: bpy.types.Curve, points: list[Vector]) -> None:
    spline = curve_data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for index, point in enumerate(points):
        spline.points[index].co = (*point, 1.0)


def make_period_guides(name: str, stride: int = 1, include_wisps: bool = False) -> bpy.types.Collection:
    """Author a centre-parted, swept-back 1890s guide field.

    These paths are project-owned.  Bystedt's node group converts them to
    cards, but no geometry from the modern demo bob is used.
    """

    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    curve_data = bpy.data.curves.new(name.replace(" ", "_"), "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2
    curve_obj = bpy.data.objects.new(name.replace(" ", "_"), curve_data)
    collection.objects.link(curve_obj)

    route_count = 168
    global_index = 0
    for side in (-1.0, 1.0):
        for route_index in range(route_count):
            if global_index % stride:
                global_index += 1
                continue
            u = (route_index + 0.5) / route_count
            layer = route_index % 3
            if u < 0.57:
                # Front hairline: a high centre opening tapering toward the
                # temple, with no horizontal fringe or bowl-cut edge.
                h = u / 0.57
                root = Vector((
                    side * (0.030 + 0.690 * h),
                    -0.735 + 0.235 * h,
                    0.690 - 0.390 * h,
                )).normalized()
            else:
                # Centre part continuing across the crown.  The tiny opposing
                # x offsets leave an actual scalp part between left/right cards.
                p = (u - 0.57) / 0.43
                root = Vector((
                    side * (0.024 + 0.025 * p),
                    -0.640 + 0.680 * p,
                    0.790 + 0.115 * math.sin(p * math.pi),
                )).normalized()

            stagger = ((route_index * 37) % route_count) / route_count
            end = Vector((
                side * (0.235 + 0.315 * stagger),
                0.875,
                -0.285 + 0.145 * math.sin(stagger * math.pi),
            )).normalized()
            add_poly_spline(
                curve_data,
                swept_surface_path(root, end, side, route_index * 1.61803398875, layer),
            )
            global_index += 1

    if include_wisps:
        # Narrow, irregular temple strands provide the soft transitional edge
        # missing from both the old shell and the demo bob.
        for side in (-1.0, 1.0):
            for wisp_index in range(6):
                root = ellipsoid_position(
                    Vector((side * (0.78 + wisp_index * 0.012), -0.47, 0.28 - wisp_index * 0.018)),
                    0.004,
                )
                length = 0.020 + wisp_index * 0.0028
                points = []
                for index in range(9):
                    t = index / 8
                    points.append(root + Vector((
                        side * (0.003 * math.sin(t * math.pi * 1.4 + wisp_index)),
                        -0.003 * t,
                        -length * t + 0.003 * math.sin(t * math.pi),
                    )))
                add_poly_spline(curve_data, points)
    return collection


def make_scalp_underlayer() -> bpy.types.Object:
    """Create the conventional dark root layer beneath translucent cards."""

    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, location=SAMPLE_HEAD_CENTRE)
    obj = bpy.context.object
    obj.name = "Victorian_Scalp_Base"
    obj.scale = SCALP_RADII * 1.006
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

    editable = bmesh.new()
    editable.from_mesh(obj.data)
    remove = []
    for face in editable.faces:
        centre = face.calc_center_median()
        front = centre.y < -0.055
        hairline = 1.575 - min(abs(centre.x), 0.090) * 0.35
        within_cap = (front and centre.z >= hairline) or (
            not front and centre.z >= 1.505 - min(abs(centre.x), 0.095) * 0.08
        )
        if not within_cap:
            remove.append(face)
    bmesh.ops.delete(editable, geom=remove, context="FACES")
    loose = [vertex for vertex in editable.verts if not vertex.link_faces]
    if loose:
        bmesh.ops.delete(editable, geom=loose, context="VERTS")
    editable.to_mesh(obj.data)
    editable.free()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    for vertex in obj.data.vertices:
        vertex.co -= SAMPLE_HEAD_ANCHOR
    obj.location = (0.0, 0.0, 0.0)
    return obj


def make_legacy_guide_collection(name: str, stride: int) -> bpy.types.Collection:
    """Copy groom paths to plain curves accepted consistently by Blender 5.1."""

    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    data_name = name.replace(" ", "_")
    curve_data = bpy.data.curves.new(data_name, "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2
    curve_obj = bpy.data.objects.new(data_name, curve_data)
    collection.objects.link(curve_obj)

    global_index = 0
    for object_name in ("front groom", "back groom"):
        source = bpy.data.objects[object_name]
        positions = source.data.attributes["position"].data
        offsets = source.data.curve_offset_data
        for curve_index in range(len(source.data.curves)):
            if global_index % stride != 0:
                global_index += 1
                continue
            start = offsets[curve_index].value
            stop = offsets[curve_index + 1].value
            spline = curve_data.splines.new("POLY")
            spline.points.add(stop - start - 1)
            for point_index, source_index in enumerate(range(start, stop)):
                spline.points[point_index].co = (*positions[source_index].vector, 1.0)
            global_index += 1
    return collection


def set_node_input(modifier: bpy.types.Modifier, name: str, value) -> None:
    for item in modifier.node_group.interface.items_tree:
        if item.item_type == "SOCKET" and item.in_out == "INPUT" and item.name == name:
            modifier[item.identifier] = value
            return
    raise KeyError(f"Missing Bystedt node input: {name}")


def make_bun_output(guides: bpy.types.Collection) -> bpy.types.Object:
    mesh = bpy.data.meshes.new("Victorian_Cards_Bun_Source")
    obj = bpy.data.objects.new("Victorian_Cards_Bun_Source", mesh)
    bpy.context.scene.collection.objects.link(obj)
    modifier = obj.modifiers.new("Hair cards from curves", "NODES")
    modifier.node_group = bpy.data.node_groups["Hair cards from curves"]
    set_node_input(modifier, "Hair curves collection", guides)
    set_node_input(modifier, "Hair card collection", bpy.data.collections["hair card thick"])
    set_node_input(modifier, "Surface collection", bpy.data.collections["simple head surface"])
    set_node_input(modifier, "Radius mult", 0.29)
    set_node_input(modifier, "Length Factor", 1.0)
    set_node_input(modifier, "Tip tilt randomize", 0.10)
    set_node_input(modifier, "Align to world or suface", 0.0)
    set_node_input(modifier, "Root align to surface", 0.0)
    set_node_input(modifier, "Tip align to surface", 0.0)
    set_node_input(modifier, "Root snap distance", 0.0)
    set_node_input(modifier, "Snap if inside", 0.0)
    set_node_input(modifier, "Snap surface offset", 0.0)
    set_node_input(modifier, "Normal from surface", 0.0)
    set_node_input(modifier, "Haircard downscale", 0.78)
    return obj


def make_card_output(
    template_name: str,
    guides: bpy.types.Collection,
    name: str,
    radius: float,
    downscale: float,
) -> bpy.types.Object:
    """Create a clean converter object from one of Bystedt's examples.

    Rebinding the collection on the source scene objects can leave their
    evaluated Geometry Nodes cache attached to the original interpolated bob.
    A fresh carrier object preserves Bystedt's authored socket values while
    guaranteeing the current Victorian guides are the geometry being sampled.
    """

    template = bpy.data.objects[template_name]
    obj = template.copy()
    obj.data = template.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    for modifier in list(obj.modifiers)[1:]:
        obj.modifiers.remove(modifier)
    set_node_input(obj.modifiers[0], "Hair curves collection", guides)
    set_node_input(obj.modifiers[0], "Radius mult", radius)
    set_node_input(obj.modifiers[0], "Haircard downscale", downscale)
    return obj


def trim_victorian_crown(mesh: bpy.types.Mesh) -> None:
    """Open the forehead and remove the demo bob's modern face curtains."""

    editable = bmesh.new()
    editable.from_mesh(mesh)
    remove = []
    for face in editable.faces:
        centre = face.calc_center_median()
        # A shallow widow's-peak curve: high at the centre part, descending
        # naturally toward the temples.  Alpha-tapered card edges conceal the
        # geometric cut while the remaining cards retain their authored flow.
        hairline = 1.596 - min(abs(centre.x), 0.105) * 0.43
        opens_forehead = centre.y < -0.060 and centre.z < hairline
        # Shorten the modern jaw-length bob in front of the ears.  A few side
        # cards survive as temple wisps; the separate coil supplies rear mass.
        removes_face_curtain = centre.y < 0.025 and centre.z < 1.485
        if opens_forehead or removes_face_curtain:
            remove.append(face)
    bmesh.ops.delete(editable, geom=remove, context="FACES")
    loose = [vertex for vertex in editable.verts if not vertex.link_faces]
    if loose:
        bmesh.ops.delete(editable, geom=loose, context="VERTS")
    editable.to_mesh(mesh)
    editable.free()
    mesh.update()


def evaluated_mesh(
    source: bpy.types.Object,
    name: str,
    decimate_ratio: float,
    trim_crown: bool = False,
) -> bpy.types.Object:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
    output = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(output)
    output.matrix_world = source.matrix_world.copy()

    if trim_crown:
        trim_victorian_crown(mesh)

    # Store coordinates relative to the canonical head anchor.  The Three.js
    # system positions this origin at each generated patient's head bone.
    for vertex in mesh.vertices:
        vertex.co -= SAMPLE_HEAD_ANCHOR
    output.matrix_world.identity()
    if decimate_ratio < 0.999:
        for selected in bpy.context.selected_objects:
            selected.select_set(False)
        output.select_set(True)
        bpy.context.view_layer.objects.active = output
        modifier = output.modifiers.new("Game card budget", "DECIMATE")
        modifier.ratio = decimate_ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return output


def configure_placeholder_material() -> bpy.types.Material:
    material = bpy.data.materials.get("Victorian Card Preview") or bpy.data.materials.new("Victorian Card Preview")
    material.diffuse_color = (0.055, 0.026, 0.016, 1.0)
    material.roughness = 0.58
    return material


def create_card_atlas(path: Path) -> bpy.types.Image:
    """Create a redistributable strand/alpha atlas for the generated cards."""

    width, height = 256, 512
    image = bpy.data.images.get("Victorian Hair Card Atlas") or bpy.data.images.new(
        "Victorian Hair Card Atlas", width=width, height=height, alpha=True
    )
    strand_centres = (0.045, 0.13, 0.215, 0.30, 0.385, 0.47, 0.555, 0.64, 0.725, 0.81, 0.895, 0.97)
    pixels: list[float] = []
    for y in range(height):
        v = y / (height - 1)
        # Bystedt's example cards are authored with mixed UV direction, so a
        # symmetric end taper keeps both roots and tips covered correctly.
        taper = smoothstep(v / 0.025) * smoothstep((1.0 - v) / 0.045)
        for x in range(width):
            u = x / (width - 1)
            alpha = 0.0
            value = 0.72
            for strand_index, centre in enumerate(strand_centres):
                wave = math.sin(v * math.pi * (1.5 + strand_index * 0.09) + strand_index * 1.7) * 0.010
                distance = u - (centre + wave)
                width_sigma = 0.015 + 0.003 * math.sin(strand_index * 2.1) ** 2
                influence = math.exp(-(distance * distance) / (2.0 * width_sigma * width_sigma))
                alpha = max(alpha, influence)
                value = max(value, 0.76 + influence * (0.16 + 0.05 * math.sin(strand_index * 2.7)))
            # Denser roots make the lower card layers provide believable mass;
            # tapered tips and side fades keep the silhouette filamentary.
            root_density = 0.10 + (1.0 - smoothstep(min(v, 1.0 - v) / 0.16)) * 0.12
            side_fade = smoothstep(u / 0.035) * smoothstep((1.0 - u) / 0.035)
            alpha = max(alpha, root_density) * taper * side_fade
            root_shadow = 0.78 + 0.22 * smoothstep(v / 0.30)
            shade = max(0.0, min(1.0, value * root_shadow))
            pixels.extend((shade, shade, shade, max(0.0, min(1.0, alpha))))
    image.pixels.foreach_set(pixels)
    image.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(path)
    image.save()
    return image


def configure_card_material(atlas: bpy.types.Image) -> bpy.types.Material:
    material = configure_placeholder_material()
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = atlas
    shader.inputs["Base Color"].default_value = (0.055, 0.026, 0.016, 1.0)
    shader.inputs["Roughness"].default_value = 0.58
    material.node_tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def configure_scalp_material() -> bpy.types.Material:
    material = bpy.data.materials.get("Victorian Scalp Roots") or bpy.data.materials.new("Victorian Scalp Roots")
    material.diffuse_color = (0.018, 0.006, 0.003, 1.0)
    material.roughness = 0.68
    material.use_nodes = True
    shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if shader:
        shader.inputs["Base Color"].default_value = (0.018, 0.006, 0.003, 1.0)
        shader.inputs["Roughness"].default_value = 0.68
        shader.inputs["Alpha"].default_value = 0.78
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def export_asset(
    outputs: list[bpy.types.Object],
    output_path: Path,
    card_material: bpy.types.Material,
    scalp_material: bpy.types.Material,
) -> None:
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in outputs:
        obj.data.materials.clear()
        obj.data.materials.append(scalp_material if obj.name == "Victorian_Scalp_Base" else card_material)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = outputs[0]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_yup=True,
    )


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--authoring")
    parser.add_argument("--texture", required=True)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    if "Hair cards from curves" not in bpy.data.node_groups:
        raise RuntimeError("Open the Bystedt Hair Cards from Curves .blend before running this script")

    bpy.context.window.scene = bpy.data.scenes["Hair character grooming"]
    body_guides = make_period_guides("Victorian Body Guides")
    fine_guides = make_period_guides("Victorian Fine Guides", stride=5, include_wisps=True)
    thick_source = make_card_output(
        "Hair cards thick", body_guides, "Victorian Body Card Source", 0.24, 0.72
    )
    sparse_source = make_card_output(
        "Hair cards sparse", fine_guides, "Victorian Fine Card Source", 0.16, 0.52
    )

    bun_source = make_bun_output(make_bun_guides())
    bpy.context.view_layer.update()
    outputs = [
        make_scalp_underlayer(),
        evaluated_mesh(thick_source, "Victorian_Cards_Body", 0.36),
        evaluated_mesh(sparse_source, "Victorian_Cards_Fine", 0.58),
        evaluated_mesh(bun_source, "Victorian_Cards_Bun", 0.55),
    ]

    for obj in outputs:
        triangles = sum(len(p.loop_indices) - 2 for p in obj.data.polygons)
        print(f"{obj.name}: {len(obj.data.vertices):,} vertices, {triangles:,} triangles")

    atlas = create_card_atlas(Path(os.path.abspath(args.texture)))
    card_material = configure_card_material(atlas)
    scalp_material = configure_scalp_material()
    export_asset(outputs, Path(os.path.abspath(args.output)), card_material, scalp_material)
    if args.authoring:
        authoring_path = Path(os.path.abspath(args.authoring))
        authoring_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(authoring_path))
    print(f"Exported Victorian card groom: {args.output}")


if __name__ == "__main__":
    main()

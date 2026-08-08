# Convert the CGTrader Victorian pack (FBX + Unity-convention textures) into
# web-ready GLBs for the interior generator. Run through Blender:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P \
#       scripts/interiors/convert_victorian.py
#
# Sources live in assets-src/victorian/ (gitignored). Textures are matched to
# each piece by name, since the FBX files carry no embedded images.

import json
import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "assets-src", "victorian")
FBX_DIR = os.path.join(SRC, "FBX")
TEX_DIR = os.path.join(SRC, ".work", "tex512")
OUT = os.path.join(ROOT, "game", "public", "models", "victorian")

# Pieces the interior generator never places; skipping keeps the payload small.
SKIP = re.compile(r"^(Mattress|Coverlet|Bed$|Arcade)", re.I)

# X-rotation in degrees needed to stand each piece upright with height on Y.
# The pack mixes authoring orientations, so there is no global rule; these
# were read off rendered contact sheets of the converted models.
ROTATE_X = {
    "Armchair02": -90,
    "Rug01": -90,
    "Cabinet": -90,
    "Cabinet_Small": -90,
    "Bedside_Cabinet": -90,
    "Radiator": -90,
    "SmallTable02": -90,
    "Sewing Machine": -90,
    "Stairs": -90,
    "Stairs_Fliped": -90,
    "Door_02_Wing": -90,
    "Door_02_Frame": -90,
}


def normalize(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def build_texture_index():
    index = {}
    if not os.path.isdir(TEX_DIR):
        return index
    for file in os.listdir(TEX_DIR):
        if not file.lower().endswith((".jpg", ".png")):
            continue
        stem = os.path.splitext(file)[0].rsplit("_", 1)[0]
        kind = "normal" if "_Normal" in file else "albedo"
        index.setdefault(normalize(stem), {})[kind] = os.path.join(TEX_DIR, file)
    return index


TEXTURES = build_texture_index()


# Exact name match wins first — otherwise "Painting" grabs the "Painting2"
# texture. Failing that, the longest containment match, so "Wall_Wooden_01"
# beats "Wall_01".
def find_texture(*names):
    for name in names:
        exact = TEXTURES.get(normalize(name))
        if exact:
            return exact
    best = None
    best_len = 0
    for name in names:
        key = normalize(name)
        for tex_key, paths in TEXTURES.items():
            if (tex_key in key or key in tex_key) and len(tex_key) > best_len:
                best = paths
                best_len = len(tex_key)
    return best


# Pieces whose own name matches no texture set; these borrow a sibling's.
ALIASES = {
    "chair_big_01": "ArmChair_01",
    "Armchair02": "ArmchairLP_ArmChair_02",
    "ChairSmall2": "ChairSmall_02",
    "SmallTable02": "Table02",
    "Table_02": "Table02",
    "Cabinet_Small": "Cabinet",
    "Bust_Pilar_01": "Bust_pilar_01",
    "Floor": "WoodenFloor_01",
    "Floor_small": "WoodenFloor_01",
    "WallPlane01": "Plaster01",
    "Wooden_ledge01": "Wooden_Details",
    "Wooden_ledge02": "Wooden_Details",
    "Wooden_Detail_01": "Wooden_Details",
    "Wooden_Detail_02": "Wooden_Details",
    "Wooden_Detail_03": "Wooden_Details",
    "WoodenWallPanel": "Wooden_WallPanel",
    "Stairs": "StairsLP_Stairs_01",
    "Balustrade": "StairsLP_Stairs_Balustrade",
}


def apply_material(obj, piece_name):
    # Several pieces ship with no material slot at all; give them one so the
    # name-matched texture has somewhere to land.
    if not obj.material_slots:
        material = bpy.data.materials.new(name=piece_name)
        obj.data.materials.append(material)

    for slot in obj.material_slots:
        material = slot.material
        if material is None:
            continue
        alias = ALIASES.get(piece_name)
        paths = find_texture(material.name, piece_name) or (find_texture(alias) if alias else None)
        if not paths:
            continue
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        if "albedo" in paths:
            image = nodes.new("ShaderNodeTexImage")
            image.image = bpy.data.images.load(paths["albedo"], check_existing=True)
            links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
        if "normal" in paths:
            image = nodes.new("ShaderNodeTexImage")
            image.image = bpy.data.images.load(paths["normal"], check_existing=True)
            image.image.colorspace_settings.name = "Non-Color"
            normal_map = nodes.new("ShaderNodeNormalMap")
            links.new(image.outputs["Color"], normal_map.inputs["Color"])
            links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
        # The pack is authored for Unity's smoothness workflow; flat values
        # here read better than the packed metallic-smoothness map.
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 0.75


def convert(path):
    name = os.path.splitext(os.path.basename(path))[0]
    if SKIP.match(name):
        return None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.fbx(filepath=path, global_scale=1.0)
    except Exception as error:  # noqa: BLE001 - report and continue the batch
        print(f"FAILED import {name}: {error}", file=sys.stderr)
        return None

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        return None
    for obj in meshes:
        apply_material(obj, name)

    # The exporter's Y-up conversion does not survive this pack's transforms,
    # so bake the rotation into each object's matrix: Blender +Z (up) -> +Y.
    # Set the matrix directly; bpy.ops.transform.rotate silently no-ops for
    # some objects in background mode.
    # The pack mixes authoring orientations piece by piece, so no global rule
    # works. ROTATE_X lists the ones whose height sits on Blender Z; they get
    # tipped so height lands on Y, which is what glTF and three.js expect.
    degrees = ROTATE_X.get(name)
    if degrees:
        flip = Matrix.Rotation(math.radians(degrees), 4, "X")
        for obj in bpy.context.scene.objects:
            if obj.parent is None:
                obj.matrix_world = flip @ obj.matrix_world
        bpy.context.view_layer.update()

    # Bounds are measured after the rotation, so they are already in the
    # game's Y-up frame: size[1] is height.
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])

    # The pack authors pieces far from the origin (the chandelier sits 5m out
    # in Z). Recentre horizontally and drop the base to y=0, so every model's
    # origin is its floor-contact point and placement needs no per-piece
    # fudge factors.
    shift = Vector((-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2))
    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.matrix_world = Matrix.Translation(shift) @ obj.matrix_world
    bpy.context.view_layer.update()
    lo = [lo[i] + shift[i] for i in range(3)]
    hi = [hi[i] + shift[i] for i in range(3)]

    safe = re.sub(r"[^A-Za-z0-9_-]", "_", name)
    out_path = os.path.join(OUT, f"{safe}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=False,
    )
    return {
        "file": f"{safe}.glb",
        "size": [round(hi[i] - lo[i], 4) for i in range(3)],
        "min": [round(value, 4) for value in lo],
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    files = sorted(f for f in os.listdir(FBX_DIR) if f.lower().endswith(".fbx"))
    for index, file in enumerate(files, 1):
        entry = convert(os.path.join(FBX_DIR, file))
        if entry:
            manifest[os.path.splitext(file)[0]] = entry
        print(f"[{index}/{len(files)}] {file} -> {'ok' if entry else 'skipped'}")
    with open(os.path.join(OUT, "manifest.json"), "w") as handle:
        json.dump(manifest, handle, indent=1, sort_keys=True)
    print(f"Wrote {len(manifest)} pieces to {OUT}")


main()

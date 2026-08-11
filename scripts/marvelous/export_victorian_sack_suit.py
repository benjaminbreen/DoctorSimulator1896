"""Export the authored Victorian sack suit for the Renderer C proof.

Run this file inside Marvelous Designer. It loads the downloaded ZPRJ without
changing its authored drape, exports garment geometry only, and writes a report
that the Blender fitting stage can validate before using the result.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import traceback
from typing import Any

import ApiTypes
import export_api
import import_api
import pattern_api
import utility_api


ROOT = pathlib.Path("/Users/benjaminbreen/code/Ghosts of the Machine Age Game")
SOURCE = ROOT / "Finished Mens Victorian suit.zprj"
OUTPUT_DIR = ROOT / "artifacts/marvelous/victorian-sack-suit-source"
OBJ = OUTPUT_DIR / "victorian-sack-suit-authored.obj"
FBX = OUTPUT_DIR / "victorian-sack-suit-authored.fbx"
ZPAC = OUTPUT_DIR / "victorian-sack-suit-authored.zpac"
PATTERNS = OUTPUT_DIR / "victorian-sack-suit-patterns.json"
THUMBNAIL = OUTPUT_DIR / "victorian-sack-suit-authored.png"
REPORT = OUTPUT_DIR / "export-report.json"


def serializable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    try:
        return {str(key): serializable(value[key]) for key in value.keys()}
    except Exception:
        return str(value)


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def apply_supported(target: Any, values: dict[str, object]) -> dict[str, object]:
    applied: dict[str, object] = {}
    for name, value in values.items():
        if hasattr(target, name):
            setattr(target, name, value)
            applied[name] = value
    return applied


def export_options() -> tuple[Any, dict[str, object]]:
    options = ApiTypes.ImportExportOption()
    requested = {
        "bExportGarment": True,
        "bExportAvatar": False,
        "bSingleObject": False,
        "bThin": True,
        "bUnifiedUVCoordinates": False,
        "bCreateUnifiedTexture": False,
        "bIncludeHiddenObject": False,
        "bIncludeInnerShape": True,
        "bSaveColorWays": False,
        "bSaveInZip": False,
        "bDiffuseColorCombined": True,
        "bExcludeAmbient": True,
        "bMetaData": True,
        "bExportLight": False,
        "bExportAnimation": False,
        "scale": 1.0,
    }
    return options, apply_supported(options, requested)


def output_facts(paths: list[pathlib.Path]) -> list[dict[str, object]]:
    facts: list[dict[str, object]] = []
    for path in paths:
        if not path.exists() or path.stat().st_size <= 0:
            continue
        facts.append(
            {
                "path": str(path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )
    return facts


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {
        "ok": False,
        "pipeline": "renderer-c-authored-victorian-sack-suit-source-v1",
        "source": str(SOURCE),
        "sourceSha256": sha256(SOURCE) if SOURCE.exists() else None,
    }

    try:
        if not SOURCE.exists():
            raise FileNotFoundError(SOURCE)

        print("[Ghosts] Loading the authored Victorian sack suit")
        utility_api.NewProject()

        load_options = ApiTypes.ImportZPRJOption()
        report["loadOptions"] = apply_supported(
            load_options,
            {
                "bAppend": False,
                "bLoadGarment": True,
                "bLoadAvatar": True,
                "bLoadSceneAndProps": False,
                "bLoadRenderProperties": False,
                "bLoadCustomView": False,
                "translationValueX": 0.0,
                "translationValueY": 0.0,
                "translationValueZ": 0.0,
            },
        )
        if not import_api.ImportZprjW(str(SOURCE), load_options):
            raise RuntimeError("Marvelous Designer rejected the source ZPRJ")

        pattern_count = int(pattern_api.GetPatternCount())
        if pattern_count <= 0:
            raise RuntimeError("The source project contains no garment patterns")

        report["sourceFacts"] = {
            "patternCount": pattern_count,
            "avatarCount": int(export_api.GetAvatarCount()),
            "avatarNames": serializable(export_api.GetAvatarNameList()),
            "particleDistances": [
                float(pattern_api.GetParticleDistanceOfPattern(index))
                for index in range(pattern_count)
            ],
        }

        options, applied_export_options = export_options()
        report["exportOptions"] = applied_export_options

        # Preserve the saved drape. Resimulation and retopology happen only
        # after this source export is proven, never during source acquisition.
        report["objResult"] = serializable(export_api.ExportOBJW(str(OBJ), options))
        report["fbxResult"] = serializable(export_api.ExportFBXW(str(FBX), options))
        report["zpacResult"] = serializable(export_api.ExportZPacW(str(ZPAC)))
        report["patternResult"] = serializable(
            pattern_api.ExportPatternJSON(str(PATTERNS))
        )
        report["thumbnailResult"] = serializable(
            export_api.ExportThumbnail3DW(str(THUMBNAIL))
        )

        required = [OBJ, FBX, ZPAC, PATTERNS]
        missing = [str(path) for path in required if not path.exists()]
        if missing:
            raise RuntimeError("Source export is incomplete: " + ", ".join(missing))

        report["outputs"] = output_facts(
            [OBJ, FBX, ZPAC, PATTERNS, THUMBNAIL, *OUTPUT_DIR.glob("*.mtl")]
        )
        report["ok"] = True
        print("[Ghosts] Authored Victorian sack suit export complete")
    except Exception:
        report["error"] = traceback.format_exc()
        print(report["error"])
    finally:
        REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

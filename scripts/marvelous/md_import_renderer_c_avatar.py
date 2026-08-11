"""Import the canonical Renderer C male into Marvelous Designer.

Run this file inside Marvelous Designer's Python editor. It creates a clean
project, imports the exact Mixamo doll used by Renderer C, generates avatar
arrangement points, and records the resulting MD coordinate data for the
garment builder.
"""

from __future__ import annotations

import json
import pathlib
import traceback

import ApiTypes
import export_api
import import_api
import pattern_api
import utility_api


ROOT = pathlib.Path("/Users/benjaminbreen/code/Ghosts of the Machine Age Game")
AVATAR = ROOT / "artifacts/marvelous/renderer-c-male-proof/renderer-c-male-md-fitting-avatar.fbx"
OUTPUT_DIR = ROOT / "artifacts/marvelous/renderer-c-male-proof"
REPORT = OUTPUT_DIR / "avatar-import-report.json"
PROJECT = OUTPUT_DIR / "renderer-c-male-md-fitting-avatar.zprj"
THUMBNAIL = OUTPUT_DIR / "renderer-c-male-md-fitting-avatar.png"


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    result: dict[str, object] = {
        "ok": False,
        "avatar": str(AVATAR),
        "project": str(PROJECT),
    }

    try:
        utility_api.NewProject()

        options = ApiTypes.ImportExportOption()
        requested_options = {
            "ImportObjectType": 0,
            "bAdd": False,
            "bAutoTranslate": True,
            "bAddArrangementPoints": True,
            "bAutoCreateFittingSuit": False,
            "bCreateAnimation": False,
            "bCreateCacheAnimation": False,
            "bCreateCamera": False,
        }
        applied_options: dict[str, object] = {}
        unavailable_options: list[str] = []
        for name, value in requested_options.items():
            if hasattr(options, name):
                setattr(options, name, value)
                applied_options[name] = value
            else:
                unavailable_options.append(name)
        result["appliedImportOptions"] = applied_options
        result["unavailableImportOptions"] = unavailable_options

        imported = import_api.ImportFBX(str(AVATAR), options)
        result.update(
            {
                "imported": imported,
                "avatarCount": export_api.GetAvatarCount(),
                "avatarNames": export_api.GetAvatarNameList(),
                "avatarGenders": export_api.GetAvatarGenderList(),
                "arrangements": pattern_api.GetArrangementList(),
                "patternCount": pattern_api.GetPatternCount(),
            }
        )
        if not imported:
            raise RuntimeError("Marvelous Designer rejected the Renderer C FBX avatar")

        result["projectExport"] = export_api.ExportZPrj(str(PROJECT), True)
        result["thumbnailExport"] = export_api.ExportThumbnail3D(str(THUMBNAIL))
        result["ok"] = True
    except Exception:
        result["error"] = traceback.format_exc()
    finally:
        REPORT.write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

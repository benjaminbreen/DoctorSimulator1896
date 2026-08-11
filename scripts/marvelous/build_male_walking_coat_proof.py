"""Build and simulate a simple men's walking-coat proof in Marvelous Designer.

Run this file inside Marvelous Designer's Python editor. Garment construction
uses MD's native male avatar because its AVT contains the arrangement metadata
that imported Renderer C FBX avatars do not. The finished garment is adapted
to Renderer C later in Blender.
"""

from __future__ import annotations

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
MD_AVATAR = pathlib.Path(
    "/Applications/MarvelousDesigner.app/Contents/Assets/New Assets/Avatar/Male/MV2.1_Luka.avt"
)
OUTPUT_DIR = ROOT / "artifacts/marvelous/renderer-c-male-proof"
REPORT = OUTPUT_DIR / "walking-coat-build-report.json"
PROJECT_PRE_SIM = OUTPUT_DIR / "male-walking-coat-pre-sim.zprj"
PROJECT = OUTPUT_DIR / "male-walking-coat-simulated.zprj"
PATTERN_JSON = OUTPUT_DIR / "male-walking-coat-patterns.json"
OBJ = OUTPUT_DIR / "male-walking-coat-simulated.obj"
THUMBNAIL = OUTPUT_DIR / "male-walking-coat-simulated.png"
TURNTABLE = OUTPUT_DIR / "male-walking-coat-turntable.png"


def serializable(value: Any) -> Any:
    """Convert the API's map-like values into ordinary JSON data."""

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


def arrangement_text(arrangement: Any) -> str:
    return json.dumps(serializable(arrangement), sort_keys=True).lower()


def choose_arrangement(
    arrangements: list[Any],
    required: tuple[str, ...],
    preferred: tuple[str, ...] = (),
    excluded: tuple[str, ...] = (),
) -> tuple[int, str]:
    """Select an arrangement point by semantic name, without fixed indexes."""

    best_index = -1
    best_score = -10_000
    best_text = ""
    for index, arrangement in enumerate(arrangements):
        text = arrangement_text(arrangement)
        if any(token in text for token in excluded):
            continue
        if not all(token in text for token in required):
            continue
        score = 100 * len(required) + sum(10 for token in preferred if token in text)
        if score > best_score:
            best_index = index
            best_score = score
            best_text = text
    return best_index, best_text


def choose_body_arrangement(arrangements: list[Any], front: bool) -> tuple[int, str]:
    side = "front" if front else "back"
    exclusions = ("arm", "hand", "leg", "foot", "head", "neck")
    attempts = (
        ((side, "torso"), ("body", "chest", "waist")),
        ((side, "body"), ("torso", "chest", "waist")),
        ((side, "chest"), ("torso", "body", "waist")),
        ((side,), ("torso", "body", "chest", "waist", "upper")),
    )
    for required, preferred in attempts:
        match = choose_arrangement(arrangements, required, preferred, exclusions)
        if match[0] >= 0:
            return match
    return -1, ""


def choose_arm_arrangement(arrangements: list[Any], left: bool) -> tuple[int, str]:
    side = "left" if left else "right"
    suffix = "_l" if left else "_r"
    for required, preferred in (
        ((side, "upper", "arm"), ("outside", "outer")),
        ((side, "arm"), ("upper", "outside", "outer")),
        # MD's native Luka AVT uses names such as Arm_Outside_2_L/R.
        (("arm", suffix), ("outside", "_2_", "upper", "outer")),
    ):
        match = choose_arrangement(
            arrangements,
            required,
            preferred,
            ("forearm", "hand", "wrist"),
        )
        if match[0] >= 0:
            return match
    return -1, ""


def create_pattern(points: list[tuple[float, float, int]]) -> int:
    index = pattern_api.CreatePatternWithPoints(points)
    if index < 0:
        raise RuntimeError(f"Could not create pattern from {points}")
    pattern_api.SetParticleDistanceOfPattern(index, 25.0)
    pattern_api.SetMeshType(index, "Triangle")
    pattern_api.SetPatternLayer(index, 1)
    return index


def arrange(pattern: int, arrangement: int, offset: int = 14) -> None:
    if arrangement < 0:
        raise RuntimeError(f"No arrangement point available for pattern {pattern}")
    pattern_api.SetArrangement(pattern, arrangement)
    pattern_api.SetArrangementShapeStyle(pattern, "Curved")
    pattern_api.SetArrangementPosition(pattern, 0, 0, offset)


def sew(
    pattern_a: int,
    line_a: int,
    pattern_b: int,
    line_b: int,
    same_direction: bool,
) -> bool:
    return bool(
        pattern_api.AddSeamlinePairGroup(
            pattern_a,
            line_a,
            pattern_b,
            line_b,
            True,
            same_direction,
        )
    )


def make_export_options() -> Any:
    options = ApiTypes.ImportExportOption()
    values = {
        "bExportGarment": True,
        "bExportAvatar": False,
        "bSingleObject": False,
        "bThin": True,
        "bWeld": False,
        "bUnifiedUVCoordinates": True,
        "bSaveInZip": False,
        "bIncludeAvatarShape": False,
        "scale": 1.0,
    }
    for name, value in values.items():
        if hasattr(options, name):
            setattr(options, name, value)
    return options


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "ok": False,
        "route": "Marvelous Designer native male AVT -> simulated garment -> Blender Renderer C fit",
        "avatar": str(MD_AVATAR),
        "outputs": {},
    }

    try:
        print("[Ghosts] Starting native-avatar walking-coat build")
        if not MD_AVATAR.exists():
            raise FileNotFoundError(MD_AVATAR)

        utility_api.NewProject()
        import_options = ApiTypes.ImportExportOption()
        for name, value in {
            "bAdd": False,
            "bAutoTranslate": True,
            "bAddArrangementPoints": False,
        }.items():
            if hasattr(import_options, name):
                setattr(import_options, name, value)

        imported = import_api.ImportAvatar(str(MD_AVATAR), import_options)
        if not imported:
            raise RuntimeError("Marvelous Designer could not import its native Luka AVT")
        print("[Ghosts] Loaded MD native male avatar")

        arrangements = list(pattern_api.GetArrangementList())
        report["avatarImport"] = {
            "result": imported,
            "count": export_api.GetAvatarCount(),
            "names": export_api.GetAvatarNameList(),
            "genders": export_api.GetAvatarGenderList(),
            "arrangementCount": len(arrangements),
            "arrangements": serializable(arrangements),
        }
        if not arrangements:
            raise RuntimeError("MD's native Luka avatar unexpectedly has no arrangement points")

        front_arrangement = choose_body_arrangement(arrangements, front=True)
        back_arrangement = choose_body_arrangement(arrangements, front=False)
        left_arm_arrangement = choose_arm_arrangement(arrangements, left=True)
        right_arm_arrangement = choose_arm_arrangement(arrangements, left=False)
        selected_arrangements = {
            "front": front_arrangement,
            "back": back_arrangement,
            "leftArm": left_arm_arrangement,
            "rightArm": right_arm_arrangement,
        }
        report["selectedArrangements"] = selected_arrangements
        missing = [name for name, (index, _text) in selected_arrangements.items() if index < 0]
        if missing:
            raise RuntimeError(
                "Could not identify MD arrangement points for: " + ", ".join(missing)
            )

        # Millimetre-scale patterns. The coat is intentionally simple: one
        # front, one back, and one sleeve per arm. Ornament comes after fit.
        front = create_pattern(
            [
                (240.0, 45.0, 0),
                (365.0, 70.0, 0),
                (505.0, 225.0, 0),
                (525.0, 865.0, 0),
                (-45.0, 865.0, 0),
                (-25.0, 225.0, 0),
                (115.0, 70.0, 0),
            ]
        )
        back = create_pattern(
            [
                (840.0, 15.0, 0),
                (965.0, 60.0, 0),
                (1105.0, 225.0, 0),
                (1125.0, 865.0, 0),
                (555.0, 865.0, 0),
                (575.0, 225.0, 0),
                (715.0, 60.0, 0),
            ]
        )
        left_sleeve = create_pattern(
            [
                (1340.0, 25.0, 0),
                (1510.0, 190.0, 0),
                (1460.0, 690.0, 0),
                (1220.0, 690.0, 0),
                (1170.0, 190.0, 0),
            ]
        )
        right_sleeve = create_pattern(
            [
                (1790.0, 25.0, 0),
                (1960.0, 190.0, 0),
                (1910.0, 690.0, 0),
                (1670.0, 690.0, 0),
                (1620.0, 190.0, 0),
            ]
        )
        patterns = {
            "front": front,
            "back": back,
            "leftSleeve": left_sleeve,
            "rightSleeve": right_sleeve,
        }
        report["patterns"] = patterns
        print("[Ghosts] Created front, back, and two sleeve patterns")

        arrange(front, front_arrangement[0], 18)
        arrange(back, back_arrangement[0], 18)
        arrange(left_sleeve, left_arm_arrangement[0], 16)
        arrange(right_sleeve, right_arm_arrangement[0], 16)

        # The back pattern reverses anatomical left/right when it wraps behind
        # the avatar. Pair opposite 2D sides; same-side pairing twists the coat.
        seams = {
            "leftSide": sew(front, 2, back, 4, False),
            "rightSide": sew(front, 4, back, 2, False),
            "leftShoulder": sew(front, 0, back, 6, False),
            "rightShoulder": sew(front, 6, back, 0, False),
            # The 2D right side of the front is the avatar's left side.
            "leftFrontArmhole": sew(front, 1, left_sleeve, 0, True),
            "leftBackArmhole": sew(back, 5, left_sleeve, 4, True),
            "leftSleeveUnderarm": sew(left_sleeve, 1, left_sleeve, 3, False),
            "rightFrontArmhole": sew(front, 5, right_sleeve, 0, False),
            "rightBackArmhole": sew(back, 1, right_sleeve, 4, False),
            "rightSleeveUnderarm": sew(right_sleeve, 1, right_sleeve, 3, False),
        }
        report["seams"] = seams
        if not all(seams.values()):
            raise RuntimeError("One or more coat seams could not be created")
        print("[Ghosts] Sewed coat body and sleeves")

        report["outputs"]["preSimulationProject"] = export_api.ExportZPrj(
            str(PROJECT_PRE_SIM), True
        )
        report["outputs"]["patternJSON"] = pattern_api.ExportPatternJSON(
            str(PATTERN_JSON)
        )

        # A short normal-quality settling pass is enough to validate assembly.
        # Accurate fitting comes only after this topology visibly passes.
        utility_api.SetSimulationQuality(0, 0)
        utility_api.SetSimulationTimeStep(0.03333)
        utility_api.SetSimulationNumberOfSimulation(2)
        utility_api.SetSimulationCGIterationCount(50)
        utility_api.SetSimulationSelfCollisionIterationCount(2)
        print("[Ghosts] Simulating coat; this is the slow step")
        simulated = utility_api.Simulate(160)
        report["simulation"] = {"steps": 160, "result": simulated}
        if not simulated:
            raise RuntimeError("Marvelous Designer simulation did not complete")

        report["outputs"].update(
            {
                "project": export_api.ExportZPrj(str(PROJECT), True),
                "obj": export_api.ExportOBJ(str(OBJ), make_export_options()),
                "thumbnail": export_api.ExportThumbnail3D(str(THUMBNAIL)),
            }
        )
        report["patternCount"] = pattern_api.GetPatternCount()
        report["ok"] = True
        print(f"[Ghosts] Build complete: {PROJECT}")
    except Exception:
        report["error"] = traceback.format_exc()
        print(report["error"])
    finally:
        REPORT.write_text(json.dumps(serializable(report), indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

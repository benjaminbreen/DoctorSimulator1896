"""Confirm that Marvelous Designer can execute an in-app Python script."""

from __future__ import annotations

import importlib
import json
import pathlib
import platform
import sys
import traceback


OUTPUT = pathlib.Path("/tmp/ghosts-md-api-probe.json")
MODULES = (
    "ApiTypes",
    "export_api",
    "fabric_api",
    "import_api",
    "pattern_api",
    "utility_api",
)


def main() -> None:
    report: dict[str, object] = {
        "ok": True,
        "python": sys.version,
        "platform": platform.platform(),
        "modules": {},
    }
    for module_name in MODULES:
        try:
            module = importlib.import_module(module_name)
            report["modules"][module_name] = {
                "ok": True,
                "members": sorted(name for name in dir(module) if not name.startswith("_"))[:40],
            }
        except Exception:
            report["ok"] = False
            report["modules"][module_name] = {
                "ok": False,
                "error": traceback.format_exc(),
            }
    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

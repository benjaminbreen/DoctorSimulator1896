"""Harmless marker used to test Marvelous Designer's -python launch flag."""

from __future__ import annotations

import json
import pathlib
import sys
import time


pathlib.Path("/tmp/ghosts-md-cli-probe.json").write_text(
    json.dumps(
        {
            "ok": True,
            "python": sys.version,
            "timestamp": time.time(),
        },
        indent=2,
    ),
    encoding="utf-8",
)

"""Record which exact vtac commit produced an artifact (stored in model_config.json)."""

from __future__ import annotations

import json
from importlib import metadata


def installed_git_ref(default: str | None = None) -> str | None:
    """Commit id if vtac was pip-installed from a git URL (Colab), else ``default``."""
    try:
        raw = metadata.distribution("vtac").read_text("direct_url.json")
        if raw:
            return json.loads(raw).get("vcs_info", {}).get("commit_id", default)
    except (metadata.PackageNotFoundError, ValueError):
        pass
    return default

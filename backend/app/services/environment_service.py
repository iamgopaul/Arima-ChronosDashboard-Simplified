from __future__ import annotations

import importlib.metadata
import shutil
import subprocess
from typing import Any, Dict, Optional


def _run_version_command(command: list[str]) -> Optional[str]:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, check=True)
    except Exception:
        return None
    output = completed.stdout.strip() or completed.stderr.strip()
    return output.splitlines()[0] if output else None


def _package_version(name: str) -> Optional[str]:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def get_environment_summary() -> Dict[str, Any]:
    r_version = _run_version_command(['R', '--version'])

    gretl_command = shutil.which('gretlcli') or shutil.which('gretl')
    gretl_version = None
    if gretl_command:
        gretl_version = _run_version_command([gretl_command, '--version'])

    return {
        'pythonVersion': _run_version_command(['python3', '--version']),
        'rVersion': r_version,
        'gretl': {
            'installed': bool(gretl_command),
            'command': gretl_command,
            'version': gretl_version,
        },
        'packages': {
            'fastapi': _package_version('fastapi'),
            'statsmodels': _package_version('statsmodels'),
            'torch': _package_version('torch'),
            'chronos-forecasting': _package_version('chronos-forecasting'),
        },
    }

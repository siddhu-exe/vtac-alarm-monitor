"""Shared preprocessing, features and metrics for ICU VT false-alarm reduction.

Core import is numpy/scipy only so the backend stays light. Heavy deps (wfdb, pandas,
neurokit2, sklearn) are imported lazily inside the modules that need them.
"""

from vtac.config import VtacConfig, load_config

__version__ = "0.1.0"
__all__ = ["VtacConfig", "load_config", "__version__"]

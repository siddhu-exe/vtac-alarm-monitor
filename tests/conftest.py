import numpy as np
import pytest

from vtac.config import VtacConfig


@pytest.fixture(scope="session")
def cfg() -> VtacConfig:
    return VtacConfig()


@pytest.fixture(scope="session")
def seg_true(cfg: VtacConfig) -> np.ndarray:
    from vtac.synthetic import make_segment

    return make_segment(cfg, True, seed=1)


@pytest.fixture(scope="session")
def seg_false(cfg: VtacConfig) -> np.ndarray:
    from vtac.synthetic import make_segment

    return make_segment(cfg, False, seed=2)

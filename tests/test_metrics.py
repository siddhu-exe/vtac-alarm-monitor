import numpy as np
import pytest

from vtac import metrics as m


def test_challenge_score_formula():
    assert m.challenge_score(tp=8, tn=80, fp=10, fn=2) == pytest.approx(88 / (88 + 10 + 10))


def _data(n=2000, seed=0):
    rng = np.random.default_rng(seed)
    y = (rng.random(n) < 0.29).astype(int)
    p = np.clip(0.5 * y + rng.normal(0.3, 0.2, n), 0, 1)
    return y, np.round(p, 2)  # rounding creates ties


def test_auc_matches_sklearn():
    sk = pytest.importorskip("sklearn.metrics")
    y, p = _data()
    assert m.roc_auc(y, p) == pytest.approx(sk.roc_auc_score(y, p))
    assert m.pr_auc(y, p) == pytest.approx(sk.average_precision_score(y, p))


def test_sweep_matches_direct_evaluation():
    y, p = _data(300, 1)
    sw = m.threshold_sweep(y, p)
    for k in (0, 5, len(sw["thr"]) // 2, len(sw["thr"]) - 1):
        tp, tn, fp, fn = m.confusion(y, p >= sw["thr"][k])
        assert (tp, fp, tn, fn) == (sw["tp"][k], sw["fp"][k], sw["tn"][k], sw["fn"][k])


def test_constrained_threshold_respects_tpr_and_is_not_better():
    y, p = _data()
    r = m.tune_thresholds(y, p, tpr_target=0.95)
    assert r["constrained"]["tpr"] >= 0.95
    assert r["constrained"]["challenge_score"] <= r["unconstrained"]["challenge_score"] + 1e-12
    # unconstrained optimum really is the max over a brute-force sweep
    best = max(m.evaluate(y, p, t)["challenge_score"] for t in np.unique(p))
    assert r["unconstrained"]["challenge_score"] == pytest.approx(best)


def test_group_bootstrap_ci_brackets_point_estimate():
    y, p = _data(600, 2)
    groups = np.arange(600) // 3
    lo, hi = m.group_bootstrap_ci(m.roc_auc, y, p, groups, n_boot=200)
    assert lo <= m.roc_auc(y, p) <= hi

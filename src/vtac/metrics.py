"""Metrics and threshold tuning (numpy/scipy only; no sklearn so the backend stays light).

Positive class = TRUE VT alarm. A false negative (true alarm suppressed) costs 5x a false positive,
which is the PhysioNet/CinC 2015 Challenge Score weighting.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np
from scipy.stats import rankdata

FN_COST = 5.0


def challenge_score(tp: float, tn: float, fp: float, fn: float) -> float:
    denom = tp + tn + fp + FN_COST * fn
    return float((tp + tn) / denom) if denom > 0 else float("nan")


def confusion(y: np.ndarray, pred: np.ndarray) -> tuple[int, int, int, int]:
    y, pred = np.asarray(y).astype(bool), np.asarray(pred).astype(bool)
    return (
        int((y & pred).sum()),
        int((~y & ~pred).sum()),
        int((~y & pred).sum()),
        int((y & ~pred).sum()),
    )


def roc_auc(y: np.ndarray, p: np.ndarray) -> float:
    y = np.asarray(y).astype(bool)
    n_pos, n_neg = int(y.sum()), int((~y).sum())
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    ranks = rankdata(p)  # average ranks handle ties
    return float((ranks[y].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def pr_auc(y: np.ndarray, p: np.ndarray) -> float:
    """Average precision (step-wise, sklearn convention)."""
    y = np.asarray(y).astype(bool)
    if not y.any():
        return float("nan")
    order = np.argsort(-np.asarray(p), kind="stable")
    ps, ys = np.asarray(p)[order], y[order]
    last = np.r_[np.flatnonzero(np.diff(ps)), len(ps) - 1]  # last index of each distinct score
    tp = np.cumsum(ys)[last]
    fp = (last + 1) - tp
    precision = tp / (tp + fp)
    recall = tp / y.sum()
    return float(np.sum(np.diff(np.r_[0.0, recall]) * precision))


def evaluate(y: np.ndarray, p: np.ndarray, threshold: float) -> dict[str, Any]:
    tp, tn, fp, fn = confusion(y, np.asarray(p) >= threshold)
    return {
        "threshold": float(threshold),
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tpr": tp / (tp + fn) if tp + fn else float("nan"),
        "tnr": tn / (tn + fp) if tn + fp else float("nan"),
        "ppv": tp / (tp + fp) if tp + fp else float("nan"),
        "challenge_score": challenge_score(tp, tn, fp, fn),
        "pr_auc": pr_auc(y, p),
        "roc_auc": roc_auc(y, p),
    }


def threshold_sweep(y: np.ndarray, p: np.ndarray) -> dict[str, np.ndarray]:
    """Counts at every candidate threshold (rule: predict TRUE iff p >= t), plus 'predict none'."""
    y, p = np.asarray(y).astype(bool), np.asarray(p, dtype=float)
    order = np.argsort(-p, kind="stable")
    ps, ys = p[order], y[order]
    last = np.r_[np.flatnonzero(np.diff(ps)), len(ps) - 1]
    tp = np.cumsum(ys)[last]
    fp = (last + 1) - tp
    thr = ps[last]
    n_pos, n_neg = int(y.sum()), int((~y).sum())
    thr = np.r_[np.nextafter(thr[0], np.inf), thr]  # above max score: nothing predicted true
    tp, fp = np.r_[0, tp], np.r_[0, fp]
    fn, tn = n_pos - tp, n_neg - fp
    denom = tp + tn + fp + FN_COST * fn
    score = np.divide(tp + tn, denom, out=np.full(len(tp), np.nan), where=denom > 0)
    tpr = tp / n_pos if n_pos else np.full(len(tp), np.nan)
    return {"thr": thr, "tp": tp, "fp": fp, "tn": tn, "fn": fn, "score": score, "tpr": tpr}


def _pick(sw: dict[str, np.ndarray], feasible: np.ndarray, plateau_tol: float) -> float:
    score = np.where(feasible, sw["score"], -np.inf)
    best = np.nanmax(score)
    # tie-break toward higher TPR, then lower threshold (safer: more alarms kept)
    cand = np.flatnonzero(feasible & (sw["score"] >= best - max(plateau_tol, 1e-12)))
    if plateau_tol <= 0:
        top = cand[sw["tpr"][cand] == sw["tpr"][cand].max()]
        return float(sw["thr"][top].min())
    return float(np.median(sw["thr"][cand]))  # centre of the near-optimal plateau


def tune_thresholds(
    y: np.ndarray, p: np.ndarray, tpr_target: float = 0.95, plateau_tol: float = 0.0
) -> dict[str, dict[str, Any]]:
    """Return both operating points, evaluated on (y, p):

    - ``unconstrained``: maximise the Challenge Score.
    - ``constrained``: maximise it subject to TPR >= ``tpr_target`` (hard constraint).
    Tune on VALIDATION only; apply to test once.
    """
    sw = threshold_sweep(y, p)
    out: dict[str, dict[str, Any]] = {}
    for name, feasible in (
        ("unconstrained", np.ones_like(sw["thr"], dtype=bool)),
        ("constrained", sw["tpr"] >= tpr_target),
    ):
        t = _pick(sw, feasible, plateau_tol)
        out[name] = evaluate(y, p, t)
    out["constrained"]["tpr_target"] = tpr_target
    return out


def group_bootstrap_ci(
    fn: Callable[[np.ndarray, np.ndarray], float],
    y: np.ndarray,
    p: np.ndarray,
    groups: np.ndarray,
    n_boot: int = 1000,
    seed: int = 0,
    alpha: float = 0.05,
) -> tuple[float, float]:
    """Percentile CI resampling PATIENTS (events cluster by patient), not events."""
    y, p, groups = np.asarray(y), np.asarray(p), np.asarray(groups)
    uniq, inv = np.unique(groups, return_inverse=True)
    members = [np.flatnonzero(inv == i) for i in range(len(uniq))]
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n_boot):
        pick = rng.integers(0, len(uniq), len(uniq))
        idx = np.concatenate([members[i] for i in pick])
        v = fn(y[idx], p[idx])
        if np.isfinite(v):
            vals.append(v)
    lo, hi = np.quantile(vals, [alpha / 2, 1 - alpha / 2])
    return float(lo), float(hi)

"""Split verification and validation-set carving. Colab / data-prep only (pandas, sklearn)."""

from __future__ import annotations

from typing import Any

VAL_NAMES = {"val", "valid", "validation"}


def check_patient_level(df: Any, split_col: str = "split", patient_col: str = "record") -> dict:
    """Report patients present in more than one split (empty for a patient-level split)."""
    n_splits = df.groupby(patient_col)[split_col].nunique()
    leaking = sorted(n_splits[n_splits > 1].index.tolist())
    return {
        "patient_level": not leaking,
        "n_patients": int(n_splits.size),
        "n_leaking_patients": len(leaking),
        "leaking_patients": leaking,
        "events_per_split": df[split_col].value_counts().to_dict(),
    }


def add_validation_split(
    df: Any,
    label_col: str = "y",
    split_col: str = "split",
    patient_col: str = "record",
    val_frac: float = 0.15,
    seed: int = 42,
    val_name: str = "val",
) -> Any:
    """If the official split has no validation set, carve one out of TRAIN grouped by patient and
    stratified by label (fixed seed). Test is never touched. Returns a new DataFrame."""
    from sklearn.model_selection import StratifiedGroupKFold

    out = df.copy()
    if set(out[split_col].str.lower()) & VAL_NAMES:
        return out
    train_idx = out.index[out[split_col] == "train"]
    train = out.loc[train_idx]
    k = max(2, round(1 / val_frac))
    sgkf = StratifiedGroupKFold(n_splits=k, shuffle=True, random_state=seed)
    _, val_pos = next(sgkf.split(train, train[label_col], groups=train[patient_col]))
    out.loc[train.index[val_pos], split_col] = val_name
    return out

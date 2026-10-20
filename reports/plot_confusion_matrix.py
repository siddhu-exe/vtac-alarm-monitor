"""Draw the served CNN's test-set confusion matrix from ``models/model_config.json``.

Laptop-safe (reads saved counts only; no model, no data). matplotlib is not a project dependency:

    uv run --with matplotlib python reports/plot_confusion_matrix.py

Writes ``reports/confusion_matrix.png``.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

CONFIG = Path("models/model_config.json")
OUT = Path("reports/confusion_matrix.png")


def main() -> None:
    test = json.loads(CONFIG.read_text())["extra"]["test"]["constrained"]
    tp, fn, fp, tn = test["tp"], test["fn"], test["fp"], test["tn"]
    counts = [[tp, fn], [fp, tn]]
    labels = [["TP", "FN (missed)"], ["FP", "TN"]]
    row_totals = [tp + fn, fp + tn]

    fig, ax = plt.subplots(figsize=(5.6, 4.6))
    ax.imshow(counts, cmap="Blues", vmin=0, vmax=max(tp, tn) * 1.15)
    for i in range(2):
        for j in range(2):
            value = counts[i][j]
            colour = "white" if value > max(tp, tn) * 0.55 else "black"
            ax.text(j, i - 0.08, str(value), ha="center", va="center", fontsize=22, color=colour)
            share = value / row_totals[i]
            ax.text(
                j,
                i + 0.22,
                f"{labels[i][j]} · {share:.1%} of row",
                ha="center",
                va="center",
                fontsize=9,
                color=colour,
            )
    ax.set_xticks([0, 1], ["Escalate", "Suppress"])
    ax.set_yticks([0, 1], [f"True VT\n(n={row_totals[0]})", f"False alarm\n(n={row_totals[1]})"])
    ax.set_xlabel("Model decision")
    ax.set_ylabel("Ground truth")
    ax.xaxis.set_label_position("top")
    ax.xaxis.tick_top()
    ax.set_title(
        f"ResNet1D (C4), test set, τ = {test['threshold']:.3f}\n"
        f"TPR {test['tpr']:.3f} · TNR {test['tnr']:.3f} · PPV {test['ppv']:.3f}",
        y=-0.12,
        fontsize=10,
    )
    fig.tight_layout()
    fig.savefig(OUT, dpi=150)


if __name__ == "__main__":
    main()

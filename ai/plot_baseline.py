"""Draws the chart that ai/notebooks/baseline.ipynb also produces: sleep hours and
resting heart rate over the two weeks, with the model's baseline band and the day
it flagged a real change — next to where the fixed color thresholds catch up (if
at all). Useful on its own for slides.

    python ai/plot_baseline.py [--out ai/notebooks/baseline.png]
"""
import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from baseline import analyze, _daily_means, BASELINE_DAYS

DATA = Path(__file__).parent.parent / "data" / "mock" / "day143.json"
THRESHOLDS = Path(__file__).parent.parent / "research" / "thresholds.json"


def first_non_green_day(metric: str, daily: dict[str, float]) -> str | None:
    if not THRESHOLDS.exists():
        return None
    rules = json.loads(THRESHOLDS.read_text(encoding="utf-8")).get(metric)
    if not rules:
        return None
    for day in sorted(daily):
        v = daily[day]
        for b in rules["bands"]:
            lo, hi = b.get("min"), b.get("max")
            if (lo is None or v >= lo) and (hi is None or v < hi):
                if b["color"] != "green":
                    return day
                break
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(Path(__file__).parent / "notebooks" / "baseline.png"))
    args = p.parse_args()

    readings = json.loads(DATA.read_text(encoding="utf-8"))
    result = analyze(readings, "crew-1")
    anomaly_by_metric = {a["metric"]: a for a in result["anomalies"]}

    fig, axes = plt.subplots(2, 1, figsize=(10, 7), sharex=False)

    for ax, metric, ylabel in [
        (axes[0], "sleep_hours", "Sleep (h)"),
        (axes[1], "heart_rate", "Resting heart rate (bpm)"),
    ]:
        daily = _daily_means(readings, metric)
        days = sorted(daily)
        values = [daily[d] for d in days]
        x = list(range(1, len(days) + 1))

        base = result["baseline"].get(metric, {})
        mean, std = base.get("mean"), base.get("std")

        ax.plot(x, values, marker="o", color="#1B4FD8", label="daily mean")
        if mean is not None:
            ax.axhspan(mean - std, mean + std, xmin=0, xmax=(BASELINE_DAYS - 0.5) / len(days),
                       color="#1B4FD8", alpha=0.15, label="week-1 baseline ± 1 std")
            ax.axhline(mean, color="#1B4FD8", linestyle=":", linewidth=1)

        a = anomaly_by_metric.get(metric)
        if a:
            since_day = a["since"][:10]
            if since_day in days:
                sx = days.index(since_day) + 1
                ax.axvline(sx, color="#E67E22", linestyle="--", label=f"model flags it: {since_day}")

        color_day = first_non_green_day(metric, daily)
        if color_day and color_day in days:
            cx = days.index(color_day) + 1
            ax.axvline(cx, color="#C0392B", linestyle="--", label=f"fixed color turns non-green: {color_day}")
        elif a:
            ax.text(0.98, 0.05, "fixed color never leaves green", transform=ax.transAxes,
                    ha="right", color="#C0392B", fontsize=9)

        ax.axvline(BASELINE_DAYS + 0.5, color="gray", linewidth=1)
        ax.set_ylabel(ylabel)
        ax.set_xlabel("day of the 14-day scenario")
        ax.legend(loc="upper left", fontsize=8)
        ax.set_title(f"{metric}: week 1 baseline vs. week 2 drift")

    fig.suptitle("AstroPulse — baseline model catches the drift before the fixed color thresholds do", fontsize=11)
    fig.tight_layout()
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.out, dpi=130)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()

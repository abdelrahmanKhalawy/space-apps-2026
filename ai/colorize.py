"""Fills in `colorStillGreen` on an analyze() result: true when the fixed color
threshold (research/thresholds.json) was still green on the day the model first
flagged the anomaly. That gap — model catches it, color hasn't moved — is the demo's
whole point (contracts/ai.md). Pure stdlib, no network or extra packages needed.
"""
from __future__ import annotations

import json
import statistics
from collections import defaultdict
from pathlib import Path


def _color_of(rules: dict, value: float) -> str | None:
    for b in rules["bands"]:
        lo, hi = b.get("min"), b.get("max")
        if (lo is None or value >= lo) and (hi is None or value < hi):
            return b["color"]
    return None


def attach_still_green(result: dict, thresholds_path: str | Path, readings: list[dict] | None = None) -> dict:
    """Mutates result['anomalies'] in place, setting colorStillGreen on each.

    Needs the metric's value on the `since` day to know its color then. If `readings`
    is given, that value is the real daily mean; otherwise falls back to the
    baseline mean (a reasonable stand-in — still usually inside the green band)."""
    path = Path(thresholds_path)
    rules_by_metric = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    daily_by_metric: dict[str, dict[str, float]] = {}
    if readings:
        for r in readings:
            daily_by_metric.setdefault(r["metric"], defaultdict(list))[r["takenAt"][:10]].append(r["value"])
        for metric, by_day in daily_by_metric.items():
            daily_by_metric[metric] = {d: statistics.fmean(vs) for d, vs in by_day.items()}

    for a in result.get("anomalies", []):
        metric = a["metric"]
        rules = rules_by_metric.get(metric)
        if rules is None:
            a["colorStillGreen"] = None
            continue

        since_day = a["since"][:10]
        value = daily_by_metric.get(metric, {}).get(since_day)
        if value is None:
            value = result["baseline"].get(metric, {}).get("mean")

        color = _color_of(rules, value) if value is not None else None
        a["colorStillGreen"] = (color == "green") if color is not None else None

    return result

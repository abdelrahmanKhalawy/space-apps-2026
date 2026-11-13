"""The simplest thing that works: mean + standard deviation from week 1, per metric,
then flag week 2 days that drift away from it. Matches contracts/ai.md's /analyze shape.

Usage:
    python ai/baseline.py                              # reads data/mock/day143.json
    python ai/baseline.py --crew crew-1 --out out.json

As a library:
    from baseline import analyze
    result = analyze(readings, crew_id="crew-1")        # readings: list of dicts, contracts/reading.md shape
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

# Z-score past this, for two days running, counts as a real deviation (not one noisy reading).
Z_THRESHOLD = 1.3
SUSTAINED_DAYS = 2
BASELINE_DAYS = 7


def _parse(t: str) -> datetime:
    return datetime.strptime(t, "%Y-%m-%dT%H:%M:%SZ")


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _daily_means(readings: list[dict], metric: str) -> dict[str, float]:
    """One value per day for a metric: the day's mean (smooths hourly device noise,
    and the normal day/night heart-rate dip, without hiding a real multi-day drift)."""
    by_day: dict[str, list[float]] = defaultdict(list)
    for r in readings:
        if r["metric"] == metric:
            day = r["takenAt"][:10]
            by_day[day].append(r["value"])
    return {day: statistics.fmean(vals) for day, vals in by_day.items()}


def analyze(readings: list[dict], crew_id: str) -> dict:
    mine = [r for r in readings if r["crewId"] == crew_id]
    metrics = sorted({r["metric"] for r in mine})

    baseline: dict[str, dict] = {}
    anomalies: list[dict] = []

    for metric in metrics:
        daily = _daily_means(mine, metric)
        days = sorted(daily)
        if len(days) < BASELINE_DAYS + SUSTAINED_DAYS:
            continue  # not enough history to call anything a trend yet

        base_days = days[:BASELINE_DAYS]
        base_values = [daily[d] for d in base_days]
        mean = statistics.fmean(base_values)
        std = statistics.pstdev(base_values) or 0.05  # a silent metric still gets a tiny, non-zero std

        baseline[metric] = {"mean": round(mean, 2), "std": round(std, 2)}

        # z-score for every day after the baseline window
        z_by_day = {}
        for d in days[BASELINE_DAYS:]:
            z_by_day[d] = (daily[d] - mean) / std

        # first day that starts a run of SUSTAINED_DAYS consecutive days over threshold
        check_days = days[BASELINE_DAYS:]
        since = None
        direction = None
        peak_score = 0.0
        for i in range(len(check_days) - SUSTAINED_DAYS + 1):
            window = check_days[i : i + SUSTAINED_DAYS]
            zs = [z_by_day[d] for d in window]
            if all(abs(z) >= Z_THRESHOLD for z in zs) and len({z > 0 for z in zs}) == 1:
                since = window[0]
                direction = "up" if zs[0] > 0 else "down"
                peak_score = max(abs(z) for z in z_by_day.values() if (z > 0) == (zs[0] > 0))
                break

        if since is not None:
            anomalies.append({
                "metric": metric,
                "since": _iso(_parse(since + "T00:00:00Z")),
                "direction": direction,
                "score": round(peak_score, 2),
                "colorStillGreen": None,  # filled in by the caller, which knows the color rules
            })

    return {"crewId": crew_id, "baseline": baseline, "anomalies": anomalies}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default=str(Path(__file__).parent.parent / "data" / "mock" / "day143.json"))
    p.add_argument("--crew", default="crew-1")
    p.add_argument("--out")
    args = p.parse_args()

    readings = json.loads(Path(args.data).read_text(encoding="utf-8"))
    result = analyze(readings, args.crew)
    text = json.dumps(result, ensure_ascii=False, indent=2)

    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()

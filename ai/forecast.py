""""If this keeps up, it'll be red in N days." A straight line through the last
week of daily means, extrapolated to the nearest red boundary. Matches
contracts/ai.md's /forecast.

    from forecast import forecast_one, forecast_all
"""
from __future__ import annotations

import json
import statistics
from collections import defaultdict
from pathlib import Path

DEFAULT_THRESHOLDS = Path(__file__).resolve().parent.parent / "research" / "thresholds.json"
WINDOW_DAYS = 7  # "last few days" — brief says a straight line is fine
MAX_DAYS = 60  # a forecast past ~2 months isn't a forecast, it's noise


def load_thresholds(path: str | Path = DEFAULT_THRESHOLDS) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def daily_means(readings: list[dict], metric: str) -> dict[str, float]:
    by_day: dict[str, list[float]] = defaultdict(list)
    for r in readings:
        if r["metric"] == metric:
            by_day[r["takenAt"][:10]].append(r["value"])
    return {d: statistics.fmean(vs) for d, vs in by_day.items()}


_daily_means = daily_means  # kept for internal callers below


def color_of(thresholds: dict, metric: str, value: float) -> str | None:
    rules = thresholds.get(metric)
    if rules is None:
        return None
    for b in rules["bands"]:
        lo, hi = b.get("min"), b.get("max")
        if (lo is None or value >= lo) and (hi is None or value < hi):
            return b["color"]
    return None


def _fit_line(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """Least-squares slope/intercept, plus R² (0..1, how straight the line really is)."""
    n = len(xs)
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    slope = sxy / sxx if sxx else 0.0
    intercept = my - slope * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / ss_tot if ss_tot else 1.0
    return slope, intercept, r2


def _nearest_red_boundary(bands: list[dict], current: float, slope: float) -> float | None:
    """The red threshold the value is headed toward, given which way it's moving.
    None if there's no red band on that side (so nothing to forecast)."""
    direction = "up" if slope > 0 else "down"
    candidates = []
    for b in bands:
        if b["color"] != "red":
            continue
        if direction == "up" and b.get("min") is not None and b["min"] >= current:
            candidates.append(b["min"])
        if direction == "down" and b.get("max") is not None and b["max"] <= current:
            candidates.append(b["max"])
    if not candidates:
        return None
    return min(candidates) if direction == "up" else max(candidates)


def _confidence(r2: float, n: int) -> str:
    if n < 4:
        return "low"
    if r2 >= 0.8:
        return "high"
    if r2 >= 0.5:
        return "medium"
    return "low"


def forecast_one(metric: str, daily: dict[str, float], thresholds: dict, since: str | None = None) -> dict | None:
    """None, not a wrong number, when the metric isn't trending toward red —
    the brief is explicit about this.

    since: the first day of the window to fit (e.g. the anomaly's own "since"),
    so the line only sees the declining stretch — not diluted by the flat week
    before it. Without it, just the trailing WINDOW_DAYS is used."""
    rules = thresholds.get(metric)
    if rules is None:
        return None

    all_days = sorted(daily)
    days = [d for d in all_days if d >= since] if since else all_days[-WINDOW_DAYS:]
    if len(days) < 3:
        return None  # not enough history for a trend line to mean anything

    xs = list(range(len(days)))
    ys = [daily[d] for d in days]
    slope, intercept, r2 = _fit_line(xs, ys)

    if abs(slope) < 1e-9:
        return None  # flat — nothing to forecast

    current = ys[-1]
    boundary = _nearest_red_boundary(rules["bands"], current, slope)
    if boundary is None:
        return None  # already as bad as it gets, or moving the safe way

    days_to_red = (boundary - current) / slope
    if days_to_red <= 0 or days_to_red > MAX_DAYS:
        return None  # already past it, or too far out to call a forecast

    return {
        "metric": metric,
        "daysToRed": round(days_to_red, 1),
        "confidence": _confidence(r2, len(days)),
    }


def forecast_all(
    readings: list[dict],
    metrics: list[str],
    thresholds: dict,
    since: dict[str, str] | None = None,
    as_of: dict[str, str] | None = None,
) -> list[dict]:
    """since/as_of: {metric: "YYYY-MM-DD"} — the window to fit the line on.
    Pass each anomaly's "since" date as both (or as_of a day or two later, for a
    few more points): without this, the model would rather use every available
    day, diluting the real decline with the flat week before it, or forecast
    metrics that are *already* red (nothing left to predict)."""
    since = since or {}
    as_of = as_of or {}
    out = []
    for metric in metrics:
        daily = _daily_means(readings, metric)
        cutoff = as_of.get(metric)
        if cutoff:
            daily = {d: v for d, v in daily.items() if d <= cutoff}
        r = forecast_one(metric, daily, thresholds, since=since.get(metric))
        if r is not None:
            out.append(r)
    return out

"""Runs the whole day-143 scenario through the model once and saves the results, so
the server can fall back to these files if the AI service is down or slow (contracts/ai.md,
docs/decisions.md section 5). Pure stdlib — no FastAPI needed to run this.

    python ai/precompute.py
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

from baseline import analyze
from colorize import attach_still_green
from explain import explain_all, load_explanations
from forecast import color_of, daily_means, forecast_all, load_thresholds

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "mock" / "day143.json"
THRESHOLDS = ROOT / "research" / "thresholds.json"
EXPLANATIONS = ROOT / "research" / "explanations.json"
ANALYZE_OUT = ROOT / "data" / "precomputed" / "analyze.json"
EXPLAIN_OUT = ROOT / "data" / "precomputed" / "explain.json"
FORECAST_OUT = ROOT / "data" / "precomputed" / "forecast.json"


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {path}")


def main():
    readings = json.loads(DATA.read_text(encoding="utf-8"))
    result = analyze(readings, crew_id="crew-1")
    attach_still_green(result, THRESHOLDS, readings)
    write(ANALYZE_OUT, result)

    explanations = load_explanations(EXPLANATIONS)
    write(EXPLAIN_OUT, explain_all(result["anomalies"], explanations))

    thresholds = load_thresholds(THRESHOLDS)
    anomaly_metrics = [a["metric"] for a in result["anomalies"]]
    # Forecast "as of" the last day before each metric actually turned red in the
    # mock data, using its trailing week — the demo's exact moment: still not red,
    # here's the line saying it's about to be. (A straight line can't see the real
    # decline curving steeper later, so this keeps the forecast grounded in the
    # days right before the turn, not the calmer week before that.)
    as_of = {}
    for metric in anomaly_metrics:
        daily = daily_means(readings, metric)
        reds = sorted(d for d, v in daily.items() if color_of(thresholds, metric, v) == "red")
        if reds:
            as_of[metric] = (datetime.strptime(reds[0], "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    write(FORECAST_OUT, forecast_all(readings, anomaly_metrics, thresholds, as_of=as_of))


if __name__ == "__main__":
    main()

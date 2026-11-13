"""Runs the whole day-143 scenario through the model once and saves the results, so
the server can fall back to these files if the AI service is down or slow (contracts/ai.md,
docs/decisions.md section 5). Pure stdlib — no FastAPI needed to run this.

    python ai/precompute.py
"""
import json
from pathlib import Path

from baseline import analyze
from colorize import attach_still_green
from explain import explain_all, load_explanations

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "mock" / "day143.json"
THRESHOLDS = ROOT / "research" / "thresholds.json"
EXPLANATIONS = ROOT / "research" / "explanations.json"
ANALYZE_OUT = ROOT / "data" / "precomputed" / "analyze.json"
EXPLAIN_OUT = ROOT / "data" / "precomputed" / "explain.json"


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


if __name__ == "__main__":
    main()

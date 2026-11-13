"""Runs the whole day-143 scenario through the model once and saves the result, so
the server can fall back to this file if the AI service is down or slow (contracts/ai.md,
docs/decisions.md section 5). Pure stdlib — no FastAPI needed to run this.

    python ai/precompute.py
"""
import json
from pathlib import Path

from baseline import analyze
from colorize import attach_still_green

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "mock" / "day143.json"
THRESHOLDS = ROOT / "research" / "thresholds.json"
OUT = ROOT / "data" / "precomputed" / "analyze.json"


def main():
    readings = json.loads(DATA.read_text(encoding="utf-8"))
    result = analyze(readings, crew_id="crew-1")
    attach_still_green(result, THRESHOLDS, readings)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

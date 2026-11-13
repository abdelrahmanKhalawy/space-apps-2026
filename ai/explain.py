"""Turns a model anomaly (ai/baseline.py's output) into the astronaut-facing
explanation contracts/ai.md's /explain wants, using only Nada's sourced text
(research/explanations.json) — never anything invented.

    from explain import explain_one, explain_all
"""
from __future__ import annotations

import json
from pathlib import Path

DEFAULT_EXPLANATIONS = Path(__file__).resolve().parent.parent / "research" / "explanations.json"


def load_explanations(path: str | Path = DEFAULT_EXPLANATIONS) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def explain_one(anomaly: dict, explanations: dict) -> dict | None:
    """One anomaly -> one contracts/ai.md /explain response. None if we have no
    text for that metric at all (should not happen — n2 covers all 8)."""
    entry = explanations.get(anomaly["metric"])
    if entry is None:
        return None
    return {
        "metric": anomaly["metric"],
        "hazard": entry["hazard"],
        "explanation": entry["explanation"],
        "steps": entry["steps"],
        "sources": entry["sources"],
    }


def explain_all(anomalies: list[dict], explanations: dict) -> list[dict]:
    """Every anomaly, explained. When two or more share a hazard, each one also
    lists the others under 'relatedMetrics' — the brief's "link them into one
    explanation" step, done without inventing a combined sentence: the per-metric
    text stays exactly Nada's, and the dashboard groups the cards by hazard."""
    out = [r for r in (explain_one(a, explanations) for a in anomalies) if r is not None]

    by_hazard: dict[str, list[str]] = {}
    for r in out:
        by_hazard.setdefault(r["hazard"], []).append(r["metric"])

    for r in out:
        r["relatedMetrics"] = [m for m in by_hazard[r["hazard"]] if m != r["metric"]]

    return out

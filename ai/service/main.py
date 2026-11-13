"""FastAPI wrapper around ai/baseline.py's analyze(), matching contracts/ai.md's /analyze.

⚠️ Written without being able to run it: fastapi/uvicorn could not be installed or
imported on this machine today (PyPI itself was unreachable from this network — the
same connection-reset pattern as github.io and several health sites, see the team
chat). Shahd Ashraf: please `pip install -r requirements.txt` and smoke-test this
before relying on it; nothing here has been executed.

Run:
    pip install -r ai/service/requirements.txt
    uvicorn main:app --app-dir ai/service --port 8001
"""
import sys
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `import baseline` finds ai/baseline.py
from baseline import analyze
from colorize import attach_still_green

app = FastAPI(title="AstroPulse AI — baseline model")

THRESHOLDS_PATH = Path(__file__).resolve().parents[2] / "research" / "thresholds.json"


class Reading(BaseModel):
    crewId: str
    metric: str
    value: float
    unit: str
    takenAt: str
    source: str


class AnalyzeRequest(BaseModel):
    crewId: str
    readings: list[Reading]


@app.get("/health")
def health():
    return "ok"


@app.post("/analyze")
def post_analyze(body: AnalyzeRequest):
    readings = [r.model_dump() for r in body.readings]
    result = analyze(readings, crew_id=body.crewId)
    attach_still_green(result, THRESHOLDS_PATH)
    return result

"""Generates data/mock/day143.json: two weeks of readings for crew-1.

Run from anywhere:  python data/mock/generate.py
Same output every time (fixed seed), so it's safe to regenerate.

The story: week 1 is normal. In week 2 sleep and mood slip and resting heart
rate creeps up, slowly enough that a fixed-threshold app stays green until the
last two days. Day 143 is the last day (2026-11-13).

The numbers below are NOT clinical thresholds. They are placeholders around
typical values. Check the colors against research/thresholds.json once Nada's
thresholds exist, and nudge the DRIFT tables if the story doesn't land.
"""
import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

CREW = "crew-1"
DAYS = 14
LAST_DAY = datetime(2026, 11, 13, tzinfo=timezone.utc)  # "day 143"
START = LAST_DAY - timedelta(days=DAYS - 1)

rng = random.Random(143)

# Per-day values for the 14 days (index 0 = first day). Week 2 = index 7..13.
SLEEP_HOURS = [7.2, 7.3, 7.1, 7.2, 7.4, 7.2, 7.3, 7.2, 7.1, 7.05, 6.9, 6.6, 5.8, 4.9]
MOOD = [4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 3, 3, 2]
HR_DRIFT = [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 5, 7, 12, 18]  # added to resting bpm
BP_DRIFT = [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 7, 9]  # added to systolic
GLUCOSE_DRIFT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 5, 8]


def iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def reading(t, metric, value, unit, source="mock"):
    return {"crewId": CREW, "metric": metric, "value": value,
            "unit": unit, "takenAt": iso(t), "source": source}


def main():
    out = []
    for d in range(DAYS):
        day = START + timedelta(days=d)

        # Device: heart rate, SpO2 and skin temperature, every hour.
        for h in range(24):
            t = day + timedelta(hours=h)
            night = -3 if h < 6 else (2 if 9 <= h <= 18 else 0)
            hr = 64 + HR_DRIFT[d] + night + rng.gauss(0, 1.2)
            spo2 = 97.5 + rng.gauss(0, 0.5)
            wave = 0.25 * math.sin((h - 15) / 24 * 2 * math.pi)  # skin warms in the afternoon
            temp = 34.2 + wave + rng.gauss(0, 0.1)
            out.append(reading(t, "heart_rate", round(hr), "bpm"))
            out.append(reading(t, "spo2", min(100, max(94, round(spo2))), "%"))
            out.append(reading(t, "temperature", round(temp, 1), "C"))

        # Manual: sleep and mood once a day, blood pressure and glucose twice.
        out.append(reading(day + timedelta(hours=7), "sleep_hours",
                           round(SLEEP_HOURS[d] + rng.gauss(0, 0.05), 1), "h"))
        out.append(reading(day + timedelta(hours=21), "mood", MOOD[d], "score"))
        for hour in (8, 20):
            t = day + timedelta(hours=hour)
            sys_ = 118 + BP_DRIFT[d] + rng.gauss(0, 3)
            dia = 76 + BP_DRIFT[d] / 2 + rng.gauss(0, 2)
            # Blood pressure is two readings with the exact same time.
            out.append(reading(t, "bp_systolic", round(sys_), "mmHg", "mock"))
            out.append(reading(t, "bp_diastolic", round(dia), "mmHg", "mock"))
            glucose = 92 + GLUCOSE_DRIFT[d] + rng.gauss(0, 4)
            out.append(reading(t + timedelta(minutes=5), "glucose", round(glucose), "mg/dL"))

    out.sort(key=lambda r: (r["takenAt"], r["metric"]))

    path = Path(__file__).with_name("day143.json")
    lines = ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in out)
    path.write_text("[\n" + lines + "\n]\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(out)} readings to {path}")


if __name__ == "__main__":
    main()

"""Virtual crew trial: does a personal baseline warn earlier than fixed color thresholds?

A Monte Carlo experiment, in the spirit of NASA's Integrated Medical Model (also a
Monte Carlo risk simulation). We simulate many crew members with their own normal
values and day-to-day noise, give half of them a slow drift (the Day-143 story), and
measure how early each detector raises its hand and how often it cries wolf.

THIS IS A SIMULATION. The crews are synthetic and the noise levels are assumptions
(see ASSUMPTIONS below), so the numbers say how the method behaves under those
assumptions, not how it would behave on real astronauts. Nothing here is a clinical
validation. The sensitivity runs show how much the answer moves when the noise does.

Pre-registered hypotheses (written before the first run, committed with this file):

  H1  On drifting crews where both fire, the calibrated personal-baseline detector
      alarms earlier than the fixed colors changing: the 95% bootstrap CI of the
      median lead time is above 0 days.
  H2  The calibrated detector's false-alarm rate on healthy crews, over the 30-day
      window, is at most 5% on the held-out test set.
  H3  The calibrated detector catches at least 80% of drifting crews inside the window.

Method notes:
  * Parameters are chosen on a CALIBRATION set (seed 1) and reported on a separate TEST
    set (seed 2), so the headline numbers are not tuned on the data they are shown on.
  * "Production model" is the detector as it shipped (z >= 1.3 for 2 days, 7-day
    baseline). It is evaluated too, unchanged, so we can see how it really behaves.
  * Alarm day is the day the evidence is complete (last day of the sustained window),
    not the first day of the run, so the comparison does not cheat in our favour.
  * The fixed-color detector is the generous one: it alarms when any metric's color
    becomes WORSE than it was during the baseline week, so crews whose normal sits in
    yellow (a typical ISS sleeper) don't count against it permanently.

Usage:
    python ai/trial.py                      # writes data/trial/results.json
    python ai/trial.py --n 1000 --out x.json
"""
from __future__ import annotations

import argparse
import json
import math
import random
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THRESHOLDS = ROOT / "research" / "thresholds.json"

DAYS = 30
BASELINE_DAYS = 7  # same as ai/baseline.py
METRICS = ["heart_rate", "sleep_hours", "bp_systolic"]

# ASSUMPTIONS: the knobs that make this a simulation, not data.
#   between-person spread (how different two crew members' normals are) and
#   within-person day-to-day noise. Sleep's mean is set near the ISS figure
#   (6.17 +/- 1.38 h in one published sample); the rest are plausible round numbers.
#   Treat them as assumptions: the sensitivity runs scale the noise.
PERSON = {  # mean of the personal normal, sd between people, clip range
    "heart_rate": (66.0, 6.0, 52.0, 84.0),
    "sleep_hours": (6.5, 0.7, 5.3, 7.8),
    "bp_systolic": (116.0, 8.0, 98.0, 132.0),
}
DAILY_NOISE = {"heart_rate": 2.0, "sleep_hours": 0.5, "bp_systolic": 4.0}  # within-person sd
# A silent baseline must not produce a huge z from nothing: floor on the std we trust.
STD_FLOOR = {"heart_rate": 1.0, "sleep_hours": 0.25, "bp_systolic": 2.0}
# Drift per day once it starts (uniform between the two numbers).
DRIFT_PER_DAY = {
    "heart_rate": (0.6, 2.0),
    "sleep_hours": (-0.20, -0.05),
    "bp_systolic": (0.4, 1.2),
}
DRIFT_ONSET = (9, 16)  # day index range; always after the baseline week


# ---------------------------------------------------------------- thresholds
def load_bands() -> dict:
    t = json.loads(THRESHOLDS.read_text(encoding="utf-8"))
    return {m: t[m]["bands"] for m in METRICS}


SEVERITY = {"green": 0, "yellow": 1, "red": 2}


def color_of(bands: list[dict], value: float) -> str:
    for b in bands:
        lo, hi = b.get("min"), b.get("max")
        if (lo is None or value >= lo) and (hi is None or value < hi):
            return b["color"]
    return "green"


# ---------------------------------------------------------------- simulation
def make_crew(rng: random.Random, drifting: bool, noise_scale: float = 1.0) -> dict:
    """One simulated crew member: DAYS daily means per metric, plus the drift truth."""
    normal = {}
    for m, (mu, sd, lo, hi) in PERSON.items():
        normal[m] = min(hi, max(lo, rng.gauss(mu, sd)))

    onset = rng.randint(*DRIFT_ONSET) if drifting else None
    rates = {}
    if drifting:
        for m, (a, b) in DRIFT_PER_DAY.items():
            rates[m] = rng.uniform(a, b) if rng.random() < 0.8 else 0.0
        if all(v == 0.0 for v in rates.values()):  # at least one metric must really drift
            m = rng.choice(METRICS)
            rates[m] = rng.uniform(*DRIFT_PER_DAY[m])

    series = {m: [] for m in METRICS}
    for d in range(DAYS):
        for m in METRICS:
            v = normal[m] + rng.gauss(0, DAILY_NOISE[m] * noise_scale)
            if drifting and d >= onset:
                v += rates[m] * (d - onset + 1)
            series[m].append(v)
    return {"series": series, "drifting": drifting, "onset": onset}


# ---------------------------------------------------------------- detectors
# Each returns the alarm day (0-based index) or None. "Alarm day" = the day the
# evidence is complete, so a 2-day run alarms on its second day.
def fixed_color_change(series: dict, bands: dict) -> int | None:
    base = {m: max(SEVERITY[color_of(bands[m], series[m][d])] for d in range(BASELINE_DAYS)) for m in METRICS}
    for d in range(BASELINE_DAYS, DAYS):
        for m in METRICS:
            if SEVERITY[color_of(bands[m], series[m][d])] > base[m]:
                return d
    return None


def fixed_red(series: dict, bands: dict) -> int | None:
    """First day any metric is RED: the point where the app tells the crew to act."""
    for d in range(BASELINE_DAYS, DAYS):
        if any(color_of(bands[m], series[m][d]) == "red" for m in METRICS):
            return d
    return None


def fixed_non_green_days(series: dict, bands: dict) -> float:
    """Share of crew-days where any metric is not green: the 'alert fatigue' number."""
    bad = sum(1 for d in range(DAYS) if any(color_of(bands[m], series[m][d]) != "green" for m in METRICS))
    return bad / DAYS


def _baseline(vals: list[float], metric: str, use_floor: bool) -> tuple[float, float]:
    mean = statistics.fmean(vals[:BASELINE_DAYS])
    std = statistics.pstdev(vals[:BASELINE_DAYS])
    std = max(std, STD_FLOOR[metric]) if use_floor else (std or 0.05)
    return mean, std


def zscore(series: dict, z: float, sustained: int, use_floor: bool) -> int | None:
    best = None
    for m in METRICS:
        vals = series[m]
        mean, std = _baseline(vals, m, use_floor)
        zs = [(v - mean) / std for v in vals]
        for d in range(BASELINE_DAYS, DAYS - sustained + 1):
            w = zs[d:d + sustained]
            if all(x >= z for x in w) or all(x <= -z for x in w):
                alarm = d + sustained - 1
                best = alarm if best is None else min(best, alarm)
                break
    return best


def cusum(series: dict, k: float, h: float) -> int | None:
    """Two-sided CUSUM on standardized values: catches a small steady shift the
    z-score window can miss, because it accumulates evidence instead of needing a
    single big jump."""
    best = None
    for m in METRICS:
        vals = series[m]
        mean, std = _baseline(vals, m, True)
        up = down = 0.0
        for d in range(BASELINE_DAYS, DAYS):
            x = (vals[d] - mean) / std
            up = max(0.0, up + x - k)
            down = max(0.0, down - x - k)
            if up > h or down > h:
                best = d if best is None else min(best, d)
                break
    return best


# ---------------------------------------------------------------- evaluation
def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, c - half), min(1.0, c + half))


def bootstrap_median_ci(xs: list[float], rng: random.Random, reps: int = 2000) -> tuple[float, float]:
    if not xs:
        return (float("nan"), float("nan"))
    meds = sorted(statistics.median(rng.choices(xs, k=len(xs))) for _ in range(reps))
    return (meds[int(0.025 * reps)], meds[int(0.975 * reps)])


def make_set(n: int, seed: int, noise_scale: float):
    rng = random.Random(seed)
    drift = [make_crew(rng, True, noise_scale) for _ in range(n)]
    healthy = [make_crew(rng, False, noise_scale) for _ in range(n)]
    return drift, healthy


def evaluate(detect, drift, healthy, bands, boot_seed: int = 7) -> dict:
    """detect(series) -> alarm day or None. Compared against the fixed color change."""
    leads, delays, caught, fixed_caught, both = [], [], 0, 0, 0
    for c in drift:
        s = c["series"]
        a = detect(s)
        f = fixed_color_change(s, bands)
        if a is not None:
            caught += 1
            delays.append(a - c["onset"])
        if f is not None:
            fixed_caught += 1
        if a is not None and f is not None:
            both += 1
            leads.append(f - a)  # positive = personal detector earlier
    fa = sum(1 for c in healthy if detect(c["series"]) is not None)
    n = len(drift)
    lo, hi = bootstrap_median_ci(leads, random.Random(boot_seed))
    return {
        "n_drift": n,
        "n_healthy": len(healthy),
        "detected": caught,
        "detection_rate": caught / n,
        "detection_rate_ci": wilson(caught, n),
        "false_alarm_rate": fa / len(healthy),
        "false_alarm_rate_ci": wilson(fa, len(healthy)),
        "median_days_after_onset": statistics.median(delays) if delays else None,
        "both_fired": both,
        "median_lead_days": statistics.median(leads) if leads else None,
        "median_lead_ci": (lo, hi),
        "lead_share_earlier": (sum(1 for x in leads if x > 0) / len(leads)) if leads else None,
        "lead_histogram": histogram(leads),
    }


def onset_aligned(detect, drift, bands) -> dict:
    """POST-HOC (added after H1 failed as pre-registered; reported separately).

    On a drifting crew, a first alarm BEFORE the drift starts is a false alarm, not an
    early catch. Counting it as a catch flatters whichever detector is noisier. Here
    every detector is judged the same way: first alarm before onset = false alarm;
    first alarm on/after onset = a true detection with a delay. Lead is measured
    against both the fixed color change and the fixed RED, among crews where both
    detectors made a true detection."""
    n = len(drift)
    true_det = early_fa = 0
    delays, lead_change, lead_red = [], [], []
    for c in drift:
        s, on = c["series"], c["onset"]
        a = detect(s)
        if a is None:
            continue
        if a < on:
            early_fa += 1
            continue
        true_det += 1
        delays.append(a - on)
        f = fixed_color_change(s, bands)
        if f is not None and f >= on:
            lead_change.append(f - a)
        r = fixed_red(s, bands)
        if r is not None:
            lead_red.append(r - a)
    rng = random.Random(11)
    return {
        "true_detection_rate": true_det / n,
        "true_detection_ci": wilson(true_det, n),
        "alarm_before_onset_rate": early_fa / n,
        "median_days_after_onset": statistics.median(delays) if delays else None,
        "lead_vs_color_change": {"n": len(lead_change),
                                 "median": statistics.median(lead_change) if lead_change else None,
                                 "ci": bootstrap_median_ci(lead_change, rng),
                                 "share_earlier": (sum(1 for x in lead_change if x > 0) / len(lead_change)) if lead_change else None},
        "lead_vs_red": {"n": len(lead_red),
                        "median": statistics.median(lead_red) if lead_red else None,
                        "ci": bootstrap_median_ci(lead_red, rng),
                        "share_earlier": (sum(1 for x in lead_red if x > 0) / len(lead_red)) if lead_red else None},
    }


def tradeoff(drift, healthy, bands) -> dict:
    """POST-HOC operating curve: for every (z, days) and CUSUM setting, the healthy
    false-alarm rate against how fast and how reliably a real drift is caught.
    The fixed colors are a single point on this plot, because their cut-offs are not
    tunable. Matched comparison: the best personal setting whose false-alarm rate is no
    higher than the fixed colors'."""
    pts = []

    def point(label, family, det):
        o = onset_aligned(det, drift, bands)
        fa = sum(1 for c in healthy if det(c["series"]) is not None) / len(healthy)
        pts.append({"label": label, "family": family, "false_alarm_rate": fa,
                    "median_days_after_onset": o["median_days_after_onset"],
                    "true_detection_rate": o["true_detection_rate"]})

    for sus in (1, 2, 3, 4):
        for z in (1.5, 2.0, 2.5, 3.0, 4.0, 5.0):
            point(f"z>={z} for {sus}d", "zscore", lambda s, z=z, sus=sus: zscore(s, z, sus, True))
    for k in (0.5, 1.0):
        for h in (3, 4, 6, 8, 12):
            point(f"CUSUM k={k} h={h}", "cusum", lambda s, k=k, h=h: cusum(s, k, h))

    fixed_det = lambda s: fixed_color_change(s, bands)
    fo = onset_aligned(fixed_det, drift, bands)
    fixed_pt = {"label": "Fixed colors (color change)", "family": "fixed",
                "false_alarm_rate": sum(1 for c in healthy if fixed_det(c["series"]) is not None) / len(healthy),
                "median_days_after_onset": fo["median_days_after_onset"],
                "true_detection_rate": fo["true_detection_rate"]}
    ok = [p for p in pts if p["false_alarm_rate"] <= fixed_pt["false_alarm_rate"] and p["median_days_after_onset"] is not None]
    best = min(ok, key=lambda p: (p["median_days_after_onset"], -p["true_detection_rate"])) if ok else None
    low = [p for p in pts if p["false_alarm_rate"] <= 0.05 and p["median_days_after_onset"] is not None]
    best_low = min(low, key=lambda p: (p["median_days_after_onset"], -p["true_detection_rate"])) if low else None
    return {"points": pts, "fixed": fixed_pt, "matched_false_alarm": best, "at_5pct_false_alarm": best_low}


def histogram(leads: list[float]) -> dict:
    out: dict[str, int] = {}
    for x in leads:
        key = str(int(max(-6, min(10, x))))
        out[key] = out.get(key, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


def fixed_stats(drift, healthy, bands) -> dict:
    n = len(drift)
    caught = sum(1 for c in drift if fixed_color_change(c["series"], bands) is not None)
    fa = sum(1 for c in healthy if fixed_color_change(c["series"], bands) is not None)
    delays = [fixed_color_change(c["series"], bands) - c["onset"] for c in drift
              if fixed_color_change(c["series"], bands) is not None]
    fatigue = statistics.fmean(fixed_non_green_days(c["series"], bands) for c in healthy)
    return {
        "detected": caught,
        "detection_rate": caught / n,
        "detection_rate_ci": wilson(caught, n),
        "false_alarm_rate": fa / len(healthy),
        "false_alarm_rate_ci": wilson(fa, len(healthy)),
        "median_days_after_onset": statistics.median(delays) if delays else None,
        "healthy_days_not_green": fatigue,
    }


def calibrate_zscore(drift, healthy, bands, max_fa: float = 0.05) -> dict:
    """Pick (z, sustained) on the calibration set: the fastest detector whose
    healthy false-alarm rate stays within max_fa."""
    best = None
    for sustained in (2, 3, 4):
        for z in [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]:
            det = lambda s, z=z, sus=sustained: zscore(s, z, sus, True)
            r = evaluate(det, drift, healthy, bands)
            if r["false_alarm_rate"] <= max_fa and r["detection_rate"] >= 0.5:
                key = (r["median_days_after_onset"] if r["median_days_after_onset"] is not None else 99,
                       -r["detection_rate"])
                if best is None or key < best[0]:
                    best = (key, {"z": z, "sustained": sustained}, r)
    return best[1] if best else {"z": 5.0, "sustained": 4}


def calibrate_cusum(drift, healthy, bands, max_fa: float = 0.05) -> dict:
    best = None
    for k in (0.5, 1.0):
        for h in (3, 4, 5, 6, 8, 10, 12):
            det = lambda s, k=k, h=h: cusum(s, k, h)
            r = evaluate(det, drift, healthy, bands)
            if r["false_alarm_rate"] <= max_fa and r["detection_rate"] >= 0.5:
                key = (r["median_days_after_onset"] if r["median_days_after_onset"] is not None else 99,
                       -r["detection_rate"])
                if best is None or key < best[0]:
                    best = (key, {"k": k, "h": h}, r)
    return best[1] if best else {"k": 1.0, "h": 12}


def run(n: int, noise_scale: float = 1.0, cal=None) -> dict:
    bands = load_bands()
    cal_drift, cal_healthy = make_set(max(300, n // 2), seed=1, noise_scale=noise_scale)
    test_drift, test_healthy = make_set(n, seed=2, noise_scale=noise_scale)

    if cal is None:
        cal = {"zscore": calibrate_zscore(cal_drift, cal_healthy, bands),
               "cusum": calibrate_cusum(cal_drift, cal_healthy, bands)}

    z = cal["zscore"]
    cu = cal["cusum"]
    detectors = {
        "production": ("Production model as shipped (z >= 1.3, 2 days, 7-day baseline)",
                       lambda s: zscore(s, 1.3, 2, False)),
        "zscore": (f"Personal baseline, z-score calibrated (z >= {z['z']}, {z['sustained']} days)",
                   lambda s: zscore(s, z["z"], z["sustained"], True)),
        "cusum": (f"Personal baseline, CUSUM calibrated (k={cu['k']}, h={cu['h']})",
                  lambda s: cusum(s, cu["k"], cu["h"])),
    }
    out = {"noise_scale": noise_scale, "calibration": cal,
           "fixed": fixed_stats(test_drift, test_healthy, bands), "detectors": {}}
    for key, (label, det) in detectors.items():
        r = evaluate(det, test_drift, test_healthy, bands)
        r["label"] = label
        r["onset_aligned"] = onset_aligned(det, test_drift, bands)
        out["detectors"][key] = r
    out["fixed"]["onset_aligned"] = onset_aligned(lambda s: fixed_color_change(s, bands), test_drift, bands)
    out["tradeoff"] = tradeoff(test_drift, test_healthy, bands)
    out["fixed_red"] = {
        "detected": sum(1 for c in test_drift if fixed_red(c["series"], bands) is not None),
        "false_alarm_rate": sum(1 for c in test_healthy if fixed_red(c["series"], bands) is not None) / len(test_healthy),
        "onset_aligned": onset_aligned(lambda s: fixed_red(s, bands), test_drift, bands),
    }
    return out, (test_drift, test_healthy, detectors)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--n", type=int, default=1000, help="crews per arm in the test set")
    p.add_argument("--out", default=str(ROOT / "data" / "trial" / "results.json"))
    args = p.parse_args()

    main_res, (test_drift, test_healthy, detectors) = run(args.n)
    cal = main_res["calibration"]

    sens = {}
    for scale in (0.5, 1.5):
        sens[str(scale)], _ = run(args.n, noise_scale=scale, cal=cal)  # same params, other noise
    main_res["sensitivity"] = sens

    # Hypotheses, checked against the calibrated z-score detector on the test set.
    d = main_res["detectors"]["zscore"]
    lo, hi = d["median_lead_ci"]
    main_res["hypotheses"] = {
        "H1": {"text": "Median lead over the fixed color change is above 0 days (95% CI excludes 0)",
               "value": d["median_lead_days"], "ci": [lo, hi], "passed": bool(lo > 0)},
        "H2": {"text": "False-alarm rate on healthy crews is at most 5% (held-out test set)",
               "value": d["false_alarm_rate"], "passed": d["false_alarm_rate"] <= 0.05},
        "H3": {"text": "Detects at least 80% of drifting crews inside the window",
               "value": d["detection_rate"], "passed": d["detection_rate"] >= 0.80},
    }

    # A few real simulated crews, for the page's replay and for the JS parity test.
    bands = load_bands()
    z = cal["zscore"]
    fixtures = []
    for c in test_drift[:6] + test_healthy[:2]:
        # Alarms are computed on the ROUNDED series that gets published, so the JS port can
        # be checked against them exactly (web/src/evidence/parity.mjs).
        s = {m: [round(v, 3) for v in c["series"][m]] for m in METRICS}
        fixtures.append({
            "drifting": c["drifting"], "onset": c["onset"],
            "series": s,
            "alarms": {"fixed": fixed_color_change(s, bands), "fixed_red": fixed_red(s, bands),
                       "production": zscore(s, 1.3, 2, False),
                       "zscore": zscore(s, z["z"], z["sustained"], True),
                       "cusum": cusum(s, cal["cusum"]["k"], cal["cusum"]["h"])},
        })
    main_res["fixtures"] = fixtures
    main_res["config"] = {"days": DAYS, "baseline_days": BASELINE_DAYS, "n_per_arm": args.n,
                          "metrics": METRICS, "person": PERSON, "daily_noise": DAILY_NOISE,
                          "std_floor": STD_FLOOR, "drift_per_day": DRIFT_PER_DAY, "drift_onset": DRIFT_ONSET}

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(main_res, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    print(f"wrote {out}")
    for k, v in main_res["detectors"].items():
        print(f"{k:11s} detected {v['detection_rate']:.1%}  false alarms {v['false_alarm_rate']:.1%}  "
              f"lead {v['median_lead_days']} {v['median_lead_ci']}")
    f = main_res["fixed"]
    print(f"fixed       detected {f['detection_rate']:.1%}  false alarms {f['false_alarm_rate']:.1%}  "
          f"healthy days not green {f['healthy_days_not_green']:.1%}")
    tr = main_res["tradeoff"]
    print("-- post-hoc, matched false alarm --")
    print("fixed", {k: tr["fixed"][k] for k in ("false_alarm_rate", "median_days_after_onset", "true_detection_rate")})
    print("matched", tr["matched_false_alarm"])
    print("at 5%", tr["at_5pct_false_alarm"])
    print("-- post-hoc, onset-aligned --")
    for k, v in main_res["detectors"].items():
        o = v["onset_aligned"]
        print(f"{k:11s} true det {o['true_detection_rate']:.1%}  before-onset {o['alarm_before_onset_rate']:.1%}  "
              f"+{o['median_days_after_onset']}d after onset  lead vs change {o['lead_vs_color_change']['median']} "
              f"{o['lead_vs_color_change']['ci']} (n={o['lead_vs_color_change']['n']})  vs red {o['lead_vs_red']['median']} "
              f"{o['lead_vs_red']['ci']} (n={o['lead_vs_red']['n']})")
    o = main_res["fixed"]["onset_aligned"]
    print(f"fixed       true det {o['true_detection_rate']:.1%}  before-onset {o['alarm_before_onset_rate']:.1%}  +{o['median_days_after_onset']}d")
    o = main_res["fixed_red"]["onset_aligned"]
    print(f"fixed red   true det {o['true_detection_rate']:.1%}  before-onset {o['alarm_before_onset_rate']:.1%}  +{o['median_days_after_onset']}d  fa {main_res['fixed_red']['false_alarm_rate']:.1%}")
    for k, v in main_res["hypotheses"].items():
        print(k, "PASS" if v["passed"] else "FAIL", v["value"])


if __name__ == "__main__":
    main()

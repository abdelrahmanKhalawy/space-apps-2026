"""Checks for the i3 acceptance criteria (tasks/2-v2-space/i3-explain-cause.md).
Standard library only:

    python ai/test_explain.py
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from explain import explain_all, explain_one, load_explanations

ROOT = Path(__file__).resolve().parent.parent
ANALYZE = json.loads((ROOT / "data" / "precomputed" / "analyze.json").read_text(encoding="utf-8"))
EXPLAIN = json.loads((ROOT / "data" / "precomputed" / "explain.json").read_text(encoding="utf-8"))
TEXTS = load_explanations()
BY_METRIC = {e["metric"]: e for e in EXPLAIN}


class ExplainTests(unittest.TestCase):
    def test_sleep_anomaly_links_to_isolation_with_steps(self):
        sleep = BY_METRIC["sleep_hours"]
        self.assertEqual(sleep["hazard"], "isolation")
        self.assertGreaterEqual(len(sleep["steps"]), 1)

    def test_every_anomaly_is_explained(self):
        self.assertEqual(sorted(BY_METRIC), sorted(a["metric"] for a in ANALYZE["anomalies"]))

    def test_every_explanation_has_a_source(self):
        for e in EXPLAIN:
            self.assertTrue(e["sources"], e["metric"])
            for s in e["sources"]:
                self.assertTrue(s["title"], e["metric"])
                self.assertTrue(s["url"].startswith("https://"), e["metric"])

    def test_nothing_comes_from_outside_nadas_texts(self):
        """Hazard, explanation, steps and sources must match research/explanations.json word for word."""
        for e in EXPLAIN:
            src = TEXTS[e["metric"]]
            for key in ("hazard", "explanation", "steps", "sources"):
                self.assertEqual(e[key], src[key], f"{e['metric']}.{key}")

    def test_related_metrics_are_the_ones_sharing_the_hazard(self):
        isolation = {m for m, e in BY_METRIC.items() if e["hazard"] == "isolation"}
        self.assertEqual(isolation, {"sleep_hours", "mood", "glucose"})
        for e in EXPLAIN:
            same_hazard = {m for m, o in BY_METRIC.items() if o["hazard"] == e["hazard"]} - {e["metric"]}
            self.assertEqual(set(e["relatedMetrics"]), same_hazard, e["metric"])

    def test_a_lone_anomaly_has_no_related_metrics(self):
        out = explain_all([{"metric": "sleep_hours", "score": 3.0}], TEXTS)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["relatedMetrics"], [])

    def test_unknown_metric_is_skipped_not_invented(self):
        self.assertIsNone(explain_one({"metric": "made_up"}, TEXTS))
        self.assertEqual(explain_all([{"metric": "made_up"}], TEXTS), [])

    def test_precomputed_file_is_up_to_date(self):
        """If this fails, run  python ai/precompute.py  and commit the result."""
        self.assertEqual(EXPLAIN, json.loads(json.dumps(explain_all(ANALYZE["anomalies"], TEXTS))))

    @unittest.expectedFailure
    def test_no_team_review_note_reaches_the_astronaut(self):
        """KNOWN ISSUE: the glucose text in research/explanations.json still starts with
        "⚠️ Nada should double-check this one". That is a note for the team, and it is shown on the
        dashboard. Once Nada rewrites that entry this test starts passing, and unittest then reports an
        'unexpected success': delete the expectedFailure line."""
        for e in EXPLAIN:
            self.assertNotIn("⚠", e["explanation"], e["metric"])
            self.assertNotIn("Nada", e["explanation"], e["metric"])


if __name__ == "__main__":
    unittest.main()

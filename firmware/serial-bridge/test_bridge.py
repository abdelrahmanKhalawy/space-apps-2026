"""
Tests for bridge.py. They need only Python 3 and no device:  python -m unittest test_bridge -v
A small fake server stands in for POST /api/readings and applies the same rules as api/Readings/ReadingRules.cs.
"""

import json
import threading
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import bridge

NOW = datetime(2026, 11, 13, 21, 15, 0, tzinfo=timezone.utc)
UNITS = {"heart_rate": "bpm", "spo2": "%", "temperature": "C", "bp_systolic": "mmHg", "bp_diastolic": "mmHg",
         "glucose": "mg/dL", "sleep_hours": "h", "mood": "score"}


def one(line, **kw):
    readings, drops = bridge.parse_line(line, now=NOW, **kw)
    return readings, drops


class ParseLine(unittest.TestCase):
    def test_minimal_line_is_filled_in(self):
        readings, drops = one('{"metric":"heart_rate","value":72}')
        self.assertEqual(drops, [])
        self.assertEqual(readings, [{
            "crewId": "crew-1", "metric": "heart_rate", "value": 72, "unit": "bpm",
            "takenAt": "2026-11-13T21:15:00Z", "source": "device"}])

    def test_full_contract_line_keeps_its_fields(self):
        line = '{"crewId":"crew-2","metric":"spo2","value":97,"unit":"%","takenAt":"2026-11-13T21:14:30Z","source":"manual"}'
        readings, _ = one(line)
        self.assertEqual(readings[0]["crewId"], "crew-2")
        self.assertEqual(readings[0]["takenAt"], "2026-11-13T21:14:30Z")
        self.assertEqual(readings[0]["source"], "device")  # always the device, whatever the line says

    def test_fractional_seconds_are_removed(self):
        readings, _ = one('{"metric":"temperature","value":34.5,"takenAt":"2026-11-13T21:14:30.123Z"}')
        self.assertEqual(readings[0]["takenAt"], "2026-11-13T21:14:30Z")

    def test_wrong_device_clock_is_replaced_by_the_laptop_time(self):
        readings, drops = one('{"metric":"heart_rate","value":70,"takenAt":"1970-01-01T00:00:05Z"}')
        self.assertEqual(readings[0]["takenAt"], "2026-11-13T21:15:00Z")
        self.assertIn("clock fixed", drops)

    def test_time_without_z_is_replaced(self):
        readings, _ = one('{"metric":"heart_rate","value":70,"takenAt":"2026-11-13T21:14:30+02:00"}')
        self.assertEqual(readings[0]["takenAt"], "2026-11-13T21:15:00Z")

    def test_debug_prints_are_ignored_silently(self):
        for line in ("", "   ", "Booting...", "WiFi connected", "HR=72 SpO2=97", "# comment"):
            self.assertEqual(one(line), ([], []), line)

    def test_finger_off_is_skipped_not_sent_as_a_number(self):
        readings, drops = one('{"metric":"heart_rate","value":null}')
        self.assertEqual(readings, [])
        self.assertEqual(drops, ["no reading"])

    def test_impossible_values_are_dropped(self):
        for metric, value in (("heart_rate", 0), ("heart_rate", 300), ("spo2", -999), ("spo2", 101), ("temperature", 0), ("temperature", 99)):
            readings, drops = one(json.dumps({"metric": metric, "value": value}))
            self.assertEqual(readings, [], f"{metric}={value}")
            self.assertEqual(len(drops), 1)

    def test_values_at_the_edges_are_kept(self):
        for metric, value in (("heart_rate", 20), ("heart_rate", 250), ("spo2", 50), ("spo2", 100), ("temperature", 10), ("temperature", 45)):
            readings, _ = one(json.dumps({"metric": metric, "value": value}))
            self.assertEqual(len(readings), 1, f"{metric}={value}")

    def test_text_and_boolean_and_nan_values_are_dropped(self):
        for raw in ('"72"', "true", "NaN", "Infinity"):
            readings, drops = one('{"metric":"heart_rate","value":%s}' % raw)
            self.assertEqual(readings, [], raw)
            self.assertEqual(len(drops), 1, raw)

    def test_manual_metrics_are_not_device_readings(self):
        readings, drops = one('{"metric":"glucose","value":95}')
        self.assertEqual(readings, [])
        self.assertTrue(drops[0].startswith("not a device metric"))

    def test_wrong_unit_is_dropped(self):
        readings, _ = one('{"metric":"temperature","value":34.5,"unit":"F"}')
        self.assertEqual(readings, [])

    def test_a_list_of_readings_on_one_line(self):
        readings, drops = one('[{"metric":"heart_rate","value":70},{"metric":"spo2","value":96},{"metric":"spo2","value":null}]')
        self.assertEqual([r["metric"] for r in readings], ["heart_rate", "spo2"])
        self.assertEqual(drops, ["no reading"])

    def test_broken_json_is_reported(self):
        self.assertEqual(one('{"metric":"heart_rate","value":'), ([], ["bad JSON"]))

    def test_other_json_shapes_are_dropped(self):
        self.assertEqual(one("[1,2]")[0], [])
        self.assertEqual(one('"text"'), ([], []))  # not an object or list: treated as a debug print

    def test_crew_id_can_be_chosen(self):
        readings, _ = one('{"metric":"heart_rate","value":70}', crew_id="crew-9")
        self.assertEqual(readings[0]["crewId"], "crew-9")


class FakeServer:
    """POST /api/readings with the same all-or-nothing rules as the real server."""

    def __init__(self):
        self.saved = []
        self.requests = 0
        self.mode = "ok"  # ok | error500
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                outer.requests += 1
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                if outer.mode == "error500":
                    return self._reply(500, {"error": "boom"})
                items = body if isinstance(body, list) else [body]
                for r in items:
                    ok = (isinstance(r, dict) and UNITS.get(r.get("metric")) == r.get("unit")
                          and isinstance(r.get("value"), (int, float)) and str(r.get("takenAt", "")).endswith("Z")
                          and r.get("source") in ("device", "manual", "mock") and r.get("crewId"))
                    if not ok:
                        return self._reply(400, {"error": "Some readings are invalid. Nothing was saved."})
                outer.saved.extend(items)
                self._reply(201, items)

            def _reply(self, code, payload):
                data = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.http = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.http.server_port}"
        threading.Thread(target=self.http.serve_forever, daemon=True).start()

    def stop(self):
        self.http.shutdown()
        self.http.server_close()


def reading(metric="heart_rate", value=72):
    return {"crewId": "crew-1", "metric": metric, "value": value, "unit": UNITS[metric],
            "takenAt": "2026-11-13T21:15:00Z", "source": "device"}


class Sending(unittest.TestCase):
    def setUp(self):
        self.server = FakeServer()
        self.logs = []
        self.sender = bridge.Sender(self.server.url, timeout=2, log=self.logs.append)

    def tearDown(self):
        self.server.stop()

    def test_readings_are_delivered_and_the_queue_empties(self):
        self.sender.add([reading(), reading("spo2", 97), reading("temperature", 34.5)])
        self.assertEqual(self.sender.flush(), 3)
        self.assertEqual(len(self.server.saved), 3)
        self.assertEqual(len(self.sender.queue), 0)
        self.assertEqual(self.server.requests, 1, "one batch, not three requests")

    def test_large_queue_is_sent_in_batches(self):
        self.sender.add([reading(value=60 + i % 30) for i in range(120)])
        self.sender.flush()
        self.assertEqual(len(self.server.saved), 120)
        self.assertEqual(self.server.requests, 3)  # 50 + 50 + 20

    def test_a_bad_reading_does_not_block_the_good_ones(self):
        bad = reading()
        bad["unit"] = "wrong"
        self.sender.add([reading(), bad, reading("spo2", 97)])
        self.sender.flush()
        self.assertEqual([r["metric"] for r in self.server.saved], ["heart_rate", "spo2"])
        self.assertEqual(self.sender.rejected, 1)
        self.assertEqual(len(self.sender.queue), 0)

    def test_server_down_keeps_the_readings_and_they_arrive_later(self):
        self.server.stop()  # nothing listens any more
        self.sender.add([reading(), reading("spo2", 97)])
        self.assertEqual(self.sender.flush(now=100.0), 0)
        self.assertEqual(len(self.sender.queue), 2, "kept for later")
        self.assertTrue(any("not reachable" in line for line in self.logs))

        # Same address, a server comes back.
        revived = FakeServer.__new__(FakeServer)
        FakeServer.__init__(revived)
        self.sender.url = revived.url + "/api/readings"
        self.assertEqual(self.sender.flush(now=200.0), 2)
        self.assertEqual(len(revived.saved), 2)
        revived.stop()
        self.server = FakeServer()  # so tearDown has something to stop

    def test_it_waits_before_retrying(self):
        self.server.mode = "error500"
        self.sender.add([reading()])
        self.sender.flush(now=100.0)
        before = self.server.requests
        self.sender.flush(now=100.1)  # too soon
        self.assertEqual(self.server.requests, before)
        self.server.mode = "ok"
        self.assertEqual(self.sender.flush(now=200.0), 1)

    def test_queue_never_grows_without_limit(self):
        self.server.mode = "error500"
        self.sender.add([reading(value=60 + i % 30) for i in range(bridge.MAX_QUEUE + 200)])
        self.assertEqual(len(self.sender.queue), bridge.MAX_QUEUE)


class EndToEnd(unittest.TestCase):
    def test_a_file_of_device_output_reaches_the_server(self):
        import tempfile, os
        server = FakeServer()
        lines = [
            "Booting...",
            '{"metric":"heart_rate","value":72}',
            '{"metric":"spo2","value":97}',
            '{"metric":"temperature","value":34.5}',
            '{"metric":"heart_rate","value":null}',       # finger off
            '{"metric":"spo2","value":-999}',               # sensor garbage
            '{"metric":"heart_rate","value":74}',
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("\n".join(lines))
        try:
            code = bridge.main(["--server", server.url, "--input", f.name, "--quiet"])
        finally:
            os.unlink(f.name)
            server.stop()
        self.assertEqual(code, 0)
        self.assertEqual([(r["metric"], r["value"]) for r in server.saved],
                         [("heart_rate", 72), ("spo2", 97), ("temperature", 34.5), ("heart_rate", 74)])
        self.assertTrue(all(r["source"] == "device" for r in server.saved))


if __name__ == "__main__":
    unittest.main()

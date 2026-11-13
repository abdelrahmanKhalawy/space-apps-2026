#!/usr/bin/env python3
"""
Serial bridge: the device is plugged into this laptop by cable, and this script reads what it prints
and sends it to the server. It is the third way to get readings to the dashboard, for when Wi-Fi and
the phone hotspot both fail (see firmware/README.md).

What the device prints (one JSON object per line, the shape of contracts/reading.md):

    {"metric":"heart_rate","value":72}
    {"metric":"spo2","value":97,"unit":"%"}
    {"crewId":"crew-1","metric":"temperature","value":34.5,"unit":"C","takenAt":"2026-11-13T21:15:00Z"}

Only metric and value are needed. Anything missing is filled in here: crewId, unit, takenAt (the laptop clock),
and source is always "device". Lines that are not JSON (debug prints) are ignored. A reading with value null
(no finger on the sensor) is skipped, so no wrong number reaches the dashboard.

Needs only Python 3. Reading a real serial port also needs:  pip install pyserial

    python bridge.py --server https://space-monkeys-2026.azurewebsites.net --port COM5
    python bridge.py --server http://localhost:5080 --simulate          # no device: fake readings
    python bridge.py --server http://localhost:5080 --input readings.txt # replay a file, or "-" for stdin
"""

import argparse
import collections
import json
import math
import random
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

DEFAULT_CREW = "crew-1"

# The three things the finger device measures, and their units (contracts/reading.md).
DEVICE_UNITS = {"heart_rate": "bpm", "spo2": "%", "temperature": "C"}

# Input sanity limits only: they drop what cannot be real (heart rate 0, SpO2 -999 from a sensor with no finger).
# They are NOT health thresholds. The green / yellow / red bands live in research/thresholds.json.
LIMITS = {"heart_rate": (20, 250), "spo2": (50, 100), "temperature": (10, 45)}

BATCH_SIZE = 50
MAX_QUEUE = 1000  # if the server is away for a long time, keep the newest readings
MAX_CLOCK_DRIFT = timedelta(days=1)  # a device clock further off than this is replaced with the laptop clock

UTC_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")


def utc_str(moment):
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _taken_at(value, now):
    """Use the device's time if it is a sensible UTC time, otherwise the laptop's. Returns (text, fixed?)."""
    if isinstance(value, str) and UTC_Z.match(value):
        try:
            parsed = datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            return utc_str(now), True
        if abs(parsed - now) <= MAX_CLOCK_DRIFT:
            return value[:19] + "Z", False
    return utc_str(now), value is not None


def parse_line(line, crew_id=DEFAULT_CREW, now=None):
    """
    One line from the device -> (readings, drops).
    readings: ready to send, in the shape of contracts/reading.md. drops: short reasons, one per rejected reading.
    A line that is not JSON at all is a debug print: it gives ([], []).
    """
    now = now or datetime.now(timezone.utc)
    text = line.strip()
    if not text or text[0] not in "{[":
        return [], []

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return [], ["bad JSON"]

    items = data if isinstance(data, list) else [data]
    readings, drops = [], []
    for item in items:
        if not isinstance(item, dict):
            drops.append("not an object")
            continue

        metric = item.get("metric")
        if metric not in DEVICE_UNITS:
            drops.append(f"not a device metric: {metric!r}")
            continue

        value = item.get("value")
        if value is None:
            drops.append("no reading")  # finger off the sensor
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            drops.append(f"{metric}: value is not a number")
            continue
        low, high = LIMITS[metric]
        if not (low <= value <= high):
            drops.append(f"{metric}: {value} is not a possible value")
            continue

        unit = item.get("unit", DEVICE_UNITS[metric])
        if unit != DEVICE_UNITS[metric]:
            drops.append(f"{metric}: unit must be {DEVICE_UNITS[metric]}, got {unit!r}")
            continue

        taken_at, fixed = _taken_at(item.get("takenAt"), now)
        if fixed:
            drops.append("clock fixed")  # informational: the reading is still sent, with the laptop time
        crew = item.get("crewId")
        readings.append(
            {
                "crewId": crew if isinstance(crew, str) and crew.strip() else crew_id,
                "metric": metric,
                "value": value,
                "unit": DEVICE_UNITS[metric],
                "takenAt": taken_at,
                "source": "device",
            }
        )
    return readings, drops


class Sender:
    """Keeps readings in a queue and delivers them to POST /api/readings, in batches, retrying when the server is away."""

    def __init__(self, server, timeout=5, log=print):
        self.url = server.rstrip("/") + "/api/readings"
        self.timeout = timeout
        self.log = log
        self.queue = collections.deque(maxlen=MAX_QUEUE)
        self.sent = 0
        self.rejected = 0
        self.failures = 0
        self.retry_at = 0.0

    def add(self, readings):
        if len(self.queue) + len(readings) > MAX_QUEUE:
            self.log(f"queue full ({MAX_QUEUE}): the oldest readings are being dropped")
        self.queue.extend(readings)

    def _post(self, readings):
        body = json.dumps(readings).encode("utf-8")
        request = urllib.request.Request(
            self.url, data=body, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
            return code

    def flush(self, now=None):
        """Send what is queued. Returns how many were delivered. Never raises: a down server just means 'try later'."""
        now = time.monotonic() if now is None else now
        delivered = 0
        while self.queue and now >= self.retry_at:
            batch = [self.queue[i] for i in range(min(BATCH_SIZE, len(self.queue)))]
            try:
                status = self._post(batch)
            except (urllib.error.URLError, OSError, TimeoutError) as error:
                self.failures += 1
                wait = min(10, 2 ** min(self.failures, 4) / 2)
                self.retry_at = now + wait
                self.log(f"server not reachable ({getattr(error, 'reason', error)}). {len(self.queue)} queued, retrying in {wait:.0f}s")
                break

            if 200 <= status < 300:
                for _ in batch:
                    self.queue.popleft()
                self.sent += len(batch)
                delivered += len(batch)
                self.failures = 0
            elif status == 400:
                # The server saves all or nothing, so one bad reading blocks the whole batch. Find it.
                delivered += self._send_one_by_one(batch)
            else:
                self.failures += 1
                wait = min(10, 2 ** min(self.failures, 4) / 2)
                self.retry_at = now + wait
                self.log(f"server answered {status}. {len(self.queue)} queued, retrying in {wait:.0f}s")
                break
        return delivered

    def _send_one_by_one(self, batch):
        delivered = 0
        for reading in batch:
            self.queue.popleft()
            try:
                status = self._post([reading])
            except (urllib.error.URLError, OSError, TimeoutError):
                self.queue.appendleft(reading)  # server went away mid way: keep it for later
                break
            if 200 <= status < 300:
                self.sent += 1
                delivered += 1
            else:
                self.rejected += 1
                self.log(f"server rejected {reading['metric']}={reading['value']} ({status}); dropped")
        return delivered


def lines_from_input(path):
    handle = sys.stdin if path == "-" else open(path, "r", encoding="utf-8", errors="replace")
    with handle:
        yield from handle


def lines_from_serial(port, baud):
    try:
        import serial  # pyserial
    except ImportError:
        sys.exit("Reading a serial port needs pyserial:  pip install pyserial")
    try:
        connection = serial.Serial(port, baud, timeout=1)
    except serial.SerialException as error:
        sys.exit(f"Cannot open {port}: {error}\nClose the Arduino Serial Monitor (only one program can use the port) and check the port name.")
    with connection:
        while True:
            try:
                raw = connection.readline()
            except serial.SerialException as error:
                sys.exit(f"Lost the serial connection: {error}")
            yield raw.decode("utf-8", errors="replace") if raw else None  # None = nothing arrived this second


def lines_simulated(every, duration):
    """Fake device output, for when there is no device. Same lines the real one prints."""
    rng = random.Random()
    started = time.monotonic()
    while duration is None or time.monotonic() - started < duration:
        for metric, mean, spread in (("heart_rate", 72, 4), ("spo2", 97, 1), ("temperature", 34.5, 0.3)):
            value = round(rng.gauss(mean, spread), 1 if metric == "temperature" else 0)
            if metric == "spo2":
                value = min(100, value)
            yield json.dumps({"metric": metric, "value": value})
        time.sleep(every)
        yield None


def run(args, lines, log=print):
    sender = Sender(args.server, log=log)
    totals = collections.Counter()
    last_report = last_flush = time.monotonic()
    finite_input = args.input is not None

    for line in lines:
        if line:
            readings, drops = parse_line(line, args.crew)
            for reason in drops:
                totals[reason] += 1
                if reason not in ("no reading", "clock fixed") and not args.quiet:
                    log(f"skipped: {reason}")
            sender.add(readings)
        # Send about once a second, so the three readings of one moment travel together.
        if time.monotonic() - last_flush >= 1.0 or len(sender.queue) >= BATCH_SIZE:
            last_flush = time.monotonic()
            sender.flush()

        if time.monotonic() - last_report >= 10:
            last_report = time.monotonic()
            log(f"sent {sender.sent}, queued {len(sender.queue)}" + (f", skipped {dict(totals)}" if totals else ""))

    # A file or pipe ended: do not leave readings behind if the server is only briefly away.
    deadline = time.monotonic() + (args.give_up if finite_input else 0)
    while sender.queue and time.monotonic() < deadline:
        sender.flush()
        time.sleep(0.5)

    log(f"done: sent {sender.sent}, rejected {sender.rejected}, left in queue {len(sender.queue)}" + (f", skipped {dict(totals)}" if totals else ""))
    return 0 if not sender.queue else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read the device from a cable and send its readings to the server.")
    parser.add_argument("--server", required=True, help="server address, for example https://space-monkeys-2026.azurewebsites.net")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--port", help="serial port of the device, for example COM5 or /dev/ttyUSB0")
    source.add_argument("--input", help="read lines from a file instead, or - for stdin")
    source.add_argument("--simulate", action="store_true", help="no device: send fake readings")
    parser.add_argument("--baud", type=int, default=115200, help="serial speed (default 115200)")
    parser.add_argument("--crew", default=DEFAULT_CREW, help="crew id when the device does not print one")
    parser.add_argument("--every", type=float, default=2.0, help="seconds between fake readings (with --simulate)")
    parser.add_argument("--duration", type=float, default=None, help="stop after this many seconds (with --simulate)")
    parser.add_argument("--give-up", type=float, default=30.0, help="with --input: seconds to keep retrying at the end")
    parser.add_argument("--quiet", action="store_true", help="do not print skipped lines")
    args = parser.parse_args(argv)

    if not re.match(r"^https?://", args.server):
        parser.error("--server must start with http:// or https://")

    if args.port:
        lines = lines_from_serial(args.port, args.baud)
    elif args.input is not None:
        lines = lines_from_input(args.input)
    else:
        lines = lines_simulated(args.every, args.duration)

    try:
        return run(args, lines)
    except KeyboardInterrupt:
        print("stopped")
        return 0


if __name__ == "__main__":
    sys.exit(main())

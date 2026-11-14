# Text for the submission forms (Cairo local + global)

Copy-paste material. Adjust to each form's character limits. Replace `<LIVE LINK>`, `<VIDEO LINK>`, `<REPO LINK>` when final.

**Challenge:** Create Health Monitoring Software for Astronauts on Space Missions
**Project name:** AstroPulse
**Team:** Space Monkeys 🚀

## One-line summary (under ~150 characters)
AstroPulse tells astronauts when their health is drifting from *their own* normal, days before fixed ranges do, and what to do while Earth is minutes away.

## Short description (~500 characters)
On long missions the crew is the first line of care, and Earth can be up to 20 minutes away. AstroPulse reads a pulse with the phone camera, logs the rest, and compares each person with their own first week. It flags slow drifts while colors are still green, explains them through NASA's five spaceflight hazards, forecasts "red in N days", and shows the delay to Earth with a ground-control screen where the doctor's reply crosses the same delay back.

## Full description
**The problem.** Astronauts carry much of the responsibility for spotting changes in their own health, and a message to Earth can take up to about 20 minutes each way on a Mars mission. Fixed "normal ranges" treat everyone the same, but radiation, isolation, altered gravity and a sealed environment change what is normal for one person over time.

**What we built.** AstroPulse is a web app with a crew view and a ground-control view on one link.
- *Crew view:* live pulse from the phone camera (or a clearly labeled simulator), manual entries for blood pressure, blood sugar, sleep and mood, quick reaction and near-vision checks. Every indicator has a color from published ranges, an interactive body, a decision screen with the Earth-delay counter, and a plain-language explanation tied to NASA's five hazards.
- *Personal baseline:* each person is compared with their own first week. A sustained drift (4 days, ≥2σ) is flagged even while the colors are green, with a forecast of when it would turn red. An AstroPulse Index (0–100) summarizes distance from your own normal.
- *Environment:* live space weather from NOAA, cabin CO₂, and a "person or environment?" view across the crew.
- *Ground control:* reports arrive only after the signal delay, and the doctor's reply crosses the same delay back.
- *Resilience:* installable, works offline, saves readings until the link returns, red alerts are never hidden by privacy settings.

**More ways to use it.** A guided pathway walks the crew member through a yellow or red indicator (do now, wait, measure again, decide, tell Earth with what was tried). A *Your data* tab lets anyone drop a CSV of their own daily resting heart rate and see their own normal, privately in the browser. A *Replay* tab shows the Day-143 scenario day by day, colors next to the personal baseline.

**How we tested it honestly.** The camera-pulse algorithm was also checked on 53 real recorded finger signals from a public dataset (BIDMC): 1.1 bpm average error on the readings it accepts. A Monte Carlo "virtual crew trial" (hypotheses written before running; settings chosen on one set, results on another) shows the calibrated personal baseline catching 97% of simulated drifts at 4.7% false alarms. Our first version false-alarmed on 94% of healthy simulated crews, so we recalibrated it, and one pre-registered hypothesis failed and is reported. All crew data is synthetic and labeled; this is a prototype, not a medical device.

**Data and sources.** NOAA Space Weather Prediction Center (live), published ranges from AHA, CDC, MedlinePlus and the National Sleep Foundation, NASA Human Research Program hazard pages, NASA's CO₂ technical brief, NASA's Integrated Medical Model (as the inspiration for the Monte Carlo approach), and Mars-500 isolation findings. Full list with links in the README and `research/sources.md`.

**Technology.** ASP.NET Core 8 with SignalR and SQLite, React + Vite, a service worker for offline use, Web Speech API for read-aloud, camera photoplethysmography in the browser. The anomaly model runs in C# and is checked against its Python reference by tests; CI runs the web tests, the API tests and the trial.

**Use of AI.** Claude Code was used throughout for code, research summaries and tests; every use is logged in `docs/ai-usage.md`.

**Links.** Live app: `<LIVE LINK>` · Video: `<VIDEO LINK>` · Source: `<REPO LINK>`

## Awards we fit (for the nomination note, if a form asks)
- *Best Use of Science:* hypotheses stated first, calibration/test split, failures reported.
- *Best Use of Technology:* in-browser camera pulse, offline-first, personal baseline model.
- *Galactic Impact:* the same idea serves any isolated place where a doctor is far away.
- *Best Use of Data:* live NOAA space-weather feed linked to the radiation hazard.

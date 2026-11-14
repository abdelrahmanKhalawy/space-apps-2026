# Questions judges may ask, with honest answers

Short answers first. Rule for every answer: say what is real, what is simulated, and what we would do next. Never claim more than the Evidence tab and the README say.

## About the idea

**What is new here compared with a normal vitals dashboard?**
The reference point. Fixed ranges compare you with a population. AstroPulse compares you with your own first week, so it can flag a slow drift while every number is still "normal". Then it explains the drift through NASA's five hazards and says what to do, with the Earth-delay built in.

**Why does this matter beyond a Mars mission?**
Anywhere a doctor is far away and "normal" is personal: polar stations, submarines, remote clinics, long-term isolation. The same idea works wherever you only have your own history to compare against.

**NASA already has medical tools. Why this?**
NASA's research plan lists meaningful thresholds and crew self-monitoring as open questions, and the tools for autonomous crew care are still being developed for early exploration missions. We built a small, testable answer to the thresholds question: a personal baseline.

## About honesty and validity

**Is the data real?**
The crew data is synthetic and says so in the app. What is real: the phone-camera pulse, the live NOAA space-weather feed, the published color ranges (AHA, CDC, MedlinePlus, National Sleep Foundation), and NASA's hazard texts. SpO₂ and skin temperature are simulated because a phone camera can't measure them reliably.

**How did you test the model?**
A Monte Carlo trial (the same style NASA uses for medical risk planning): 2,000 simulated crew members, half with a slow drift, with the hypotheses written before the first run. Settings were chosen on one set and reported on another. At 4.7% false alarms it catches 97% of drifts.

**Your first model false-alarmed on 94% of healthy crews. Why show that?**
Because it is what the trial found, and it is why the live model now uses a stricter rule (z ≥ 2 for 4 days). One pre-registered hypothesis also failed; it is listed on the Evidence tab with the reason. We would rather show the miss than hide it.

**The numbers come from simulated noise. Does that count?**
It shows how the method behaves under stated assumptions, not how it works on real astronauts. The page lists the assumptions and re-runs them at half and one-and-a-half times the noise. Real validation needs analog missions (HERA, CHAPEA), which is our next step.

**Is the personal baseline always faster than the colors?**
No, and the Replay tab shows that: for sleep the fixed range changed first. It catches what the ranges miss (the heart-rate drift never leaves green) and it never replaces them.

## About the product

**How accurate is the camera pulse?**
Approximate, and it needs good light and a still finger. The algorithm itself was checked on 53 real recorded finger signals from a public dataset (BIDMC) against the ECG heart rate: on the readings the app accepts (82% of 25-second windows) the average error was 1.1 bpm and 97% were within 5 bpm. Those are pulse-oximeter signals from patients, not phone-camera video, so we still call the camera feature an experiment and not a medical measurement. The app picks the cleanest color channel, rejects noisy recordings instead of guessing, and a simulator is the fallback.

**Is this a medical device?**
No. It is decision support and a prototype, and it says so on screen and in the README.

**What about privacy?**
The crew member chooses which groups of indicators go into reports to Earth. A red alert is always sent so the ground knows something is wrong, but its details can be held back.

**What if the connection to Earth is down?**
The app installs, keeps working offline, saves readings on the device and sends them when the link returns. Advice can be read aloud for hands-busy moments.

**Why a web app?**
One link, nothing to install, works on any phone or laptop, which also made it testable by anyone. The server runs the model itself (ASP.NET Core), so nothing depends on an outside AI service.

## About the team and the build

**How did you use AI?**
Claude Code helped write most of the code, the research summaries and the tests. Decisions, scope and what to claim were ours, and the claims are backed by tests and sourced texts.

**Can I try it on my own data?**
Yes: the *Your data* tab reads a CSV of daily resting heart rate (and sleep) from a watch or health app, entirely in the browser, and shows your own normal next to the fixed ranges. A very fit person whose resting rate is below 60 is flagged almost every day by fixed ranges, which is the point.

**What happens when something turns yellow or red?**
The app walks the crew member through it: what to do now, a timer, measuring again (by camera or typed), and a decision: back in range, closer, or not better. If it is not better, the report to Earth says what was already tried. It is decision support in the spirit of NASA's work on autonomous crew medical support, not medical advice.

**What would you do with another month?**
Validate on analog-mission data, replace the simulated SpO₂ and temperature with a real wearable, extend the personal baseline to heart-rate variability, and run usability tests with people who are not engineers.

# Backup slides: 7 slides exactly (cover included)

Draft content for Nada. One idea per slide, big numbers, no paragraphs. Screens come from the live app (take screenshots after **Restore demo data**).

## 1. Cover
**AstroPulse** — health monitoring for astronauts, normal for *you*.
Team Space Monkeys · NASA Space Apps Challenge 2026, Cairo · live link + QR code.

## 2. The problem
- Mars: up to ~20 minutes each way to Earth. The crew is the first line of care.
- Fixed "normal ranges" treat everyone the same. Space changes what is normal for one person (sleep, fluids, isolation, radiation, a sealed cabin).
- In a long isolation study (Mars-500), crew members responded very differently to the same conditions.
- NASA's own research plan lists "meaningful thresholds" and crew self-monitoring as open questions.

## 3. What we built
Two screens, one link: **Crew** (status, interactive body, decision screen with the delay counter) and **Ground control** (reports arrive after the delay, the doctor's reply crosses it back).
Screenshot: Status + body.

## 4. How it works
1. Learn each person's **own first week**.
2. Flag a sustained drift (4 days, ≥2σ) even while colors are green.
3. Explain it through NASA's five hazards, say what to do, forecast "red in N days".
4. Add the environment: live NOAA space weather, cabin CO₂, "one person or the whole crew?".
Screenshot: the **Replay** tab (heart-rate row green, flag on day 11).

## 5. We tested it, and we show the misses
- Virtual crew trial: 2,000 simulated crew members, hypotheses written before running.
- At 4.7% false alarms: **97%** of drifts caught.
- Our first model false-alarmed on **94%** of healthy crews → we recalibrated it. One hypothesis failed and is reported.
Chart: speed vs false alarms (Evidence tab).

## 6. What is real, what is simulated
- **Real:** phone-camera pulse, live NOAA space weather, published color ranges (AHA, CDC, MedlinePlus), NASA hazard texts.
- **Simulated and labeled:** crew data, SpO₂ and skin temperature, the trial.
- Prototype, not a medical device. Works offline, red alerts are never hidden by privacy settings.

## 7. Next steps and team
- Validate on analog missions (HERA, CHAPEA), then a wearable.
- Beyond space: any place a doctor is far away and "normal" is personal.
- Team: Abdelrahman, Shahd, Shahd Ashraf, Mohamed, Nada, Ammar. Repo + live link.

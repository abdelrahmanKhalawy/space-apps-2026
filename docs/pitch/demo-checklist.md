# Demo day checklist

Do this in order, 20 minutes before presenting. Everything needs only a phone or a laptop.

## Before
- [ ] Open the **live link** in a private window on the phone you will use, on the venue network (and once on mobile data).
- [ ] Open `<LIVE LINK>#ground` on the laptop. Press **Restore demo data**. Reload the phone page.
- [ ] Phone: allow the camera when asked. Try **Measure my pulse with the phone camera** once with flash/good light. If it gives no clean reading after two tries, plan to use **Simulate readings**.
- [ ] Phone volume on (for **Read aloud**), screen timeout off, battery above 50%, power bank ready.
- [ ] On every device you will present from: dismiss the first-visit banner (tap **No thanks**), or it shows over the demo. It is remembered per device and browser.
- [ ] Laptop: second tab on the **Replay** tab at day 1, third tab on **Evidence**.
- [ ] Install the app to the phone's home screen once (offline fallback), then confirm the Status page opens in airplane mode.
- [ ] CI green on `main`, and the live link is the latest `main`: run **Actions → Deploy to Azure** (see `api/README.md`) and check that run is green.

## The 60 seconds
1. Judge puts a finger on the camera → pulse appears (fallback: **Simulate readings**).
2. Laptop: **Replay**, press play. Stop on day 11: "heart rate is still green, the flag says otherwise."
3. Phone: Status turns red → **Report to Earth** → laptop `#ground`, **Skip to next arrival**, send a reply → reply appears on the phone.
4. Close with the one-line answer: "Not what is normal. What is normal for *you*."

## If something breaks
| Problem | Do this |
|---|---|
| Camera won't read | **Simulate readings**. Say nothing about the camera. |
| No internet | The app is installed: Status and Replay still work offline. Skip the ground reply. |
| Live link is slow (cold start) | Hit `/api/health` a minute earlier; keep that tab open. |
| Demo state is messy | `#ground` → **Restore demo data**, reload. |
| A judge asks about accuracy | "Approximate, labeled as an experiment; the Evidence tab shows what we measured and what failed." |

## After
- [ ] **Restore demo data** so the next judge starts clean.

# AstroPulse brand

**Tagline:** Normal, for you.
Alternatives: *Know earlier.* · *Your health. Our priority.*

## The mark

An **orbit ring** (the person's own baseline), a **heartbeat line** crossing it (the pulse the camera reads, and the drift AstroPulse watches for) and a small **sun** on the ring (space, distance, the mission). The line's thin tail enters from the open side of the ring.

| File | Use |
|---|---|
| `logo-mark.svg` | The mark alone on a dark background. |
| `app-icon.svg` | Dark app icon (rounded square). Also the favicon (`web/public/icon.svg`). |
| `app-icon-light.svg` | Light app icon, for white backgrounds and documents. |
| `logo-mono-white.svg` / `logo-mono-black.svg` | One-color versions (print, watermarks, stamps). |
| `logo-lockup.png` | The horizontal lockup (mark + wordmark + tagline) as designed: use it as is on dark backgrounds, in the README, slides and video end card. |
| `og-card.png` | The social card (1200x630) built from the lockup; also `web/public/og.png`. |
| `og.svg` | An alternative social card drawn from the SVG mark. |
| `make_logo.py` | Draws all of the above from a few numbers. |
| `export-png.mjs` | Renders the PNGs the web app needs (icons, social card). |

The same mark is the React component `web/src/brand/BrandMark.jsx`. If you change the shapes, change `make_logo.py`, re-run it, and refresh `BrandMark.jsx`.

## Wordmark

**Astro**Pulse: one word, capital A and P, bold. "Astro" in white (or near-black on light), "Pulse" in Astro Blue. Under it, optionally, `NORMAL, FOR YOU.` in spaced capitals, monospace.

## Colors

| Name | Hex | Use |
|---|---|---|
| Deep Space | `#070C1D` | Background |
| Card Navy | `#111A36` | Cards |
| Astro Blue | `#6EA8FF` | Accent, "Pulse", links |
| Health Green | `#3DDC84` | Status: healthy |
| Watch Yellow | `#FFCC4D` | Status: watch |
| Alert Red | `#FF5D5D` | Status: act now |
| Salmon | `#FFB4A6` | Primary buttons |
| Sun | `#FFD76A` → `#FF9F2E` | The sun on the ring (only there) |

These are the same colors the app uses (`web/src/styles.css`). The status colors always come with a word, never color alone.

## Typography

**Inter** for text, **IBM Plex Mono** (or any monospace) for small spaced labels. The app uses Inter with the system monospace so nothing is loaded from outside.

## Rules

- Keep clear space around the mark equal to its own width, and don't use it below 24 px (the favicon is the one exception, drawn for 16 px).
- Don't stretch, rotate, recolor, outline or put it on a busy photo.
- Light backgrounds: use `app-icon-light.svg` or the black mono.
- **Never use NASA's logos or insignia** next to ours or imitate them. We can name the challenge in text only.

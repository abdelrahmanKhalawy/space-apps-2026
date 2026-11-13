// AstroPulse Index: one 0-100 number for "how far is this person from their own normal right now".
//
// Our own composite, NOT a validated clinical score. For each metric:
//   personal strain = how far the latest day sits from this person's first-week baseline (z-score,
//                     0 up to 1.5 sigma, then rising to 1 at 4.5 sigma)
//   color strain    = the fixed threshold color of the latest day's mean (green 0, yellow 0.2, red 0.8).
//                     Yellow counts little on its own: a healthy person's numbers brush a fixed yellow line
//                     all the time (see the Evidence tab), so one yellow light is not an alarm.
// A metric's strain is the larger of the two. Metrics combine like independent warning lights:
//   index = 100 * (1 - product(1 - strain))
// so one extreme metric alone shows its own level, and several moderate ones add up.
// Pure functions: works the same on live readings and on the offline sample data.

export const BASELINE_DAYS = 7
const COLOR_STRAIN = { green: 0, yellow: 0.2, red: 0.8 }
// A silent baseline must not turn a tiny wobble into a huge z-score: the least spread we trust, per metric.
const STD_FLOOR = {
  heart_rate: 1.0, spo2: 0.5, temperature: 0.2, bp_systolic: 2.0, bp_diastolic: 1.5, glucose: 3.0, sleep_hours: 0.25, mood: 0.35,
}

export const BANDS = [
  { max: 25, label: 'Steady', tone: 'green' },
  { max: 50, label: 'Watch', tone: 'yellow' },
  { max: 75, label: 'Strained', tone: 'orange' },
  { max: 101, label: 'Act now', tone: 'red' },
]
export const labelFor = score => BANDS.find(b => score < b.max)

function colorOf(rules, value) {
  if (!rules) return null
  for (const b of rules.bands) {
    if ((b.min === undefined || value >= b.min) && (b.max === undefined || value < b.max)) return b.color
  }
  return null
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const pstdev = xs => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - m) * (x - m))))
}

/** readings: [{metric, value, takenAt}], thresholds: research/thresholds.json (by metric). */
export function computeIndex(readings, thresholds) {
  const byMetric = {}
  for (const r of readings) (byMetric[r.metric] ??= []).push(r)

  const parts = []
  let baselineReady = false
  for (const [metric, rows] of Object.entries(byMetric)) {
    const rules = thresholds[metric]
    if (!rules) continue
    rows.sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt))
    const days = {}
    for (const r of rows) (days[r.takenAt.slice(0, 10)] ??= []).push(r.value)
    const dayKeys = Object.keys(days).sort()
    const daily = dayKeys.map(d => mean(days[d]))
    const color = colorOf(rules, daily[daily.length - 1])

    let z = null
    let personal = 0
    if (daily.length >= BASELINE_DAYS + 2) {
      baselineReady = true
      const base = daily.slice(0, BASELINE_DAYS)
      const sd = Math.max(pstdev(base), STD_FLOOR[metric] ?? 0.05)
      z = (daily[daily.length - 1] - mean(base)) / sd
      personal = Math.min(1, Math.max(0, (Math.abs(z) - 1.5) / 3))
    }
    const colorStrain = COLOR_STRAIN[color] ?? 0
    parts.push({ metric, strain: Math.max(personal, colorStrain), personal, colorStrain, color, z })
  }

  const score = Math.round(100 * (1 - parts.reduce((p, x) => p * (1 - x.strain), 1)))
  parts.sort((a, b) => b.strain - a.strain)
  return { score, label: labelFor(score), parts, baselineReady }
}

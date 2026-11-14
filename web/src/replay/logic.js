// "Replay Day 143": the two weeks of the demo scenario, day by day, showing what the FIXED color ranges said
// next to what AstroPulse's personal baseline said. Same rule as the live model (api/Insights/AnomalyModel.cs):
// each metric is compared with its own first week; four days in a row at least 2 sigma away in the same
// direction counts as a real drift, and the alarm is raised on the fourth day.
import { BASELINE_DAYS, STD_FLOOR, computeIndex } from '../dashboard/astroIndex.js'

export const Z = 2
export const SUSTAINED = 4

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const pstdev = xs => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - m) * (x - m))))
}

function colorOf(rules, value) {
  if (!rules) return null
  for (const b of rules.bands) {
    if ((b.min === undefined || value >= b.min) && (b.max === undefined || value < b.max)) return b.color
  }
  return null
}

export function dayList(readings) {
  return [...new Set(readings.map(r => r.takenAt.slice(0, 10)))].sort()
}

/** Daily mean per metric, in day order: { metric: [value, ...] } (one value per day in `days`). */
export function dailySeries(readings, days) {
  const by = {}
  for (const r of readings) {
    const d = r.takenAt.slice(0, 10)
    ;((by[r.metric] ??= {})[d] ??= []).push(r.value)
  }
  const out = {}
  for (const [metric, perDay] of Object.entries(by)) {
    out[metric] = days.map(d => (perDay[d] ? mean(perDay[d]) : null))
  }
  return out
}

/** Index of the day the model raises its hand for this series (0-based), or null. */
export function modelAlarmDay(values, metric) {
  if (values.length < BASELINE_DAYS + SUSTAINED || values.slice(0, BASELINE_DAYS).some(v => v == null)) return null
  const base = values.slice(0, BASELINE_DAYS)
  const sd = Math.max(pstdev(base), STD_FLOOR[metric] ?? 0.05)
  const m = mean(base)
  const zs = values.map(v => (v == null ? 0 : (v - m) / sd))
  for (let d = BASELINE_DAYS; d <= values.length - SUSTAINED; d++) {
    const w = zs.slice(d, d + SUSTAINED)
    if (w.every(z => z >= Z) || w.every(z => z <= -Z)) return d + SUSTAINED - 1
  }
  return null
}

/** Everything the screen needs. thresholds: research/thresholds.json by metric. */
export function buildReplay(readings, thresholds, order) {
  const days = dayList(readings)
  const series = dailySeries(readings, days)
  const rows = order
    .filter(metric => series[metric] && thresholds[metric])
    .map(metric => {
      const values = series[metric]
      const colors = values.map(v => (v == null ? null : colorOf(thresholds[metric], v)))
      const firstYellow = colors.findIndex(c => c === 'yellow' || c === 'red')
      const firstRed = colors.findIndex(c => c === 'red')
      return {
        metric,
        values,
        colors,
        firstNonGreen: firstYellow === -1 ? null : firstYellow,
        firstRed: firstRed === -1 ? null : firstRed,
        modelAlarm: modelAlarmDay(values, metric),
      }
    })
  const index = days.map(d => computeIndex(readings.filter(r => r.takenAt.slice(0, 10) <= d), thresholds))
  // metrics where the model spoke before the fixed colors did (or the colors never changed at all)
  const earlier = rows.filter(r => r.modelAlarm != null && (r.firstNonGreen == null || r.modelAlarm < r.firstNonGreen))
  return { days, rows, index, earlier }
}

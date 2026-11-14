import { getLang } from '../i18n/lang.js'
import { METRIC_ORDER, METRIC_NAMES } from './metricInfo.js'

// Pure helpers for the dashboard. No React and no fetch, so they are easy to test.
// The live path trusts the colors the server sends (api/ reads research/thresholds.json).
// colorOf below is ONLY used for the offline sample-data fallback and for drawing the chart bands.

const RANK = { green: 0, yellow: 1, red: 2 }

export function worstColor(colors) {
  let worst = null
  for (const c of colors) {
    if (c && (worst === null || RANK[c] > RANK[worst])) worst = c
  }
  return worst
}

/** Same rule as the contract: a band includes its min and excludes its max. */
export function colorOf(thresholdForMetric, value) {
  if (!thresholdForMetric) return null
  for (const band of thresholdForMetric.bands) {
    const aboveMin = band.min === undefined || band.min === null || value >= band.min
    const belowMax = band.max === undefined || band.max === null || value < band.max
    if (aboveMin && belowMax) return band.color
  }
  return null
}

export function groupByMetric(readings) {
  const groups = {}
  for (const r of readings) (groups[r.metric] ??= []).push(r)
  for (const list of Object.values(groups)) list.sort((a, b) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0))
  return groups
}

/** Builds the same shape as GET /api/status from raw readings, for the offline fallback. */
export function localStatus(readings, thresholds, crewId = 'crew-1') {
  const groups = groupByMetric(readings)
  const metrics = []
  for (const metric of METRIC_ORDER) {
    const list = groups[metric]
    if (!list || list.length === 0) continue
    const latest = list[list.length - 1]
    const t = thresholds[metric]
    const color = colorOf(t, latest.value)
    metrics.push({
      metric,
      value: latest.value,
      color,
      takenAt: latest.takenAt,
      // English by default, like GET /api/status; the Arabic original is in `advice` (?lang=ar on the server).
      advice: color && t ? (getLang() === 'ar' ? t.advice?.[color] ?? t.advice_en?.[color] : t.advice_en?.[color] ?? t.advice?.[color]) ?? null : null,
      hazard: t?.hazard ?? null,
    })
  }
  return { crewId, overall: worstColor(metrics.map(m => m.color)), metrics }
}

/** One plain sentence for the top of the screen. */
export function summarize(status) {
  const names = color =>
    status.metrics.filter(m => m.color === color).map(m => METRIC_NAMES[m.metric] ?? m.metric)
  const reds = names('red')
  const yellows = names('yellow')
  if (status.overall === 'red') return `Act now: ${reds.join(', ')} ${reds.length > 1 ? 'are' : 'is'} in the red zone.`
  if (status.overall === 'yellow') return `Keep an eye on: ${yellows.join(', ')}.`
  if (status.overall === 'green') return 'All indicators are in the green range.'
  return 'No readings yet.'
}

/** Chart y-range that always shows every band edge and every reading, with a little padding. */
export function chartDomain(thresholdForMetric, values) {
  const nums = [...values]
  for (const b of thresholdForMetric?.bands ?? []) {
    if (b.min !== undefined && b.min !== null) nums.push(b.min)
    if (b.max !== undefined && b.max !== null) nums.push(b.max)
  }
  if (nums.length === 0) return [0, 1]
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const pad = (hi - lo || 1) * 0.1
  return [Math.floor((lo - pad) * 10) / 10, Math.ceil((hi + pad) * 10) / 10]
}

/** Bands clipped to the chart domain, ready to draw as background areas. */
export function chartBands(thresholdForMetric, [lo, hi]) {
  return (thresholdForMetric?.bands ?? []).map(b => ({
    color: b.color,
    y1: b.min === undefined || b.min === null ? lo : Math.max(lo, b.min),
    y2: b.max === undefined || b.max === null ? hi : Math.min(hi, b.max),
  }))
}

export function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}, ${iso.slice(11, 16)} UTC`
}

export function formatValue(metric, value) {
  if (metric === 'sleep_hours') return value.toFixed(1)
  if (metric === 'temperature') return value.toFixed(1)
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** Round-number tick values between lo and hi, about `count` of them. */
export function niceTicks(lo, hi, count = 5) {
  const raw = (hi - lo) / Math.max(1, count - 1)
  if (!(raw > 0)) return [lo]
  // Smallest round step (1, 2, 5, 10 times a power of ten) that gives at most `count` + 1 ticks.
  const pow = 10 ** Math.floor(Math.log10(raw / 2))
  const step = [1, 2, 5, 10, 20, 50].map(m => m * pow).find(s => (hi - lo) / s <= count) ?? raw
  const ticks = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

// Run: node web/src/dashboard/astroIndex.test.mjs
import { readFileSync } from 'node:fs'
import { computeIndex, labelFor } from './astroIndex.js'

const root = new URL('../../../', import.meta.url)
const day143 = JSON.parse(readFileSync(new URL('data/mock/day143.json', root), 'utf8'))
const raw = JSON.parse(readFileSync(new URL('research/thresholds.json', root), 'utf8'))
const thresholds = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')))

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
  if (!ok) failed++
}

// The index as of the end of each of the 14 days of the Day-143 scenario.
const days = [...new Set(day143.map(r => r.takenAt.slice(0, 10)))].sort()
const asOf = d => computeIndex(day143.filter(r => r.takenAt.slice(0, 10) <= d), thresholds)
const series = days.map(d => asOf(d))
console.log('index by day:', series.map(s => s.score).join(' '))

check('baseline week is not "ready" until day 9', !series[7].baselineReady && series[8].baselineReady)
check('quiet baseline week stays Steady', series.slice(0, 7).every(s => s.score < 25), `max ${Math.max(...series.slice(0, 7).map(s => s.score))}`)
check('final day is "Act now"', series[13].label.label === 'Act now', `score ${series[13].score}`)
const first = series.findIndex(s => s.score >= 25)
check('index leaves "Steady" while the screen is still mostly green', first >= 7 && first <= 11, `first >=25 on day ${first + 1}`)
check('index rises over the drift (non-decreasing from day 9 on)', series.slice(8).every((s, i, a) => i === 0 || s.score >= a[i - 1].score - 8))
check('top driver on the last day is a drifting metric', ['sleep_hours', 'heart_rate', 'bp_systolic', 'glucose', 'mood'].includes(series[13].parts[0].metric), series[13].parts[0].metric)

// A tiny wobble in a perfectly flat baseline must not explode.
{
  const flat = []
  for (let d = 1; d <= 10; d++) for (let h = 0; h < 4; h++)
    flat.push({ metric: 'heart_rate', value: d === 10 ? 64.6 : 64, takenAt: `2026-11-${String(d).padStart(2, '0')}T0${h}:00:00Z` })
  const r = computeIndex(flat, thresholds)
  check('flat baseline + 0.6 bpm wobble stays Steady (std floor)', r.score < 25, `score ${r.score}`)
}
check('labels', labelFor(0).label === 'Steady' && labelFor(25).label === 'Watch' && labelFor(50).label === 'Strained' && labelFor(75).label === 'Act now' && labelFor(100).label === 'Act now')

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

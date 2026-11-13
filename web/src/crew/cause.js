// "Is it the person or the environment?" A plain rule over the whole crew, not a diagnosis.
//
// Each person is compared with their OWN first week. A metric counts as shifted for someone
// when its last 3 daily values all sit at least 2 sigma from their baseline, in the same direction.
//   one person shifted           -> more likely personal (stress, isolation, health)
//   three or four shifted, same  -> something shared (cabin air, light, schedule) comes first
//   two shifted                  -> ambiguous: look for what those two share
// This is OUR reasoning, built on the idea that people respond differently to the same isolation
// (Mars-500) so a crew-wide move at the same time is less likely to be four separate coincidences.
// It is not a NASA method and has not been validated on real crews.
import { CABIN_CO2_LIMIT } from './scenarios.js'

const BASELINE_DAYS = 7
const RECENT = 3
const Z = 2
const STD_FLOOR = { sleep_hours: 0.25, heart_rate: 1.0 }
const METRIC_WORDS = { sleep_hours: 'sleep', heart_rate: 'resting heart rate' }

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const pstdev = xs => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - m) * (x - m))))
}

/** +1 / -1 when the last RECENT days all sit >= Z sigma from the person's own baseline, else 0. */
export function shift(values, metric) {
  if (values.length < BASELINE_DAYS + RECENT) return 0
  const base = values.slice(0, BASELINE_DAYS)
  const sd = Math.max(pstdev(base), STD_FLOOR[metric] ?? 0.05)
  const zs = values.slice(-RECENT).map(v => (v - mean(base)) / sd)
  if (zs.every(z => z >= Z)) return 1
  if (zs.every(z => z <= -Z)) return -1
  return 0
}

export function analyzeCause(scn) {
  const perMetric = {}
  for (const metric of Object.keys(METRIC_WORDS)) {
    const dirs = scn.people.map(p => shift(p.daily[metric], metric))
    perMetric[metric] = { dirs, flagged: scn.people.filter((_, i) => dirs[i] !== 0), up: dirs.filter(d => d > 0).length, down: dirs.filter(d => d < 0).length }
  }

  const co2Now = scn.cabin.co2[scn.cabin.co2.length - 1]
  const co2Base = mean(scn.cabin.co2.slice(0, BASELINE_DAYS))
  const co2High = co2Now > CABIN_CO2_LIMIT || co2Now - co2Base > 1

  // The metric with the most people shifted decides the verdict.
  const [metric, m] = Object.entries(perMetric).sort((a, b) => b[1].flagged.length - a[1].flagged.length)[0]
  const n = scn.people.length
  const sameWay = Math.max(m.up, m.down)

  let kind = 'none'
  let headline = 'Everyone is close to their own normal.'
  let detail = 'Nobody has moved away from their own first week. Keep logging.'
  if (sameWay >= Math.ceil(0.75 * n)) {
    kind = 'shared'
    headline = `${sameWay} of ${n} crew moved the same way. Look at the environment first.`
    detail = `${sameWay} people's ${METRIC_WORDS[metric]} shifted together, each away from their own normal. When several people move at once, something shared (cabin air, lighting, schedule) is more likely than ${sameWay} separate personal causes.`
    if (co2High) detail += ` Cabin CO₂ also rose to ${co2Now.toFixed(1)} mmHg (the limit NASA quotes is about ${CABIN_CO2_LIMIT}).`
  } else if (m.flagged.length === 1 && sameWay === 1) {
    kind = 'personal'
    const who = m.flagged[0]
    headline = `Only ${who.name}'s ${METRIC_WORDS[metric]} is drifting. Likely personal.`
    detail = `The other ${n - 1} are steady, so this looks more like stress, isolation or a health issue for ${who.name} than the environment.`
  } else if (m.flagged.length >= 2) {
    kind = 'pair'
    headline = `${m.flagged.length} of ${n} crew drifted. Check what they share.`
    detail = `${m.flagged.map(p => p.name).join(' and ')} moved, the rest did not. Look for something only they share, like a work shift, station or EVA.`
  }
  return { kind, headline, detail, metric, flagged: m.flagged.map(p => p.id), co2High, co2Now, perMetric }
}

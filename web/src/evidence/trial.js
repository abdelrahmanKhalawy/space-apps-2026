// JS port of the detectors and the crew generator in ai/trial.py, so the Evidence page can
// run a fresh virtual crew in the browser. The Python script is the source of truth for the
// numbers on the page; parity.mjs checks this port gives the same alarm days on the same series.

export const METRICS = ['heart_rate', 'sleep_hours', 'bp_systolic']
export const METRIC_LABEL = { heart_rate: 'Resting heart rate', sleep_hours: 'Sleep', bp_systolic: 'Systolic blood pressure' }
const SEVERITY = { green: 0, yellow: 1, red: 2 }

export function colorOf(bands, value) {
  for (const b of bands) {
    if ((b.min === undefined || value >= b.min) && (b.max === undefined || value < b.max)) return b.color
  }
  return 'green'
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const pstdev = xs => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length)
}

function baseline(vals, metric, cfg, useFloor) {
  const head = vals.slice(0, cfg.baseline_days)
  const m = mean(head)
  let sd = pstdev(head)
  sd = useFloor ? Math.max(sd, cfg.std_floor[metric]) : sd || 0.05
  return [m, sd]
}

// Each returns the alarm day (0-based) or null. Alarm day = the day the evidence is complete.
export function fixedColorChange(series, bands, cfg) {
  const base = {}
  for (const m of METRICS) {
    base[m] = Math.max(...series[m].slice(0, cfg.baseline_days).map(v => SEVERITY[colorOf(bands[m], v)]))
  }
  for (let d = cfg.baseline_days; d < cfg.days; d++) {
    for (const m of METRICS) if (SEVERITY[colorOf(bands[m], series[m][d])] > base[m]) return d
  }
  return null
}

export function fixedRed(series, bands, cfg) {
  for (let d = cfg.baseline_days; d < cfg.days; d++) {
    if (METRICS.some(m => colorOf(bands[m], series[m][d]) === 'red')) return d
  }
  return null
}

export function zscore(series, z, sustained, useFloor, cfg) {
  let best = null
  for (const m of METRICS) {
    const [mu, sd] = baseline(series[m], m, cfg, useFloor)
    const zs = series[m].map(v => (v - mu) / sd)
    for (let d = cfg.baseline_days; d <= cfg.days - sustained; d++) {
      const w = zs.slice(d, d + sustained)
      if (w.every(x => x >= z) || w.every(x => x <= -z)) {
        const alarm = d + sustained - 1
        best = best === null ? alarm : Math.min(best, alarm)
        break
      }
    }
  }
  return best
}

export function cusum(series, k, h, cfg) {
  let best = null
  for (const m of METRICS) {
    const [mu, sd] = baseline(series[m], m, cfg, true)
    let up = 0
    let down = 0
    for (let d = cfg.baseline_days; d < cfg.days; d++) {
      const x = (series[m][d] - mu) / sd
      up = Math.max(0, up + x - k)
      down = Math.max(0, down - x - k)
      if (up > h || down > h) {
        best = best === null ? d : Math.min(best, d)
        break
      }
    }
  }
  return best
}

export function allAlarms(series, bands, cfg, cal) {
  return {
    fixed: fixedColorChange(series, bands, cfg),
    fixed_red: fixedRed(series, bands, cfg),
    production: zscore(series, 1.3, 2, false, cfg),
    zscore: zscore(series, cal.zscore.z, cal.zscore.sustained, true, cfg),
    cusum: cusum(series, cal.cusum.k, cal.cusum.h, cfg),
  }
}

// ---- generator (a different RNG from Python's, so the crews differ; the process is the same)
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gauss = (rng, mu, sd) => {
  const u = Math.max(rng(), 1e-12)
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}
const uniform = (rng, a, b) => a + (b - a) * rng()

export function makeCrew(rng, drifting, cfg, noiseScale = 1) {
  const normal = {}
  for (const m of METRICS) {
    const [mu, sd, lo, hi] = cfg.person[m]
    normal[m] = Math.min(hi, Math.max(lo, gauss(rng, mu, sd)))
  }
  let onset = null
  const rates = {}
  if (drifting) {
    onset = cfg.drift_onset[0] + Math.floor(rng() * (cfg.drift_onset[1] - cfg.drift_onset[0] + 1))
    for (const m of METRICS) {
      const [a, b] = cfg.drift_per_day[m]
      rates[m] = rng() < 0.8 ? uniform(rng, a, b) : 0
    }
    if (METRICS.every(m => rates[m] === 0)) {
      const m = METRICS[Math.floor(rng() * METRICS.length)]
      rates[m] = uniform(rng, ...cfg.drift_per_day[m])
    }
  }
  const series = Object.fromEntries(METRICS.map(m => [m, []]))
  for (let d = 0; d < cfg.days; d++) {
    for (const m of METRICS) {
      let v = normal[m] + gauss(rng, 0, cfg.daily_noise[m] * noiseScale)
      if (drifting && d >= onset) v += rates[m] * (d - onset + 1)
      series[m].push(Math.round(v * 1000) / 1000)
    }
  }
  return { series, drifting, onset }
}

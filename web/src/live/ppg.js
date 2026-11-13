// Camera photoplethysmography (PPG): the phone's camera sees the fingertip's red channel get
// slightly brighter and darker with each heartbeat. This file turns a series of
// {t: ms, v: mean red} samples into heart rate, a rough HRV (RMSSD) and a quality grade.
//
// Pure functions, no browser APIs, so web/src/live/ppg.test.mjs can check them against
// synthetic signals. Accuracy on a real phone depends on lighting, finger pressure and
// motion, so the UI calls this an experiment and not a medical measurement.

export const FS = 30 // resample rate in Hz
const MIN_IBI = 0.33 // s, 180 bpm
const MAX_IBI = 1.5 // s, 40 bpm

const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const std = xs => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - m) * (x - m))))
}

// Camera frames arrive at uneven times; interpolate onto an even FS grid.
export function resample(samples, fs = FS) {
  if (samples.length < 2) return []
  const t0 = samples[0].t
  const t1 = samples[samples.length - 1].t
  const n = Math.floor(((t1 - t0) / 1000) * fs)
  const out = []
  let j = 0
  for (let i = 0; i < n; i++) {
    const t = t0 + (i / fs) * 1000
    while (j < samples.length - 2 && samples[j + 1].t < t) j++
    const a = samples[j]
    const b = samples[j + 1]
    const w = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
    out.push(a.v + (b.v - a.v) * Math.min(1, Math.max(0, w)))
  }
  return out
}

function movingAverage(x, win) {
  const half = Math.floor(win / 2)
  return x.map((_, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(x.length, i + half + 1)
    let s = 0
    for (let k = lo; k < hi; k++) s += x[k]
    return s / (hi - lo)
  })
}

// Remove the slow drift (finger pressure, lighting), then smooth the camera's pixel noise.
export function bandpass(x, fs = FS) {
  const slow = movingAverage(x, Math.round(fs * 1.5))
  const detrended = x.map((v, i) => v - slow[i])
  return movingAverage(detrended, Math.max(3, Math.round(fs / 8)))
}

export function findPeaks(x, fs = FS, minIbi = MIN_IBI) {
  const minDist = Math.round(fs * minIbi)
  const floor = 0.25 * std(x)
  const peaks = []
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > floor && x[i] >= x[i - 1] && x[i] > x[i + 1]) {
      const last = peaks[peaks.length - 1]
      if (last === undefined || i - last >= minDist) peaks.push(i)
      else if (x[i] > x[last]) peaks[peaks.length - 1] = i // a taller peak inside the dead zone wins
    }
  }
  // sub-sample peak time by fitting a parabola through the three points around each peak
  return peaks.map(i => {
    const a = x[i - 1]
    const b = x[i]
    const c = x[i + 1]
    const d = a - 2 * b + c
    return (i + (d === 0 ? 0 : (0.5 * (a - c)) / d)) / fs
  })
}

/** samples: [{t (ms), v}]. Returns { bpm, rmssd, beats, quality: 'good' | 'low' | 'none' }. */
export function analyze(samples, fs = FS) {
  const raw = resample(samples, fs)
  if (raw.length < fs * 8) return { bpm: null, rmssd: null, beats: 0, quality: 'none' }
  const sig = bandpass(raw, fs)
  // Two passes: a first rough rate, then ignore any bump closer than 60% of the typical beat spacing
  // (the small second bump after each pulse, the dicrotic notch, is not a heartbeat).
  const rough = findPeaks(sig, fs)
  const roughIbis = rough.slice(1).map((t, i) => t - rough[i]).filter(d => d >= MIN_IBI && d <= MAX_IBI)
  const times = roughIbis.length >= 4 ? findPeaks(sig, fs, Math.max(MIN_IBI, 0.6 * median(roughIbis))) : rough
  const ibis = times.slice(1).map((t, i) => t - times[i]).filter(d => d >= MIN_IBI && d <= MAX_IBI)
  if (ibis.length < 6) return { bpm: null, rmssd: null, beats: ibis.length, quality: 'none' }

  const med = median(ibis)
  const keep = ibis.filter(d => Math.abs(d - med) <= 0.25 * med)
  if (keep.length < 6) return { bpm: null, rmssd: null, beats: keep.length, quality: 'none' }

  // RMSSD only over neighbours that are both kept and truly consecutive beats.
  const diffs = []
  for (let i = 1; i < times.length - 1; i++) {
    const a = times[i] - times[i - 1]
    const b = times[i + 1] - times[i]
    if (Math.abs(a - med) <= 0.25 * med && Math.abs(b - med) <= 0.25 * med) diffs.push((b - a) * 1000)
  }
  const rmssd = diffs.length >= 4 ? Math.sqrt(mean(diffs.map(d => d * d))) : null

  const share = keep.length / ibis.length
  const quality = keep.length >= 12 && share >= 0.7 ? 'good' : 'low'
  return { bpm: Math.round(60 / mean(keep)), rmssd: rmssd == null ? null : Math.round(rmssd), beats: keep.length, quality }
}

/** Is a fingertip covering the lens? With the torch on the red channel is high and green is low. */
export function fingerOnLens({ r, g, b }) {
  return r > 90 && r > 1.5 * g && r > 1.5 * b
}

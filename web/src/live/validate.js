// Checks the phone-camera pulse algorithm (ppg.js) against REAL recorded finger PPG with a reference heart rate.
// Dataset: BIDMC PPG and Respiration Dataset (PhysioNet, Open Data Commons Attribution License v1.0), 53 recordings
// of 8 minutes at 125 Hz, from hospital patients, with a heart rate derived from the ECG once per second.
//
// Honest limits, stated in the results file too: these are pulse-oximeter signals from patients, not phone-camera video,
// so this validates the signal processing on real pulse waveforms and real noise, not the camera or its optics.
import { analyzeBest } from './ppg.js'

export const WINDOW_S = 25 // same length as the in-app measurement
export const STEP_S = 60
const SCALE = 200 // BIDMC PLETH is normalized around 0..1; the app sees camera values 0..255, so scale it up

/** Minimal CSV reader for the BIDMC files: header names are trimmed, numbers parsed, bad cells become NaN. */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  const header = lines[0].split(',').map(h => h.trim())
  const rows = lines.slice(1).map(l => l.split(',').map(c => {
    const v = parseFloat(c)
    return Number.isFinite(v) ? v : NaN
  }))
  const col = name => {
    const i = header.findIndex(h => h.toLowerCase().startsWith(name.toLowerCase()))
    return i === -1 ? null : rows.map(r => r[i])
  }
  return { header, col }
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length

/** All windows of one recording: the algorithm's answer next to the ECG-derived reference. */
export function evaluateRecord(signalsText, numericsText, recordId = '') {
  const sig = parseCsv(signalsText)
  const num = parseCsv(numericsText)
  const t = sig.col('Time')
  const pleth = sig.col('PLETH')
  const nt = num.col('Time')
  const hr = num.col('HR')
  if (!t || !pleth || !nt || !hr) throw new Error(`record ${recordId}: missing Time/PLETH/HR columns`)

  const windows = []
  const end = t[t.length - 1]
  for (let start = 0; start + WINDOW_S <= end; start += STEP_S) {
    const stop = start + WINDOW_S
    // reference: mean ECG heart rate over the window, needs most of the seconds present
    const refVals = []
    for (let i = 0; i < nt.length; i++) if (nt[i] >= start && nt[i] < stop && Number.isFinite(hr[i]) && hr[i] > 0) refVals.push(hr[i])
    if (refVals.length < WINDOW_S * 0.8) continue
    const samples = []
    for (let i = 0; i < t.length; i++) {
      if (t[i] >= start && t[i] < stop && Number.isFinite(pleth[i])) samples.push({ t: t[i] * 1000, r: pleth[i] * SCALE, g: 0, b: 0 })
    }
    if (samples.length < WINDOW_S * 100) continue
    const res = analyzeBest(samples)
    windows.push({ record: recordId, start, ref: mean(refVals), bpm: res.bpm, quality: res.quality, channel: res.channel, polarity: res.polarity ?? 1 })
  }
  return windows
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null
}
const round1 = x => (x == null ? null : Math.round(x * 10) / 10)

/** Accuracy numbers. "Accepted" = windows where the app would show a reading (quality 'good'); the rest it rejects. */
export function summarize(windows) {
  const accepted = windows.filter(w => w.quality === 'good' && w.bpm != null)
  const errs = accepted.map(w => Math.abs(w.bpm - w.ref))
  const records = new Set(windows.map(w => w.record))
  return {
    recordings: records.size,
    windows: windows.length,
    accepted_windows: accepted.length,
    accepted_share: windows.length ? round1((accepted.length / windows.length) * 100) : null,
    mean_abs_error_bpm: errs.length ? round1(errs.reduce((a, b) => a + b, 0) / errs.length) : null,
    median_abs_error_bpm: round1(median(errs)),
    p90_abs_error_bpm: round1(pct(errs, 0.9)),
    within_2_bpm_pct: errs.length ? round1((errs.filter(e => e <= 2).length / errs.length) * 100) : null,
    within_5_bpm_pct: errs.length ? round1((errs.filter(e => e <= 5).length / errs.length) * 100) : null,
    window_seconds: WINDOW_S,
  }
}

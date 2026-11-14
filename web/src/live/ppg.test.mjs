// Run: node web/src/live/ppg.test.mjs
// Synthetic fingertip signals with a known heart rate, checked against analyze().
import { analyze, analyzeBest, fingerOnLens } from './ppg.js'

let failed = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
  if (!ok) failed++
}

// Small deterministic RNG so the test never flakes.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const noise = r => (r() + r() + r() - 1.5) * 1.2 // roughly gaussian, sd ~0.6

// One pulse: fast rise, slower fall, a small second bump (dicrotic notch).
const pulse = x => (x < 0 || x > 1.2 ? 0 : Math.exp(-Math.pow((x - 0.18) / 0.1, 2)) + 0.35 * Math.exp(-Math.pow((x - 0.5) / 0.14, 2)))

function simulate({ beatTimes, seconds = 25, seed = 1, drift = 5, amp = 3, noiseScale = 1 }) {
  const r = rng(seed)
  const samples = []
  for (let t = 0; t < seconds; t += 1 / 30) {
    const jitter = (r() - 0.5) * 6 // camera frames never land exactly on time
    const ms = t * 1000 + jitter
    let v = 120 + drift * Math.sin(2 * Math.PI * 0.05 * t) + noiseScale * noise(r)
    for (const b of beatTimes) v += amp * pulse(t - b)
    samples.push({ t: ms, v })
  }
  return samples
}

function regularBeats(bpm, seconds = 25) {
  const out = []
  for (let t = 0.4; t < seconds; t += 60 / bpm) out.push(t)
  return out
}

// 1) regular heart rates across the normal range
for (const bpm of [52, 65, 72, 88, 110, 140]) {
  const res = analyze(simulate({ beatTimes: regularBeats(bpm), seed: bpm }))
  check(`regular ${bpm} bpm`, res.bpm !== null && Math.abs(res.bpm - bpm) <= 2, `got ${res.bpm}, quality ${res.quality}, beats ${res.beats}`)
}

// 2) variable beat spacing: HRV (RMSSD) should come out near the truth
{
  const r = rng(99)
  const beats = []
  const trueIbis = []
  let t = 0.4
  while (t < 25) {
    beats.push(t)
    const ibi = 0.83 + (r() - 0.5) * 0.16 // about 72 bpm, +/-80 ms spread
    trueIbis.push(ibi)
    t += ibi
  }
  const d = trueIbis.slice(1).map((x, i) => (x - trueIbis[i]) * 1000)
  const trueRmssd = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / d.length)
  const res = analyze(simulate({ beatTimes: beats, seed: 7, noiseScale: 0.5 }))
  check('variable beats: HR', res.bpm !== null && Math.abs(res.bpm - 72) <= 3, `got ${res.bpm}`)
  check('variable beats: RMSSD within 35%', res.rmssd !== null && Math.abs(res.rmssd - trueRmssd) / trueRmssd < 0.35,
    `got ${res.rmssd} ms, true ${Math.round(trueRmssd)} ms`)
}

// 3) pure noise must not produce a confident reading
{
  const res = analyze(simulate({ beatTimes: [], seed: 5, noiseScale: 2 }))
  check('noise only is not "good"', res.quality !== 'good', `quality ${res.quality}, bpm ${res.bpm}`)
}

// 4) too short a recording
{
  const res = analyze(simulate({ beatTimes: regularBeats(72), seconds: 4 }))
  check('4 s recording gives no reading', res.quality === 'none', `quality ${res.quality}`)
}

// 5) finger detection
check('finger on lens (torch)', fingerOnLens({ r: 230, g: 40, b: 30 }), '')
check('no finger (grey room)', !fingerOnLens({ r: 110, g: 105, b: 100 }), '')
check('dark lens is not a finger', !fingerOnLens({ r: 15, g: 4, b: 4 }), '')
check('finger in room light, no flash (dark red) is a finger', fingerOnLens({ r: 52, g: 11, b: 7 }), '')
check('a bright scene with no finger is not', !fingerOnLens({ r: 140, g: 130, b: 120 }), '')

// 6) real phones: the red channel may be clipped at 255 (torch) while the pulse lives in green, or the other way round
{
  const beats = regularBeats(72)
  const base = simulate({ beatTimes: beats, seed: 21 })
  const clean = base.map(s => s.v)
  const rgb = (rFn, gFn) => base.map((s, i) => ({ t: s.t, r: rFn(clean[i], i), g: gFn(clean[i], i), b: 40 }))

  const redClipped = rgb(() => 255, v => 80 + (v - 120) * 1.5)
  const a = analyzeBest(redClipped)
  check('red clipped at 255: pulse is found in green', a.bpm !== null && Math.abs(a.bpm - 72) <= 2 && a.channel === 'g', `got ${a.bpm} via ${a.channel}`)

  const redGood = rgb(v => v + 100, () => 60)
  const b = analyzeBest(redGood)
  check('red clean, green flat: red is used', b.bpm !== null && Math.abs(b.bpm - 72) <= 2 && b.channel === 'r', `got ${b.bpm} via ${b.channel}`)

  // camera polarity: the red channel DIPS on each beat (more blood, less light), the opposite of an oximeter trace
  const dips = rgb(v => 200 - (v - 120) * 2, () => 0)
  const d = analyzeBest(dips)
  check('red dips on each beat (camera polarity): still 72', d.bpm !== null && Math.abs(d.bpm - 72) <= 2, `got ${d.bpm}, polarity ${d.polarity}`)

  const dead = rgb(() => 255, () => 255)
  const c = analyzeBest(dead)
  check('everything clipped: no reading, no crash', c.bpm === null && c.quality === 'none', `quality ${c.quality}`)
}

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

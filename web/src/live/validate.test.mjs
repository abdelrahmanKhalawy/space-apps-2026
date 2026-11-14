// Run: node web/src/live/validate.test.mjs
// The BIDMC plumbing (CSV parsing, windows, error numbers) checked on small synthetic files in the same layout.
import { evaluateRecord, parseCsv, summarize } from './validate.js'

let failed = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); if (!ok) failed++ }

// a 125 Hz pulse waveform at a known rate, in BIDMC's column layout (note the padded header names)
function fakeRecord(bpm, seconds = 130, hz = 125) {
  const pulse = x => (x < 0 || x > 1.2 ? 0 : Math.exp(-Math.pow((x - 0.18) / 0.1, 2)) + 0.35 * Math.exp(-Math.pow((x - 0.5) / 0.14, 2)))
  const period = 60 / bpm
  let sig = 'Time [s], RESP, PLETH, V, AVR, II\n'
  for (let i = 0; i < seconds * hz; i++) {
    const t = i / hz
    const phase = (t % period) / period * period // seconds since the last beat
    const v = 0.4 + 0.12 * pulse(phase) + 0.002 * Math.sin(t * 7.3)
    sig += `${t.toFixed(3)}, 0.5, ${v.toFixed(5)}, 0, 0, 0\n`
  }
  let num = 'Time [s], HR, PULSE, RESP, SpO2\n'
  for (let t = 0; t < seconds; t++) num += `${t}, ${bpm}, ${bpm}, 15, 97\n`
  return { sig, num }
}

{
  const p = parseCsv('Time [s], HR\n0, 70\n1, \n2, 72\n')
  check('padded headers are found, empty cells become NaN', p.col('HR')[0] === 70 && Number.isNaN(p.col('HR')[1]))
}
{
  const { sig, num } = fakeRecord(72)
  const w = evaluateRecord(sig, num, '99')
  check('a 130 s recording gives 2 windows', w.length === 2, `got ${w.length}`)
  const s = summarize(w)
  check('72 bpm pulse is read to within 2 bpm', s.accepted_windows >= 1 && s.mean_abs_error_bpm !== null && s.mean_abs_error_bpm <= 2, JSON.stringify(s))
}
{
  const { sig } = fakeRecord(72)
  const w = evaluateRecord(sig, 'Time [s], HR\n', 'x')
  check('no reference heart rate: nothing to compare, no crash', w.length === 0)
}
{
  const s = summarize([])
  check('empty input summarizes without NaN', s.windows === 0 && s.mean_abs_error_bpm === null)
}

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
